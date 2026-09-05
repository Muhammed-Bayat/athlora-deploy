import { expect, type Locator, type Page } from '@playwright/test';

export async function openView(page: Page, desktopName: string, mobileName: string): Promise<void> {
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

export async function waitForView(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible();
}

export async function addAthlete(page: Page, name: string, squad?: string): Promise<void> {
  await page.getByRole('button', { name: 'Add athlete', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add athlete' });
  await dialog.getByLabel('Athlete name').fill(name);
  await dialog.getByLabel('Date of birth').fill('2010-01-15');
  await dialog.getByLabel('Gender category').fill('Female');
  if (squad) {
    await dialog.getByLabel('Discipline group / squad').fill(squad);
  }
  await dialog.getByRole('button', { name: 'Add athlete', exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

export async function addEvent(page: Page, title: string, type: 'competition' | 'training'): Promise<void> {
  await page.getByRole('button', { name: 'Add event', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add event' });
  await dialog.getByLabel('Event title').fill(title);
  await dialog.getByLabel('Event type').selectOption(type);
  await dialog.getByLabel('Date').fill(todayIso());
  await dialog.getByLabel('Venue or address').fill('Central Stadium');
  await dialog.getByRole('button', { name: 'Search venues' }).click();
  await dialog.getByRole('button', { name: /Central Stadium, Johannesburg/ }).click();
  await dialog.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
}

export async function openEventDetail(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: new RegExp(title) }).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function resultsRow(dialog: Locator, athleteName: string): Promise<Locator> {
  return dialog
    .getByRole('list', { name: 'Event results' })
    .getByText(athleteName, { exact: true })
    .locator('xpath=../..');
}

export async function mockVenues(page: Page): Promise<void> {
  await page.route('**/api/v1/venues/search**', async (route) =>
    route.fulfill({
      json: {
        data: [{ displayName: 'Central Stadium, Johannesburg', latitude: -26.2041, longitude: 28.0473 }],
        meta: { count: 1 },
      },
    }),
  );
}

function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
