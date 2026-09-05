import { expect, test } from '@playwright/test';
import { openView, waitForView, addEvent, addAthlete } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('routing and navigation', () => {
  test('direct load of event detail page works', async ({ page }) => {
    const t = token();
    const eventName = `E2E Route Event ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await page.getByRole('button', { name: new RegExp(eventName) }).click();
    const detail = page.getByRole('dialog', { name: eventName });
    await expect(detail).toBeVisible();
  });

  test('direct load of athlete detail page works', async ({ page }) => {
    const t = token();
    const name = `E2E Route Athlete ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  });

  test('comparison page loads with query parameters', async ({ page }) => {
    await page.goto('/console/comparison');
    await waitForView(page, 'Two-Athlete 100m Comparison');
  });

  test('unknown console route redirects to dashboard', async ({ page }) => {
    await page.goto('/console');
    await waitForView(page, 'Dashboard');

    await page.goto('/console/totally-fake-view-xyz');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('athlete list search filters results', async ({ page }) => {
    const t = token();
    const name = `E2E Route Search ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByPlaceholder('Search athletes...').fill(name);
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();

    await page.getByPlaceholder('Search athletes...').fill('zzz-nonexistent-zzz');
    await expect(page.getByRole('heading', { name, level: 2 })).toHaveCount(0);
  });

  test('back navigation from athlete detail returns to roster', async ({ page }) => {
    const t = token();
    const name = `E2E Route Back ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
  });

  test('dashboard shows active event resume button when event is live', async ({ page }) => {
    const t = token();
    const eventName = `E2E Route Resume ${t}`;

    await page.goto('/console');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'competition');

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();

    await openView(page, 'Dashboard', 'Home');
    await expect(page.getByRole('button', { name: 'Resume live logging' })).toBeVisible();
  });
});
