import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('frontend shell loads for an anonymous visitor', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Landing page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Athlora home' })).toBeVisible();
});

test('landing page has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/');

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
});
