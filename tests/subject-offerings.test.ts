import { describe, expect, it } from "vitest";
import { offeringMatches } from "@/lib/subjects/offerings";
import { assignedFor } from "@/lib/subjects/assignment-rules";

const term = { id: "t1", type: "FIRST", level: "COLLEGE" };
const subject = { id: "cc101", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null, semester: "FIRST" };
const section = { id: "s1", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null, semesterId: "t1" };
describe("subject offerings", () => {
  it("matches the section's curriculum and term", () => {
    expect(offeringMatches(subject, section, term)).toBe(true);
    expect(offeringMatches(subject, { ...section, curriculum: [{ subjectId: "other" }] }, term)).toBe(true);
  });
  it.each([{ semesterId: "other" }, { yearLevel: "SECOND" }, { level: "SENIOR_HIGH" }, { programId: "p2" }])("rejects a mismatched section: %o", (patch) => {
    expect(offeringMatches(subject, { ...section, ...patch }, term)).toBe(false);
  });
  it("rejects a subject offered in another semester", () => {
    expect(offeringMatches({ ...subject, semester: "SECOND" }, section, term)).toBe(false);
  });
  it("keeps course-specific terms restricted even when the section uses that term id", () => {
    expect(offeringMatches(subject, section, { ...term, programId: "p2" })).toBe(false);
  });
  it("supports explicit shared programs and unrestricted general curriculum", () => {
    expect(offeringMatches({ ...subject, programId: null }, section, term)).toBe(true);
    expect(offeringMatches({ ...subject, programId: "p2", sharedProgramIds: ["p1"] }, section, term)).toBe(true);
    expect(offeringMatches({ ...subject, programId: null, sharedProgramIds: ["p2"] }, section, term)).toBe(false);
  });
  it("never assigns a future section from an old all-sections default", () => {
    expect(assignedFor([{ subjectId: "cc101", sectionId: null, facultyId: "ana" }, { subjectId: "cc101", sectionId: "s1", facultyId: "ben" }], "cc101", "s2")).toBeNull();
    expect(assignedFor([{ subjectId: "cc101", sectionId: "s1", facultyId: "ben" }], "cc101", "s1")).toBe("ben");
  });
});
