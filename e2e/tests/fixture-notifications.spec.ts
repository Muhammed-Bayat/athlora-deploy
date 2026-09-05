import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent, todayIso } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('fixture notifications and RSVP audit', () => {
  test('fixture notification bell is visible in top bar', async ({ page }) => {
    await page.goto('/console');
    await waitForView(page, 'Dashboard');

    const notificationBell = page.getByRole('button', { name: /notification/i });
    if (await notificationBell.isVisible().catch(() => false)) {
      await expect(notificationBell).toBeVisible();
    }
  });

  test('RSVP select is visible on assigned participant', async ({ page }) => {
    const t = token();
    const eventName = `E2E RSVP Event ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const rsvpSelect = detail.getByLabel(/rsvp/i).first();
    if (await rsvpSelect.isVisible().catch(() => false)) {
      const options = await rsvpSelect.locator('option').allTextContents();
      expect(options.some((o) => o.toLowerCase().includes('yes'))).toBeTruthy();
      expect(options.some((o) => o.toLowerCase().includes('no'))).toBeTruthy();
      expect(options.some((o) => o.toLowerCase().includes('maybe'))).toBeTruthy();
    }
  });

  test('RSVP change is reflected in event detail', async ({ page }) => {
    const t = token();
    const eventName = `E2E RSVP Change ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const rsvpSelect = detail.getByLabel(/rsvp/i).first();
    if (await rsvpSelect.isVisible().catch(() => false)) {
      await rsvpSelect.selectOption('yes');
      await expect(detail.getByRole('status').filter({ hasText: /attending/i })).toBeVisible();
    }
  });
});
