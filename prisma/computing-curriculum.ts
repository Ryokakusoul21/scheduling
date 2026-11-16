import type { YearLevel } from "@prisma/client";

type SubjectRow = readonly [code: string, name: string, units: number];
type CurriculumYear = { yearLevel: YearLevel; sections: number; totalUnits: number; subjects: readonly SubjectRow[] };

const firstYear: readonly SubjectRow[] = [
  ["GE1", "Purposive Communication", 3],
  ["GE2", "Readings in the Philippine History", 3],
  ["GE3", "Mathematics in Modern World", 3],
  ["GVAL1", "Granby Values 1", 3],
  ["CC101", "Introduction to Computing", 3],
  ["CC102", "Computer Programming 1", 3],
  ["PATHFIT1", "Human Enhancement", 2],
];
const elective: SubjectRow = ["GEELC1", "GE Elective-1 (Living in the IT Era)", 3];
const fitness: SubjectRow = ["PATHFIT3", "Physical Activities Towards Health and Fitness in Dance", 2];

/** Transcribed from subjects_BSCS.png and subjects_BSIT.png; units are not contact hours. */
export const COMPUTING_CURRICULA: { code: "BSCS" | "BSIT"; name: string; years: CurriculumYear[] }[] = [
  {
    code: "BSCS", name: "Bachelor of Science in Computer Science", years: [
      { yearLevel: "FIRST", sections: 1, totalUnits: 23, subjects: [...firstYear, ["CWTS1", "Civic Welfare Training Services -1", 3]] },
      { yearLevel: "SECOND", sections: 1, totalUnits: 20, subjects: [
        ["GE5", "Art Appreciation", 3],
        ["CSC2", "Discrete Structures-2", 3],
        ["CSC3", "Object-Oriented Programming", 3],
        ["CSC4", "Algorithms and Complexity", 3],
        ["GE7", "The Contemporary World", 3], elective, fitness,
      ] },
      { yearLevel: "THIRD", sections: 1, totalUnits: 24, subjects: [
        ["CSC6", "Automata Theory and Formal Language", 3],
        ["CC106", "Application Development and Emerging Technologies", 3],
        ["CSC7", "Architecture and Organization", 3],
        ["CSC8", "Information Assurance and Security", 3],
        ["CSC9", "Programming Language", 3],
        ["CSC10", "Software Engineering 1", 3],
        ["CSC11", "Advance Database Management System", 3],
        ["CSC12", "Human Computer Interaction", 3],
      ] },
      { yearLevel: "FOURTH", sections: 1, totalUnits: 9, subjects: [
        ["CSC401", "Practicum (300 hours)", 6], ["CSC406", "CS Thesis Writing 2", 3],
      ] },
    ],
  },
  {
    code: "BSIT", name: "Bachelor of Science in Information Technology", years: [
      { yearLevel: "FIRST", sections: 8, totalUnits: 23, subjects: [...firstYear, ["NSTP1", "Civic Welfare Training Services -1", 3]] },
      { yearLevel: "SECOND", sections: 6, totalUnits: 23, subjects: [
        ["GE5", "Art Appreciation", 3],
        ["ITC3", "Fundamentals of Database Management Systems", 3],
        ["ITC4", "Object-Oriented Programming", 3],
        ["ITC5", "Networking-1", 3],
        ["GE6", "Understanding the Self", 3],
        ["GE7", "The Contemporary World", 3], elective, fitness,
      ] },
      { yearLevel: "THIRD", sections: 4, totalUnits: 18, subjects: [
        ["ITC8", "Systems Administration and Maintenance", 3],
        ["ITC9", "Systems Integration and Architecture 1", 3],
        ["ITC10", "Systems Analysis and Design", 3],
        ["ITC11", "Introduction to Human-Computer Interaction", 3],
        ["ITC12", "Integrative Programming and Technologies 1", 3],
        ["ITC13", "Quantitative Methods (incl. Modeling & Simulation)", 3],
      ] },
      { yearLevel: "FOURTH", sections: 3, totalUnits: 9, subjects: [
        ["ITC18", "Capstone Project and Research 2", 3], ["ITC22", "Practicum (500 HRS)", 6],
      ] },
    ],
  },
];

export const COMPUTING_ACADEMIC_YEAR = "2026-2027";

export function computingSubjects() {
  const subjects = new Map<string, { code: string; name: string; units: number; yearLevel: YearLevel; sortOrder: number; programs: string[] }>();
  for (const program of COMPUTING_CURRICULA) {
    for (const year of program.years) {
      if (year.subjects.reduce((sum, subject) => sum + subject[2], 0) !== year.totalUnits) throw new Error(`Unit total does not match ${program.code} ${year.yearLevel}.`);
      for (const [sortOrder, [code, name, units]] of year.subjects.entries()) {
        const existing = subjects.get(code);
        if (existing && (existing.name !== name || existing.units !== units || existing.yearLevel !== year.yearLevel)) throw new Error(`Conflicting source rows for ${code}.`);
        if (existing) existing.programs.push(program.code);
        else subjects.set(code, { code, name, units, yearLevel: year.yearLevel, sortOrder, programs: [program.code] });
      }
    }
  }
  return [...subjects.values()];
}
