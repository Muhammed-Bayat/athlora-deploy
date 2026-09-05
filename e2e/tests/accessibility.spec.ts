import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openView, waitForView, addAthlete, addEvent, mockVenues, expectNoSeriousViolations } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('accessibility deep audit', () => {
  test.beforeEach(async ({ page }) => {
    await mockVenues(page);
  });

  test('dashboard has no serious violations', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Dashboard', 'Home');
    await waitForView(page, 'Dashboard');
    await expectNoSeriousViolations(page);
  });

  test('athletes roster has no serious violations', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await expectNoSeriousViolations(page);
  });

  test('events list has no serious violations', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await expectNoSeriousViolations(page);
  });

  test('comparison page has no serious violations', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');
    await expectNoSeriousViolations(page);
  });

  test('account page has no serious violations', async ({ page }) => {
    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('athlete detail page has no serious violations', async ({ page }) => {
    const t = token();
    const name = `E2E A11y Detail ${t}`;

    await page.goto('/');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('live logger page has no serious violations', async ({ page }) => {
    const t = token();
    const eventName = `E2E A11y Logger ${t}`;

    await page.goto('/');
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, eventName, 'training');

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const eventCard = page.getByRole('heading', { name: eventName, level: 3 }).locator('xpath=..');
    await eventCard.getByRole('button', { name: 'Start Event' }).click();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('fixtures page has no serious violations', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Fixtures', 'Fixtures');
    await expectNoSeriousViolations(page);
  });

  test('keyboard navigation works through main interactive elements', async ({ page }) => {
    await page.goto('/');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    const addButton = page.getByRole('button', { name: 'Add athlete', exact: true }).first();
    await addButton.focus();
    await expect(addButton).toBeFocused();

    await page.keyboard.press('Tab');
    const nextFocused = page.evaluate(() => document.activeElement?.tagName);
    expect(await nextFocused).toBeTruthy();
  });

  test('narrow viewport does not cause horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });
});
