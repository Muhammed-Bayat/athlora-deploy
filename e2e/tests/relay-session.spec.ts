import { expect, test } from '@playwright/test';

test('Relay session setup, per-athlete split logging, official leg selections, and team standings', async ({ page }) => {
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
  await roster.getByLabel('Discipline').selectOption({ label: '4 × 100m relay' });
  await roster.getByLabel('Session label').fill('4x100m Heat 1');
  await roster.getByRole('button', { name: 'Add session' }).click();
  await roster.getByLabel('Session').selectOption({ index: 1 });

  for (const name of ['Relay Leg One', 'Relay Leg Two', 'Relay Leg Three', 'Relay Leg Four']) {
    await roster.getByLabel('Guest name').fill(name);
    await roster.getByRole('button', { name: 'Add guest', exact: true }).click();
  }

  await roster.getByLabel('Team name').fill('Speed Demons');
  await roster.getByLabel('Relay Leg One').check();
  await roster.getByLabel('Relay Leg Two').check();
  await roster.getByLabel('Relay Leg Three').check();
  await roster.getByLabel('Relay Leg Four').check();
  await roster.getByRole('button', { name: 'Add relay' }).click();
  await expect(roster.getByRole('list', { name: 'Registered entrants' })).toContainText('Speed Demons');
  await expect(roster.getByRole('list', { name: 'Registered entrants' })).toContainText('Relay Leg One → Relay Leg Two');

  await page.getByRole('button', { name: 'Start event', exact: true }).click();
  await page.getByRole('dialog', { name: 'Start event', exact: true }).getByRole('button', { name: 'Start event', exact: true }).click();

  const live = page.getByRole('region', { name: 'Session live logging' });
  await expect(live).toBeVisible();
  await live.getByRole('tab', { name: /4x100m Heat 1/ }).click();
  await live.getByRole('button', { name: 'Start session' }).click();

  const teamRow = live.getByRole('group', { name: 'Speed Demons' });
  await expect(teamRow.getByLabelText('Team members')).toContainText('Relay Leg One → Relay Leg Two');
  await expect(teamRow.getByText('Relay splits', { exact: true })).toHaveCount(4);

  const legs: Array<[string, string]> = [
    ['Relay Leg One', '11.10'],
    ['Relay Leg Two', '11.20'],
    ['Relay Leg Three', '11.30'],
    ['Relay Leg Four', '11.40'],
  ];
  for (const [index, [name, value]] of legs.entries()) {
    const split = teamRow.getByLabel(`Relay splits for ${name} (leg ${index + 1})`);
    await split.fill(value);
    await split.locator('xpath=..').getByRole('button', { name: 'Record' }).click();
    await expect(teamRow.getByRole('list', { name: `Relay splits for ${name}` })).toContainText(value);
  }

  for (const [name] of legs) {
    const splitEntries = teamRow.getByRole('list', { name: `Relay splits for ${name}` });
    await splitEntries.getByRole('button', { name: 'Make official' }).click();
    await expect(splitEntries.getByText(/· official/)).toBeVisible();
  }

  const provisional = live.getByRole('table');
  await expect(provisional).toContainText('Speed Demons');
  await expect(provisional).toContainText('Relay Leg One → Relay Leg Two');
  await expect(provisional).toContainText('Awaiting selection');
  await expect(provisional).toContainText('Relay Leg One 11.10 · Relay Leg Two 11.20 · Relay Leg Three 11.30 · Relay Leg Four 11.40');

  await live.getByRole('button', { name: 'Finalize session' }).click();
  await expect(live.getByRole('heading', { name: 'Standings (final)' })).toBeVisible();
  await expect(live.getByRole('table')).toContainText('45.00 s');
  await expect(live.getByRole('table')).toContainText('11.10 · Relay Leg Two 11.20 · Relay Leg Three 11.30 · Relay Leg Four 11.40');
  await expect(live.getByRole('button', { name: 'Make official' })).toHaveCount(0);
  await expect(live.getByRole('button', { name: 'Export results CSV' })).toBeEnabled();

  await live.getByRole('button', { name: 'Reopen session' }).click();
  await expect(live.getByRole('heading', { name: 'Standings (reopened — provisional)' })).toBeVisible();
  await expect(live.getByRole('table')).toContainText('Awaiting selection');
  await expect(live.getByRole('button', { name: 'Make official' })).toHaveCount(4);
});
