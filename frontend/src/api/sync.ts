import { request } from './client';

export interface SyncAction {
  actionId: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  payload: Record<string, unknown>;
  expectedVersion?: number;
  clientTimestamp: string;
}

export interface SyncBatchRequest {
  deviceId: string;
  eventId: string;
  actions: SyncAction[];
}

export interface SyncActionReceipt {
  actionId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  code?: string;
  serverVersion?: number;
  entryId?: string;
}

export interface SyncBatchResponse {
  data: {
    receipts: SyncActionReceipt[];
    recomputedResults: boolean;
  };
}

export async function postSyncBatch(batch: SyncBatchRequest): Promise<SyncBatchResponse['data']> {
  const response = await request<SyncBatchResponse>('/api/v1/sync/batch', {
    method: 'POST',
    body: JSON.stringify(batch),
  });
  return response.data;
}

export function toSyncAction(action: {
  id: string;
  actionType: SyncAction['actionType'];
  entryId?: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  createdAt: number;
}): SyncAction {
  return {
    actionId: action.id,
    actionType: action.actionType,
    payload: action.entryId
      ? { ...action.payload, entryId: action.entryId }
      : action.payload,
    expectedVersion: action.expectedVersion,
    clientTimestamp: new Date(action.createdAt).toISOString(),
  };
}
