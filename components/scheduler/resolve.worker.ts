/// <reference lib="webworker" />
import { solve } from "@/lib/scheduler/resolver/solver";
import type { ResolverInput, ResolverOptions } from "@/lib/scheduler/resolver/types";

/** Runs the resolver off the main thread and reports each step back to the page. */
self.onmessage = (e: MessageEvent<{ input: ResolverInput; options: ResolverOptions }>) => {
  const proposal = solve(e.data.input, e.data.options, (step, done, total) => self.postMessage({ type: "progress", step, done, total }));
  self.postMessage({ type: "done", proposal });
};
