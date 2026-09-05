import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('realtime invalidation', () => {
  test('Socket.IO connection banner is visible when live event exists', async ({ page }) => {
    const t = token();
    const eventName = `E2E Realtime ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();

    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();
  });

  test('live logger reflects new entries in real-time', async ({ page }) => {
    const t = token();
    const eventName = `E2E Realtime Entries ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();

    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Athlete logging console' })).toBeVisible();
  });

  test('event detail view shows realtime status for live event', async ({ page }) => {
    const t = token();
    const eventName = `E2E Realtime Detail ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();

    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });
    await expect(detail.getByText(/in.progress|live/i)).toBeVisible();
  });
});
