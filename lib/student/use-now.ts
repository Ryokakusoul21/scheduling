"use client";

import { useSyncExternalStore } from "react";

// One shared minute ticker so every live widget re-renders together.
const subscribe = (onTick: () => void) => {
  const id = window.setInterval(onTick, 30_000);
  return () => window.clearInterval(id);
};
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

/** Current time rounded to the minute, or null during the server render so clock-based text never mismatches. */
export function useNow(): Date | null {
  const ts = useSyncExternalStore(subscribe, snapshot, () => 0);
  return ts ? new Date(ts) : null;
}
