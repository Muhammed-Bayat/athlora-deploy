import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { enqueueAction, getQueueActions, getQueueStatus, resetFailed, type OfflineQueueStatus } from '../offline/actionQueue';
import { drainQueue, type DrainResult } from '../offline/syncEngine';
import type { SessionEntryInput, SessionTarget } from '../types/meets';
import type { OfflineAction } from '../offline/db';

const DEVICE_ID_KEY = 'athlora-device-id';

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export interface SessionOfflineState {
  isOnline: boolean;
  deviceId: string;
  queueStatus: OfflineQueueStatus;
  queueActions: OfflineAction[];
}

export interface SessionOfflineActions {
  enqueueCreateEntry: (eventId: string, workspaceId: string, target: SessionTarget, payload: SessionEntryInput) => Promise<boolean>;
  enqueueEditEntry: (eventId: string, workspaceId: string, target: SessionTarget, entryId: string, payload: SessionEntryInput & { expectedVersion: number }) => Promise<boolean>;
  enqueueUndoEntry: (eventId: string, workspaceId: string, target: SessionTarget, entryId: string, expectedVersion: number) => Promise<boolean>;
  syncPending: (eventId: string) => Promise<DrainResult>;
  refreshQueueStatus: (eventId: string) => Promise<void>;
  retryFailedAction: (actionId: string, eventId: string) => Promise<void>;
}

export function useSessionOffline(
  userId: string,
  currentEventId: string | null,
  workspaceId: string,
): SessionOfflineState & SessionOfflineActions {
  const { isOnline } = useOnlineStatus();
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const [queueStatus, setQueueStatus] = useState<OfflineQueueStatus>({ pending: 0, synced: 0, failed: 0, lastSyncedAt: null });
  const [queueActions, setQueueActions] = useState<OfflineAction[]>([]);

  const refreshQueueStatus = useCallback(async (eventId: string) => {
    try {
      const [status, actions] = await Promise.all([getQueueStatus(eventId, userId), getQueueActions(eventId, userId)]);
      setQueueStatus(status);
      setQueueActions(actions);
    } catch {
      setQueueStatus({ pending: 0, synced: 0, failed: 0, lastSyncedAt: null });
      setQueueActions([]);
    }
  }, [userId]);

  useEffect(() => {
    if (currentEventId) void refreshQueueStatus(currentEventId);
  }, [currentEventId, refreshQueueStatus]);

  const enqueueCreateEntry = useCallback(async (eventId: string, ws: string, target: SessionTarget, payload: SessionEntryInput) => {
    if (isOnline) return false;
    await enqueueAction({
      actionType: 'create_entry',
      eventId,
      target,
      workspaceId: ws || workspaceId,
      payload: payload as unknown as Record<string, unknown>,
      deviceId: deviceIdRef.current,
    }, userId);
    await refreshQueueStatus(eventId);
    return true;
  }, [isOnline, refreshQueueStatus, userId, workspaceId]);

  const enqueueEditEntry = useCallback(async (eventId: string, ws: string, target: SessionTarget, entryId: string, payload: SessionEntryInput & { expectedVersion: number }) => {
    if (isOnline) return false;
    await enqueueAction({
      actionType: 'edit_entry',
      eventId,
      target,
      workspaceId: ws || workspaceId,
      entryId,
      payload: payload as unknown as Record<string, unknown>,
      expectedVersion: payload.expectedVersion,
      deviceId: deviceIdRef.current,
    }, userId);
    await refreshQueueStatus(eventId);
    return true;
  }, [isOnline, refreshQueueStatus, userId, workspaceId]);

  const enqueueUndoEntry = useCallback(async (eventId: string, ws: string, target: SessionTarget, entryId: string, expectedVersion: number) => {
    if (isOnline) return false;
    await enqueueAction({
      actionType: 'undo_entry',
      eventId,
      target,
      workspaceId: ws || workspaceId,
      entryId,
      payload: { expectedVersion },
      expectedVersion,
      deviceId: deviceIdRef.current,
    }, userId);
    await refreshQueueStatus(eventId);
    return true;
  }, [isOnline, refreshQueueStatus, userId, workspaceId]);

  const syncPending = useCallback(async (eventId: string) => {
    const result = await drainQueue(eventId, userId);
    await refreshQueueStatus(eventId);
    return result;
  }, [refreshQueueStatus, userId]);

  const retryFailedAction = useCallback(async (actionId: string, eventId: string) => {
    await resetFailed(actionId, userId);
    await refreshQueueStatus(eventId);
  }, [refreshQueueStatus, userId]);

  return {
    isOnline,
    deviceId: deviceIdRef.current,
    queueStatus,
    queueActions,
    enqueueCreateEntry,
    enqueueEditEntry,
    enqueueUndoEntry,
    syncPending,
    refreshQueueStatus,
    retryFailedAction,
  };
}
