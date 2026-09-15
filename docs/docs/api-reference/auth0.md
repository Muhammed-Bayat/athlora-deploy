---
sidebar_position: 5
---

# Auth0 Integration

Athlora uses Auth0 for hosted authentication (sign-up, login, password reset, social providers) and `jose` for standards-compliant JWT verification on the backend. The Auth0 Management API handles permanent account deletion and password-change tickets.

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `VITE_AUTH0_DOMAIN` | Frontend | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Frontend | SPA application client ID |
| `VITE_AUTH0_AUDIENCE` | Frontend | API audience identifier |
| `AUTH0_DOMAIN` | Backend | Same tenant domain for JWT issuer validation |
| `AUTH0_AUDIENCE` | Backend | Same audience for JWT audience validation |
| `AUTH0_MANAGEMENT_CLIENT_ID` | Backend | M2M application client ID |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | Backend | M2M application secret (never exposed to frontend) |
| `AUTH0_PASSWORD_RETURN_URL` | Backend | Return URL for password-change tickets |

## Frontend

### Provider Setup

`frontend/src/main.tsx` wraps the app in `<Auth0Provider>` configured via `frontend/src/utils/auth0.ts`:

```typescript
auth0ProviderOptions() returns {
  domain: VITE_AUTH0_DOMAIN,
  clientId: VITE_AUTH0_CLIENT_ID,
  cacheLocation: 'localstorage',
  authorizationParams: {
    audience: VITE_AUTH0_AUDIENCE,
    redirect_uri: window.location.origin,
    scope: 'openid profile email',
  },
}
```

### Token Bridge

`frontend/src/features/auth/Auth0TokenBridge.tsx` is a state machine with five states (`idle` → `synchronizing` → `ready` | `consent_required` | `onboarding` | `error`):

1. Calls `PUT /api/v1/auth/me` to synchronize the Auth0 profile
2. Checks consent acceptance
3. Loads workspace memberships
4. Restores the active workspace from `localStorage` or server metadata
5. Passes `getAccessTokenSilently` to the API client

### API Client Token Injection

`frontend/src/api/client.ts` acquires a token before every request. When offline, it short-circuits to prevent Auth0 background refresh from cascading 401 errors.

## Backend

### JWT Verification

`backend/src/middleware/auth.ts` uses `jose`'s `createRemoteJWKSet` and `jwtVerify`:

| Tier | Middleware | Purpose |
|---|---|---|
| 1 | `verifyAuth0Token` | Pure JWT verification; attaches `req.auth0` |
| 2 | `resolveLocalApplicationUser` | Looks up `users` table; returns 403 if unsynchronized or deletion pending |
| 3 | `resolveApplicationUser` | Joins `workspace_members`; resolves workspace from `X-Workspace-Id` header |

### Sync Endpoint

`PUT /api/v1/auth/me` fetches the Auth0 profile from `https://{domain}/userinfo`, verifies `sub` matches, and upserts into `users` via `ON CONFLICT (auth0_id) DO UPDATE`.

### Management API

`backend/src/services/auth0-management.ts` uses the `client_credentials` grant (scopes: `delete:users`, `create:user_tickets`). The token is cached in memory and refreshed 60 seconds before expiry.

## Authentication Endpoints

| Method & path | Authentication | Purpose |
|---|---|---|
| `PUT /auth/me` | Verified Auth0 JWT | Synchronize profile; create/update local user |
| `POST /auth/me/password-ticket` | Verified JWT + synchronized user | Auth0-hosted password-change ticket |
| `POST /auth/me/consent` | Verified JWT | Record consent acceptance |
| `DELETE /auth/me` | Verified JWT | Permanent account deletion |

## Unsynchronized Identity

When a valid Auth0 identity has not completed synchronization:

```json
{
  "error": {
    "code": "AUTH_USER_NOT_SYNCHRONIZED",
    "message": "Authenticated user is not synchronized",
    "details": { "syncEndpoint": "/api/v1/auth/me" }
  }
}
```

Status: `403`.

## Key Files

| File | Purpose |
|---|---|
| `frontend/src/utils/auth0.ts` | Provider configuration helper |
| `frontend/src/main.tsx` | Auth0Provider mount and bootstrap |
| `frontend/src/features/auth/Auth0TokenBridge.tsx` | Sync state machine, workspace selection |
| `frontend/src/api/client.ts` | Token injection into HTTP requests |
| `backend/src/middleware/auth.ts` | JWT verification and middleware chain |
| `backend/src/services/auth0-management.ts` | Management API token lifecycle |
| `backend/src/controllers/auth.ts` | Sync endpoint and password ticket creation |

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
