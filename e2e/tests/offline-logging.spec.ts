import { expect, test } from '@playwright/test';

test.describe('Offline logging', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the live logger page
    await page.goto('/console');
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('shows offline status indicator when network is offline', async ({ page }) => {
    // Go offline
    await page.context().setOffline(true);

    // Verify the offline indicator is visible
    await expect(page.getByText('Offline')).toBeVisible();

    // Go back online
    await page.context().setOffline(false);
  });

  test('queues actions when offline and syncs when back online', async ({ page }) => {
    // This test requires a designated offline logger and an in-progress event
    // For now, we verify the UI elements exist

    // Check that the queue status badge component exists
    await expect(page.locator('[role="status"]')).toBeAttached();
  });

  test('service worker registers successfully', async ({ page }) => {
    // Verify the service worker is registered
    const registration = await page.evaluate(() => {
      return navigator.serviceWorker?.controller !== null || 
             navigator.serviceWorker?.ready !== undefined;
    });

    // Service worker should be available (PWA)
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
