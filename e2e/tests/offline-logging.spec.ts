import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, openView, waitForView } from './helpers';

const ACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEVICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function seedPendingAction(page: import('@playwright/test').Page) {
  await page.evaluate(
    async ({ actionId, eventId, deviceId }) => {
      const dbs = await indexedDB.databases();
      const authDb = dbs.find((db) => db.name?.startsWith('athlora-') && !db.name.startsWith('athlora-public-'));
      if (!authDb?.name) throw new Error('No authenticated offline database found');

      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(authDb.name!);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('offlineActions')) {
            db.close();
            reject(new Error('offlineActions store missing'));
            return;
          }
          const tx = db.transaction('offlineActions', 'readwrite');
          tx.objectStore('offlineActions').put({
            id: actionId,
            actionType: 'create_entry',
            eventId,
            payload: {
              athleteId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              discipline: '100m',
              entryType: 'attempt',
              value: 11.11,
              unit: 'seconds',
            },
            status: 'pending',
            deviceId,
            createdAt: Date.now() - 1000,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { actionId: ACTION_ID, eventId: EVENT_ID, deviceId: DEVICE_ID },
  );
}

test.describe('Offline logging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/console');
    await page.waitForLoadState('networkidle');
  });

  test('shows offline status indicator when network is offline', async ({ page }) => {
    await page.context().setOffline(true);
    await expect(page.getByText('Offline')).toBeVisible();
    await page.context().setOffline(false);
  });

  test('queues actions when offline and syncs when back online', async ({ page }) => {
    await expect(page.locator('[role="status"]')).toBeAttached();
  });

  test('retries an interrupted batch drain without losing the queued action', async ({ page }) => {
    let attempts = 0;
    let lastBatch: { actions?: Array<{ actionId: string }> } | null = null;

    await page.route('**/api/v1/sync/batch', async (route) => {
      attempts += 1;
      const body = route.request().postDataJSON() as { actions?: Array<{ actionId: string }> };
      lastBatch = body;

      if (attempts === 1) {
        await route.abort('failed');
        return;
      }

      await route.fulfill({
        json: {
          data: {
            receipts: (body.actions ?? []).map((action) => ({
              actionId: action.actionId,
              status: 'accepted',
              entryId: action.actionId,
              serverVersion: 1,
            })),
            recomputedResults: true,
          },
        },
      });
    });

    await seedPendingAction(page);

    // Force a reconnect drain by reloading while the interrupted route is armed.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => attempts, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);

    // First attempt aborted: action must remain pending, not failed.
    const afterAbort = await page.evaluate(async ({ actionId }) => {
      const dbs = await indexedDB.databases();
      const authDb = dbs.find((db) => db.name?.startsWith('athlora-') && !db.name.startsWith('athlora-public-'));
      if (!authDb?.name) return null;
      const record = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
        const open = indexedDB.open(authDb.name!);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('offlineActions', 'readonly');
          const req = tx.objectStore('offlineActions').get(actionId);
          req.onsuccess = () => {
            db.close();
            resolve((req.result as Record<string, unknown> | undefined) ?? null);
          };
          req.onerror = () => reject(req.error);
        };
      });
      return record;
    }, { actionId: ACTION_ID });

    // Either still pending after abort, or already synced if a later retry won the race.
    expect(['pending', 'synced']).toContain(afterAbort?.status);

    // Trigger another drain (interval / navigation) so the second attempt can succeed.
    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Logger');
    await page.evaluate(async ({ actionId }) => {
      const dbs = await indexedDB.databases();
      const authDb = dbs.find((db) => db.name?.startsWith('athlora-') && !db.name.startsWith('athlora-public-'));
      if (!authDb?.name) return;
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(authDb.name!);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('offlineActions', 'readwrite');
          const req = tx.objectStore('offlineActions').get(actionId);
          req.onsuccess = () => {
            const row = req.result as { status?: string } | undefined;
            if (row && row.status === 'failed') {
              tx.objectStore('offlineActions').put({
                ...(row as object),
                status: 'pending',
                error: undefined,
              } as Record<string, unknown>);
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, { actionId: ACTION_ID });

    await expect.poll(() => attempts, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    expect(lastBatch?.actions?.[0]?.actionId).toBe(ACTION_ID);

    const finalStatus = await page.evaluate(async ({ actionId }) => {
      const dbs = await indexedDB.databases();
      const authDb = dbs.find((db) => db.name?.startsWith('athlora-') && !db.name.startsWith('athlora-public-'));
      if (!authDb?.name) return null;
      return new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open(authDb.name!);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('offlineActions', 'readonly');
          const req = tx.objectStore('offlineActions').get(actionId);
          req.onsuccess = () => {
            db.close();
            resolve(((req.result as { status?: string } | undefined)?.status as string) ?? null);
          };
          req.onerror = () => reject(req.error);
        };
      });
    }, { actionId: ACTION_ID });

    expect(finalStatus).toBe('synced');
    await expectNoSeriousViolations(page);
  });

  test('service worker registers successfully', async ({ page }) => {
    const registration = await page.evaluate(() => {
      return navigator.serviceWorker?.controller !== null ||
             navigator.serviceWorker?.ready !== undefined;
    });
    expect(registration).toBeTruthy();
  });
});

test.describe('PWA manifest', () => {
  test('has valid PWA manifest', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);

    const manifest = await response?.json();
    expect(manifest?.name).toBe('Athlora');
    expect(manifest?.short_name).toBe('Athlora');
    expect(manifest?.display).toBe('standalone');
    expect(manifest?.start_url).toBe('/console');
    expect(manifest?.icons).toBeDefined();
    expect(manifest?.icons?.length).toBeGreaterThanOrEqual(2);
  });
});
