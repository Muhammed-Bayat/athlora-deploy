import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { enqueueAction, getQueueStatus } from '../offline/actionQueue';
import { drainQueue, type DrainResult } from '../offline/syncEngine';
import type { SessionEntryInput, SessionTarget } from '../types/meets';

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
  queueStatus: { pending: number; synced: number; failed: number };
}

export interface SessionOfflineActions {
  enqueueCreateEntry: (eventId: string, workspaceId: string, target: SessionTarget, payload: SessionEntryInput) => Promise<boolean>;
  enqueueEditEntry: (eventId: string, workspaceId: string, target: SessionTarget, entryId: string, payload: SessionEntryInput & { expectedVersion: number }) => Promise<boolean>;
  enqueueUndoEntry: (eventId: string, workspaceId: string, target: SessionTarget, entryId: string, expectedVersion: number) => Promise<boolean>;
  syncPending: (eventId: string) => Promise<DrainResult>;
  refreshQueueStatus: (eventId: string) => Promise<void>;
}

export function useSessionOffline(
  userId: string,
  currentEventId: string | null,
  workspaceId: string,
): SessionOfflineState & SessionOfflineActions {
  const { isOnline } = useOnlineStatus();
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const [queueStatus, setQueueStatus] = useState({ pending: 0, synced: 0, failed: 0 });

  const refreshQueueStatus = useCallback(async (eventId: string) => {
    try {
      setQueueStatus(await getQueueStatus(eventId, userId));
    } catch {
      setQueueStatus({ pending: 0, synced: 0, failed: 0 });
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

  return {
    isOnline,
    queueStatus,
    enqueueCreateEntry,
    enqueueEditEntry,
    enqueueUndoEntry,
    syncPending,
    refreshQueueStatus,
  };
}
