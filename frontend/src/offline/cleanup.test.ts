import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeOfflineData, clearServiceWorkerCaches, performFullCleanup } from './cleanup';

vi.mock('./db', () => ({
  resetOfflineDB: vi.fn(),
}));

describe('cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('purgeOfflineData deletes the Dexie database and resets the singleton', async () => {
    const { resetOfflineDB } = await import('./db');
    const Dexie = await import('dexie');
    const deleteSpy = vi.spyOn(Dexie.default, 'delete').mockResolvedValue(undefined);

    await purgeOfflineData('user-1');

    expect(deleteSpy).toHaveBeenCalledWith('athlora-user-1');
    expect(resetOfflineDB).toHaveBeenCalled();
  });

  it('clearServiceWorkerCaches deletes all caches when available', async () => {
    const deleteMock = vi.fn().mockResolvedValue(true);
    const keysMock = vi.fn().mockResolvedValue(['cache-1', 'cache-2']);
    vi.stubGlobal('caches', { keys: keysMock, delete: deleteMock });

    await clearServiceWorkerCaches();

    expect(keysMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith('cache-1');
    expect(deleteMock).toHaveBeenCalledWith('cache-2');
  });

  it('clearServiceWorkerCaches does nothing when caches API unavailable', async () => {
    const original = window.caches;
    // @ts-expect-error testing missing caches
    delete window.caches;

    await expect(clearServiceWorkerCaches()).resolves.toBeUndefined();

    window.caches = original;
  });

  it('performFullCleanup runs both purge and cache clear', async () => {
    const { resetOfflineDB } = await import('./db');
    const Dexie = await import('dexie');
    vi.spyOn(Dexie.default, 'delete').mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]), delete: deleteMock });

    await performFullCleanup('user-2');

    expect(resetOfflineDB).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
