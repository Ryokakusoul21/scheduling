import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ role: "REGISTRAR", years: vi.fn(), create: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn(async (...roles: string[]) => {
  if (!roles.includes(m.role)) throw new Error("FORBIDDEN");
  return { id: "user", role: m.role };
}) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { academicYear: { findMany: m.years, create: m.create } } }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("@/app/(dashboard)/academic-years/years-manager", () => ({ YearsManager: () => createElement("div") }));

import { AcademicYearsSection } from "@/app/(dashboard)/academic-years/years-section";
import AcademicYearsPage from "@/app/(dashboard)/academic-years/page";
import { createDefaultTermsAction, deleteAcademicYearAction, deleteTermAction, saveAcademicYearAction, saveTermAction, setActiveAcademicYearAction, setActiveTermAction } from "@/app/(dashboard)/academic-years/actions";

describe("merged academic record access", () => {
  beforeEach(() => { vi.clearAllMocks(); m.role = "REGISTRAR"; m.years.mockResolvedValue([]); m.create.mockResolvedValue({ id: "year" }); });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("allows %s to load the calendar in the programs workspace", async (role) => {
    m.role = role;
    const result = await AcademicYearsSection();
    expect(result.props.embedded).toBe(true);
    expect(m.years).toHaveBeenCalledOnce();
  });

  it.each(["HEAD_OF_DEPARTMENT", "FACULTY", "STUDENT"])("does not expose calendar data or mutations to %s", async (role) => {
    m.role = role;
    await expect(AcademicYearsSection()).rejects.toThrow("FORBIDDEN");
    const calls = [
      () => saveAcademicYearAction(null, new FormData()), () => setActiveAcademicYearAction("year"), () => deleteAcademicYearAction("year"),
      () => saveTermAction(null, new FormData()), () => setActiveTermAction("term"), () => deleteTermAction("term"),
      () => createDefaultTermsAction("year", "COLLEGE", null),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("FORBIDDEN");
    expect(m.years).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("keeps old year links working and preserves the selected academic level", async () => {
    await expect(AcademicYearsPage({ searchParams: Promise.resolve({ level: "COLLEGE" }) })).rejects.toThrow("REDIRECT:/programs?level=COLLEGE#academic-calendar");
  });

  it("refreshes the merged page after an academic year changes", async () => {
    const form = new FormData();
    form.set("name", "2026-2027"); form.set("startDate", "2026-06-01"); form.set("endDate", "2027-05-31");
    expect(await saveAcademicYearAction(null, form)).toEqual({ ok: true });
    expect(m.refresh).toHaveBeenCalledWith("/programs");
    expect(m.refresh).toHaveBeenCalledWith("/academic-years/year");
  });
});
