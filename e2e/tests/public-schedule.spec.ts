import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import pg from 'pg';

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required for public schedule tests');
  }
  return value;
}

const slug = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface SeededClub {
  clubId: string;
}

async function seedClub(pool: pg.Pool, name: string, scheduleEnabled: boolean): Promise<SeededClub> {
  const suffix = slug();
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (auth0_id, name, email, role)
     VALUES ($1, $2, $3, 'coach') RETURNING id`,
    [`e2e-schedule-${suffix}`, `Schedule Coach ${suffix}`, `schedule-${suffix}@e2e.test`],
  );
  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
    [`Schedule WS ${suffix}`],
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'coach')`,
    [workspace.rows[0].id, user.rows[0].id],
  );
  const club = await pool.query<{ id: string }>(
    `INSERT INTO clubs (workspace_id, name, public_schedule_enabled)
     VALUES ($1, $2, $3) RETURNING id`,
    [workspace.rows[0].id, name, scheduleEnabled],
  );
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO events (created_by, workspace_id, type, discipline, title, date, time, location_name, status)
     VALUES ($1, $2, 'competition', '100m', $3, $4::date, '10:00:00', 'City Track', 'scheduled'),
            ($1, $2, 'training', '100m', $5, $6::date, '09:00:00', 'Old Ground', 'scheduled')`,
    [user.rows[0].id, workspace.rows[0].id, `Future Meet ${suffix}`, futureDate, `Past Meet ${suffix}`, pastDate],
  );
  return { clubId: club.rows[0].id };
}

test.describe('public schedule', () => {
  let pool: pg.Pool;

  test.beforeAll(() => {
    pool = new pg.Pool({ connectionString: databaseUrl() });
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test('published club schedule opens without sign-in and shows only future meets', async ({ page }) => {
    const { clubId } = await seedClub(pool, `Public Schedule Club ${slug()}`, true);

    await page.goto('/schedule');

    const card = page.getByRole('link', { name: /Public Schedule Club/ });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', new RegExp(`/schedule/${clubId}$`));

    await page.goto(`/schedule/${clubId}`);

    await expect(page.getByRole('heading', { name: /Public Schedule Club/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Future Meet/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Past Meet/ })).toHaveCount(0);
    await expect(page.getByText('Venue: City Track')).toBeVisible();
    await expect(page.getByRole('list', { name: /Disciplines at Future Meet/ })).toContainText('100m');
    const time = page.locator('time').filter({ hasText: '10:00' });
    await expect(time).toHaveCount(1);
    expect(await time.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T10:00:00$/);
  });

  test('disabled club does not disclose schedule data', async ({ page }) => {
    const { clubId } = await seedClub(pool, `Private Schedule Club ${slug()}`, false);

    const listResponse = await page.request.get('/api/v1/public/schedule/clubs');
    expect(listResponse.ok()).toBe(true);
    expect(await listResponse.text()).not.toContain('Private Schedule Club');

    const detailResponse = await page.request.get(`/api/v1/public/schedule/clubs/${clubId}`);
    expect(detailResponse.status()).toBe(404);

    await page.goto(`/schedule/${clubId}`);
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("This schedule isn't published.");
    await expect(page.getByText('Private Schedule Club')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Browse published schedules' })).toBeVisible();
  });

  test('unknown club ids show the same unavailable state', async ({ page }) => {
    await page.goto('/schedule/33333333-3333-4333-8333-333333333333');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("This schedule isn't published.");
  });

  test('published club with no upcoming meets shows the empty state', async ({ page }) => {
    const suffix = slug();
    const workspace = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Empty WS ${suffix}`],
    );
    const club = await pool.query<{ id: string }>(
      `INSERT INTO clubs (workspace_id, name, public_schedule_enabled)
       VALUES ($1, $2, true) RETURNING id`,
      [workspace.rows[0].id, `Empty Schedule Club ${suffix}`],
    );

    await page.goto(`/schedule/${club.rows[0].id}`);

    await expect(page.getByRole('heading', { name: 'No upcoming meets' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Empty Schedule Club/ })).toBeVisible();
  });

  test('public schedule pages have no critical or serious accessibility violations', async ({ page }) => {
    const { clubId } = await seedClub(pool, `A11y Schedule Club ${slug()}`, true);

    await page.goto('/schedule');
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    let violations = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(violations, violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);

    await page.goto(`/schedule/${clubId}`);
    results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    violations = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(violations, violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
  });

  test('landing page links to the public schedule', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('navigation', { name: 'Landing page' }).getByRole('link', { name: 'Schedule' })).toBeVisible();
  });
});
