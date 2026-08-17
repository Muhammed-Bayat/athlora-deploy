import { expect, test } from '@playwright/test';

test('frontend shell loads for an anonymous visitor', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Landing page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Athlora home' })).toBeVisible();
});
