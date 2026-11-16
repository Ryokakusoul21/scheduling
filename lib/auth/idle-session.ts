import { AUTH } from "./config";

export type IdleSessionState =
  | { status: "active" }
  | { status: "warning"; secondsRemaining: number }
  | { status: "expired" };

interface StoredActivity { lastActiveAt: number; expired: boolean }

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

/** Watches human input, sharing activity between tabs of the same signed-in browser session. */
export function watchIdleSession({ sessionKey, onChange }: {
  sessionKey: string;
  onChange: (state: IdleSessionState) => void;
}) {
  const key = `scheduling:idle:${sessionKey}`;
  let lastActiveAt = Date.now();
  let expired = false;
  let stopped = false;
  let state: IdleSessionState = { status: "active" };

  function read() {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<StoredActivity>;
      if (typeof value.lastActiveAt !== "number" || !Number.isFinite(value.lastActiveAt) || value.lastActiveAt > Date.now() || typeof value.expired !== "boolean") return null;
      return value as StoredActivity;
    } catch {
      return null;
    }
  }

  function write() {
    try {
      window.localStorage.setItem(key, JSON.stringify({ lastActiveAt, expired } satisfies StoredActivity));
    } catch {
      // The current tab still times out when browser storage is unavailable.
    }
  }

  function publish(next: IdleSessionState) {
    if (stopped || (state.status === next.status && (state.status !== "warning" || (next.status === "warning" && state.secondsRemaining === next.secondsRemaining)))) return;
    state = next;
    onChange(next);
  }

  function expire() {
    if (stopped || expired) return;
    expired = true;
    write();
    publish({ status: "expired" });
  }

  function check() {
    if (stopped) return;
    const stored = read();
    if (stored) {
      lastActiveAt = Math.max(lastActiveAt, stored.lastActiveAt);
      expired ||= stored.expired;
    }
    const elapsed = Date.now() - lastActiveAt;
    if (expired) return publish({ status: "expired" });
    if (elapsed >= AUTH.idleWarningAfterMs + AUTH.idleSignOutGraceMs) return expire();
    if (elapsed >= AUTH.idleWarningAfterMs) {
      return publish({ status: "warning", secondsRemaining: Math.ceil((AUTH.idleWarningAfterMs + AUTH.idleSignOutGraceMs - elapsed) / 1000) });
    }
    publish({ status: "active" });
  }

  function renew() {
    check();
    if (expired || stopped) return;
    lastActiveAt = Date.now();
    write();
    publish({ status: "active" });
  }

  function activity() {
    // Limit pointer/scroll writes to once a second. A visible warning requires confirmation.
    if (Date.now() - lastActiveAt < 1000 && state.status === "active") return;
    check();
    if (state.status === "active") renew();
  }

  function storage(event: StorageEvent) {
    if (event.key === key || event.key === null) check();
  }

  const stored = read();
  if (stored) {
    lastActiveAt = stored.lastActiveAt;
    expired = stored.expired;
  } else {
    write();
  }
  check();

  for (const event of ACTIVITY_EVENTS) window.addEventListener(event, activity, { capture: true, passive: true });
  window.addEventListener("storage", storage);
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", check);
  const timer = setInterval(check, 1000);

  return {
    renew,
    expire,
    stop() {
      stopped = true;
      clearInterval(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, activity, true);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    },
  };
}
