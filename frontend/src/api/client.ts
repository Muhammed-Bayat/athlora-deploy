import type { ApiError, ApiList } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
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