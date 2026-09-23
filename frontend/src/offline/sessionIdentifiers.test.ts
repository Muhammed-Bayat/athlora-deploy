import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { getOfflineDB, resetOfflineDB } from './db';
import { getPublicOfflineDB, resetPublicOfflineDB } from './publicDb';
import { enqueueAction, getPendingActions } from './actionQueue';
import { enqueuePublicAction, getPendingPublicActions } from './publicActionQueue';
import { cacheSession, getCachedSession, cachePublicSession, getCachedPublicSession } from './sessionCache';
import { toSyncAction } from '../api/sync';
import { toPublicSyncAction } from '../api/publicSync';

const user = 'issue-244';
const secondUser = 'issue-244-other';
const token = 'issue-244-public';
const eventId = '11111111-1111-4111-8111-111111111111';
const target = { disciplineSessionId: '22222222-2222-4222-8222-222222222222', entrantId: '33333333-3333-4333-8333-333333333333' };
afterEach(async () => {
  const publicName = getPublicOfflineDB(token).name;
  resetOfflineDB();
  resetPublicOfflineDB(token);
  await Promise.all([Dexie.delete(`athlora-${user}`), Dexie.delete(`athlora-${secondUser}`), Dexie.delete(publicName)]);
});

describe('session-aware offline storage', () => {
  it('upgrades a v1 queue without rewriting pending legacy IDs or payloads', async () => {
    const old = new Dexie(`athlora-${user}`);
    old.version(1).stores({ offlineActions: 'id, [status+eventId+createdAt], eventId, status', cachedEvents: 'id, [workspaceId+id]', cachedParticipants: 'eventId', cachedTimeline: 'eventId' });
    const legacy = { id: crypto.randomUUID(), actionType: 'create_entry', eventId, payload: { athleteId: target.entrantId, value: 12, unit: 'seconds' }, status: 'pending', deviceId: 'device', createdAt: 1 };
    await old.table('offlineActions').add(legacy);
    old.close();
    expect(await getPendingActions(eventId, user)).toEqual([legacy]);
    expect(getOfflineDB(user).verno).toBe(2);
    expect(toSyncAction((await getPendingActions(eventId, user))[0])).not.toHaveProperty('target');
  });
  it('preserves exact session/entrant/action IDs and pins workspace while isolating cached sessions and users', async () => {
    const id = await enqueueAction({ eventId, target, workspaceId: 'workspace-a', actionType: 'edit_entry', entryId: eventId, payload: { value: 6.1 }, expectedVersion: 2, deviceId: 'device' }, user);
    const [action] = await getPendingActions(eventId, user);
    expect(action).toMatchObject({ id, target, workspaceId: 'workspace-a' });
    expect(toSyncAction(action)).toMatchObject({ actionId: id, target, expectedVersion: 2, payload: { entryId: eventId, value: 6.1 } });
    await cacheSession(user, 'workspace-a', eventId, target.disciplineSessionId, { marker: 'first' });
    await cacheSession(user, 'workspace-b', eventId, target.disciplineSessionId, { marker: 'second' });
    expect((await getCachedSession(user, 'workspace-a', eventId, target.disciplineSessionId))?.data).toEqual({ marker: 'first' });
    expect(await getCachedSession(secondUser, 'workspace-a', eventId, target.disciplineSessionId)).toBeUndefined();
    expect(await getPendingActions(eventId, secondUser)).toEqual([]);
    await expect(enqueueAction({ eventId, target, actionType: 'create_entry', payload: {}, deviceId: 'device' }, user)).rejects.toThrow('workspace');
  });
  it('keeps public session targets distinct from the logger identity and forwards edit entry IDs', async () => {
    const id = await enqueuePublicAction({ eventId, target, actionType: 'undo_entry', entryId: eventId, payload: {}, expectedVersion: 3, deviceId: 'device' }, token);
    const [action] = await getPendingPublicActions(eventId, token);
    expect(toPublicSyncAction(action)).toMatchObject({ actionId: id, target, payload: { entryId: eventId }, expectedVersion: 3 });
    await cachePublicSession(token, eventId, target.disciplineSessionId, { entries: [] });
    expect((await getCachedPublicSession(token, eventId, target.disciplineSessionId))?.snapshot).toEqual({ entries: [] });
    expect(await getCachedPublicSession(token, eventId, eventId)).toBeUndefined();
  });
});
