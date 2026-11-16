import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { clearSchedules } from "./clear-schedules";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
clearSchedules(db)
  .then(async () => console.log("Class schedules cleared; remaining:", await db.schedule.count()))
  .finally(() => db.$disconnect());
