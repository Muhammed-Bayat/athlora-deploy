import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// The full 100m vertical slice, run serially against a fresh, deterministic
// database (global-setup truncates application tables before the run).
//
// Every run (one per project: desktop-chromium, mobile-chromium) works on
// data that is unique to that project, so desktop and mobile runs never
// interfere with each other.

const SQUAD = 'E2E';

function names(token: string) {
  return {
    alpha: `E2E Alpha ${token}`,
    bravo: `E2E Bravo ${token}`,
    charlie: `E2E Charlie ${token}`,
    delta: `E2E Delta ${token}`,
    competition: `E2E Competition ${token}`,
    training: `E2E Training ${token}`,
  };
}

function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The SPA is state-driven, not route-driven. Only one of the two coach
// consoles is visible per viewport (desktop sidebar vs. mobile bottom bar).
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

async function addEvent(page: Page, title: string, type: 'competition' | 'training'): Promise<void> {
  await page.getByRole('button', { name: 'Add event', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add event' });
  await dialog.getByLabel('Event title').fill(title);
  await dialog.getByLabel('Event type').selectOption(type);
  await dialog.getByLabel('Date').fill(todayIso());
  await dialog.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
}

async function openEventDetail(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: new RegExp(title) }).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Scopes to the row of the given athlete inside the results board of a dialog.
async function resultsRow(dialog: Locator, athleteName: string): Promise<Locator> {
  return dialog
    .getByRole('list', { name: 'Event results' })
    .getByText(athleteName, { exact: true })
    .locator('xpath=../..');
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(
    violations,
    violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

test.describe.serial('100m vertical slice', () => {
  test('roster, events, assignment, and starting the competition', async ({ page }) => {
    const token = test.info().project.name;
    const { alpha, bravo, charlie, delta, competition, training } = names(token);

    await page.goto('/');
    await waitForView(page, 'Dashboard');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    for (const name of [alpha, bravo, charlie, delta]) {
      await addAthlete(page, name);
      await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    }

    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, competition, 'competition');
    await addEvent(page, training, 'training');

    const competitionDetail = await openEventDetail(page, competition);
    const candidate = competitionDetail.getByLabel('Assign an active athlete');
    await expect(candidate).toBeEnabled();
    for (const name of [alpha, bravo, charlie, delta]) {
      await candidate.selectOption({ label: new RegExp(name) });
      await competitionDetail.getByRole('button', { name: 'Assign athlete' }).click();
      await expect(
        competitionDetail.getByRole('status').filter({ hasText: 'assigned with a pending RSVP' }),
      ).toBeVisible();
    }

    await competitionDetail.getByLabel(`RSVP for ${alpha}`).selectOption('yes');
    await expect(
      competitionDetail.getByRole('status').filter({ hasText: 'attending' }),
    ).toBeVisible();

    await competitionDetail.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: competition })).toHaveCount(0);

    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');

    const competitionCard = page
      .getByRole('heading', { name: competition, level: 3 })
      .locator('xpath=..');
    await competitionCard.getByRole('button', { name: 'Start Event' }).click();
    await expect(
      page.getByRole('heading', { name: competition, level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();

    await openView(page, 'Dashboard', 'Home');
    await expect(
      page.getByRole('region', { name: 'Dashboard overview' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume live logging' })).toBeVisible();
    await expect(page.getByText(competition, { exact: true })).toBeVisible();
  });

  test('live logging, timeline corrections, results overrides, and completing the event', async ({
    page,
  }) => {
    const token = test.info().project.name;
    const { alpha, bravo, charlie, delta, competition } = names(token);

    await page.goto('/');
    await waitForView(page, 'Dashboard');
    await page.getByRole('button', { name: 'Resume live logging' }).click();

    const consoleSection = page.getByRole('region', { name: 'Athlete logging console' });
    const feed = page.getByRole('complementary', { name: 'Timeline feed and standings' });
    const board = feed.getByRole('list', { name: 'Event results' });

    const finishInput = (athleteName: string) =>
      consoleSection.getByLabel(`Finish time for ${athleteName}`);
    const incidentButton = (athleteName: string, incident: string) =>
      finishInput(athleteName).locator('xpath=../..').getByRole('button', { name: incident });
    const boardRow = (athleteName: string) =>
      board.getByText(athleteName, { exact: true }).locator('xpath=../..');

    // Record a valid finish and a non-voiding penalty for the winner.
    await finishInput(alpha).fill('10.42');
    await finishInput(alpha).locator('xpath=..').getByRole('button', { name: 'Record' }).click();
    await expect(feed.getByText('Finish: 10.42s', { exact: true })).toBeVisible();
    await incidentButton(alpha, 'False Start').click();
    await expect(feed.getByText('Incident: False start', { exact: true })).toBeVisible();

    // Record the voiding incidents: DQ, DNF, DNS.
    for (const [athlete, incident] of [
      [bravo, 'DQ'],
      [charlie, 'DNF'],
      [delta, 'DNS'],
    ] as const) {
      await incidentButton(athlete, incident).click();
      await expect(
        feed.getByText(
          `Incident: ${incident === 'DQ' ? 'Disqualified' : incident === 'DNF' ? 'Did not finish' : 'Did not start'}`,
          { exact: true },
        ),
      ).toBeVisible();
    }

    await expect(boardRow(alpha)).toContainText('10.42s');
    await expect(boardRow(alpha)).toContainText('False start');
    await expect(boardRow(bravo)).toContainText('Disqualified');
    await expect(boardRow(charlie)).toContainText('Did not finish');
    await expect(boardRow(delta)).toContainText('Did not start');

    // Correct the recorded finish directly in the live timeline.
    await feed
      .getByText('Finish: 10.42s', { exact: true })
      .locator('xpath=../..')
      .getByRole('button', { name: 'Edit' })
      .click();
    const editDialog = page.getByRole('dialog', { name: 'Edit Timeline Entry' });
    await editDialog.getByLabel('Finish Time / Value (seconds)').fill('10.40');
    await editDialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(feed.getByText('Finish: 10.40s', { exact: true })).toBeVisible();
    await expect(boardRow(alpha)).toContainText('10.40s');

    // Undo the DQ; the athlete returns to no result and results recalculate.
    await feed
      .getByText('Incident: Disqualified', { exact: true })
      .locator('xpath=../..')
      .getByRole('button', { name: 'Undo' })
      .click();
    await page
      .getByRole('dialog', { name: 'Undo timeline entry' })
      .getByRole('button', { name: 'Undo entry' })
      .click();
    await expect(feed.getByText('Incident: Disqualified', { exact: true })).toHaveCount(0);
    await expect(boardRow(bravo)).toContainText('No result recorded');

    // Apply a manual result override from the event detail, then clear it.
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    const competitionDetail = await openEventDetail(page, competition);
    const alphaRow = await resultsRow(competitionDetail, alpha);
    await alphaRow.getByRole('button', { name: 'Correct time' }).click();

    const correctionDialog = page.getByRole('dialog', { name: `Correct ${alpha}` });
    await correctionDialog.getByLabel('Corrected time (seconds)').fill('10.35');
    await correctionDialog.getByLabel('Reason for correction').fill('E2E override');
    await correctionDialog.getByRole('button', { name: 'Apply correction' }).click();

    const detailAfterApply = page.getByRole('dialog', { name: competition });
    await expect(detailAfterApply.getByText('Manual correction', { exact: true })).toBeVisible();
    await expect(await resultsRow(detailAfterApply, alpha)).toContainText('10.35s');

    const alphaRowAfterApply = await resultsRow(detailAfterApply, alpha);
    await alphaRowAfterApply.getByRole('button', { name: 'Review correction' }).click();
    const reviewDialog = page.getByRole('dialog', { name: `Correct ${alpha}` });
    await reviewDialog.getByRole('button', { name: 'Clear correction' }).click();
    await reviewDialog.getByRole('button', { name: 'Confirm clear' }).click();

    const detailAfterClear = page.getByRole('dialog', { name: competition });
    await expect(detailAfterClear.getByText('Manual correction', { exact: true })).toHaveCount(0);
    await expect(await resultsRow(detailAfterClear, alpha)).toContainText('10.40s');
    await detailAfterClear.getByRole('button', { name: 'Close' }).click();

    // Complete the event from the live logger.
    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const competitionCard = page
      .getByRole('heading', { name: competition, level: 3 })
      .locator('xpath=..');
    await competitionCard.getByRole('button', { name: 'Open Live Logger ›' }).click();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();
    await page.getByRole('button', { name: 'Complete Event' }).click();

    // Completed events leave the logger; the dashboard returns to summary mode.
    await expect(page.getByRole('heading', { name: competition, level: 3 })).toHaveCount(0);
    await openView(page, 'Dashboard', 'Home');
    await expect(page.getByRole('button', { name: 'Resume live logging' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Roster snapshot', level: 2 }),
    ).toBeVisible();
  });

  test('statistics, dashboard summary, cancelled training, and archived athletes', async ({
    page,
  }) => {
    const token = test.info().project.name;
    const { alpha, delta, competition, training } = names(token);

    await page.goto('/');
    await waitForView(page, 'Dashboard');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');

    // Find the winner on the roster and open the performance detail.
    await page.getByPlaceholder('Search athletes...').fill(alpha);
    await expect(page.getByRole('heading', { name: alpha, level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'View performance' }).click();

    await expect(page.getByRole('heading', { name: alpha, level: 1 })).toBeVisible();
    const kpi = page.getByRole('region', { name: '100m performance summary' });
    await expect(kpi.getByText('10.40s', { exact: true })).toHaveCount(2);

    const competitions = page.getByRole('tabpanel', { name: /Competitions/ });
    await expect(competitions.getByText(competition, { exact: true })).toBeVisible();
    await expect(competitions.getByText('Personal best (PB)', { exact: true })).toBeVisible();
    await expect(competitions.getByText('Season best (SB)', { exact: true })).toBeVisible();

    // Cancel the training session; it stays in history as cancelled.
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    const trainingDetail = await openEventDetail(page, training);
    await trainingDetail.getByRole('button', { name: 'Cancel event' }).click();
    const cancelDialog = page.getByRole('dialog', { name: 'Cancel event' });
    await cancelDialog.getByRole('button', { name: 'Cancel event', exact: true }).click();
    await expect(trainingDetail.getByText('Cancelled', { exact: true })).toBeVisible();
    await trainingDetail.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: new RegExp(training) })).toContainText(
      'Cancelled',
    );

    // Archive an athlete; the active roster count drops and the dashboard
    // excludes them from the roster snapshot.
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    const deltaCard = page.getByText(delta, { exact: true }).locator('xpath=..');
    await deltaCard.getByRole('button', { name: 'Archive' }).click();
    const archiveDialog = page.getByRole('dialog', { name: 'Archive athlete' });
    await archiveDialog.getByRole('button', { name: 'Archive athlete', exact: true }).click();
    await expect(page.getByText(delta, { exact: true })).toHaveCount(0);
    await expect(page.getByText('3 athletes shown', { exact: true })).toBeVisible();

    await openView(page, 'Dashboard', 'Home');
    const snapshot = page.getByRole('region', { name: 'Roster snapshot' });
    await expect(snapshot).toContainText(alpha);
    await expect(snapshot).not.toContainText(delta);
  });

  test('key coach views have no critical or serious accessibility violations', async ({
    page,
  }) => {
    const token = test.info().project.name;
    const { alpha, competition } = names(token);

    await page.goto('/');

    const views: Array<[string, () => Promise<void>]> = [
      ['Dashboard', () => openView(page, 'Dashboard', 'Home')],
      ['Athletes', () => openView(page, 'Athletes', 'Athletes')],
      ['Events', () => openView(page, 'Events', 'Events')],
      ['Live Logger', () => openView(page, 'Live Logger', 'Live')],
    ];

    for (const [name, navigate] of views) {
      await navigate();
      await waitForView(page, name);
      await expectNoSeriousViolations(page);
    }

    // Launch a fresh event so the logging console is reachable after the flow.
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await addEvent(page, `E2E Audit ${token}`, 'training');
    await openView(page, 'Live Logger', 'Live');
    await waitForView(page, 'Live Race Logger');
    const auditCard = page
      .getByRole('heading', { name: `E2E Audit ${token}`, level: 3 })
      .locator('xpath=..');
    await auditCard.getByRole('button', { name: 'Start Event' }).click();
    await expect(page.getByRole('button', { name: 'Complete Event' })).toBeVisible();
    await expectNoSeriousViolations(page);

    // Open the athlete performance detail.
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await page.getByPlaceholder('Search athletes...').fill(alpha);
    await page.getByRole('button', { name: 'View performance' }).click();
    await expect(page.getByRole('heading', { name: alpha, level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page);

    // A completed competition on the events calendar.
    await openView(page, 'Events', 'Events');
    await waitForView(page, 'Events');
    await expect(page.getByRole('button', { name: new RegExp(competition) })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
