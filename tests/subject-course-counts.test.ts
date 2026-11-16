import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelFlow } from "@/components/academics/level-flow";

const college = (programId: string | null, sharedPrograms: { id: string }[] = [], yearLevel: string | null = "FIRST") => ({ level: "COLLEGE", programId, sharedPrograms, yearLevel, gradeLevel: null });
const rows = [
  college("bsit", [{ id: "bsit" }]),
  college("bsit", [], "SECOND"),
  college(null, [{ id: "bsit" }, { id: "bscs" }]),
  college(null, [], null),
  college("bscs"),
  college(null, [{ id: "bscs" }]),
  ...Array.from({ length: 84 }, (_, i) => ({ level: ["SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY", "PRE_ELEMENTARY"][i % 4], programId: null, sharedPrograms: [], yearLevel: null, gradeLevel: null })),
];
const programs = ["bsit", "bscs", "bsba"].map((id) => ({ id, code: id.toUpperCase(), name: id, level: "COLLEGE" }));

function render(programId: string | null = null, noun = "subjects", data: Parameters<typeof LevelFlow>[0]["rows"] = rows) {
  return renderToStaticMarkup(createElement(LevelFlow, {
    basePath: "/subjects", rootLabel: "Subjects", noun, rows: data, programs, allowGeneral: true, allowAnyYear: true,
    flow: { level: "COLLEGE", programId, year: null, grade: null, strand: null },
  }));
}
function card(html: string, query: string) {
  const anchor = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .find((match) => match[1] === `/subjects?${query}`);
  expect(anchor, `Card ${query} exists`).toBeDefined();
  return anchor![2];
}

describe("subject course counts", () => {
  it("excludes all 84 basic education subjects from college course totals", () => {
    const html = render();
    expect(card(html, "level=COLLEGE&amp;program=bsit")).toContain("4 subjects");
    expect(card(html, "level=COLLEGE&amp;program=bscs")).toContain("4 subjects");
    expect(card(html, "level=COLLEGE&amp;program=bsba")).toContain("1 subject");
  });
  it("keeps explicit sharing restricted and counts a subject only once per course", () => {
    const html = render();
    expect(card(html, "level=COLLEGE&amp;program=general")).toContain("3 subjects");
    expect(html).not.toContain("Subjects shared by every course");
    expect(card(html, "level=COLLEGE&amp;program=bsit")).not.toContain("5 subjects");
  });
  it("keeps course totals consistent with their year-level counts", () => {
    const html = render("bsit");
    expect(card(html, "level=COLLEGE&amp;program=bsit&amp;year=FIRST")).toContain("2 subjects");
    expect(card(html, "level=COLLEGE&amp;program=bsit&amp;year=SECOND")).toContain("1 subject");
    expect(card(html, "level=COLLEGE&amp;program=bsit&amp;year=any")).toContain("1 subject");
  });
  it("rejects other academic levels even if their course id matches", () => {
    const html = render(null, "subjects", [{ ...college("bsit"), level: "SENIOR_HIGH" }]);
    expect(card(html, "level=COLLEGE&amp;program=bsit")).toContain("0 subjects");
  });
  it("preserves college section counts without shared-program metadata", () => {
    const html = render(null, "sections", [{ level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null }, { level: "COLLEGE", programId: "bscs", yearLevel: "FIRST", gradeLevel: null }]);
    expect(card(html, "level=COLLEGE&amp;program=bsit")).toContain("1 section");
  });
});
