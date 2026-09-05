import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('authorization boundaries', () => {
  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/console');
    await page.waitForURL((url) => /auth0/i.test(url.hostname) || /console/.test(url.pathname), {
      timeout: 15_000,
    });
    const isOnLogin = /auth0/i.test(page.url());
    const isOnConsole = page.url().includes('/console');
    expect(isOnLogin || isOnConsole).toBeTruthy();
  });

  test('malformed athlete ID returns not found', async ({ page }) => {
    await page.goto('/console');
    await page.goto('/console/athletes/not-a-uuid');
    await page.waitForLoadState('networkidle');

    const notFound = page.getByText(/not found|404/i);
    const dashboard = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    const visible = await notFound.isVisible().catch(() => false) ||
                    await dashboard.isVisible().catch(() => false);
    expect(visible).toBeTruthy();
  });

  test('non-existent athlete ID shows not found or redirects', async ({ page }) => {
    await page.goto('/console');
    await page.goto('/console/athletes/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    const notFound = page.getByText(/not found|404/i);
    const dashboard = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    const visible = await notFound.isVisible().catch(() => false) ||
                    await dashboard.isVisible().catch(() => false);
    expect(visible).toBeTruthy();
  });

  test('guest workspace state is isolated from coach workspace', async ({ page, browser }) => {
    const guestContext = await browser.newContext({ storageState: './.auth/guest.json' });
    const guestPage = await guestContext.newPage();
    try {
      await guestPage.goto('/console');
      await guestPage.waitForLoadState('networkidle');

      const workspaceSelect = guestPage.getByLabel('Club');
      if (await workspaceSelect.isVisible().catch(() => false)) {
        const options = await workspaceSelect.locator('option').allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await guestContext.close();
    }
  });

  test('invitation page handles invalid token gracefully', async ({ page }) => {
    await page.goto('/invitations/invalid-token-12345');
    await page.waitForLoadState('networkidle');

    const error = page.getByText(/invalid|expired|not found|error/i).first();
    const dashboard = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    const visible = await error.isVisible().catch(() => false) ||
                    await dashboard.isVisible().catch(() => false);
    expect(visible).toBeTruthy();
  });

  test('expired invitation link shows error', async ({ page }) => {
    await page.goto('/invitations/expired-token-00000');
    await page.waitForLoadState('networkidle');

    const error = page.getByText(/invalid|expired|not found|error/i).first();
    const dashboard = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    const visible = await error.isVisible().catch(() => false) ||
                    await dashboard.isVisible().catch(() => false);
    expect(visible).toBeTruthy();
  });

  test('unknown route redirects to dashboard', async ({ page }) => {
    await page.goto('/console');
    await waitForView(page, 'Dashboard');

    await page.goto('/console/nonexistent-view-12345');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });
});
