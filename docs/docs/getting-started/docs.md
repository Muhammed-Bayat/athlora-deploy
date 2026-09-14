---
sidebar_position: 4
---

# Documentation Site

The `/docs` package is the Athlora Docusaurus site. It documents setup, architecture, API behavior, schema rules, delivery process, and project decisions. Its source lives in the repository and deploys separately from the application.

## Requirements

- Node.js 22 LTS recommended (Node.js 20 or later supported)
- npm

## Run locally

```bash
cd docs
npm install
npm run start
```

The development server prints its local URL, normally `http://localhost:3000`. Source pages are in `docs/docs`, navigation is defined in `sidebars.ts`, and site settings are in `docusaurus.config.ts`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run start` | Start Docusaurus in development mode. |
| `npm run build` | Produce the static production site in `build/`; fails on broken links. |
| `npm run serve` | Serve the generated production site locally. |
| `npm run clear` | Clear Docusaurus caches. |
| `npm run typecheck` | Type-check the Docusaurus configuration and site code. |
| `npm run deploy` | Run Docusaurus's deployment command when a compatible deployment target is configured. |

## Writing guidance

- Keep setup instructions executable and include prerequisites, commands, expected behavior, and any destructive effects.
- Update the relevant implementation and status documentation in the same change as a feature.
- Link to the API contract or schema documents instead of duplicating detailed rules.
- Do not include credentials, private environment values, or copied provider payloads.
- Run `npm run build` before considering a documentation change complete.

## Deployment

The published documentation site is hosted on Cloudflare Pages:

```text
https://athlora-deploy.pages.dev
```

Cloudflare Pages builds the `/docs` package with `npm ci` and `npm run build`, then publishes `build/`.

## AI declaration

This document was created with the assistance of OpenCode[gpt-5.6-terra] and updated with the assistance of OpenCode[gpt-5.6-terra].
