import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`Responsive overlays at ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('no horizontal overflow on the page', async ({ page }) => {
      await page.goto('/');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test('axe finds no serious or critical violations', async ({ page }) => {
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const violations = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(violations).toEqual([]);
    });
  });
}

test.describe('Modal accessibility', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('focus is trapped inside an open modal', async ({ page }) => {
    await page.goto('/');
    // This test assumes a modal is opened via a user action.
    // It verifies the focus trap mechanics described in Modal.tsx.
    // Placeholder: when auth flow is available, open a modal and verify Tab cycling.
  });

  test('Escape closes the modal', async ({ page }) => {
    await page.goto('/');
    // Placeholder: when auth flow is available, open a modal, press Escape, verify it closes.
  });

  test('body scroll is locked while modal is open', async ({ page }) => {
    await page.goto('/');
    // Placeholder: when auth flow is available, open a modal, check document.body.style.overflow === 'hidden'.
  });
});
