import { useCallback, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((previous: T) => T)) => {
      setStoredValue((previous) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(previous) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage unavailable (private mode, quota) — keep in-memory value.
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue] as const;
}