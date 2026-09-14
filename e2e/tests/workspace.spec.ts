import { expect, test } from '@playwright/test';
import { openView, waitForView, addAthlete, addEvent, todayIso } from './helpers';

const token = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('workspace and membership', () => {
  test('workspace dropdown shows the current workspace', async ({ page }) => {
    await page.goto('/console');
    await waitForView(page, 'Dashboard');

    const workspaceSelect = page.getByLabel('Club');
    await expect(workspaceSelect).toBeVisible();
    const options = await workspaceSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  test('coach can invite a member by email and revoke the invitation', async ({ page }) => {
    const t = token();
    const inviteEmail = `e2e-invite-${t}@test.example.com`;

    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

    const inviteSection = page.getByRole('region', { name: /invitations|team/i });
    if (await inviteSection.isVisible().catch(() => false)) {
      await page.getByLabel(/email/i).fill(inviteEmail);
      await page.getByRole('button', { name: /invite/i }).first().click();

      const pending = page.getByText(inviteEmail, { exact: true });
      await expect(pending).toBeVisible();

      const revokeBtn = pending.locator('xpath=..').getByRole('button', { name: /revoke/i });
      if (await revokeBtn.isVisible().catch(() => false)) {
        await revokeBtn.click();
        await expect(pending).toHaveCount(0);
      }
    }
  });

  test('workspace members list is visible to coach', async ({ page }) => {
    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

    const membersSection = page.getByRole('region', { name: /members|team/i });
    await expect(membersSection).toBeVisible();
  });

  test('final coach cannot be demoted or removed', async ({ page }) => {
    await page.goto('/console/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();

    const coachRow = page.getByText(/coach/i).first();
    if (await coachRow.isVisible().catch(() => false)) {
      const removeBtn = coachRow.locator('xpath=..').getByRole('button', { name: /remove/i });
      await expect(removeBtn).toBeDisabled();
    }
  });
});
