import { expect, test } from '@playwright/test';

test('frontend shell loads for an anonymous visitor', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('Athlora', { exact: true })).toBeVisible();
});