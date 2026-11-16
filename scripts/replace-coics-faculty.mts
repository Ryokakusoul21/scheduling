import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseDelimited } from "../lib/import/parse";
import { previewCoicsFaculty, replaceCoicsFaculty, type RosterPerson } from "../prisma/coics-faculty";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const file = "prisma/data/coics-faculty-roster.csv";
const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
try {
  const [headers, ...data] = parseDelimited(await readFile(file, "utf8"));
  if (headers.join(",") !== "fullName,employeeId,email,position") throw new Error("Unexpected roster columns.");
  const people: RosterPerson[] = data.map(([fullName, employeeId, email, position]) => ({ fullName, employeeId, email, position }));
  if (process.argv.includes("--apply")) {
    const { roster, reassignment, ...result } = await replaceCoicsFaculty(db, people);
    await writeFile(file, [headers.map(cell).join(","), ...people.map((p) => {
      const row = roster.find((f) => f.fullName === p.fullName)!;
      return [row.fullName, row.employeeId, row.email, row.position].map(cell).join(",");
    })].join("\n") + "\n");
    const columns = ["type", "id", "semesterId", "sectionId", "subjectId", "oldFaculty", "facultyId", "targetFacultyId", "status"] as const;
    const reassignmentPath = "prisma/data/coics-faculty-reassignment.csv";
    await writeFile(reassignmentPath, [columns.map(cell).join(","), ...reassignment.map((r) => columns.map((key) => cell(r[key])).join(","))].join("\n") + "\n");
    console.log(JSON.stringify({ ...result, reassignmentPath, inactiveTemporaryProfiles: roster.filter((f) => f.status === "INACTIVE" && f.email.endsWith("@faculty.invalid")).length, newAccounts: roster.filter((f) => f.user).length }, null, 2));
  } else console.log(JSON.stringify(await previewCoicsFaculty(db, people), null, 2));
} finally { await db.$disconnect(); }
