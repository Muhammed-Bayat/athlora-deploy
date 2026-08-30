import type { ApiList, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
let getAccessToken: (() => Promise<string>) | undefined;
let accessTokenGetterRegistration: symbol | undefined;
let activeWorkspaceId: string | undefined;

// Try to read a stored token from localStorage on startup
{
  const stored = typeof window !== 'undefined' && localStorage.getItem('athlora_access_token');
  if (stored) {
    getAccessToken = async () => stored;
  }
}

interface ApiData<T> {
  data: T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setAccessTokenGetter(getter: (() => Promise<string>) | undefined) {
  const registration = Symbol('accessTokenGetter');
  getAccessToken = getter;
  accessTokenGetterRegistration = registration;

  return () => {
    if (accessTokenGetterRegistration === registration) {
      getAccessToken = undefined;
      accessTokenGetterRegistration = undefined;
    }
  };
}

export function setActiveWorkspaceId(workspaceId: string | undefined): void {
  activeWorkspaceId = workspaceId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseError(payload: unknown): Omit<ApiError, 'name' | 'status'> | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return undefined;
  }

  const { code, message, details } = payload.error;
  if (typeof code !== 'string' || typeof message !== 'string') {
    return undefined;
  }

  return {
    code,
    message,
    details: isRecord(details) ? details : {},
  };
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const body = await response.text();
  if (!body.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(response.status, 'MALFORMED_RESPONSE', 'Response body is not valid JSON');
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const tokenGetter = getAccessToken;
  // Keep an action in the workspace in which it began while Auth0 obtains its token.
  const workspaceId = activeWorkspaceId;
  let accessToken: string | undefined;
  if (tokenGetter) {
    try {
      accessToken = await tokenGetter();
    } catch (error) {
      throw new ApiError(
        401,
        'AUTH_TOKEN_ACQUISITION_FAILED',
        error instanceof Error ? error.message : 'Failed to acquire access token',
      );
    }
  }

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (workspaceId && !headers.has('X-Workspace-Id')) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  }

  let payload: unknown;
  try {
    payload = await readBody(response);
  } catch (error) {
    if (response.ok) {
      throw error;
    }
  }

  if (!response.ok) {
    const apiError = parseError(payload);
    throw new ApiError(
      response.status,
      apiError?.code ?? 'HTTP_ERROR',
      apiError?.message ?? `Request failed with status ${response.status}`,
      apiError?.details,
    );
  }

  return payload as T;
}

export async function list<T>(resource: string): Promise<ApiList<T>> {
  return request<ApiList<T>>(`/api/v1/${resource}`);
}

export async function get<T>(resource: string, id: string): Promise<T> {
  const response = await request<ApiData<T>>(`/api/v1/${resource}/${id}`);
  return response.data;
}

export async function create<T>(resource: string, body: unknown): Promise<T> {
  const response = await request<ApiData<T>>(`/api/v1/${resource}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.data;
}

export async function update<T>(resource: string, id: string, body: unknown): Promise<T> {
  const response = await request<ApiData<T>>(`/api/v1/${resource}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return response.data;
}

export async function remove(resource: string, id: string): Promise<void> {
  await request<void>(`/api/v1/${resource}/${id}`, { method: 'DELETE' });
}

export async function syncCurrentUser(): Promise<User> {
  const response = await request<ApiData<User>>('/api/v1/auth/me', { method: 'PUT' });
  return response.data;
}
