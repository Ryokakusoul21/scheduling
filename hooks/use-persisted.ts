"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "persisted-preference";
const memory = new Map<string, string>();

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** A per-browser preference (view mode, visible columns) kept in localStorage; the default renders on the server and until a value is saved. */
export function usePersisted<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return memory.get(key) ?? window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    () => null,
  );
  let value = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
        memory.delete(key);
      } catch {
        // Storage can be blocked; the choice then lasts only until reload.
        memory.set(key, JSON.stringify(next));
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
