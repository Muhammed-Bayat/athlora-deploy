import { useEffect, useRef, useState } from 'react';
import { isDeviceOnline, onConnectivityChange } from '../offline/networkStatus';

export interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() => isDeviceOnline());
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      wasOfflineRef.current = true;
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to failure-tracker changes (when requests fail/recover)
    const unsubConnectivity = onConnectivityChange((online) => {
      setIsOnline(online);
    });

    // Periodic fallback: some devices/browsers don't fire online/offline
    // events reliably (e.g. airplane mode toggles on certain Android builds).
    // Also checks the failure tracker in case navigator.onLine is stale.
    const poll = setInterval(() => {
      setIsOnline(isDeviceOnline());
    }, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubConnectivity();
      clearInterval(poll);
    };
  }, []);

  return { isOnline, wasOffline: wasOfflineRef.current };
}
