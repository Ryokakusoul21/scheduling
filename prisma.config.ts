import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // The react-server condition lets the seed reuse server-only scheduling code.
    seed: "npx tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
