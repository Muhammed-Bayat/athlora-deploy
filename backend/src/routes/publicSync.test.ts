import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import publicSyncRouter from './publicSync.js';

const services = vi.hoisted(() => ({
  processPublicSyncBatch: vi.fn(), processSessionSyncBatch: vi.fn(), resolvePublicMeetActor: vi.fn(),
}));

vi.mock('../services/publicSync.js', () => ({ processPublicSyncBatch: services.processPublicSyncBatch }));
vi.mock('../services/sessionSync.js', () => ({ processSessionSyncBatch: services.processSessionSyncBatch }));
vi.mock('../services/publicLoggers.js', () => ({ resolvePublicMeetActor: services.resolvePublicMeetActor }));

const app = express();
app.use(express.json());
app.use('/api/v1/public/logger/sync', publicSyncRouter);

describe('public sync route', () => {
  it('rejects a batch that mixes legacy and targeted session actions', async () => {
    const response = await request(app)
      .post('/api/v1/public/logger/sync/batch')
      .set('Authorization', 'Bearer public-session')
      .send({
        eventId: '11111111-1111-4111-8111-111111111111', deviceId: 'device',
        actions: [
          { actionId: '22222222-2222-4222-8222-222222222222', target: { disciplineSessionId: '33333333-3333-4333-8333-333333333333', entrantId: '44444444-4444-4444-8444-444444444444' } },
          { actionId: '55555555-5555-4555-8555-555555555555' },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(services.processPublicSyncBatch).not.toHaveBeenCalled();
    expect(services.processSessionSyncBatch).not.toHaveBeenCalled();
  });
});
