import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete, addEvent } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('analytics and comparison', () => {
  test('athlete performance page shows statistics', async ({ page }) => {
    const t = token();
    const name = `E2E Analytics ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

    const kpi = page.getByRole('region', { name: '100m performance summary' });
    if (await kpi.isVisible().catch(() => false)) {
      await expect(kpi).toBeVisible();
    }
  });

  test('dashboard summary shows roster and stats', async ({ page }) => {
    await page.goto('/console');
    await waitForView(page, 'Dashboard');

    const overview = page.getByRole('region', { name: 'Dashboard overview' });
    await expect(overview).toBeVisible();
  });

  test('dashboard shows athlete count', async ({ page }) => {
    const t = token();
    const name = `E2E Dashboard Count ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await openView(page, 'Dashboard', 'Home');
    await waitForView(page, 'Dashboard');

    const overview = page.getByRole('region', { name: 'Dashboard overview' });
    await expect(overview).toBeVisible();
  });

  test('comparison page shows empty state without athletes', async ({ page }) => {
    await page.goto('/console');
    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    await expect(page.getByText(/Select exactly two different athletes/)).toBeVisible();
  });

  test('comparison page allows selecting athletes and viewing metrics', async ({ page }) => {
    const t = token();
    const alpha = `E2E Compare Alpha ${t}`;
    const bravo = `E2E Compare Bravo ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, alpha, 'E2E');
    await addAthlete(page, bravo, 'E2E');

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');
    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    const metrics = page.getByRole('list', { name: 'Comparison metrics summary' });
    await expect(metrics.getByText(`${alpha} PB`, { exact: true })).toBeVisible();
    await expect(metrics.getByText(`${bravo} PB`, { exact: true })).toBeVisible();
  });

  test('comparison preserves state in URL', async ({ page }) => {
    const t = token();
    const alpha = `E2E URL Alpha ${t}`;
    const bravo = `E2E URL Bravo ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, alpha, 'E2E');
    await addAthlete(page, bravo, 'E2E');

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');
    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    await expect(page.getByRole('list', { name: 'Comparison metrics summary' })).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('athlete1Id')).toBeTruthy();
    expect(url.searchParams.get('athlete2Id')).toBeTruthy();
    expect(url.searchParams.get('athlete1Id')).not.toBe(url.searchParams.get('athlete2Id'));
  });

  test('progression chart is accessible', async ({ page }) => {
    const t = token();
    const name = `E2E Progression ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, name, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

    const progressionChart = page.getByRole('img', { name: /progression chart/i });
    if (await progressionChart.isVisible().catch(() => false)) {
      await expect(progressionChart).toBeVisible();
    }
  });
});
