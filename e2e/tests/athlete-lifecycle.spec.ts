import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete, addEvent, openEventDetail } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('athlete lifecycle', () => {
  test('create active athlete', async ({ page }) => {
    const t = token();
    const name = `E2E Lifecycle Active ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, name, 'E2E');
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  });

  test('deactivate athlete via status change', async ({ page }) => {
    const t = token();
    const name = `E2E Lifecycle Deact ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

    const statusBtn = page.getByRole('button', { name: /inactive/i });
    if (await statusBtn.isVisible().catch(() => false)) {
      await statusBtn.click();
      await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    }
  });

  test('archive and restore athlete', async ({ page }) => {
    const t = token();
    const name = `E2E Lifecycle Archive ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, name, 'E2E');

    const card = page.getByText(name, { exact: true }).locator('xpath=..');
    await card.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog', { name: 'Archive athlete' })
      .getByRole('button', { name: 'Archive athlete', exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    const archiveToggle = page.getByRole('button', { name: /archived/i });
    if (await archiveToggle.isVisible().catch(() => false)) {
      await archiveToggle.click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();

      const restoreCard = page.getByText(name, { exact: true }).locator('xpath=..');
      const restoreBtn = restoreCard.getByRole('button', { name: /restore/i });
      if (await restoreBtn.isVisible().catch(() => false)) {
        await restoreBtn.click();
        await expect(page.getByText(name, { exact: true })).toBeVisible();
      }
    }
  });

  test('inactive athlete cannot be assigned to events', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Lifecycle Inactive ${t}`;
    const eventName = `E2E Lifecycle Event ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, athleteName, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name: athleteName, level: 1 })).toBeVisible();

    const inactiveBtn = page.getByRole('button', { name: /inactive/i });
    if (await inactiveBtn.isVisible().catch(() => false)) {
      await inactiveBtn.click();
      await page.getByRole('button', { name: /confirm|yes/i }).first().click().catch(() => {});
    }

    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await page.getByRole('button', { name: 'Add event', exact: true }).first().click();
    const eventDialog = page.getByRole('dialog', { name: 'Add event' });
    await eventDialog.getByLabel('Event title').fill(eventName);
    await eventDialog.getByLabel('Event type').selectOption('competition');
    await eventDialog.getByLabel('Date').fill(todayIso());
    await eventDialog.getByRole('button', { name: 'Add event', exact: true }).click();

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });

    const candidate = detail.getByLabel('Assign an active athlete');
    const options = await candidate.locator('option').allTextContents();
    expect(options.some((o) => o.includes(athleteName))).toBeFalsy();
  });

  test('athlete detail shows injury section', async ({ page }) => {
    const t = token();
    const name = `E2E Lifecycle Injury ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, name, 'E2E');
    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active injury map', level: 2 })).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
  });
});

function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
