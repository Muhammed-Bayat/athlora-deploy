import request from 'supertest';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/client.js';

const brandingService = vi.hoisted(() => ({
  getClubBranding: vi.fn(),
  updateClubBranding: vi.fn(),
  replaceClubLogo: vi.fn(),
  replaceClubCover: vi.fn(),
  clearClubLogo: vi.fn(),
  clearClubCover: vi.fn(),
  readBrandAsset: vi.fn(),
}));
vi.mock('../services/clubBranding.js', () => brandingService);
vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const app = createApp();
const query = vi.fn();

const BRANDING = {
  description: 'City athletics club',
  primaryColor: '#001D3C',
  accentColor: '#45BED7',
  logoUrl: null,
  logoContentType: null,
  coverUrl: null,
  coverContentType: null,
};

const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function applicationUser(workspaceRole: 'coach' | 'assistant') {
  return {
    rows: [{
      user_id: USER_ID,
      auth0_id: 'auth0|user-1',
      role: 'coach',
      deletion_status: null,
      workspace_id: WORKSPACE_ID,
      workspace_role: workspaceRole,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|user-1' } } as never);
  brandingService.getClubBranding.mockResolvedValue(BRANDING);
  brandingService.updateClubBranding.mockResolvedValue(BRANDING);
  brandingService.replaceClubLogo.mockResolvedValue({ ...BRANDING, logoUrl: '/api/v1/media/clubs/logo.png', logoContentType: 'image/png' });
  brandingService.replaceClubCover.mockResolvedValue({ ...BRANDING, coverUrl: '/api/v1/media/clubs/cover.png', coverContentType: 'image/png' });
  brandingService.clearClubLogo.mockResolvedValue(BRANDING);
  brandingService.clearClubCover.mockResolvedValue(BRANDING);
});

describe('club branding routes', () => {
  it('requires authentication for every branding method', async () => {
    expect((await request(app).get('/api/v1/clubs/branding')).status).toBe(401);
    expect((await request(app).put('/api/v1/clubs/branding').send({ description: null, primaryColor: null, accentColor: null })).status).toBe(401);
    expect((await request(app).post('/api/v1/clubs/branding/logo')).status).toBe(401);
    expect((await request(app).delete('/api/v1/clubs/branding/logo')).status).toBe(401);
    expect(brandingService.getClubBranding).not.toHaveBeenCalled();
  });

  it('returns branding for any application workspace member without requiring coach', async () => {
    query.mockResolvedValueOnce(applicationUser('assistant'));

    const response = await request(app)
      .get('/api/v1/clubs/branding')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: BRANDING });
    expect(brandingService.getClubBranding).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('lets a coach update description and colours', async () => {
    query.mockResolvedValueOnce(applicationUser('coach'));

    const response = await request(app)
      .put('/api/v1/clubs/branding')
      .set('Authorization', 'Bearer valid')
      .send({ description: 'City athletics club', primaryColor: '#001D3C', accentColor: '#45BED7' });

    expect(response.status).toBe(200);
    expect(brandingService.updateClubBranding).toHaveBeenCalledWith(WORKSPACE_ID, {
      description: 'City athletics club',
      primaryColor: '#001D3C',
      accentColor: '#45BED7',
    });
  });

  it('rejects an assistant coach-only mutation with 403', async () => {
    query.mockResolvedValueOnce(applicationUser('assistant'));

    const response = await request(app)
      .put('/api/v1/clubs/branding')
      .set('Authorization', 'Bearer valid')
      .send({ description: null, primaryColor: null, accentColor: null });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WORKSPACE_CAPABILITY_DENIED');
    expect(brandingService.updateClubBranding).not.toHaveBeenCalled();
  });

  it('rejects a branding payload that fails validation before the service', async () => {
    query.mockResolvedValueOnce(applicationUser('coach'));

    const response = await request(app)
      .put('/api/v1/clubs/branding')
      .set('Authorization', 'Bearer valid')
      .send({ primaryColor: 'red' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(brandingService.updateClubBranding).not.toHaveBeenCalled();
  });

  it('uploads a logo for a coach after sniffing the image bytes', async () => {
    query.mockResolvedValueOnce(applicationUser('coach'));

    const response = await request(app)
      .post('/api/v1/clubs/branding/logo')
      .set('Authorization', 'Bearer valid')
      .attach('file', PNG_BUFFER, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.data.logoUrl).toBe('/api/v1/media/clubs/logo.png');
    expect(brandingService.replaceClubLogo).toHaveBeenCalledWith(WORKSPACE_ID, PNG_BUFFER);
  });

  it('rejects missing files, oversize files, and unsupported magic bytes', async () => {
    query.mockResolvedValue(applicationUser('coach'));

    const missing = await request(app)
      .post('/api/v1/clubs/branding/logo')
      .set('Authorization', 'Bearer valid');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('CLUB_MEDIA_REQUIRED');

    const oversize = await request(app)
      .post('/api/v1/clubs/branding/logo')
      .set('Authorization', 'Bearer valid')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    expect(oversize.status).toBe(413);
    expect(oversize.body.error.code).toBe('CLUB_MEDIA_TOO_LARGE');

    const unsupported = await request(app)
      .post('/api/v1/clubs/branding/logo')
      .set('Authorization', 'Bearer valid')
      .attach('file', Buffer.from('GIF89a-not-a-real-image'), { filename: 'logo.gif', contentType: 'image/gif' });
    expect(unsupported.status).toBe(415);
    expect(unsupported.body.error.code).toBe('CLUB_MEDIA_TYPE_UNSUPPORTED');
    expect(brandingService.replaceClubLogo).not.toHaveBeenCalled();
  });

  it('clears logo and cover for a coach', async () => {
    query.mockResolvedValue(applicationUser('coach'));

    const logo = await request(app)
      .delete('/api/v1/clubs/branding/logo')
      .set('Authorization', 'Bearer valid');
    const cover = await request(app)
      .delete('/api/v1/clubs/branding/cover')
      .set('Authorization', 'Bearer valid');

    expect(logo.status).toBe(200);
    expect(cover.status).toBe(200);
    expect(brandingService.clearClubLogo).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(brandingService.clearClubCover).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('forbids assistants from uploading or clearing media', async () => {
    query.mockResolvedValue(applicationUser('assistant'));

    const upload = await request(app)
      .post('/api/v1/clubs/branding/cover')
      .set('Authorization', 'Bearer valid')
      .attach('file', PNG_BUFFER, { filename: 'cover.png', contentType: 'image/png' });
    const clear = await request(app)
      .delete('/api/v1/clubs/branding/cover')
      .set('Authorization', 'Bearer valid');

    expect(upload.status).toBe(403);
    expect(clear.status).toBe(403);
    expect(brandingService.replaceClubCover).not.toHaveBeenCalled();
    expect(brandingService.clearClubCover).not.toHaveBeenCalled();
  });
});
