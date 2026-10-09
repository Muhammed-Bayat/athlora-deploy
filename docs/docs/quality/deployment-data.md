---
sidebar_position: 6
---

# Deployment and data operations

## Deployed services

| Service | Provider | Purpose |
|---|---|---|
| Frontend | Vercel | React single-page application |
| API | Render | Express REST API, Socket.IO, migration-on-start |
| Database | Neon, Frankfurt | PostgreSQL application data |
| Documentation | Cloudflare Pages | This Docusaurus site |
| Identity | Auth0 | Hosted authentication and JWT issuance |

The live application, API health endpoint, and documentation site are linked from the repository README and the documentation homepage. The database is private and accessed only through server-side `DATABASE_URL` configuration.

## Database operations

- Migrations are sequential, checksum-tracked SQL files. Production startup runs pending migrations before starting the API.
- Never edit a migration that has been applied. Add a new migration for a schema change and update the [schema reference](../db-schema/overview) in the same change.
- Use a separate disposable database for integration and E2E tests. E2E setup migrates and truncates its target database.
- Restore and backup capability are provided by the Neon deployment. A production restore must be performed through the provider's controlled restore workflow, then validated with the API health check and a non-destructive application read before traffic is considered healthy.

## Seeded demonstration data

The deployed database has been seeded to make the product demonstrable. This seed content is demonstration data, not a claim that Athlora operates on independently collected production athlete data.

- Do not place real athlete, health, credential, or minor-identifying data in seed files, screenshots, automated tests, or public reports without the necessary authorization.
- The product stores athlete and injury records inside the owning club workspace. Coaches control whether club results and club schedules are published; these are separate controls.
- Account deletion removes the account's access and requests Auth0 identity deletion. Shared club records remain to preserve their event history and attribution; this limitation is disclosed in the [privacy policy](../legal/privacy-policy).

## Security and service boundaries

- Auth0 access tokens are verified by the API. Database credentials, Auth0 Management API credentials, Gemini API keys, and S3 credentials stay server-side.
- The API uses explicit CORS origins, security headers, non-enumerating resource checks, and structured error responses.
- Venue searches are proxied and rate-limited; weather data is cached and validated server-side; Gemini receives audio directly from the browser after the API issues a constrained short-lived token.
- Club media is stored in an S3-compatible object store, not source control. Validate uploads and configure lifecycle/backup policy in the selected storage provider.

## Release procedure

1. Run the affected lint, typecheck, tests, build, and docs build.
2. Review the complete diff and API/schema/deployment impact.
3. Merge through the documented Gitea flow; deployment follows `main`.
4. Verify `/health`, the public app, and any changed authenticated or public route.
5. Record failures and follow-up work in the [Gitea project and bug tracker](https://sdp.ms.wits.ac.za/cache-us-outside/athlora/projects).

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
