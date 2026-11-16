import { describe, expect, it, vi } from "vitest";
import { syncAssignedCurriculum } from "@/lib/subjects/assignment-curriculum";
import { sectionNeeds } from "@/lib/scheduler/summary";

const section = { id: "s1", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null, semesterId: "t1", archivedAt: null };
const subject = { id: "cc101", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null, semester: "FIRST", lectureHours: 3, labHours: 1, sharedPrograms: [], archivedAt: null };
const slot = { subjectId: "cc101", sectionId: "s1", semesterId: "t1" };
function fixture() {
  const assignment = { ...slot, facultyId: "ana", section, subject, semester: { id: "t1", level: "COLLEGE", programId: null, type: "FIRST" } };
  const existing = new Map<string, { sectionId: string; subjectId: string; component: "LECTURE" | "LABORATORY"; rememberedFacultyId?: string }>();
  const createMany = vi.fn(async ({ data }: { data: { sectionId: string; subjectId: string; component: "LECTURE" | "LABORATORY" }[] }) => {
    let count = 0;
    for (const row of data) if (!existing.has(row.component)) { existing.set(row.component, row); count++; }
    return { count };
  });
  const rows = vi.fn(async () => [assignment]);
  const db = { subjectAssignment: { findMany: rows }, sectionClassPlaceholder: { createMany } } as unknown as Parameters<typeof syncAssignedCurriculum>[0];
  return { assignment, existing, createMany, rows, db };
}
describe("assignment to curriculum queue", () => {
  it("makes saved assignments appear immediately in Unscheduled with the assigned teacher", async () => {
    const f = fixture();
    expect(await syncAssignedCurriculum(f.db, [slot])).toBe(2);
    const curriculum = [...f.existing.values()];
    const needs = sectionNeeds({ ...section, curriculum }, [subject], [], "t1", [f.assignment]);
    expect(needs).toHaveLength(2);
    expect(needs.every((n) => n.facultyId === "ana" && !n.blockedReason)).toBe(true);
  });
  it("repairs a partial queue without changing remembered choices and is idempotent", async () => {
    const f = fixture();
    f.existing.set("LECTURE", { ...slot, component: "LECTURE", rememberedFacultyId: "remembered" });
    expect(await syncAssignedCurriculum(f.db, [slot])).toBe(1);
    expect(await syncAssignedCurriculum(f.db, [slot])).toBe(0);
    expect(f.existing.get("LECTURE")?.rememberedFacultyId).toBe("remembered");
  });
  it("keeps unassigned required classes visible with a Needs teacher blocker", async () => {
    const f = fixture(); await syncAssignedCurriculum(f.db, [slot]);
    const needs = sectionNeeds({ ...section, curriculum: [...f.existing.values()] }, [subject], [], "t1", []);
    expect(needs).toHaveLength(2);
    expect(needs[0].blockedReason).toContain("Needs teacher");
  });
  it("reduces remaining hours after partial placement and clears complete components", async () => {
    const f = fixture(); await syncAssignedCurriculum(f.db, [slot]);
    const s = { ...section, curriculum: [...f.existing.values()] };
    const meeting = { ...slot, id: "e1", facultyId: "ana", roomId: "r1", component: "LECTURE" as const, dayOfWeek: "MONDAY" as const, startMin: 420, endMin: 510 };
    expect(sectionNeeds(s, [subject], [meeting], "t1", [f.assignment])[0]).toMatchObject({ requiredMin: 180, scheduledMin: 90 });
    expect(sectionNeeds(s, [subject], [{ ...meeting, endMin: 600 }], "t1", [f.assignment]).map((n) => n.component)).toEqual(["LABORATORY"]);
  });
  it("rejects invalid academic scope before creating queue components", async () => {
    const f = fixture();
    f.rows.mockResolvedValue([{ ...f.assignment, section: { ...section, programId: "wrong" } }]);
    await expect(syncAssignedCurriculum(f.db, [slot])).rejects.toThrow("no longer matches");
    expect(f.createMany).not.toHaveBeenCalled();
  });
});
