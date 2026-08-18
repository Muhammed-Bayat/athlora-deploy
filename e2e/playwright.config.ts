import { defineConfig, devices } from '@playwright/test';

const E2E_ORIGIN = 'http://localhost:5174';
const API_ORIGIN = 'http://localhost:4100';

// Secrets live in e2e/.env (gitignored) or the shell / CI secrets.
try {
  process.loadEnvFile();
} catch {
  // No .env is fine when the variables come from the environment.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `E2E requires ${name}. Set it in e2e/.env (see e2e/.env.example) or export it in the shell.`,
    );
  }
  return value;
}

const databaseUrl = required('DATABASE_URL');
const auth0Domain = required('VITE_AUTH0_DOMAIN');
const auth0ClientId = required('VITE_AUTH0_CLIENT_ID');
const auth0Audience = required('VITE_AUTH0_AUDIENCE');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './global-setup.ts',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /.*auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: undefined },
    },
    {
      name: 'desktop-chromium',
      testIgnore: /(auth\.setup|smoke\.spec)\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './.auth/coach.json' },
      dependencies: ['auth-setup'],
    },
    {
      name: 'mobile-chromium',
      testIgnore: /(auth\.setup|smoke\.spec)\.ts/,
      use: { ...devices['Pixel 5'], storageState: './.auth/coach.json' },
      dependencies: ['auth-setup'],
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../backend run dev',
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        AUTH0_DOMAIN: auth0Domain,
        AUTH0_AUDIENCE: auth0Audience,
        CORS_ORIGINS: E2E_ORIGIN,
        PORT: '4100',
      },
    },
    {
      command: 'npm --prefix ../frontend run dev -- --host localhost --port 5174 --strictPort',
      url: E2E_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_ORIGIN,
        VITE_AUTH0_DOMAIN: auth0Domain,
        VITE_AUTH0_CLIENT_ID: auth0ClientId,
        VITE_AUTH0_AUDIENCE: auth0Audience,
      },
    },
  ],
});