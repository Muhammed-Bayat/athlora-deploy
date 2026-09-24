import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enqueuePublicAction,
  getPublicQueueActions,
  getPublicQueueStatus,
  resetPublicFailed,
  type PublicOfflineQueueStatus,
} from '../offline/publicActionQueue';
import { cachePublicSnapshot } from '../offline/publicEventCache';
import { drainPublicQueue } from '../offline/syncEngine';
import { useOnlineStatus } from './useOnlineStatus';
import type { SessionTarget } from '../types/meets';
import type { PublicOfflineAction } from '../offline/publicDb';

interface UsePublicOfflineSyncOptions {
  sessionToken: string;
  eventId: string;
  deviceId: string;
}

export interface PublicOfflineSyncResult {
  isOnline: boolean;
  deviceId: string;
  wasOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queueStatus: PublicOfflineQueueStatus | null;
  queueActions: PublicOfflineAction[];
  sessionExpired: boolean;
  enqueue: (input: {
    target?: SessionTarget;
    actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
    payload: Record<string, unknown>;
    entryId?: string;
    expectedVersion?: number;
  }) => Promise<string>;
  cacheSnapshot: (snapshot: Record<string, unknown>) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  retryFailedAction: (actionId: string) => Promise<void>;
  clearSessionExpired: () => void;
}

export function usePublicOfflineSync({ sessionToken, eventId, deviceId }: UsePublicOfflineSyncOptions): PublicOfflineSyncResult {
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();
  const [queueStatus, setQueueStatus] = useState<PublicOfflineQueueStatus | null>(null);
  const [queueActions, setQueueActions] = useState<PublicOfflineAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!sessionToken || !eventId) return;
    try {
      const [status, actions] = await Promise.all([
        getPublicQueueStatus(eventId, sessionToken),
        getPublicQueueActions(eventId, sessionToken),
      ]);
      setQueueStatus(status);
      setQueueActions(actions);
    } catch {
      setQueueStatus(null);
      setQueueActions([]);
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
      target?: SessionTarget;
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

  const retryFailedAction = useCallback(async (actionId: string) => {
    await resetPublicFailed(actionId, sessionToken);
    await refreshStatus();
  }, [refreshStatus, sessionToken]);

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
    deviceId,
    wasOffline,
    isSyncing,
    pendingCount: queueStatus?.pending ?? 0,
    failedCount: queueStatus?.failed ?? 0,
    queueStatus,
    queueActions,
    sessionExpired,
    enqueue,
    cacheSnapshot,
    syncNow,
    refreshStatus,
    retryFailedAction,
    clearSessionExpired,
  };
}
