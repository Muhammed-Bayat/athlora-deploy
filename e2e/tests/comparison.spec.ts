import { expect, test, type Page } from '@playwright/test';

const SQUAD = 'E2E';

function names(token: string) {
  return {
    alpha: `E2E Compare Alpha ${token}`,
    bravo: `E2E Compare Bravo ${token}`,
  };
}

function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openView(page: Page, desktopName: string, mobileName: string): Promise<void> {
  const desktopButton = page
    .getByRole('navigation', { name: 'Coach console' })
    .getByRole('button', { name: desktopName });
  if (await desktopButton.isVisible().catch(() => false)) {
    await desktopButton.click();
  } else {
    await page
      .getByRole('navigation', { name: 'Mobile coach console' })
      .getByRole('button', { name: mobileName })
      .click();
  }
}

async function waitForView(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible();
}

async function addAthlete(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add athlete', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add athlete' });
  await dialog.getByLabel('Athlete name').fill(name);
  await dialog.getByLabel('Date of birth').fill('2010-01-15');
  await dialog.getByLabel('Gender category').fill('Female');
  await dialog.getByLabel('Discipline group / squad').fill(SQUAD);
  await dialog.getByRole('button', { name: 'Add athlete', exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

test.describe('two-athlete comparison', () => {
  test('allows selecting two athletes and viewing comparison metrics', async ({ page }) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { alpha, bravo } = names(token);

    await page.goto('/console');

    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, alpha);
    await addAthlete(page, bravo);

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const emptyState = page.getByText(/Select exactly two different athletes/);
    await expect(emptyState).toBeVisible();

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');

    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    await expect(page.getByText('PB')).toBeVisible();
    await expect(page.getByText('Valid result count')).toBeVisible();

    const tableButton = page.getByRole('button', { name: 'Table' });
    await tableButton.click();

    await expect(page.getByRole('table', { name: /comparison metrics/i })).toBeVisible();
  });

  test('prevents selecting the same athlete twice', async ({ page }) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { alpha } = names(token);

    await page.goto('/console');

    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, alpha);

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');

    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: alpha });

    await expect(page.getByText(/Select exactly two different athletes/)).toBeVisible();
  });

  test('preserves comparison state in URL query parameters', async ({ page }) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { alpha, bravo } = names(token);

    await page.goto('/console');

    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, alpha);
    await addAthlete(page, bravo);

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');

    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    await expect(page.getByText('PB')).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('athlete1Id')).toBeTruthy();
    expect(url.searchParams.get('athlete2Id')).toBeTruthy();
    expect(url.searchParams.get('athlete1Id')).not.toBe(url.searchParams.get('athlete2Id'));
  });

  test('has accessible chart with textual equivalent', async ({ page }) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { alpha, bravo } = names(token);

    await page.goto('/console');

    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    await addAthlete(page, alpha);
    await addAthlete(page, bravo);

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');

    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    await expect(page.getByRole('img', { name: /progression chart/i })).toBeVisible();
  });
});
