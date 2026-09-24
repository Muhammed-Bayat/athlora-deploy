import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import {
  enqueueAction,
  getQueueActions,
  getQueueStatus,
  resetFailed,
  type OfflineQueueStatus,
} from '../offline/actionQueue';
import type { OfflineAction } from '../offline/db';
import { drainQueue, type DrainResult } from '../offline/syncEngine';
import { cacheEventData, getCachedEventData } from '../offline/eventCache';
import type {
  AthleticsEvent,
  EventParticipantSummary,
  TimelineEntry,
  TimelineEntryCreatePayload,
  TimelineEntryPatchPayload,
} from '../types';

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

export interface EventOfflineState {
  isOnline: boolean;
  wasOffline: boolean;
  deviceId: string;
  queueStatus: OfflineQueueStatus;
  queueActions: OfflineAction[];
}

export interface EventOfflineActions {
  cacheEventData: (
    eventId: string,
    workspaceId: string,
    event: AthleticsEvent,
    participants: EventParticipantSummary[],
    timeline: TimelineEntry[],
  ) => Promise<boolean>;
  getCachedEventData: (
    eventId: string,
  ) => Promise<{
    event: AthleticsEvent | null;
    participants: EventParticipantSummary[];
    timeline: TimelineEntry[];
    cachedAt: number | null;
  } | null>;
  createEntry: (
    eventId: string,
    payload: TimelineEntryCreatePayload,
  ) => Promise<TimelineEntry | null>;
  updateEntry: (
    eventId: string,
    entryId: string,
    payload: TimelineEntryPatchPayload,
  ) => Promise<boolean>;
  deleteEntry: (
    eventId: string,
    entryId: string,
    expectedVersion: number,
  ) => Promise<boolean>;
  syncPending: (eventId: string) => Promise<DrainResult>;
  refreshQueueStatus: (eventId: string) => Promise<void>;
  retryFailedAction: (actionId: string, eventId: string) => Promise<void>;
}

export function useEventOffline(
  userId: string,
  currentEventId: string | null,
): EventOfflineState & EventOfflineActions {
  const { isOnline, wasOffline } = useOnlineStatus();
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const [queueStatus, setQueueStatus] = useState<OfflineQueueStatus>({ pending: 0, synced: 0, failed: 0, lastSyncedAt: null });
  const [queueActions, setQueueActions] = useState<OfflineAction[]>([]);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    wasOfflineRef.current = wasOffline;
  }, [wasOffline]);

  const refreshQueueStatus = useCallback(async (eventId: string) => {
    try {
      const [status, actions] = await Promise.all([
        getQueueStatus(eventId, userId),
        getQueueActions(eventId, userId),
      ]);
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

  const cacheEventDataAction = useCallback(async (
    eventId: string,
    workspaceId: string,
    event: AthleticsEvent,
    participants: EventParticipantSummary[],
    timeline: TimelineEntry[],
  ) => {
    try {
      await cacheEventData(
        eventId,
        workspaceId,
        event as unknown as Record<string, unknown>,
        participants as unknown as Record<string, unknown>,
        timeline as unknown as Record<string, unknown>[],
        userId,
      );
      return true;
    } catch {
      // Cache errors are non-fatal
      return false;
    }
  }, [userId]);

  const getCachedEventDataAction = useCallback(async (eventId: string) => {
    try {
      const cached = await getCachedEventData(eventId, userId);
      if (!cached.event) return null;
      return {
        event: cached.event as unknown as AthleticsEvent,
        participants: (cached.participants ?? []) as unknown as EventParticipantSummary[],
        timeline: (cached.timeline ?? []) as unknown as TimelineEntry[],
        cachedAt: cached.cachedAt,
      };
    } catch {
      return null;
    }
  }, [userId]);

  const createEntry = useCallback(async (
    eventId: string,
    payload: TimelineEntryCreatePayload,
  ): Promise<TimelineEntry | null> => {
    if (!isOnline) {
      await enqueueAction(
        {
          actionType: 'create_entry',
          eventId,
          payload: payload as unknown as Record<string, unknown>,
          deviceId: deviceIdRef.current,
        },
        userId,
      );
      await refreshQueueStatus(eventId);
      return null;
    }
    return null;
  }, [isOnline, userId, refreshQueueStatus]);

  const updateEntry = useCallback(async (
    eventId: string,
    entryId: string,
    payload: TimelineEntryPatchPayload,
  ): Promise<boolean> => {
    if (!isOnline) {
      await enqueueAction(
        {
          actionType: 'edit_entry',
          eventId,
          entryId,
          payload: payload as unknown as Record<string, unknown>,
          expectedVersion: payload.expectedVersion,
          deviceId: deviceIdRef.current,
        },
        userId,
      );
      await refreshQueueStatus(eventId);
      return true;
    }
    return false;
  }, [isOnline, userId, refreshQueueStatus]);

  const deleteEntry = useCallback(async (
    eventId: string,
    entryId: string,
    expectedVersion: number,
  ): Promise<boolean> => {
    if (!isOnline) {
      await enqueueAction(
        {
          actionType: 'undo_entry',
          eventId,
          entryId,
          payload: { expectedVersion },
          expectedVersion,
          deviceId: deviceIdRef.current,
        },
        userId,
      );
      await refreshQueueStatus(eventId);
      return true;
    }
    return false;
  }, [isOnline, userId, refreshQueueStatus]);

  const syncPending = useCallback(async (eventId: string): Promise<DrainResult> => {
    const result = await drainQueue(eventId, userId);
    await refreshQueueStatus(eventId);
    return result;
  }, [userId, refreshQueueStatus]);

  const retryFailedAction = useCallback(async (actionId: string, eventId: string) => {
    await resetFailed(actionId, userId);
    await refreshQueueStatus(eventId);
  }, [userId, refreshQueueStatus]);

  return {
    isOnline,
    wasOffline,
    deviceId: deviceIdRef.current,
    queueStatus,
    queueActions,
    cacheEventData: cacheEventDataAction,
    getCachedEventData: getCachedEventDataAction,
    createEntry,
    updateEntry,
    deleteEntry,
    syncPending,
    refreshQueueStatus,
    retryFailedAction,
  };
}
