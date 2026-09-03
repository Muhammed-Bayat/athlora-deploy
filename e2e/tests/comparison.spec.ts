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

async function recordComparisonResults(
  page: Page,
  eventTitle: string,
  athletes: Array<{ name: string; result: string }>,
): Promise<void> {
  await openView(page, 'Events', 'Events');
  await waitForView(page, 'Events');
  await page.getByRole('button', { name: 'Add event', exact: true }).first().click();

  const eventDialog = page.getByRole('dialog', { name: 'Add event' });
  await eventDialog.getByLabel('Event title').fill(eventTitle);
  await eventDialog.getByLabel('Event type').selectOption('competition');
  await eventDialog.getByLabel('Date').fill(todayIso());
  await eventDialog.getByRole('button', { name: 'Add event', exact: true }).click();

  await page.getByRole('button', { name: new RegExp(eventTitle) }).click();
  const eventDetail = page.getByRole('dialog', { name: eventTitle });
  const candidate = eventDetail.getByLabel('Assign an active athlete');
  for (const athlete of athletes) {
    await candidate.selectOption({ label: athlete.name });
    await eventDetail.getByRole('button', { name: 'Assign athlete' }).click();
    await expect(
      eventDetail.getByRole('status').filter({ hasText: 'assigned with a pending RSVP' }),
    ).toBeVisible();
    await eventDetail.getByLabel(`RSVP for ${athlete.name}`).selectOption('yes');
    await expect(eventDetail.getByRole('status').filter({ hasText: 'attending' })).toBeVisible();
  }
  await eventDetail.getByRole('button', { name: 'Close' }).click();

  await openView(page, 'Live Logger', 'Live');
  await waitForView(page, 'Live Race Logger');
  const eventCard = page.getByRole('heading', { name: eventTitle, level: 3 }).locator('xpath=..');
  await eventCard.getByRole('button', { name: 'Start Event' }).click();

  const loggingConsole = page.getByRole('region', { name: 'Athlete logging console' });
  const feed = page.getByRole('complementary', { name: 'Timeline feed and standings' });
  for (const athlete of athletes) {
    const finishInput = loggingConsole.getByLabel(`Finish time for ${athlete.name}`);
    await finishInput.fill(athlete.result);
    await finishInput.locator('xpath=..').getByRole('button', { name: 'Record' }).click();
    await expect(feed.getByText(`Finish: ${athlete.result}s`, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Complete Event' }).click();
  await expect(page.getByRole('heading', { name: eventTitle, level: 3 })).toHaveCount(0);
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

    const metrics = page.getByRole('list', { name: 'Comparison metrics summary' });
    await expect(metrics.getByText(`${alpha} PB`, { exact: true })).toBeVisible();
    await expect(metrics.getByText(`${bravo} PB`, { exact: true })).toBeVisible();

    const tableButton = page.getByRole('button', { name: 'Table' });
    await tableButton.click();

    const table = page.getByRole('table', { name: /comparison metrics/i });
    await expect(table).toBeVisible();
    await expect(table.getByText('Valid result count')).toBeVisible();
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

    await expect(
      page.getByRole('list', { name: 'Comparison metrics summary' }),
    ).toBeVisible();

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

    await recordComparisonResults(page, `E2E Compare Event ${token}`, [
      { name: alpha, result: '11.42' },
      { name: bravo, result: '11.58' },
    ]);

    await openView(page, 'Compare', 'Compare');
    await waitForView(page, 'Two-Athlete 100m Comparison');

    const select1 = page.getByLabel('Select first athlete for comparison');
    const select2 = page.getByLabel('Select second athlete for comparison');

    await select1.selectOption({ label: alpha });
    await select2.selectOption({ label: bravo });

    await expect(page.getByRole('img', { name: /progression chart/i })).toBeVisible();
  });
});
