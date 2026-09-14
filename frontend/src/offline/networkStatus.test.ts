import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDeviceOnline,
  recordNetworkFailure,
  recordNetworkSuccess,
  onConnectivityChange,
  resetNetworkStatus,
} from './networkStatus';

beforeEach(() => {
  resetNetworkStatus();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

afterEach(() => {
  resetNetworkStatus();
});

describe('networkStatus', () => {
  it('returns true when navigator is online and no failures recorded', () => {
    expect(isDeviceOnline()).toBe(true);
  });

  it('returns false when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    expect(isDeviceOnline()).toBe(false);
  });

  it('returns false after two consecutive failures within cooldown', () => {
    recordNetworkFailure();
    expect(isDeviceOnline()).toBe(true);

    recordNetworkFailure();
    expect(isDeviceOnline()).toBe(false);
  });

  it('resets failure count on success', () => {
    recordNetworkFailure();
    recordNetworkFailure();
    expect(isDeviceOnline()).toBe(false);

    recordNetworkSuccess();
    expect(isDeviceOnline()).toBe(true);
  });

  it('notifies listeners when going offline', () => {
    const listener = vi.fn();
    const unsub = onConnectivityChange(listener);

    recordNetworkFailure();
    recordNetworkFailure();

    expect(listener).toHaveBeenCalledWith(false);
    unsub();
  });

  it('notifies listeners when coming back online after failure', () => {
    const listener = vi.fn();
    const unsub = onConnectivityChange(listener);

    recordNetworkFailure();
    recordNetworkFailure();
    listener.mockClear();

    recordNetworkSuccess();
    expect(listener).toHaveBeenCalledWith(true);
    unsub();
  });

  it('does not notify listeners when already online and success recorded', () => {
    const listener = vi.fn();
    const unsub = onConnectivityChange(listener);

    recordNetworkSuccess();

    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('unsubscribes listener correctly', () => {
    const listener = vi.fn();
    const unsub = onConnectivityChange(listener);
    unsub();

    recordNetworkFailure();
    recordNetworkFailure();

    expect(listener).not.toHaveBeenCalled();
  });

  it('handles listener errors gracefully', () => {
    const badListener = vi.fn(() => { throw new Error('boom'); });
    const goodListener = vi.fn();
    onConnectivityChange(badListener);
    const unsub = onConnectivityChange(goodListener);

    recordNetworkFailure();
    recordNetworkFailure();

    expect(goodListener).toHaveBeenCalled();
    unsub();
  });
});
