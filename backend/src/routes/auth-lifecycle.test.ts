import request from 'supertest';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

const accountService = vi.hoisted(() => ({ deleteCurrentAccount: vi.fn() }));
const managementService = vi.hoisted(() => ({
  createAuth0PasswordTicket: vi.fn(),
  deleteAuth0User: vi.fn(),
}));
const database = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../services/accounts.js', () => accountService);
vi.mock('../services/auth0-management.js', () => managementService);
vi.mock('../db/client.js', () => ({ getPool: () => database }));
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  accountService.deleteCurrentAccount.mockResolvedValue(undefined);
  managementService.createAuth0PasswordTicket.mockResolvedValue('https://example.auth0.com/ticket/abc');
  database.query.mockResolvedValue({ rows: [{
    user_id: '11111111-1111-4111-8111-111111111111',
    auth0_id: 'auth0|coach-1',
    role: 'coach',
    deletion_status: null,
  }] });
});

describe('account lifecycle routes', () => {
  it('accepts deletion only for the verified current subject', async () => {
    const response = await request(app)
      .delete('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid')
      .send({ userId: 'someone-else' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ data: { status: 'pending' } });
    expect(accountService.deleteCurrentAccount).toHaveBeenCalledWith('auth0|coach-1');
  });

  it('returns a password ticket only for the verified current subject', async () => {
    const response = await request(app)
      .post('/api/v1/auth/me/password-ticket')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { url: 'https://example.auth0.com/ticket/abc' } });
    expect(managementService.createAuth0PasswordTicket).toHaveBeenCalledWith('auth0|coach-1');
  });

  it('blocks password tickets after account deletion has been requested', async () => {
    database.query.mockResolvedValueOnce({ rows: [{
      user_id: '11111111-1111-4111-8111-111111111111',
      auth0_id: 'auth0|coach-1',
      role: 'coach',
      deletion_status: 'failed',
    }] });

    const response = await request(app)
      .post('/api/v1/auth/me/password-ticket')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_DELETION_PENDING');
    expect(managementService.createAuth0PasswordTicket).not.toHaveBeenCalled();
  });

  it('protects both lifecycle operations with bearer-token verification', async () => {
    const deletion = await request(app).delete('/api/v1/auth/me');
    const password = await request(app).post('/api/v1/auth/me/password-ticket');
    expect(deletion.status).toBe(401);
    expect(password.status).toBe(401);
    expect(accountService.deleteCurrentAccount).not.toHaveBeenCalled();
  });
});
