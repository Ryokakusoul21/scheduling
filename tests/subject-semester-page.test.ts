import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ year: vi.fn(), subjects: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/subjects", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: vi.fn(async () => ({ role: "REGISTRAR", isAdmin: true, departmentId: null })) }));
vi.mock("@/lib/permissions/department", () => ({ departmentWhere: { subject: () => ({}), program: () => ({}) } }));
vi.mock("@/lib/academics/department-levels", () => ({ headLevels: vi.fn(async () => null) }));
vi.mock("@/lib/subjects/assignments", () => ({ assignableFaculty: vi.fn() }));
vi.mock("@/app/(dashboard)/subjects/curriculum-list", () => ({ CurriculumList: () => null }));
vi.mock("@/app/(dashboard)/subjects/subjects-list", () => ({ SubjectsList: ({ subjects }: { subjects: { code: string }[] }) => createElement("div", { "data-subjects": subjects.map((s) => s.code).join(",") }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  academicYear: { findFirst: m.year }, subject: { findMany: m.subjects },
  program: { findMany: vi.fn(async () => [{ id: "bsit", code: "BSIT", name: "Information Technology", level: "COLLEGE" }]) },
} }));
import SubjectsPage from "@/app/(dashboard)/subjects/page";

const rows = ["FIRST", "SECOND", null].map((semester, index) => ({ id: `s${index}`, code: ["FIRST-SUBJECT", "SECOND-SUBJECT", "ANY-SUBJECT"][index], name: "Subject", description: null, units: 3, lectureHours: 3, labHours: 0, semester,
  requiredRoomType: "LECTURE_ROOM", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null, departmentId: null, sharedPrograms: [], program: { code: "BSIT" }, _count: { schedules: 0 } }));
describe("Subjects page calendar and semester filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.subjects.mockResolvedValue(rows);
    m.year.mockResolvedValue({ id: "active", name: "2026-2027", isActive: true, semesters: [
      { id: "t1", name: "First Semester", type: "FIRST", programId: null, isActive: true },
      { id: "t2", name: "Second Semester", type: "SECOND", programId: null, isActive: false },
    ] });
  });
  it("uses the active academic year regardless of a stale year in the URL", async () => {
    const html = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ level: "COLLEGE", program: "bsit", year: "FIRST", ay: "old", semester: "FIRST" }) }));
    expect(m.year).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(html).toContain("2026-2027");
    expect(html).toContain('data-subjects="FIRST-SUBJECT,ANY-SUBJECT"');
    expect(html).not.toContain("Subjects academic year");
  });
  it("changes the subject list and course counts with the semester filter", async () => {
    const html = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ level: "COLLEGE", program: "bsit", year: "FIRST", semester: "SECOND" }) }));
    expect(html).toContain('data-subjects="SECOND-SUBJECT,ANY-SUBJECT"');
    expect(html).toContain('aria-label="2 subjects"');
  });
  it("keeps the semester filter in links while browsing the course and year levels", async () => {
    const html = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ level: "COLLEGE", semester: "SECOND" }) }));
    expect(html).toContain("program=bsit&amp;semester=SECOND");
    expect(html).toContain("2 subjects");
  });
});
