import { expect, test } from '@playwright/test';

test.describe('Landing cinematic introduction', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the tunnel scroll segment reversible and preserves the existing story', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.getByTestId('landing-intro')).toHaveCount(0);
    const wallText = page.getByText('BETTER ATHLETES', { exact: false });
    await expect(wallText).toHaveCount(1);
    const greeting = page.getByTestId('tunnel-greeting');
    await expect(greeting).toContainText('Welcome toATHLORA');
    await expect(greeting).toContainText('Scroll up to begin the lap');
    await expect(greeting).toHaveCSS('opacity', '1');
    const scrollCue = greeting.getByText('Scroll up to begin the lap');
    await expect(scrollCue).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 5));
    await expect(scrollCue).toBeHidden();
    const intro = page.locator('#cinematic-intro');
    await expect(intro).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('link', { name: 'Skip cinematic introduction' })).toHaveAttribute('href', '#top');
    await expect.poll(() => intro.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(1600);
    await expect.poll(() => intro.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(2000);

    const lines = page.locator('#landing-title > span');
    await expect(lines).toHaveCount(2);
    const initialReveal = await lines.first().evaluate((node) => Number((node as HTMLElement).style.getPropertyValue('--text-reveal')));
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(180);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await expect(wallText).toHaveCount(0);
    await expect(greeting).toHaveCount(0);
    await page.locator('#top').evaluate((node) => window.scrollTo(0, (node as HTMLElement).offsetTop + 160));
    await expect.poll(() => lines.first().evaluate((node) => Number((node as HTMLElement).style.getPropertyValue('--text-reveal')))).toBeGreaterThan(initialReveal);
    await expect(lines.last()).toContainText('Run the season.');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(180);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(wallText).toHaveCount(1);
    await expect(greeting).toHaveCSS('opacity', '1');
    await expect(scrollCue).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Track the squad. Run the season.' })).toBeAttached();
    expect(pageErrors).toEqual([]);
  });

  test('keeps the compact scene and landing controls available on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('#cinematic-intro')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skip cinematic introduction' })).toBeAttached();
  });
});
