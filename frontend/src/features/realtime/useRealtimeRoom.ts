import { useEffect, useRef, useState } from 'react';
import { getCurrentAccessToken } from '../../api/client';

export type RealtimeConnectionState = 'unavailable' | 'connecting' | 'connected' | 'disconnected' | 'error';

export const realtimeProtocol = {
  subscribeEvent: 'event:subscribe',
  invalidated: 'realtime:invalidate',
} as const;

interface Socket {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener?: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  disconnect(): void;
}

interface SocketModule {
  io(url: string, options: Record<string, unknown>): Socket;
}

interface RealtimeRoomOptions {
  workspaceId: string;
  eventId: string | null;
  onInvalidate: () => void | Promise<void>;
}

async function loadSocketModule(): Promise<SocketModule> {
  return import('socket.io-client') as Promise<SocketModule>;
}

/**
 * Joins one scoped room and asks the caller to reload canonical HTTP data when
 * the server broadcasts a change. It does not retain realtime payloads.
 */
export function useRealtimeRoom({ workspaceId, eventId, onInvalidate }: RealtimeRoomOptions): RealtimeConnectionState {
  const [state, setState] = useState<RealtimeConnectionState>(() => (
    import.meta.env.VITE_REALTIME_URL ? 'disconnected' : 'unavailable'
  ));
  const invalidateRef = useRef(onInvalidate);
  const invalidatingRef = useRef(false);
  const receivedNotificationIdsRef = useRef(new Set<string>());
  invalidateRef.current = onInvalidate;

  useEffect(() => {
    const realtimeUrl = import.meta.env.VITE_REALTIME_URL;
    if (!realtimeUrl || !eventId) {
      setState('unavailable');
      return;
    }

    let active = true;
    let socket: Socket | undefined;
    const invalidate = (payload?: unknown) => {
      const id = typeof payload === 'object' && payload !== null && 'id' in payload && typeof payload.id === 'string'
        ? payload.id
        : undefined;
      if (id) {
        if (receivedNotificationIdsRef.current.has(id)) return;
        receivedNotificationIdsRef.current.add(id);
        // Bound duplicate tracking for long-lived event views.
        if (receivedNotificationIdsRef.current.size > 200) receivedNotificationIdsRef.current.clear();
      }
      if (invalidatingRef.current) return;
      invalidatingRef.current = true;
      void Promise.resolve(invalidateRef.current()).finally(() => {
        invalidatingRef.current = false;
      });
    };

    setState('connecting');
    void (async () => {
      try {
        const token = await getCurrentAccessToken();
        if (!token || !active) {
          if (active) setState('unavailable');
          return;
        }
        const { io } = await loadSocketModule();
        if (!active) return;
        socket = io(realtimeUrl, {
          auth: { token, workspaceId },
          transports: ['websocket', 'polling'],
        });
        socket.on('connect', () => {
          if (!active || !socket) return;
          socket.emit(realtimeProtocol.subscribeEvent, eventId);
          setState('connected');
        });
        socket.on('disconnect', () => {
          if (active) setState('disconnected');
        });
        socket.on('connect_error', () => {
          if (active) setState('error');
        });
        socket.on(realtimeProtocol.invalidated, invalidate);
      } catch {
        if (active) setState('unavailable');
      }
    })();

    return () => {
      active = false;
      if (!socket) return;
      socket.off(realtimeProtocol.invalidated, invalidate);
      socket.disconnect();
    };
  }, [eventId, workspaceId]);

  return state;
}
