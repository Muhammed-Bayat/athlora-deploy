import { useCallback, useEffect, useRef, useState } from 'react';
import { enqueuePublicAction, getPublicQueueStatus } from '../offline/publicActionQueue';
import { cachePublicSnapshot } from '../offline/publicEventCache';
import { drainPublicQueue } from '../offline/syncEngine';
import { useOnlineStatus } from './useOnlineStatus';

interface UsePublicOfflineSyncOptions {
  sessionToken: string;
  eventId: string;
  deviceId: string;
}

export interface PublicOfflineSyncResult {
  isOnline: boolean;
  wasOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queueStatus: { pending: number; synced: number; failed: number } | null;
  sessionExpired: boolean;
  enqueue: (input: {
    actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
    payload: Record<string, unknown>;
    entryId?: string;
    expectedVersion?: number;
  }) => Promise<string>;
  cacheSnapshot: (snapshot: Record<string, unknown>) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearSessionExpired: () => void;
}

export function usePublicOfflineSync({ sessionToken, eventId, deviceId }: UsePublicOfflineSyncOptions): PublicOfflineSyncResult {
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();
  const [queueStatus, setQueueStatus] = useState<{ pending: number; synced: number; failed: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!sessionToken || !eventId) return;
    try {
      const status = await getPublicQueueStatus(eventId, sessionToken);
      setQueueStatus(status);
    } catch {
      setQueueStatus(null);
    }
  }, [eventId, sessionToken]);

  const syncNow = useCallback(async () => {
    if (isSyncingRef.current || !isOnline || !sessionToken || !eventId) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await drainPublicQueue(eventId, sessionToken);
      if (result.sessionExpired) {
        setSessionExpired(true);
      }
      await refreshStatus();
    } catch {
      // Errors already handled per-action in drainPublicQueue
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [eventId, sessionToken, isOnline, refreshStatus]);

  const enqueue = useCallback(
    async (input: {
      actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
      payload: Record<string, unknown>;
      entryId?: string;
      expectedVersion?: number;
    }) => {
      const id = await enqueuePublicAction(
        { ...input, eventId, deviceId },
        sessionToken,
      );
      await refreshStatus();
      if (isOnline && sessionToken) {
        void syncNow();
      }
      return id;
    },
    [eventId, deviceId, sessionToken, isOnline, syncNow, refreshStatus],
  );

  const cacheSnapshot = useCallback(
    async (snapshot: Record<string, unknown>) => {
      await cachePublicSnapshot(eventId, snapshot, sessionToken);
    },
    [eventId, sessionToken],
  );

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (wasOffline && isOnline && sessionToken) {
      void syncNow();
      resetWasOffline();
    }
  }, [wasOffline, isOnline, sessionToken, syncNow, resetWasOffline]);

  useEffect(() => {
    if (!isOnline || !sessionToken) return;
    const interval = setInterval(() => {
      void syncNow();
    }, 10000);
    return () => clearInterval(interval);
  }, [isOnline, sessionToken, syncNow]);

  return {
    isOnline,
    wasOffline,
    isSyncing,
    pendingCount: queueStatus?.pending ?? 0,
    failedCount: queueStatus?.failed ?? 0,
    queueStatus,
    sessionExpired,
    enqueue,
    cacheSnapshot,
    syncNow,
    refreshStatus,
    clearSessionExpired,
  };
}
