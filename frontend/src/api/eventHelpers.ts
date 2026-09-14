import { request } from './client';

export interface OfflineDesignationResponse {
  success: boolean;
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
