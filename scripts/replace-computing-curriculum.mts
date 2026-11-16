import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { previewComputingCurriculum, replaceComputingCurriculum, verifyComputingCurriculum } from "../prisma/replace-computing-curriculum";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  console.log(JSON.stringify(process.argv.includes("--apply") ? await replaceComputingCurriculum(prisma) : process.argv.includes("--verify") ? await verifyComputingCurriculum(prisma) : await previewComputingCurriculum(prisma), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Curriculum import failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
