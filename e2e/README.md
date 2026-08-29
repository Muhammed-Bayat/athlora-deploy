# Athlora End-to-End Tests

## Core Requirements

### Project Title

**Athlora E2E**

### Short Description

This Playwright package validates the current 100m coaching workflow across the real local frontend, backend, PostgreSQL database, and Auth0 login. It covers anonymous access, authenticated desktop/mobile workflows, and accessibility checks.

### System Requirements

- Node.js 22 LTS and npm.
- Docker Desktop or another disposable PostgreSQL 16 database.
- Two Auth0 test users with access to Athlora: a host coach and a guest coach.
- Chromium, installed by the Playwright setup command.

## Installation Guide

Start a disposable database:

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
```

Configure and run the suite:

```bash
cp e2e/.env.example e2e/.env
# Set both host and guest Auth0 test-user credentials in e2e/.env.
cd e2e
npm install
npm run test:install
npm test
```

Register `http://localhost:5174` and `http://localhost:4100` as Auth0 callback URLs, logout URLs, and web origins. `e2e/.env` must point to a scratch database only: global setup applies migrations and truncates application tables before each run.

## Usage Examples

Run all Playwright projects:

```bash
npm test
```

The configuration starts the API on port `4100` and Vite on port `5174`. It prepares separate host and guest Auth0 browser states for cross-workspace fixture flows, then runs anonymous smoke checks, desktop Chromium, and Pixel 5 workflows. Test reports are written to `playwright-report/`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run test:install` | Install Playwright Chromium. |
| `npm test` | Run the configured Playwright projects. |

## AI Declaration

This document was created and updated with the assistance of OpenCode[gpt-5.6-terra].
