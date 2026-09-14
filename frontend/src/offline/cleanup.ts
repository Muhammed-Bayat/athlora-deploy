import Dexie from 'dexie';
import { resetOfflineDB } from './db';

export async function purgeOfflineData(userId: string): Promise<void> {
  const dbName = `athlora-${userId}`;
  await Dexie.delete(dbName);
  resetOfflineDB();
}

export async function clearServiceWorkerCaches(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
    }
  }
}

export async function performFullCleanup(userId: string): Promise<void> {
  await Promise.all([purgeOfflineData(userId), clearServiceWorkerCaches()]);
}
