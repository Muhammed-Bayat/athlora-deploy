import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';

const hasIndexedDB = typeof indexedDB !== 'undefined';

class TestDB extends Dexie {
  offlineActions!: Dexie.Table<{
    id: string;
    actionType: string;
    eventId: string;
    status: string;
    deviceId: string;
    createdAt: number;
  }, string>;

  constructor() {
    super('test-offline-db');
    this.version(1).stores({
      offlineActions: 'id, [status+eventId+createdAt], eventId, status',
    });
  }
}

const describeIfIDB = hasIndexedDB ? describe : describe.skip;

describeIfIDB('Offline Action Queue', () => {
  let db: TestDB;

  beforeEach(() => {
    db = new TestDB();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('stores actions with correct schema', async () => {
    const action = {
      id: crypto.randomUUID(),
      actionType: 'create_entry',
      eventId: 'event-1',
      status: 'pending',
      deviceId: 'device-1',
      createdAt: Date.now(),
    };

    await db.offlineActions.add(action);
    const stored = await db.offlineActions.get(action.id);

    expect(stored).toBeDefined();
    expect(stored?.id).toBe(action.id);
    expect(stored?.actionType).toBe('create_entry');
    expect(stored?.eventId).toBe('event-1');
    expect(stored?.status).toBe('pending');
  });

  it('queries pending actions by eventId', async () => {
    await db.offlineActions.bulkAdd([
      {
        id: '1',
        actionType: 'create_entry',
        eventId: 'event-1',
        status: 'pending',
        deviceId: 'device-1',
        createdAt: 1000,
      },
      {
        id: '2',
        actionType: 'create_entry',
        eventId: 'event-2',
        status: 'pending',
        deviceId: 'device-1',
        createdAt: 2000,
      },
      {
        id: '3',
        actionType: 'edit_entry',
        eventId: 'event-1',
        status: 'synced',
        deviceId: 'device-1',
        createdAt: 3000,
      },
    ]);

    const event1Pending = await db.offlineActions
      .where({ status: 'pending', eventId: 'event-1' })
      .toArray();

    expect(event1Pending).toHaveLength(1);
    expect(event1Pending[0].id).toBe('1');
  });

  it('updates action status', async () => {
    await db.offlineActions.add({
      id: '1',
      actionType: 'create_entry',
      eventId: 'event-1',
      status: 'pending',
      deviceId: 'device-1',
      createdAt: Date.now(),
    });

    await db.offlineActions.update('1', { status: 'synced' });
    const updated = await db.offlineActions.get('1');

    expect(updated?.status).toBe('synced');
  });

  it('counts pending actions by status', async () => {
    await db.offlineActions.bulkAdd([
      { id: '1', actionType: 'create_entry', eventId: 'event-1', status: 'pending', deviceId: 'device-1', createdAt: 1000 },
      { id: '2', actionType: 'create_entry', eventId: 'event-1', status: 'pending', deviceId: 'device-1', createdAt: 2000 },
      { id: '3', actionType: 'create_entry', eventId: 'event-1', status: 'synced', deviceId: 'device-1', createdAt: 3000 },
      { id: '4', actionType: 'create_entry', eventId: 'event-1', status: 'failed', deviceId: 'device-1', createdAt: 4000 },
    ]);

    const pendingCount = await db.offlineActions.where({ status: 'pending' }).count();
    const syncedCount = await db.offlineActions.where({ status: 'synced' }).count();
    const failedCount = await db.offlineActions.where({ status: 'failed' }).count();

    expect(pendingCount).toBe(2);
    expect(syncedCount).toBe(1);
    expect(failedCount).toBe(1);
  });
});
