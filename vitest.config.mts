import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      // Next-only modules throw outside a Next request, so tests get inert stand-ins.
      { find: /^server-only$/, replacement: `${root}/tests/stubs/server-only.ts` },
      { find: /^next\/cache$/, replacement: `${root}/tests/stubs/next-cache.ts` },
      { find: /^next\/headers$/, replacement: `${root}/tests/stubs/next-headers.ts` },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The default worker pools crash on this machine (undefined runner); vmForks is the one that runs.
    pool: "vmForks",
  },
});
