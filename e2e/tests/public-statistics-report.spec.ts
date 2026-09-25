import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('public report opens without sign-in and preserves report filters in its URL', async ({ page }) => {
  await page.goto('/stats/report?discipline=100m');

  await expect(page.getByRole('heading', { name: 'Detailed statistics report' })).toBeVisible();
  await expect(page.getByLabel('Discipline')).toHaveValue('100m');
  await page.getByLabel('Gender').selectOption('female');
  await expect(page).toHaveURL(/\/stats\/report\?discipline=100m&gender=female/);
});

test('public report has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/stats/report');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(violations, violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
});
