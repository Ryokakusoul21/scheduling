"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { solve } from "@/lib/scheduler/resolver/solver";
import type { ProgressStep, Proposal, ResolverInput, ResolverOptions } from "@/lib/scheduler/resolver/types";

export interface ResolverProgress {
  step: ProgressStep;
  done: number;
  total: number;
}

type Message = { type: "progress"; step: ProgressStep; done: number; total: number } | { type: "done"; proposal: Proposal };

/** Runs the resolver in a Web Worker with progress and Cancel; falls back to the page thread if workers fail. */
export function useResolver() {
  const worker = useRef<Worker | null>(null);
  const settle = useRef<((p: Proposal | null) => void) | null>(null);
  const [progress, setProgress] = useState<ResolverProgress | null>(null);

  const finish = useCallback((proposal: Proposal | null) => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    settle.current?.(proposal);
    settle.current = null;
  }, []);

  /** Stops the run; the pending promise resolves to null. */
  const cancel = useCallback(() => finish(null), [finish]);
  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (input: ResolverInput, options: ResolverOptions) =>
      new Promise<Proposal | null>((resolve) => {
        cancel();
        settle.current = resolve;
        setProgress({ step: "Finding issues", done: 0, total: 1 });
        const inline = () =>
          setTimeout(() => {
            if (settle.current !== resolve) return;
            finish(solve(input, options, (step, done, total) => setProgress({ step, done, total })));
          });
        try {
          const w = new Worker(new URL("./resolve.worker.ts", import.meta.url));
          worker.current = w;
          w.onmessage = (e: MessageEvent<Message>) => (e.data.type === "progress" ? setProgress({ step: e.data.step, done: e.data.done, total: e.data.total }) : finish(e.data.proposal));
          w.onerror = () => {
            w.terminate();
            worker.current = null;
            inline();
          };
          w.postMessage({ input, options });
        } catch {
          inline();
        }
      }),
    [cancel, finish]
  );

  return { run, cancel, progress };
}
