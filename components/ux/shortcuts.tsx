"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "./kbd";
import { eventToKey } from "@/lib/keyboard";

/**
 * Keyboard shortcut system.
 *
 * - Single keys ("n", "?", "/") and two-key sequences ("g s") are supported.
 * - Modifier combos use "mod" for Ctrl/Cmd: "mod+k".
 * - Shortcuts never fire while the user is typing in a field (except "Escape").
 * - Pages register their own shortcuts with `useShortcut`; they show up in the
 *   help dialog (press "?") while that page is mounted.
 */

export interface ShortcutDef {
  /** e.g. "n", "?", "g s", "mod+k", "shift+arrowdown" */
  keys: string;
  description: string;
  group?: string;
  handler: (e: KeyboardEvent) => void;
  /** Allow firing while focus is in an input/textarea. */
  allowInInput?: boolean;
}

/** Shortcuts handled by components themselves (shown in the help dialog only). */
const STATIC_HELP: { group: string; items: { keys: string; description: string }[] }[] = [
  {
    group: "Tables & lists",
    items: [
      { keys: "↑ ↓", description: "Move between rows / cards" },
      { keys: "← →", description: "Move between cards in a grid" },
      { keys: "Home End", description: "Jump to first / last item" },
      { keys: "Enter", description: "Open the focused item" },
      { keys: "Space", description: "Pick up / drop a draggable row (then ↑ ↓ to move)" },
    ],
  },
  {
    group: "Timetable",
    items: [
      { keys: "← → ↑ ↓", description: "Move focus between class blocks" },
      { keys: "Enter", description: "Edit the focused class" },
      { keys: "Space", description: "Pick up a class, move with arrows, Space to drop" },
      { keys: "Esc", description: "Cancel a move / close dialogs" },
    ],
  },
];

const NAV_SHORTCUTS: { keys: string; href: string; description: string }[] = [
  { keys: "g d", href: "/dashboard", description: "Go to Dashboard" },
  { keys: "g s", href: "/scheduler", description: "Go to Scheduler" },
  { keys: "g y", href: "/academic-years", description: "Go to Academic Years & Terms" },
  { keys: "g p", href: "/programs", description: "Go to Programs & Strands" },
  { keys: "g u", href: "/subjects", description: "Go to Subjects" },
  { keys: "g e", href: "/sections", description: "Go to Sections" },
  { keys: "g f", href: "/faculty", description: "Go to Faculty" },
  { keys: "g r", href: "/rooms", description: "Go to Rooms" },
  { keys: "g n", href: "/notifications", description: "Go to Notifications" },
];

interface Ctx {
  register: (def: ShortcutDef) => () => void;
  openHelp: () => void;
}

const ShortcutContext = createContext<Ctx | null>(null);

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function ShortcutProvider({ allowedHrefs, children }: { allowedHrefs?: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const registry = useRef(new Map<number, ShortcutDef>());
  const nextId = useRef(0);
  const [registered, setRegistered] = useState<ShortcutDef[]>([]);
  const pending = useRef<{ prefix: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const register = useCallback((def: ShortcutDef) => {
    const id = nextId.current++;
    registry.current.set(id, def);
    setRegistered([...registry.current.values()]);
    return () => {
      registry.current.delete(id);
      setRegistered([...registry.current.values()]);
    };
  }, []);

  const navShortcuts = useMemo(
    () => NAV_SHORTCUTS.filter((s) => !allowedHrefs || allowedHrefs.includes(s.href)),
    [allowedHrefs]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const typing = isTypingTarget(e.target);
      const key = eventToKey(e);

      // Second key of a "g x" sequence.
      if (pending.current) {
        const seq = `${pending.current.prefix} ${key}`;
        clearTimeout(pending.current.timer);
        pending.current = null;
        const nav = navShortcuts.find((s) => s.keys === seq);
        if (nav) {
          e.preventDefault();
          router.push(nav.href);
          return;
        }
        const custom = [...registry.current.values()].find((d) => d.keys === seq);
        if (custom) {
          e.preventDefault();
          custom.handler(e);
          return;
        }
      }

      const defs = [...registry.current.values()].reverse(); // latest registration wins
      const match = defs.find((d) => d.keys === key && (!typing || d.allowInInput || key === "escape"));
      if (match) {
        e.preventDefault();
        match.handler(e);
        return;
      }
      if (typing) return;

      if (key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (key === "/" || key === "mod+k") {
        const search = document.getElementById("global-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }
      if (key === "g") {
        pending.current = { prefix: "g", timer: setTimeout(() => (pending.current = null), 1200) };
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, navShortcuts]);

  const ctx = useMemo(() => ({ register, openHelp: () => setHelpOpen(true) }), [register]);

  const pageGroups = registered.reduce<Record<string, ShortcutDef[]>>((acc, d) => {
    (acc[d.group ?? "This page"] ??= []).push(d);
    return acc;
  }, {});

  return (
    <ShortcutContext.Provider value={ctx}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Press <Kbd>?</Kbd> anytime to show this list. <Kbd>Esc</Kbd> closes it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            <ShortcutGroup
              title="General"
              items={[
                { keys: "?", description: "Show keyboard shortcuts" },
                { keys: "/", description: "Focus global search" },
                { keys: "mod+k", description: "Focus global search" },
                { keys: "Tab", description: "Move to the next control" },
                { keys: "Esc", description: "Close dialog / menu / cancel" },
              ]}
            />
            <ShortcutGroup title="Navigation" items={navShortcuts} />
            {Object.entries(pageGroups).map(([group, items]) => (
              <ShortcutGroup key={group} title={group} items={items} />
            ))}
            {STATIC_HELP.map((g) => (
              <ShortcutGroup key={g.group} title={g.group} items={g.items} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </ShortcutContext.Provider>
  );
}

function prettyKeys(keys: string) {
  return keys
    .split(" ")
    .map((chord) => chord.replace("mod", "Ctrl").replace("shift", "Shift").replace("alt", "Alt"));
}

function ShortcutGroup({ title, items }: { title: string; items: { keys: string; description: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={`${s.keys}-${s.description}`} className="flex items-center justify-between gap-3 text-sm">
            <span>{s.description}</span>
            <span className="flex shrink-0 gap-1">
              {prettyKeys(s.keys).map((k, i) => (
                <Kbd key={i}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function useShortcuts() {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error("useShortcuts must be used inside <ShortcutProvider>");
  return ctx;
}

/** Registers a shortcut for as long as the calling component is mounted. */
export function useShortcut(def: ShortcutDef | null) {
  const ctx = useContext(ShortcutContext);
  const handlerRef = useRef(def?.handler);
  useEffect(() => {
    handlerRef.current = def?.handler;
  });
  const keys = def?.keys;
  const description = def?.description;
  const group = def?.group;
  const allowInInput = def?.allowInInput;
  useEffect(() => {
    if (!ctx || !keys || !description) return;
    return ctx.register({
      keys,
      description,
      group,
      allowInInput,
      handler: (e) => handlerRef.current?.(e),
    });
  }, [ctx, keys, description, group, allowInInput]);
}
