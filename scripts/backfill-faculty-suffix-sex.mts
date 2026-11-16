// Fills Faculty.suffix and Faculty.sex from names; pass --apply to save, otherwise prints a dry run.
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const SUFFIX = /\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i;
const apply = process.argv.includes("--apply");

const faculty = await prisma.faculty.findMany({ select: { id: true, fullName: true, suffix: true, sex: true }, orderBy: { fullName: "asc" } });
let changed = 0;
for (const f of faculty) {
  const suffix = f.suffix ?? f.fullName.match(SUFFIX)?.[1]?.replace(/^(jr|sr)$/i, (m) => `${m[0].toUpperCase()}${m[1].toLowerCase()}.`) ?? null;
  const sex = f.sex ?? (/^Mr\.?\s/i.test(f.fullName) ? "MALE" : /^(Ms|Mrs|Miss)\.?\s/i.test(f.fullName) ? "FEMALE" : null);
  if (suffix === f.suffix && sex === f.sex) { console.log(`unchanged  ${f.fullName}`); continue; }
  changed++;
  console.log(`update     ${f.fullName}  suffix=${suffix ?? "-"}  sex=${sex ?? "-"}`);
  if (apply) await prisma.faculty.update({ where: { id: f.id }, data: { suffix, sex } });
}
console.log(`${faculty.length} faculty, ${changed} ${apply ? "updated" : "would update"}`);
await prisma.$disconnect();
