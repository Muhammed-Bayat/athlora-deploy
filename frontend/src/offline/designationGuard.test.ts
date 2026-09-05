import { describe, it, expect } from 'vitest';
import { isDesignatedLogger, canUseOfflineQueue, getDesignatedLogger } from './designationGuard';
import type { User } from '../types';
import type { OfflineDesignation } from './designationGuard';

const mockUser: User = {
  id: 'user-1',
  auth0Id: 'auth0|user-1',
  name: 'Coach One',
  email: 'coach@example.com',
  role: 'coach',
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

const mockDesignation: OfflineDesignation = {
  grantId: 'grant-1',
  userId: 'user-1',
  eventId: 'event-1',
  isOfflineLogger: true,
  offlineQueueDeviceId: 'device-1',
};

describe('Designation Guard', () => {
  it('returns true when user is designated logger', () => {
    expect(isDesignatedLogger(mockUser, [mockDesignation])).toBe(true);
  });

  it('returns false when user is not designated logger', () => {
    const otherUser: User = { ...mockUser, id: 'user-2' };
    expect(isDesignatedLogger(otherUser, [mockDesignation])).toBe(false);
  });

  it('returns false when user is null', () => {
    expect(isDesignatedLogger(null, [mockDesignation])).toBe(false);
  });

  it('returns false when no designations exist', () => {
    expect(isDesignatedLogger(mockUser, [])).toBe(false);
  });

  it('canUseOfflineQueue returns true for designated logger', () => {
    expect(canUseOfflineQueue(mockUser, [mockDesignation])).toBe(true);
  });

  it('canUseOfflineQueue returns false for non-designated user', () => {
    const otherUser: User = { ...mockUser, id: 'user-2' };
    expect(canUseOfflineQueue(otherUser, [mockDesignation])).toBe(false);
  });

  it('getDesignatedLogger returns the designated logger', () => {
    const result = getDesignatedLogger([mockDesignation]);
    expect(result).toBeDefined();
    expect(result?.userId).toBe('user-1');
  });

  it('getDesignatedLogger returns undefined when none designated', () => {
    const nonDesignated: OfflineDesignation = {
      ...mockDesignation,
      isOfflineLogger: false,
    };
    expect(getDesignatedLogger([nonDesignated])).toBeUndefined();
  });
});
