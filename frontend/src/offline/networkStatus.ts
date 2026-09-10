/**
 * Network status tracker that detects offline state more reliably than
 * navigator.onLine, which stays true on some devices in airplane mode.
 *
 * Tracks actual request failures to determine connectivity. When a request
 * fails with a network error, we mark the device as offline for a cooldown
 * period. This prevents the 401 cascade from Auth0 token refresh attempts
 * when the device has no network.
 */

let failureCount = 0;
let lastFailureAt = 0;
let listeners: Array<(online: boolean) => void> = [];

const COOLDOWN_MS = 10_000; // 10 seconds after last failure
const FAILURE_THRESHOLD = 2; // 2 consecutive failures to trigger offline

/**
 * Returns true if the device is likely online.
 * Combines navigator.onLine with failure tracking.
 */
export function isDeviceOnline(): boolean {
  if (typeof navigator === 'undefined') return true;

  // navigator.onLine is authoritative when false (dev tools, some devices)
  if (!navigator.onLine) return false;

  // If we've had consecutive failures recently, treat as offline
  if (failureCount >= FAILURE_THRESHOLD) {
    const timeSinceFailure = Date.now() - lastFailureAt;
    if (timeSinceFailure < COOLDOWN_MS) {
      return false;
    }
    // Cooldown expired, allow a probe attempt
    failureCount = 0;
  }

  return true;
}

/**
 * Record a network failure. Called when a fetch or token refresh fails
 * with a network error (not a 4xx/5xx from the server).
 */
export function recordNetworkFailure(): void {
  failureCount++;
  lastFailureAt = Date.now();
  notifyListeners(false);
}

/**
 * Record a successful network request. Resets the failure tracker.
 */
export function recordNetworkSuccess(): void {
  const wasOffline = failureCount >= FAILURE_THRESHOLD;
  failureCount = 0;
  lastFailureAt = 0;
  if (wasOffline) {
    notifyListeners(true);
  }
}

/**
 * Subscribe to connectivity changes. Returns an unsubscribe function.
 */
export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners(online: boolean): void {
  for (const listener of listeners) {
    try {
      listener(online);
    } catch {
      // listener errors are non-fatal
    }
  }
}

/**
 * Reset the tracker. Used for testing.
 */
export function resetNetworkStatus(): void {
  failureCount = 0;
  lastFailureAt = 0;
  listeners = [];
}
