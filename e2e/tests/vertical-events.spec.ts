import { expect, test } from '@playwright/test';

test('High Jump setup, progression, audited attempts and finalized placing', async ({ page }) => {
  const title = `Vertical meet ${test.info().project.name}`;
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
  await form.getByLabel('Date', { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel('Venue or address').fill('Central Stadium');
  await form.getByRole('button', { name: 'Search venues' }).click();
  await form.getByRole('button', { name: /Central Stadium, Johannesburg/ }).click();
  await form.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: 'High Jump / Pole Vault sessions' }).click();
  const vertical = page.getByRole('region', { name: 'Vertical events', exact: true });
  await vertical.getByLabel('Vertical discipline').selectOption({ label: 'High Jump' });
  await vertical.getByLabel('Starting height (m)').fill('1.50');
  await vertical.getByLabel('Height increment (m)').fill('0.05');
  await vertical.getByRole('button', { name: 'Add vertical session' }).click();
  await vertical.getByLabel('Guest name').fill('Vertical athlete');
  await vertical.getByRole('button', { name: 'Add entrant', exact: true }).click();
  await expect(vertical.getByLabel('Vertical entrant')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Start event', exact: true }).click();
  await page.getByRole('dialog', { name: 'Start event', exact: true }).getByRole('button', { name: 'Start event', exact: true }).click();
  await vertical.getByRole('button', { name: 'Start vertical session' }).click();
  for (const state of ['failure', 'clearance']) {
    await vertical.getByRole('button', { name: state, exact: true }).click();
    await expect(vertical.getByRole('button', { name: state, exact: true })).toBeEnabled();
  }
  await vertical.getByRole('button', { name: 'Next height' }).click();
  await vertical.getByRole('button', { name: 'pass', exact: true }).click();
  await expect(vertical.getByRole('button', { name: 'pass', exact: true })).toBeEnabled();
  await vertical.getByRole('button', { name: 'Next height' }).click();
  await vertical.getByRole('button', { name: 'clearance', exact: true }).click();
  await expect(vertical.getByRole('cell', { name: '1.60 m', exact: true })).toBeVisible();
  await vertical.getByRole('button', { name: 'Finalize vertical session' }).click();
  await expect(vertical.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(vertical.getByRole('listitem').filter({ hasText: 'pass' })).toHaveCount(1);
  await expect(vertical.getByRole('button', { name: 'Export vertical results' })).toBeEnabled();
});
