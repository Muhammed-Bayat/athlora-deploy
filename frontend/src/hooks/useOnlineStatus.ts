import { useEffect, useRef, useState, useCallback } from 'react';

export interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  resetWasOffline: () => void;
}

const PROBE_URL = '/health';
const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_MS = 8000;

async function probeNetwork(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(PROBE_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const wasOfflineRef = useRef(false);
  const mountedRef = useRef(true);

  const resetWasOffline = useCallback(() => {
    wasOfflineRef.current = false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      const reachable = await probeNetwork();
      if (!mountedRef.current) return;
      if (reachable) {
        wasOfflineRef.current = true;
        setIsOnline(true);
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll for actual connectivity — navigator.onLine is unreliable on desktop
    // (e.g., airplane mode may not fire the 'offline' event)
    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      const reachable = await probeNetwork();
      if (!mountedRef.current) return;
      setIsOnline((prev) => {
        if (prev && !reachable) {
          wasOfflineRef.current = true;
          return false;
        }
        if (!prev && reachable) {
          wasOfflineRef.current = true;
          return true;
        }
        return prev;
      });
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, wasOffline: wasOfflineRef.current, resetWasOffline };
}
