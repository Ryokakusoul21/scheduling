import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH } from "@/lib/auth/config";
import { watchIdleSession, type IdleSessionState } from "@/lib/auth/idle-session";

let browser: EventTarget & { localStorage: Storage };
let page: EventTarget;
let values: Map<string, string>;
const watchers: ReturnType<typeof watchIdleSession>[] = [];
const key = "scheduling:idle:session-1";

function start(sessionKey = "session-1") {
  const onChange = vi.fn<(state: IdleSessionState) => void>();
  const watcher = watchIdleSession({ sessionKey, onChange });
  watchers.push(watcher);
  return { ...watcher, onChange };
}

function broadcast() {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  browser.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T06:00:00Z"));
  values = new Map();
  const localStorage: Storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); },
    removeItem: (name) => { values.delete(name); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  browser = Object.assign(new EventTarget(), { localStorage });
  page = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
});

afterEach(() => {
  for (const watcher of watchers.splice(0)) watcher.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("idle session countdown", () => {
  it("warns after exactly five inactive minutes and expires one minute later", () => {
    const watcher = start();
    vi.advanceTimersByTime(AUTH.idleWarningAfterMs - 1);
    expect(watcher.onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
    vi.advanceTimersByTime(59_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 1 });
    vi.advanceTimersByTime(1000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "expired" });
    expect(JSON.parse(values.get(key)!)).toMatchObject({ expired: true });
  });

  it.each(["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"])("resets inactivity on %s before a warning", (event) => {
    const watcher = start();
    vi.advanceTimersByTime(4 * 60_000);
    browser.dispatchEvent(new Event(event));
    vi.advanceTimersByTime(4 * 60_000);
    expect(watcher.onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
  });

  it("requires explicit confirmation once the prompt is visible", () => {
    const watcher = start();
    vi.advanceTimersByTime(5 * 60_000);
    browser.dispatchEvent(new Event("pointermove"));
    browser.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(30_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 30 });
    watcher.renew();
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "active" });
    vi.advanceTimersByTime(5 * 60_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
  });

  it("expires immediately when resuming after a throttled or sleeping browser passes the deadline", () => {
    const watcher = start();
    vi.setSystemTime(Date.now() + 7 * 60_000);
    page.dispatchEvent(new Event("visibilitychange"));
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "expired" });
    watcher.renew();
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "expired" });
  });

  it("does not revive an expired session when the user returns after browser sleep", () => {
    const watcher = start();
    vi.setSystemTime(Date.now() + 7 * 60_000);
    browser.dispatchEvent(new Event("pointerdown"));
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "expired" });
  });

  it("does not count focus changes or background polling as human activity", () => {
    const watcher = start();
    vi.advanceTimersByTime(4 * 60_000);
    browser.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
  });

  it("preserves inactivity across reloads instead of starting a new five-minute period", () => {
    const first = start();
    vi.advanceTimersByTime(4 * 60_000);
    first.stop();
    const reloaded = start();
    vi.advanceTimersByTime(60_000);
    expect(reloaded.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
  });

  it("keeps warnings in sync with activity and confirmation in another tab", () => {
    const first = start();
    vi.advanceTimersByTime(4 * 60_000);
    const second = start();
    second.renew();
    broadcast();
    vi.advanceTimersByTime(4 * 60_000);
    expect(first.onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(first.onChange).toHaveBeenLastCalledWith({ status: "warning", secondsRemaining: 60 });
    first.renew();
    broadcast();
    expect(second.onChange).toHaveBeenLastCalledWith({ status: "active" });
  });

  it("shares expiry across tabs and gives a new sign-in its own inactivity state", () => {
    const first = start();
    const second = start();
    first.expire();
    broadcast();
    expect(second.onChange).toHaveBeenLastCalledWith({ status: "expired" });
    const nextSignIn = start("new-session");
    expect(nextSignIn.onChange).not.toHaveBeenCalled();
  });

  it("still times out when storage is denied or contains invalid data", () => {
    values.set(key, "invalid json");
    vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const watcher = start();
    vi.advanceTimersByTime(6 * 60_000);
    expect(watcher.onChange).toHaveBeenLastCalledWith({ status: "expired" });
  });

  it("stops timers and event subscriptions when unmounted", () => {
    const watcher = start();
    watcher.stop();
    vi.advanceTimersByTime(7 * 60_000);
    browser.dispatchEvent(new Event("pointerdown"));
    page.dispatchEvent(new Event("visibilitychange"));
    expect(watcher.onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
