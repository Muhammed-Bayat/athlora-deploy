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

test('landing story chapters and final CTA remain available without WebGL interaction', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#trend')).toContainText('Every lane tells a performance story.');
  await expect(page.locator('#fitness')).toContainText('See more than performance.');
  await expect(page.locator('#system')).toContainText('The entire season, in one place.');

  const finalCta = page.getByRole('heading', { name: 'Ready to run the season?' });
  await finalCta.scrollIntoViewIfNeeded();
  await expect(finalCta).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get started free' }).last()).toBeVisible();
});
