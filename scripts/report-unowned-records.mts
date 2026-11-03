import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const counts = await Promise.all([
  prisma.program.count({ where: { departmentId: null } }),
  prisma.subject.count({ where: { departmentId: null } }),
  prisma.section.count({ where: { departmentId: null } }),
  prisma.schedule.count({ where: { departmentId: null } }),
  prisma.examination.count({ where: { departmentId: null } }),
  prisma.roomBooking.count({ where: { departmentId: null } }),
  prisma.scheduleRequest.count({ where: { departmentId: null } }),
  prisma.scheduleAdjustment.count({ where: { departmentId: null } }),
  prisma.workloadFix.count({ where: { departmentId: null } }),
]);

console.table(Object.fromEntries([
  "Program", "Subject", "Section", "Schedule", "Examination", "RoomBooking",
  "ScheduleRequest", "ScheduleAdjustment", "WorkloadFix",
].map((name, index) => [name, counts[index]])));
await prisma.$disconnect();
