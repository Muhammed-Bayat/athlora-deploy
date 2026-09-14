import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('squad management', () => {
  test('create a squad via the athletes page', async ({ page }) => {
    const t = token();
    const squadName = `E2E Squad ${t}`;
    const athleteName = `E2E Squad Athlete ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, athleteName, squadName);

    const card = page.getByText(athleteName, { exact: true }).locator('xpath=..');
    await expect(card).toBeVisible();
  });

  test('assign athletes to squads via the roster', async ({ page }) => {
    const t = token();
    const squad1 = `E2E Red ${t}`;
    const squad2 = `E2E Blue ${t}`;
    const athlete1 = `E2E Squad A ${t}`;
    const athlete2 = `E2E Squad B ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, athlete1, squad1);
    await addAthlete(page, athlete2, squad2);

    await expect(page.getByRole('heading', { name: athlete1, level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: athlete2, level: 2 })).toBeVisible();
  });

  test('filter roster by squad name', async ({ page }) => {
    const t = token();
    const squadName = `E2E Filter ${t}`;
    const athleteName = `E2E Filter Athlete ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, athleteName, squadName);

    const searchInput = page.getByPlaceholder('Search athletes...');
    await searchInput.fill(athleteName);
    await expect(page.getByRole('heading', { name: athleteName, level: 2 })).toBeVisible();
    await expect(page.getByText(`${await page.getByText(/athletes shown/).textContent()}`)).toBeVisible();
  });

  test('archived athletes are hidden from default roster view', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Lifecycle ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, athleteName, 'E2E');

    const card = page.getByText(athleteName, { exact: true }).locator('xpath=..');
    await card.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog', { name: 'Archive athlete' })
      .getByRole('button', { name: 'Archive athlete', exact: true }).click();
    await expect(page.getByText(athleteName, { exact: true })).toHaveCount(0);
  });
});
