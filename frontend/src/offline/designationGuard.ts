import type { User } from '../types';

export interface OfflineDesignation {
  grantId: string;
  userId: string;
  eventId: string;
  isOfflineLogger: boolean;
  offlineQueueDeviceId: string | null;
}

export function isDesignatedLogger(
  user: User | null,
  designations: OfflineDesignation[],
): boolean {
  if (!user) return false;
  return designations.some(
    (d) => d.userId === user.id && d.isOfflineLogger,
  );
}

export function canUseOfflineQueue(
  user: User | null,
  designations: OfflineDesignation[],
): boolean {
  return isDesignatedLogger(user, designations);
}

export function getDesignatedLogger(
  designations: OfflineDesignation[],
): OfflineDesignation | undefined {
  return designations.find((d) => d.isOfflineLogger);
}
