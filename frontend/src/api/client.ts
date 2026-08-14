import type { ApiList, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
let getAccessToken: (() => Promise<string>) | undefined;
let accessTokenGetterRegistration: symbol | undefined;

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
  return body.trim() ? (JSON.parse(body) as unknown) : undefined;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const tokenGetter = getAccessToken;
  const accessToken = tokenGetter ? await tokenGetter() : undefined;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

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
