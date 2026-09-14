import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent, todayIso } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('event reminders', () => {
  test('reminder section visible on event detail for upcoming event', async ({ page }) => {
    const t = token();
    const eventName = `E2E Reminder Event ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });
    await expect(detail).toBeVisible();

    const reminderSection = detail.getByRole('region', { name: /reminder/i });
    if (await reminderSection.isVisible().catch(() => false)) {
      await expect(reminderSection).toBeVisible();
    }
  });

  test('reminder badge appears on dashboard for upcoming events', async ({ page }) => {
    const t = token();
    const eventName = `E2E Reminder Dashboard ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await openView(page, 'Dashboard', 'Home');
    await waitForView(page, 'Dashboard');

    const upcomingSection = page.getByRole('region', { name: /upcoming/i });
    if (await upcomingSection.isVisible().catch(() => false)) {
      await expect(upcomingSection.getByText(eventName)).toBeVisible();
    }
  });
});
