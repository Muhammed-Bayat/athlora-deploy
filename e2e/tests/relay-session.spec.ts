import { expect, test } from '@playwright/test';

test('Relay session setup, team logging, official selection, and standings', async ({ page }) => {
  const title = `Relay meet ${test.info().project.name}`;
  await page.route('**/api/v1/venues/search**', route => route.fulfill({ json: { data: [{ displayName: 'Central Stadium, Johannesburg', latitude: -26.2041, longitude: 28.0473 }], meta: { count: 1 } } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 }).first()).toBeVisible();
  const desktop = page.getByRole('navigation', { name: 'Coach console' }).getByRole('button', { name: 'Events', exact: true });
  if (await desktop.isVisible()) await desktop.click();
  else await page.getByRole('navigation', { name: 'Mobile coach console' }).getByRole('button', { name: 'Events', exact: true }).click();

  await page.getByRole('button', { name: 'Add event', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: 'Add event' });
  await form.getByLabel('Event title').fill(title);
  await form.getByLabel('Event type').selectOption('competition');
  await form.getByLabel('Multi-discipline meet').check();
  await form.getByLabel('Date', { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel('Venue or address').fill('Central Stadium');
  await form.getByRole('button', { name: 'Search venues' }).click();
  await form.getByRole('button', { name: /Central Stadium, Johannesburg/ }).click();
  await form.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();

  const roster = page.getByRole('region', { name: 'Multi-discipline meet roster' });
  await expect(roster).toBeVisible();
  await roster.getByLabel('Discipline').selectOption({ label: '4 × 400m relay' });
  await roster.getByLabel('Session label').fill('4x400m Heat 1');
  await roster.getByRole('button', { name: 'Add session' }).click();
  await roster.getByLabel('Session').selectOption({ index: 1 });

  await roster.getByLabel('Guest name').fill('Relay Leg One');
  await roster.getByRole('button', { name: 'Add guest', exact: true }).click();
  await roster.getByLabel('Guest name').fill('Relay Leg Two');
  await roster.getByRole('button', { name: 'Add guest', exact: true }).click();

  await roster.getByLabel('Team name').fill('Speed Demons');
  await roster.getByLabel('Relay Leg One').check();
  await roster.getByLabel('Relay Leg Two').check();
  await roster.getByRole('button', { name: 'Add relay' }).click();
  await expect(roster.getByRole('list', { name: 'Registered entrants' })).toContainText('Speed Demons');
  await expect(roster.getByRole('list', { name: 'Registered entrants' })).toContainText('Relay Leg One → Relay Leg Two');

  await page.getByRole('button', { name: 'Start event', exact: true }).click();
  await page.getByRole('dialog', { name: 'Start event', exact: true }).getByRole('button', { name: 'Start event', exact: true }).click();

  const live = page.getByRole('region', { name: 'Session live logging' });
  await expect(live).toBeVisible();
  await live.getByLabel('Session').selectOption({ index: 1 });
  await live.getByRole('button', { name: 'Start session' }).click();
  await live.getByLabel('Team').selectOption({ label: 'Speed Demons' });
  await expect(live.getByLabel('Team members')).toContainText('Relay Leg One → Relay Leg Two');

  await live.getByLabel('Time (s)').fill('62.40');
  await live.getByRole('button', { name: 'Log attempt' }).click();
  await expect(live.getByRole('list').filter({ hasText: '62.40' }).first()).toBeVisible();

  await live.getByLabel('Time (s)').fill('61.10');
  await live.getByRole('button', { name: 'Log attempt' }).click();
  await expect(live.getByRole('list').filter({ hasText: '61.10' }).first()).toBeVisible();

  await live.getByRole('button', { name: 'Make official' }).first().click();
  await expect(live.getByRole('table')).toContainText('Speed Demons');
  await expect(live.getByRole('table')).toContainText('Relay Leg One → Relay Leg Two');
  await expect(live.getByRole('table')).toContainText('Selected');

  await live.getByRole('button', { name: 'Complete session' }).click();
  await expect(live.getByRole('heading', { name: /Standings/ })).toBeVisible();
  await expect(live.getByRole('button', { name: 'Export results CSV' })).toBeEnabled();
});
