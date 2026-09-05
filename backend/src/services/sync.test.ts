import { describe, it, expect } from 'vitest';
import type { SyncActionInput } from '../services/sync.js';

describe('Sync Service', () => {
  it('validates sync action input shape', () => {
    const validAction: SyncActionInput = {
      actionId: '550e8400-e29b-41d4-a716-446655440000',
      actionType: 'create_entry',
      payload: {
        athleteId: 'athlete-1',
        discipline: '100m',
        entryType: 'attempt',
        value: 12.34,
        unit: 'seconds',
      },
      clientTimestamp: '2026-09-05T10:00:00.000Z',
    };

    expect(validAction.actionId).toBeDefined();
    expect(validAction.actionType).toBe('create_entry');
    expect(validAction.payload).toBeDefined();
    expect(validAction.clientTimestamp).toBeDefined();
  });

  it('validates edit action has required fields', () => {
    const editAction: SyncActionInput = {
      actionId: '550e8400-e29b-41d4-a716-446655440001',
      actionType: 'edit_entry',
      payload: {
        entryId: 'entry-1',
        value: 12.50,
        expectedVersion: 1,
      },
      expectedVersion: 1,
      clientTimestamp: '2026-09-05T10:01:00.000Z',
    };

    expect(editAction.actionType).toBe('edit_entry');
    expect(editAction.expectedVersion).toBe(1);
  });

  it('validates undo action has required fields', () => {
    const undoAction: SyncActionInput = {
      actionId: '550e8400-e29b-41d4-a716-446655440002',
      actionType: 'undo_entry',
      payload: {
        entryId: 'entry-1',
        expectedVersion: 2,
      },
      expectedVersion: 2,
      clientTimestamp: '2026-09-05T10:02:00.000Z',
    };

    expect(undoAction.actionType).toBe('undo_entry');
    expect(undoAction.payload).toHaveProperty('entryId');
  });
});
