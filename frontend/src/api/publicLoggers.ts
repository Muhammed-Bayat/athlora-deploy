import type { ApiList, PublicLoggerLink, PublicLoggerSnapshot, PublicTimelineEntry, TimelineEntryCreatePayload } from '../types';
import { ApiError, request } from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/public/logger${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  }
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: { code?: string; message?: string } }).error : undefined;
    throw new ApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

export async function createPublicLoggerLink(eventId: string): Promise<{ link: PublicLoggerLink; token: string }> {
  const response = await request<{ data: { link: PublicLoggerLink; token: string } }>(`/api/v1/events/${eventId}/public-loggers`, { method: 'POST' });
  return response.data;
}

export function listPublicLoggerLinks(eventId: string): Promise<ApiList<PublicLoggerLink>> {
  return request<ApiList<PublicLoggerLink>>(`/api/v1/events/${eventId}/public-loggers`);
}

export function revokePublicLoggerLink(eventId: string, linkId: string): Promise<void> {
  return request<void>(`/api/v1/events/${eventId}/public-loggers/${linkId}`, { method: 'DELETE' });
}

export async function startPublicLoggerSession(linkToken: string, name: string, club: string): Promise<{ sessionToken: string; snapshot: PublicLoggerSnapshot }> {
  const response = await publicRequest<{ data: { sessionToken: string; snapshot: PublicLoggerSnapshot } }>('/sessions', {
    method: 'POST', body: JSON.stringify({ linkToken, name, club }),
  });
  return response.data;
}

export async function getPublicLoggerSnapshot(sessionToken: string, eventId: string): Promise<PublicLoggerSnapshot> {
  const response = await publicRequest<{ data: PublicLoggerSnapshot }>(`/events/${eventId}`, {
    headers: { 'X-Public-Logger-Session': sessionToken },
  });
  return response.data;
}

export async function createPublicLoggerEntry(sessionToken: string, eventId: string, payload: TimelineEntryCreatePayload): Promise<PublicTimelineEntry> {
  const response = await publicRequest<{ data: PublicTimelineEntry }>(`/events/${eventId}/entries`, {
    method: 'POST', headers: { 'X-Public-Logger-Session': sessionToken }, body: JSON.stringify(payload),
  });
  return response.data;
}
