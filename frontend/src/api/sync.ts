import { request } from './client';
import type { SessionTarget } from '../types/meets';

export interface SyncAction {
  target?: SessionTarget;
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
  target?: SessionTarget;
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

export async function postSyncBatch(batch: SyncBatchRequest, workspaceId?: string): Promise<SyncBatchResponse['data']> {
  const response = await request<SyncBatchResponse>('/api/v1/sync/batch', {
    method: 'POST',
    body: JSON.stringify(batch),
    ...(workspaceId ? { headers: { 'X-Workspace-Id': workspaceId } } : {}),
  });
  return response.data;
}

export function toSyncAction(action: {
  target?: SessionTarget;
  id: string;
  actionType: SyncAction['actionType'];
  entryId?: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  createdAt: number;
}): SyncAction {
  return {
    ...(action.target ? { target: action.target } : {}),
    actionId: action.id,
    actionType: action.actionType,
    payload: action.entryId
      ? { ...action.payload, entryId: action.entryId }
      : action.payload,
    expectedVersion: action.expectedVersion,
    clientTimestamp: new Date(action.createdAt).toISOString(),
  };
}
