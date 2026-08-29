import { expect, test } from '@playwright/test';

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('host and guest complete a fixture invitation and roster flow', async ({ page, browser }) => {
  const suffix = `${test.info().project.name}-${Date.now()}`;
  const fixtureTitle = `E2E fixture ${suffix}`;
  const athleteName = `E2E guest athlete ${suffix}`;
  const guestEmail = process.env.E2E_GUEST_AUTH0_EMAIL;
  if (!guestEmail) throw new Error('E2E_GUEST_AUTH0_EMAIL is required for fixture tests');

  await page.goto('/console/events');
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  const eventDialog = page.getByRole('dialog', { name: 'Add event' });
  await eventDialog.getByLabel('Event title').fill(fixtureTitle);
  await eventDialog.getByLabel('Event type').selectOption('competition');
  await eventDialog.getByLabel('Date').fill(todayIso());
  await eventDialog.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(fixtureTitle) }).click();
  await expect(page.getByRole('heading', { name: fixtureTitle, level: 1 })).toBeVisible();

  await page.getByLabel('Guest coach email').fill(guestEmail);
  await page.getByRole('button', { name: 'Create fixture invitation' }).click();
  const invitationLink = page.locator('a[href*="/fixture-invitations/"]');
  await expect(invitationLink).toBeVisible();
  const href = await invitationLink.getAttribute('href');
  if (!href) throw new Error('Fixture invitation link was not created');

  const guestContext = await browser.newContext({ storageState: './.auth/guest.json' });
  const guestPage = await guestContext.newPage();
  try {
    await guestPage.goto(href);
    await guestPage.getByRole('button', { name: 'Accept fixture' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Fixtures', level: 1 })).toBeVisible();

    await guestPage.goto('/console/athletes');
    await guestPage.getByRole('button', { name: 'Add athlete', exact: true }).click();
    const athleteDialog = guestPage.getByRole('dialog', { name: 'Add athlete' });
    await athleteDialog.getByLabel('Athlete name').fill(athleteName);
    await athleteDialog.getByLabel('Date of birth').fill('2010-01-15');
    await athleteDialog.getByLabel('Gender category').fill('Female');
    await athleteDialog.getByRole('button', { name: 'Add athlete', exact: true }).click();

    await guestPage.goto('/console/fixtures');
    await expect(guestPage.getByRole('heading', { name: 'Fixtures', level: 1 })).toBeVisible();
    await guestPage.getByLabel('Assign active athlete').selectOption({ label: athleteName });
    await guestPage.getByRole('button', { name: 'Assign athlete' }).click();
    await expect(guestPage.getByText(athleteName, { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});
