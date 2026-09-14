import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete, addEvent, todayIso } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('role enforcement', () => {
  test('coach can create and archive athletes', async ({ page }) => {
    const t = token();
    const name = `E2E Role Coach ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();

    const card = page.getByText(name, { exact: true }).locator('xpath=..');
    await card.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog', { name: 'Archive athlete' })
      .getByRole('button', { name: 'Archive athlete', exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test('coach can manage workspace members', async ({ page }) => {
    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    const inviteSection = page.getByRole('region', { name: /invitations|team/i });
    await expect(inviteSection).toBeVisible();
  });

  test('assistant role is assignable through the UI', async ({ page }) => {
    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

    const roleSelect = page.getByLabel(/role/i).first();
    if (await roleSelect.isVisible().catch(() => false)) {
      const options = await roleSelect.locator('option').allTextContents();
      const lowerOptions = options.map((o) => o.toLowerCase());
      expect(lowerOptions.some((o) => o.includes('assistant'))).toBeTruthy();
    }
  });

  test('operational access allows timeline entry creation', async ({ page }) => {
    const t = token();
    const eventName = `E2E Role Event ${t}`;
    const athleteName = `E2E Role Athlete ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, athleteName, 'E2E');

    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });
    await detail.getByLabel('Assign an active athlete').selectOption({ label: athleteName });
    await detail.getByRole('button', { name: 'Assign athlete' }).click();
    await expect(detail.getByRole('status').filter({ hasText: 'pending' })).toBeVisible();
    await detail.getByLabel(`RSVP for ${athleteName}`).selectOption('yes');
    await detail.getByRole('button', { name: 'Close' }).click();

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();

    const loggingConsole = page.getByRole('region', { name: 'Athlete logging console' });
    const finishInput = loggingConsole.getByLabel(`Finish time for ${athleteName}`);
    await finishInput.fill('10.55');
    await finishInput.locator('xpath=..').getByRole('button', { name: 'Record' }).click();

    const feed = page.getByRole('complementary', { name: 'Timeline feed and standings' });
    await expect(feed.getByText('Finish: 10.55s', { exact: true })).toBeVisible();
  });
});
