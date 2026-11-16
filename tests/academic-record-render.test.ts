import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ layout: "cards", shortcut: vi.fn() }));
vi.mock("@/hooks/use-persisted", () => ({ usePersisted: (key: string, fallback: unknown) => [key === "programs:view" ? m.layout : fallback, vi.fn()] }));
vi.mock("@/components/ux/shortcuts", () => ({ useShortcut: m.shortcut }));
vi.mock("@/app/(dashboard)/programs/actions", () => ({ saveProgramAction: vi.fn(), deleteProgramAction: vi.fn() }));
vi.mock("@/app/(dashboard)/academic-years/actions", () => ({ saveAcademicYearAction: vi.fn(), deleteAcademicYearAction: vi.fn(), setActiveAcademicYearAction: vi.fn() }));

import { ProgramsManager, type ProgramRow } from "@/app/(dashboard)/programs/programs-manager";
import { YearsManager } from "@/app/(dashboard)/academic-years/years-manager";

const programs: ProgramRow[] = [
  { id: "bsit", code: "BSIT", name: "Information Technology", level: "COLLEGE", departmentId: "college", department: "Computing", sections: 2, subjects: 6, terms: 2 },
  { id: "stem", code: "STEM", name: "Science and Technology", level: "SENIOR_HIGH", departmentId: "shs", department: "Senior High", sections: 1, subjects: 4, terms: 0 },
];
const departments = [{ value: "college", label: "Computing" }, { value: "shs", label: "Senior High" }];

describe("level-specific academic programs", () => {
  beforeEach(() => { vi.clearAllMocks(); m.layout = "cards"; });

  it.each(["cards", "table"])("shows only College records and creation controls in %s view", (layout) => {
    m.layout = layout;
    const html = renderToStaticMarkup(createElement(ProgramsManager, { programs, departments, activeLevel: "COLLEGE" }));
    expect(html).toContain("BSIT");
    expect(html).not.toContain("STEM");
    expect(html).not.toContain("Senior High School strands");
    expect(html).toContain("Add course");
    expect(html).not.toContain("Add strand");
    expect(m.shortcut).toHaveBeenCalledWith(expect.objectContaining({ keys: "n", description: "Add a college course" }));
  });

  it.each(["cards", "table"])("shows only Senior High records and creation controls in %s view", (layout) => {
    m.layout = layout;
    const html = renderToStaticMarkup(createElement(ProgramsManager, { programs, departments, activeLevel: "SENIOR_HIGH" }));
    expect(html).toContain("STEM");
    expect(html).not.toContain("BSIT");
    expect(html).not.toContain("College courses");
    expect(html).toContain("Add strand");
    expect(html).not.toContain("Add course");
    expect(m.shortcut).toHaveBeenCalledWith(expect.objectContaining({ keys: "n", description: "Add a Senior High strand" }));
  });

  it("keeps an empty selected level visible without adding the opposite level", () => {
    const html = renderToStaticMarkup(createElement(ProgramsManager, { programs: [], departments, activeLevel: "SENIOR_HIGH" }));
    expect(html).toContain("No senior high school strands yet");
    expect(html).not.toContain("College courses");
    expect(html).not.toContain("Add course");
  });

  it("shows calendar guidance for basic education without unrelated program forms", () => {
    const html = renderToStaticMarkup(createElement(ProgramsManager, { programs, departments, activeLevel: "ELEMENTARY" }));
    expect(html).toContain("academic calendar above");
    expect(html).not.toContain("College courses");
    expect(html).not.toContain("Senior High School strands");
    expect(html).not.toContain("Add course");
    expect(html).not.toContain("Add strand");
  });

  it("gives academic years the page heading and preserves the program creation shortcut", () => {
    const html = renderToStaticMarkup(createElement(YearsManager, { years: [], embedded: true }));
    expect(html).toMatch(/<h1[^>]*>Academic Years and Terms<\/h1>/);
    expect(html).toContain("New academic year");
    expect(html).not.toContain('aria-keyshortcuts="n"');
    expect(m.shortcut).toHaveBeenCalledWith(null);
  });
});
