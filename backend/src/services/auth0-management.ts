import { ApiError } from '../middleware/errors.js';

interface ManagementTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface PasswordTicketResponse {
  ticket?: unknown;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function configuration() {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new ApiError(
      503,
      'AUTH0_MANAGEMENT_NOT_CONFIGURED',
      'Account management is temporarily unavailable',
    );
  }
  return { domain, clientId, clientSecret, audience: `https://${domain}/api/v2/` };
}

async function managementToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const config = configuration();
  let response: Response;
  try {
    response = await fetch(`https://${config.domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: config.audience,
        scope: 'delete:users create:user_tickets',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, 'AUTH0_MANAGEMENT_UNAVAILABLE', 'Account management is temporarily unavailable');
  }
  if (!response.ok) {
    throw new ApiError(502, 'AUTH0_MANAGEMENT_UNAVAILABLE', 'Account management is temporarily unavailable');
  }
  const body = (await response.json()) as ManagementTokenResponse;
  if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
    throw new ApiError(502, 'AUTH0_MANAGEMENT_INVALID_RESPONSE', 'Account management is temporarily unavailable');
  }
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(0, body.expires_in) * 1000,
  };
  return cachedToken.token;
}

async function managementRequest(path: string, init: RequestInit): Promise<Response> {
  const { domain } = configuration();
  const token = await managementToken();
  try {
    return await fetch(`https://${domain}/api/v2/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, 'AUTH0_MANAGEMENT_UNAVAILABLE', 'Account management is temporarily unavailable');
  }
}

export async function deleteAuth0User(auth0Id: string): Promise<void> {
  const response = await managementRequest(`users/${encodeURIComponent(auth0Id)}`, { method: 'DELETE' });
  if (response.status === 204 || response.status === 404) return;
  throw new ApiError(502, 'AUTH0_IDENTITY_DELETE_FAILED', 'Could not delete the Auth0 identity');
}

export async function createAuth0PasswordTicket(auth0Id: string): Promise<string> {
  const returnUrl = process.env.AUTH0_PASSWORD_RETURN_URL;
  if (!returnUrl) {
    throw new ApiError(503, 'AUTH0_PASSWORD_RESET_NOT_CONFIGURED', 'Password change is temporarily unavailable');
  }
  const response = await managementRequest('tickets/password-change', {
    method: 'POST',
    body: JSON.stringify({
      user_id: auth0Id,
      result_url: returnUrl,
      ttl_sec: 900,
      mark_email_as_verified: false,
    }),
  });
  if (!response.ok) {
    throw new ApiError(502, 'AUTH0_PASSWORD_TICKET_FAILED', 'Could not create a password-change link');
  }
  const body = (await response.json()) as PasswordTicketResponse;
  if (typeof body.ticket !== 'string' || !body.ticket.startsWith('https://')) {
    throw new ApiError(502, 'AUTH0_MANAGEMENT_INVALID_RESPONSE', 'Could not create a password-change link');
  }
  return body.ticket;
}

export function resetAuth0ManagementTokenCacheForTests(): void {
  cachedToken = null;
}
