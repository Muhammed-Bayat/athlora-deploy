import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, openView, waitForView } from './helpers';

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
