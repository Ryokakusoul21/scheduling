import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SUPPLIED_ROOM_CAPACITIES } from "../prisma/supplied-rooms";
import { previewRoomCatalog, replaceRoomCatalog, verifyRoomCatalog } from "../prisma/replace-room-catalog";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const path = process.argv[process.argv.indexOf("--capacities") + 1];
  const capacities = process.argv.includes("--capacities") ? JSON.parse(await readFile(path, "utf8")) as Record<string, number> : SUPPLIED_ROOM_CAPACITIES;
  console.log(JSON.stringify(process.argv.includes("--apply") ? await replaceRoomCatalog(prisma, capacities)
    : process.argv.includes("--verify") ? await verifyRoomCatalog(prisma, capacities) : await previewRoomCatalog(prisma, capacities), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Room import failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
