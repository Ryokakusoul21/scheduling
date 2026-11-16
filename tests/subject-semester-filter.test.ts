import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ replace: vi.fn(), select: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace }), usePathname: () => "/subjects", useSearchParams: () => new URLSearchParams("level=COLLEGE&program=bsit&year=FIRST&ay=old&term=old-term") }));
vi.mock("@/components/ux/native-select", () => ({ NativeSelect: (props: { options: { value: string; label: string }[] }) => {
  m.select(props);
  return createElement("select", { "aria-label": "Filter subjects by semester" }, props.options.map((o) => createElement("option", { key: o.value, value: o.value }, o.label)));
} }));
import { SubjectSemesterFilter } from "@/app/(dashboard)/subjects/semester-filter";

const props = { academicYear: "2026-2027", semester: "ALL" as const, options: [{ value: "FIRST", label: "First Semester" }, { value: "SECOND", label: "Second Semester" }] };
describe("static academic year and semester filter", () => {
  beforeEach(() => vi.clearAllMocks());
  it("shows the academic year as text and only one dropdown for configured semesters", () => {
    const html = renderToStaticMarkup(createElement(SubjectSemesterFilter, props));
    expect(html).toContain("2026-2027");
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).not.toContain('value="2026-2027"');
    expect(html).toContain("All semesters");
    expect(html).toContain("First Semester");
    expect(html).toContain("Second Semester");
    expect(html).not.toContain("Summer");
  });
  it("preserves the course and year level while clearing stale academic year and term links", () => {
    renderToStaticMarkup(createElement(SubjectSemesterFilter, props));
    m.select.mock.calls[0][0].onChange({ target: { value: "SECOND" } });
    const query = new URL(m.replace.mock.calls[0][0], "http://localhost").searchParams;
    expect(query.get("semester")).toBe("SECOND");
    expect(query.get("program")).toBe("bsit");
    expect(query.get("year")).toBe("FIRST");
    expect(query.has("ay")).toBe(false);
    expect(query.has("term")).toBe(false);
  });
  it("shows a clear empty state when no academic year has been activated", () => {
    const html = renderToStaticMarkup(createElement(SubjectSemesterFilter, { academicYear: null, semester: "ALL", options: [] }));
    expect(html).toContain("No active academic year");
    expect(m.select.mock.calls[0][0].disabled).toBe(true);
  });
});
