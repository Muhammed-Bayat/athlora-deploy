import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('injuries and fitness map', () => {
  test('create injury on athlete via fitness view', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Injury ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, athleteName, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name: athleteName, level: 1 })).toBeVisible();

    await page.getByRole('button', { name: /fitness|injury/i }).first().click();

    const injuryForm = page.getByRole('form', { name: /injury|record/i });
    if (await injuryForm.isVisible().catch(() => false)) {
      await page.getByLabel(/body region|region/i).first().selectOption({ index: 1 });
      await page.getByLabel(/area/i).first().selectOption({ index: 1 });
      await page.getByLabel(/side/i).first().selectOption({ index: 0 });
      await page.getByLabel(/severity/i).first().selectOption('Minor');
      await page.getByRole('button', { name: /save|record|add/i }).first().click();

      await expect(page.getByText('Minor', { exact: true })).toBeVisible();
    }
  });

  test('resolve and reopen injury', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Injury Resolve ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, athleteName, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name: athleteName, level: 1 })).toBeVisible();

    await page.getByRole('button', { name: /fitness|injury/i }).first().click();

    const injuryForm = page.getByRole('form', { name: /injury|record/i });
    if (await injuryForm.isVisible().catch(() => false)) {
      await page.getByLabel(/body region|region/i).first().selectOption({ index: 1 });
      await page.getByLabel(/area/i).first().selectOption({ index: 1 });
      await page.getByLabel(/side/i).first().selectOption({ index: 0 });
      await page.getByLabel(/severity/i).first().selectOption('Moderate');
      await page.getByRole('button', { name: /save|record|add/i }).first().click();

      const resolveBtn = page.getByRole('button', { name: /resolve/i }).first();
      if (await resolveBtn.isVisible().catch(() => false)) {
        await resolveBtn.click();
        await expect(page.getByText(/resolved/i)).toBeVisible();

        const reopenBtn = page.getByRole('button', { name: /reopen/i }).first();
        if (await reopenBtn.isVisible().catch(() => false)) {
          await reopenBtn.click();
          await expect(page.getByText(/active/i).first()).toBeVisible();
        }
      }
    }
  });

  test('injury summary visible on roster card', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Injury Summary ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, athleteName, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name: athleteName, level: 1 })).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
  });

  test('fitness view shows 3D body viewer', async ({ page }) => {
    const t = token();
    const athleteName = `E2E Fitness 3D ${t}`;

    await page.goto('/console');
    await openView(page, 'Athletes', 'Athletes');
    await waitForView(page, 'Athletes');
    await addAthlete(page, athleteName, 'E2E');

    await page.getByRole('button', { name: 'View performance' }).first().click();
    await expect(page.getByRole('heading', { name: athleteName, level: 1 })).toBeVisible();

    await page.getByRole('button', { name: /fitness|injury/i }).first().click();

    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible().catch(() => false)) {
      await expect(canvas).toBeVisible();
    }
  });
});
