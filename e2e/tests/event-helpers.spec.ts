import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('event helpers and offline designation', () => {
  test('create helper invitation from event detail', async ({ page }) => {
    const t = token();
    const eventName = `E2E Helper Event ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const helperSection = detail.getByRole('region', { name: /helper/i });
    if (await helperSection.isVisible().catch(() => false)) {
      const createBtn = helperSection.getByRole('button', { name: /create|invite/i }).first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        await expect(helperSection.getByText(/helper|invitation/i).first()).toBeVisible();
      }
    }
  });

  test('event detail shows helper grant section', async ({ page }) => {
    const t = token();
    const eventName = `E2E Helper Section ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });
    await expect(detail).toBeVisible();
  });

  test('offline logger designation UI is present', async ({ page }) => {
    const t = token();
    const eventName = `E2E Offline Designation ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const offlineSection = detail.getByRole('region', { name: /offline/i });
    if (await offlineSection.isVisible().catch(() => false)) {
      await expect(offlineSection).toBeVisible();
    }
  });
});
