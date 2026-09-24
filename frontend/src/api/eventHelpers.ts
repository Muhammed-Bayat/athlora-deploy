import { request } from './client';

export interface OfflineDesignationResponse {
  success: boolean;
}

export interface OfflineLoggerDesignation {
  grantId: string;
  userId: string | null;
  name: string | null;
  deviceId: string | null;
}

export async function getOfflineLoggerDesignation(eventId: string): Promise<OfflineLoggerDesignation | null> {
  const response = await request<{ data: OfflineLoggerDesignation | null }>(
    `/api/v1/events/${eventId}/helpers/offline-logger`,
  );
  return response.data;
}

export async function designateOfflineLogger(
  eventId: string,
  grantId: string,
  deviceId: string,
): Promise<OfflineDesignationResponse> {
  const response = await request<{ data: OfflineDesignationResponse }>(
    `/api/v1/events/${eventId}/helpers/grants/${grantId}/designate-offline-logger`,
    {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    },
  );
  return response.data;
}

export async function revokeOfflineLoggerDesignation(
  eventId: string,
  grantId: string,
): Promise<OfflineDesignationResponse> {
  const response = await request<{ data: OfflineDesignationResponse }>(
    `/api/v1/events/${eventId}/helpers/grants/${grantId}/designate-offline-logger`,
    { method: 'DELETE' },
  );
  return response.data;
}

export async function transferOfflineLoggerDesignation(
  eventId: string,
  fromGrantId: string,
  toGrantId: string,
): Promise<OfflineDesignationResponse> {
  const response = await request<{ data: OfflineDesignationResponse }>(
    `/api/v1/events/${eventId}/helpers/transfer-offline-logger`,
    {
      method: 'POST',
      body: JSON.stringify({ fromGrantId, toGrantId }),
    },
  );
  return response.data;
}
