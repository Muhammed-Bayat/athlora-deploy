import { request } from './client';
import type { ClubBranding } from '../types';

const BRANDING_PATH = '/api/v1/clubs/branding';

export async function getClubBranding(): Promise<ClubBranding> {
  const response = await request<{ data: ClubBranding }>(BRANDING_PATH);
  return response.data;
}

export async function updateClubBranding(payload: {
  description: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}): Promise<ClubBranding> {
  const response = await request<{ data: ClubBranding }>(BRANDING_PATH, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}

async function uploadImage(path: string, file: File): Promise<ClubBranding> {
  const body = new FormData();
  body.append('file', file);
  const response = await request<{ data: ClubBranding }>(path, { method: 'POST', body });
  return response.data;
}

export function uploadClubLogo(file: File): Promise<ClubBranding> {
  return uploadImage(`${BRANDING_PATH}/logo`, file);
}

export function uploadClubCover(file: File): Promise<ClubBranding> {
  return uploadImage(`${BRANDING_PATH}/cover`, file);
}

export async function clearClubLogo(): Promise<ClubBranding> {
  const response = await request<{ data: ClubBranding }>(`${BRANDING_PATH}/logo`, { method: 'DELETE' });
  return response.data;
}

export async function clearClubCover(): Promise<ClubBranding> {
  const response = await request<{ data: ClubBranding }>(`${BRANDING_PATH}/cover`, { method: 'DELETE' });
  return response.data;
}
