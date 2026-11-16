import type { PolicyOptions } from "@/lib/scheduler/policy-options";

export function policyOptionsFixture(): PolicyOptions {
  return {
    departments: [
      { value: "cs", label: "College of Informatics and Computing Sciences", code: "COICS", levels: ["COLLEGE"] },
      { value: "shs", label: "Senior High School Department", code: "SHS", levels: ["SENIOR_HIGH"] },
      { value: "elem", label: "Elementary Department", code: "ELEM", levels: ["ELEMENTARY"] },
      { value: "pre", label: "Pre-Elementary Department", code: "PRE-ELEM", levels: ["PRE_ELEMENTARY"] },
    ],
    years: [{ value: "year", label: "2026-2027", isActive: true }, { value: "old-year", label: "2025-2026", isActive: false }],
    terms: [
      { value: "term", label: "First Semester", level: "COLLEGE", academicYearId: "year", departmentIds: ["cs"], isActive: true },
      { value: "second", label: "Second Semester", level: "COLLEGE", academicYearId: "year", departmentIds: ["cs"] },
      { value: "old", label: "Second Semester", level: "COLLEGE", academicYearId: "old-year", departmentIds: ["cs"] },
      { value: "quarter", label: "First Quarter", level: "SENIOR_HIGH", academicYearId: "year", departmentIds: ["shs"], isActive: true },
      { value: "elem-quarter", label: "First Quarter", level: "ELEMENTARY", academicYearId: "year", departmentIds: ["elem"], isActive: true },
      { value: "pre-quarter", label: "First Quarter", level: "PRE_ELEMENTARY", academicYearId: "year", departmentIds: ["pre"], isActive: true },
    ],
    programs: [{ value: "bsit", label: "BSIT", departmentId: "cs", level: "COLLEGE" }, { value: "bscs", label: "BSCS", departmentId: "cs", level: "COLLEGE" }, { value: "stem", label: "STEM", departmentId: "shs", level: "SENIOR_HIGH" }],
    sections: [
      { value: "section", label: "BSIT 1A", departmentId: "cs", programId: "bsit", level: "COLLEGE", yearLevel: "FIRST", termId: "term", academicYearId: "year" },
      { value: "section-b", label: "BSIT 1B", departmentId: "cs", programId: "bsit", level: "COLLEGE", yearLevel: "FIRST", termId: "term", academicYearId: "year" },
      { value: "section-second", label: "BSIT 2A", departmentId: "cs", programId: "bsit", level: "COLLEGE", yearLevel: "SECOND", termId: "second", academicYearId: "year" },
      { value: "shs-section", label: "STEM 11A", departmentId: "shs", programId: "stem", level: "SENIOR_HIGH", gradeLevel: "GRADE_11", termId: "quarter", academicYearId: "year" },
    ],
    subjects: [
      { value: "ge", label: "GE101 - General Education", level: "COLLEGE", category: "MINOR", departmentIds: ["cs"], programIds: ["bsit", "bscs"], sectionIds: ["section", "section-b"] },
      { value: "it", label: "IT101 - Programming", level: "COLLEGE", category: "MAJOR", departmentIds: ["cs"], programId: "bsit", programIds: ["bsit"], sectionIds: ["section"] },
      { value: "stem-subject", label: "SHS Science", level: "SENIOR_HIGH", category: "MINOR", departmentIds: ["shs"], programId: "stem", programIds: ["stem"], sectionIds: ["shs-section"] },
    ],
    classes: [
      { value: "meeting", label: "BSIT 1A - GE101 - Monday 08:00", departmentId: "cs", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", sectionId: "section", subjectId: "ge", termId: "term", academicYearId: "year", category: "MINOR", component: "LECTURE" },
      { value: "meeting-b", label: "BSIT 1B - GE101 - Tuesday 08:00", departmentId: "cs", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", sectionId: "section-b", subjectId: "ge", termId: "term", academicYearId: "year", category: "MINOR", component: "LECTURE" },
      { value: "shs-meeting", label: "STEM Science - Wednesday", departmentId: "shs", level: "SENIOR_HIGH", programId: "stem", gradeLevel: "GRADE_11", sectionId: "shs-section", subjectId: "stem-subject", termId: "quarter", academicYearId: "year", category: "MINOR", component: "LECTURE" },
    ],
  };
}
