import { request } from './client';

export async function createPasswordTicket(): Promise<string> {
  const response = await request<{ data: { url: string } }>('/api/v1/auth/me/password-ticket', {
    method: 'POST',
  });
  return response.data.url;
}

export async function deleteCurrentAccount(): Promise<void> {
  await request<void>('/api/v1/auth/me', { method: 'DELETE' });
}

export async function acceptConsent(version: string): Promise<void> {
  await request<void>('/api/v1/auth/me/consent', {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}
