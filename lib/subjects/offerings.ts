import { subjectAppliesToSection } from "@/lib/scheduler/timetable";

export type OfferingSubject = {
  id: string; level: string; programId: string | null; sharedProgramIds?: readonly string[];
  yearLevel: string | null; gradeLevel: string | null; semester?: string | null;
};
export type OfferingSection = {
  id: string; level: string; programId: string | null; yearLevel: string | null; gradeLevel: string | null;
  semesterId: string | null; curriculum?: { subjectId: string }[];
};

/** The catalog defines eligibility. Placement queue rows can be partial and never restrict the curriculum. */
export function offeringMatches(subject: OfferingSubject, section: OfferingSection, term: { id: string; type: string; level: string; programId?: string | null }) {
  return subject.level === term.level && section.level === term.level &&
    (section.semesterId === term.id || (section.level !== "COLLEGE" && !section.semesterId)) &&
    (!term.programId || term.programId === section.programId) &&
    (!subject.semester || subject.semester === term.type) && subjectAppliesToSection(subject, section);
}

export const offeringKey = (termId: string, sectionId: string, subjectId: string) => `${termId}|${sectionId}|${subjectId}`;
