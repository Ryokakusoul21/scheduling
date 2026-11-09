import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaAdapter: PrismaPg | undefined;
};

// Cache the adapter (and its underlying pg.Pool) across dev hot-reloads too,
// otherwise every module re-evaluation opens a fresh pool and can exhaust
// Supabase's connection limit within minutes of active development.
const adapter =
  globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });

const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);

/** True inside a server action sent while a Super Administrator views as another account (header set by the proxy). */
async function viewingAsInAction() {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-viewing-as") === "1" && h.has("next-action");
  } catch {
    // Outside a request (seed, scripts, tests) there is nothing to restrict.
    return false;
  }
}

/** Viewing as another account is read-only: reads run normally, writes from server actions are refused. */
function readOnlyWhileViewing(client: PrismaClient) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (WRITES.has(operation) && (await viewingAsInAction())) throw new Error("Viewing as another account is read-only. Return to your own account to make changes.");
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma =
  globalForPrisma.prisma ??
  readOnlyWhileViewing(new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}
