import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { generateScheduleForSections } from "../lib/scheduler/service";

async function main() {
  const semester = await prisma.semester.findFirst({ where: { isActive: true } });
  if (!semester) throw new Error("No active semester");

  const sections = await prisma.section.findMany({ where: { semesterId: semester.id } });
  const admin = await prisma.user.findUnique({ where: { email: "admin@gcst.edu.ph" } });
  if (!admin) throw new Error("No admin user");

  console.log(`Generating for ${sections.length} sections in ${semester.name}...`);

  const result = await generateScheduleForSections({
    semesterId: semester.id,
    sectionIds: sections.map((s) => s.id),
    generatedBy: admin.id,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
