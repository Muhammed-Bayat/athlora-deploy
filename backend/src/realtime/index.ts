import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getPool, type DbExecutor } from '../db/client.js';
import { verifyAuth0AccessToken } from '../middleware/auth.js';
import { isCanonicalUuid } from '../validation/primitives.js';

export const REALTIME_INVALIDATION_EVENT = 'realtime:invalidate';

export type RealtimeResource = 'event' | 'participants' | 'results' | 'timeline';

export interface RealtimeInvalidation {
  id: string;
  eventId: string;
  resources: readonly RealtimeResource[];
  occurredAt: string;
}

interface Socket {
  handshake: { auth?: { token?: unknown } };
  join(room: string): void;
  leave(room: string): void;
  disconnect(close?: boolean): void;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface SocketServer {
  to(room: string): { emit(event: string, payload: RealtimeInvalidation): void };
  use(handler: (socket: Socket, next: (error?: Error) => void) => void): void;
  on(event: 'connection', handler: (socket: Socket) => void): void;
}

interface SocketIoModule {
  Server: new (server: HttpServer, options: { cors: { origin: string[] } }) => SocketServer;
}

let io: SocketServer | undefined;
const connectedSockets = new Map<Socket, { auth0Id: string; eventIds: Set<string> }>();

function room(eventId: string): string {
  return `event:${eventId}`;
}

export async function authorizeEventSubscription(
  auth0Id: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<boolean> {
  if (!isCanonicalUuid(eventId)) return false;
  const result = await executor.query(
    `SELECT 1
     FROM users u
     JOIN workspace_members wm ON wm.user_id = u.id
     JOIN events e ON e.id = $2
     LEFT JOIN account_deletions d ON d.auth0_id = u.auth0_id
     WHERE u.auth0_id = $1
       AND d.status IS NULL
       AND u.role IN ('coach', 'assistant')
       AND wm.role IN ('coach', 'assistant')
        AND (
         e.workspace_id = wm.workspace_id
          OR EXISTS (
           SELECT 1
           FROM event_fixture_workspaces fw
           WHERE fw.event_id = e.id
             AND fw.workspace_id = wm.workspace_id
             AND fw.role = 'guest'
             AND fw.status = 'accepted'
              AND fw.accepted_revision = e.fixture_revision
          )
          OR EXISTS (
            SELECT 1
            FROM event_helper_grants hg
            WHERE hg.event_id = e.id
              AND hg.auth0_sub = $1
              AND hg.status = 'active'
              AND (e.status NOT IN ('completed', 'cancelled') OR e.updated_at >= now() - interval '2 hours')
          )
       )
     LIMIT 1`,
    [auth0Id, eventId],
  );
  return result.rows.length > 0;
}

export function notifyEventInvalidated(eventId: unknown, ...resources: RealtimeResource[]): void {
  if (!isCanonicalUuid(eventId) || resources.length === 0) return;
  io?.to(room(eventId)).emit(REALTIME_INVALIDATION_EVENT, {
    id: randomUUID(),
    eventId,
    resources,
    occurredAt: new Date().toISOString(),
  });
}

/** Removes revoked helper connections from a single event immediately. */
export function disconnectHelperFromEvent(auth0Id: string, eventId: string): void {
  for (const [socket, connection] of connectedSockets) {
    if (connection.auth0Id !== auth0Id || !connection.eventIds.has(eventId)) continue;
    socket.leave(room(eventId));
    connection.eventIds.delete(eventId);
    socket.emit('realtime:access-revoked', { eventId });
  }
}

async function loadSocketIo(): Promise<SocketIoModule> {
  // Kept dynamic while Socket.IO is supplied by deployment rather than this package manifest.
  return Function('specifier', 'return import(specifier)')('socket.io') as Promise<SocketIoModule>;
}

export async function attachRealtimeServer(server: HttpServer): Promise<void> {
  const { Server } = await loadSocketIo();
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  io = new Server(server, { cors: { origin: origins } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      next(new Error('Missing bearer token'));
      return;
    }
    void verifyAuth0AccessToken(token)
      .then((auth) => {
        socket.handshake.auth = { token: auth.accessToken, auth0Id: auth.auth0Id } as typeof socket.handshake.auth;
        connectedSockets.set(socket, { auth0Id: auth.auth0Id, eventIds: new Set() });
        next();
      })
      .catch(() => next(new Error('Invalid token')));
  });

  io.on('connection', (socket) => {
    socket.on('event:subscribe', (eventId: unknown) => {
      const auth0Id = (socket.handshake.auth as { auth0Id?: string } | undefined)?.auth0Id;
      if (!auth0Id) return;
      void authorizeEventSubscription(auth0Id, eventId).then((authorized) => {
        if (authorized && typeof eventId === 'string') {
          socket.join(room(eventId));
          connectedSockets.get(socket)?.eventIds.add(eventId);
        }
        else socket.emit('realtime:error', { code: 'EVENT_SUBSCRIPTION_FORBIDDEN' });
      }).catch(() => socket.emit('realtime:error', { code: 'EVENT_SUBSCRIPTION_FORBIDDEN' }));
    });
    socket.on('disconnect', () => connectedSockets.delete(socket));
  });
}
