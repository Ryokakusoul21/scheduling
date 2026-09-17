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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}
