import type { PublicOfflineAction } from '../offline/publicDb';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface PublicSyncAction {
  actionId: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  payload: Record<string, unknown>;
  expectedVersion?: number;
  clientTimestamp: string;
}

export interface PublicSyncBatchRequest {
  eventId: string;
  deviceId: string;
  actions: PublicSyncAction[];
}

export interface PublicSyncActionReceipt {
  actionId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  code?: string;
  serverVersion?: number;
  entryId?: string;
}

export interface PublicSyncBatchResponse {
  receipts: PublicSyncActionReceipt[];
  recomputedResults: boolean;
}

export async function postPublicSyncBatch(
  sessionToken: string,
  batch: PublicSyncBatchRequest,
): Promise<PublicSyncBatchResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/public/logger/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(batch),
    });
  } catch {
    throw new Error('Network request failed');
  }

  const body = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: string }).error
      : `Request failed with status ${response.status}`;
    throw new Error(error);
  }
  return body as PublicSyncBatchResponse;
}

export function toPublicSyncAction(action: PublicOfflineAction): PublicSyncAction {
  return {
    actionId: action.id,
    actionType: action.actionType,
    payload: action.payload,
    expectedVersion: action.expectedVersion,
    clientTimestamp: new Date(action.createdAt).toISOString(),
  };
}
