import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errors.js';
import * as workspaces from '../services/workspaces.js';
import router from './workspaces.js';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
let role: 'coach' | 'assistant' = 'coach';

vi.mock('../middleware/auth.js', () => ({
  getApplicationUserContext: () => ({ userId, workspaceId, workspaceRole: role }),
}));
vi.mock('../services/workspaces.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/workspaces.js')>(),
  listMembers: vi.fn(),
  changeMemberRole: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/workspaces', router);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  role = 'coach';
});

describe('workspace member routes', () => {
  it('lets assistants list members without granting role management', async () => {
    role = 'assistant';
    vi.mocked(workspaces.listMembers).mockResolvedValue([
      { userId, name: 'Assistant Sam', email: 'sam@example.com', role: 'assistant', createdAt: '2026-10-04T00:00:00.000Z' },
    ]);

    const listResponse = await request(app).get(`/workspaces/${workspaceId}/members`);
    const updateResponse = await request(app)
      .patch(`/workspaces/${workspaceId}/members/${userId}`)
      .send({ role: 'coach' });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([expect.objectContaining({ userId, role: 'assistant' })]);
    expect(updateResponse.status).toBe(403);
    expect(workspaces.changeMemberRole).not.toHaveBeenCalled();
  });
});
