import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDelimited } from "@/lib/import/parse";
import { planCoicsFaculty, rosterName } from "@/prisma/coics-faculty";

const [, ...rows] = parseDelimited(readFileSync("prisma/data/coics-faculty-roster.csv", "utf8"));
const source = rows.map(([fullName]) => ({ fullName }));
const old = { id: "old", fullName: "Old Faculty", departmentId: "coics", employeeId: "GC-001", email: "old@example.test", archivedAt: null };
describe("supplied COICS roster replacement", () => {
  it("prepares 16 inactive profiles with marked temporary identifiers and non-deliverable addresses", () => {
    const plan = planCoicsFaculty(source, [old], "coics");
    expect(plan.create).toHaveLength(16);
    expect(plan.create.every((f) => f.status === "INACTIVE" && f.employeeId.startsWith("GC-COICS-TEMP-") && f.email.endsWith("@faculty.invalid"))).toBe(true);
    expect(plan.create.find((f) => f.fullName.includes("Marvin"))?.position).toContain("account access pending");
    expect(plan.archiveIds).toEqual(["old"]);
  });
  it("is idempotent and preserves existing identity information", () => {
    const created = planCoicsFaculty(source, [], "coics").create.map((f, i) => ({ ...f, id: `new-${i}`, archivedAt: null }));
    created[0].email = "confirmed@example.test"; created[0].employeeId = "GC-REAL-001";
    const plan = planCoicsFaculty(source, [...created, { ...old, archivedAt: new Date() }], "coics");
    expect(plan.create).toEqual([]);
    expect(plan.archiveIds).toEqual([]);
    expect(plan.keepIds).toHaveLength(16);
  });
  it("never archives faculty in another department", () => {
    expect(planCoicsFaculty(source, [{ ...old, departmentId: "other" }], "coics").archiveIds).toEqual([]);
  });
  it("rejects collisions instead of renaming an unrelated person or moving departments", () => {
    expect(() => planCoicsFaculty(source, [{ ...old, employeeId: "GC-COICS-TEMP-001" }], "coics")).toThrow("already in use");
    expect(() => planCoicsFaculty(source, [{ ...old, fullName: source[0].fullName, departmentId: "other" }], "coics")).toThrow("outside the current COICS roster");
  });
  it("recognizes names with or without honorifics without creating duplicate people", () => {
    expect(rosterName("Mr. Marvin A. Ramos")).toBe(rosterName("Marvin A Ramos"));
  });
});
