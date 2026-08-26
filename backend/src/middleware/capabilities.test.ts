import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/ownership.js', () => ({ assertTimelineEntryRecordedBy: vi.fn() }));

import { assertTimelineEntryRecordedBy } from '../services/ownership.js';
import { requireCoach, requireCurrentWorkspace, requireTimelineWriteAccess } from './capabilities.js';

const context = {
  userId: '11111111-1111-4111-8111-111111111111', auth0Id: 'auth0|user', role: 'coach' as const,
  workspaceId: '22222222-2222-4222-8222-222222222222', workspaceRole: 'coach' as const,
};
function request(overrides: Partial<Request> = {}): Request {
  return { auth: { ...context }, params: {}, ...overrides } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe('workspace capabilities', () => {
  it('denies coach-only operations to assistants', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireCoach()({ ...request(), auth: { ...context, workspaceRole: 'assistant' } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'WORKSPACE_CAPABILITY_DENIED' }));
  });

  it('does not permit a coach to manage another workspace by URL', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireCurrentWorkspace(request({ params: { workspaceId: '33333333-3333-4333-8333-333333333333' } }), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('restricts assistant timeline edits to their recorded entries', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = request({ params: { eventId: 'event', entryId: 'entry' } });
    req.auth = { ...context, workspaceRole: 'assistant' };
    await requireTimelineWriteAccess(req, {} as Response, next);
    expect(assertTimelineEntryRecordedBy).toHaveBeenCalledWith(context.workspaceId, 'event', 'entry', context.userId);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows assistants to create timeline entries', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = request({ params: { eventId: 'event' } });
    req.auth = { ...context, workspaceRole: 'assistant' };
    await requireTimelineWriteAccess(req, {} as Response, next);
    expect(assertTimelineEntryRecordedBy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
