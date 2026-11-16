import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ calendar: vi.fn(), save: vi.fn(), program: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: vi.fn(async () => ({ role: "REGISTRAR", isAdmin: true, departmentId: null })), OUTSIDE_DEPARTMENT: "Outside department" }));
vi.mock("@/lib/permissions/department", () => ({ recordDepartment: vi.fn(async () => null), logBlocked: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/subjects/term-calendar", () => ({ loadSubjectCalendar: m.calendar }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { subject: { findUnique: vi.fn(async () => ({ departmentId: null, labHours: 0 })), update: m.save }, program: { findUnique: m.program } } }));
import { saveSubjectAction } from "@/app/(dashboard)/subjects/actions";

const calendar = { id: "ay", name: "2026-2027", isActive: true, semesters: [
  { id: "first", name: "First Semester", type: "FIRST", programId: null, isActive: true },
  { id: "second", name: "Second Semester", type: "SECOND", programId: null, isActive: false },
] };
function form(semester: string, level = "COLLEGE") {
  const fd = new FormData();
  Object.entries({ code: "CC101", name: "Computing", units: "3", hoursPerWeek: "3", requiredRoomType: "LECTURE_ROOM", level, yearLevel: "FIRST", gradeLevel: level === "COLLEGE" ? "" : "GRADE_7", semester, academicYearId: "ay" }).forEach(([key, value]) => fd.set(key, value));
  return fd;
}
describe("subject calendar save validation", () => {
  beforeEach(() => { vi.clearAllMocks(); m.calendar.mockResolvedValue(calendar); m.save.mockResolvedValue({ id: "s" }); m.program.mockResolvedValue({ level: "COLLEGE" }); });
  it("rejects a forged Summer submission when only First and Second exist", async () => {
    expect(await saveSubjectAction("s", form("SUMMER"))).toMatchObject({ ok: false, error: expect.stringContaining("configured") });
    expect(m.save).not.toHaveBeenCalled();
    expect(m.calendar).toHaveBeenCalledWith("ay");
  });
  it("saves configured terms using the existing subject semester type", async () => {
    expect(await saveSubjectAction("s", form("SECOND"))).toEqual({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ semester: "SECOND" }) }));
  });
  it("checks the actual submitted course against its overriding calendar", async () => {
    m.calendar.mockResolvedValue({ ...calendar, semesters: [...calendar.semesters, { id: "own", name: "BSCS Second", type: "SECOND", programId: "bscs", isActive: true }] });
    const fd = form("FIRST"); fd.set("programId", "bscs");
    expect((await saveSubjectAction("s", fd)).ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("does not silently save when an academic year was removed", async () => {
    m.calendar.mockResolvedValue(null);
    expect((await saveSubjectAction("s", form("FIRST"))).ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("keeps basic education independent of college calendars", async () => {
    expect((await saveSubjectAction("s", form("", "JUNIOR_HIGH"))).ok).toBe(true);
    expect(m.calendar).not.toHaveBeenCalled();
  });
});
