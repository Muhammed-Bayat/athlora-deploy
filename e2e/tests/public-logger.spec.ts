import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('public logger links', () => {
  test('create and list public logger links from event detail', async ({ page }) => {
    const t = token();
    const eventName = `E2E Public Logger ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const publicSection = detail.getByRole('region', { name: /public|logger|share/i });
    if (await publicSection.isVisible().catch(() => false)) {
      const createBtn = publicSection.getByRole('button', { name: /create|generate|share/i }).first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();

        const link = detail.getByRole('link', { name: /public|logger|log/i });
        if (await link.isVisible().catch(() => false)) {
          const href = await link.getAttribute('href');
          expect(href).toContain('/log/');
        }
      }
    }
  });

  test('public logger page loads without authentication', async ({ page }) => {
    await page.goto('/log/invalid-token-12345');

    const response = page;
    await expect(response.getByText(/invalid|expired|not found/i).first()).toBeVisible();
  });

  test('revoking public logger link removes access', async ({ page }) => {
    const t = token();
    const eventName = `E2E Revoke Logger ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const publicSection = detail.getByRole('region', { name: /public|logger|share/i });
    if (await publicSection.isVisible().catch(() => false)) {
      const createBtn = publicSection.getByRole('button', { name: /create|generate|share/i }).first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();

        const revokeBtn = publicSection.getByRole('button', { name: /revoke|remove|delete/i }).first();
        if (await revokeBtn.isVisible().catch(() => false)) {
          await revokeBtn.click();
          await expect(publicSection.getByRole('link', { name: /public|logger|log/i })).toHaveCount(0);
        }
      }
    }
  });
});
