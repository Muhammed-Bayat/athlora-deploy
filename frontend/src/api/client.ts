import type { ApiError, ApiList } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
let getAccessToken: (() => Promise<string>) | undefined;

export function setAccessTokenGetter(getter: (() => Promise<string>) | undefined) {
  getAccessToken = getter;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getAccessToken ? await getAccessToken() : undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let payload: ApiError | undefined;
    try {
      payload = (await response.json()) as ApiError;
    } catch {
      payload = undefined;
    }
    throw new Error(payload?.error.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function list<T>(resource: string): Promise<ApiList<T>> {
  return request<ApiList<T>>(`/api/v1/${resource}`);
}

export async function get<T>(resource: string, id: string): Promise<T> {
  return request<T>(`/api/v1/${resource}/${id}`);
}

export async function create<T>(resource: string, body: unknown): Promise<T> {
  return request<T>(`/api/v1/${resource}`, { method: 'POST', body: JSON.stringify(body) });
}

export async function update<T>(resource: string, id: string, body: unknown): Promise<T> {
  return request<T>(`/api/v1/${resource}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function remove(resource: string, id: string): Promise<void> {
  await request<void>(`/api/v1/${resource}/${id}`, { method: 'DELETE' });
}

export async function syncCurrentUser(accessToken: string): Promise<void> {
  await request('/api/v1/auth/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
