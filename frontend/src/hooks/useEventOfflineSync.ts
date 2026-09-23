import { useCallback, useEffect, useRef, useState } from 'react';
import { enqueueAction, getQueueStatus } from '../offline/actionQueue';
import { drainQueue } from '../offline/syncEngine';
import { useOnlineStatus } from './useOnlineStatus';
import type { SessionTarget } from '../types/meets';

interface UseEventOfflineSyncOptions {
  workspaceId?: string;
  userId: string;
  eventId: string;
  deviceId: string;
}

export interface EventOfflineSyncResult {
  isOnline: boolean;
  wasOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queueStatus: { pending: number; synced: number; failed: number } | null;
  enqueue: (input: {
    target?: SessionTarget;
    actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
    payload: Record<string, unknown>;
    entryId?: string;
    expectedVersion?: number;
  }) => Promise<string>;
  syncNow: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useEventOfflineSync({ userId, eventId, deviceId, workspaceId }: UseEventOfflineSyncOptions): EventOfflineSyncResult {
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();
  const [queueStatus, setQueueStatus] = useState<{ pending: number; synced: number; failed: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!userId || !eventId) return;
    try {
      const status = await getQueueStatus(eventId, userId);
      setQueueStatus(status);
    } catch {
      setQueueStatus(null);
    }
  }, [eventId, userId]);

  const syncNow = useCallback(async () => {
    if (isSyncingRef.current || !isOnline || !userId || !eventId) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await drainQueue(eventId, userId);
      await refreshStatus();
    } catch {
      // Errors already handled per-action in drainQueue
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [eventId, userId, isOnline, refreshStatus]);

  const enqueue = useCallback(
    async (input: {
      target?: SessionTarget;
      actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
      payload: Record<string, unknown>;
      entryId?: string;
      expectedVersion?: number;
    }) => {
      const id = await enqueueAction(
        { ...input, eventId, deviceId, ...(workspaceId ? { workspaceId } : {}) },
        userId,
      );
      await refreshStatus();
      if (isOnline && userId) {
        void syncNow();
      }
      return id;
    },
    [eventId, deviceId, userId, workspaceId, isOnline, syncNow, refreshStatus],
  );

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (wasOffline && isOnline && userId) {
      void syncNow();
      resetWasOffline();
    }
  }, [wasOffline, isOnline, userId, syncNow, resetWasOffline]);

  useEffect(() => {
    if (!isOnline || !userId) return;
    const interval = setInterval(() => {
      void syncNow();
    }, 10000);
    return () => clearInterval(interval);
  }, [isOnline, userId, syncNow]);

  return {
    isOnline,
    wasOffline,
    isSyncing,
    pendingCount: queueStatus?.pending ?? 0,
    failedCount: queueStatus?.failed ?? 0,
    queueStatus,
    enqueue,
    syncNow,
    refreshStatus,
  };
}
