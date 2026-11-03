/** Builds the resolver's input from the Scheduler page data already in the browser. */
import type { SchedulerData, SchedulerEntry } from "@/components/scheduler/types";
import { DEFAULT_GRID } from "../timetable";
import type { DayOfWeek } from "../types";
import type { ResolverInput } from "./types";

export function buildResolverInput(data: SchedulerData, entries: SchedulerEntry[], termOf: (sectionId: string) => string): ResolverInput {
  const subjects = new Map(data.subjects.map((s) => [s.id, s]));
  return {
    // Other departments' classes come in as anonymous busy blocks: they block time and are never moved.
    entries: [...entries, ...data.busy].filter((e) => e.status !== "ARCHIVED").map((e) => ({
      id: e.id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, facultyId: e.facultyId, roomId: e.roomId,
      component: e.component, dayOfWeek: e.dayOfWeek, startMin: e.startMin, endMin: e.endMin, status: e.status, busy: e.busy,
    })),
    sections: data.sections.filter((s) => !s.archived).map((s) => ({
      id: s.id, name: s.shortName, level: s.level, programId: s.programId, departmentId: s.departmentId, termId: termOf(s.id),
      studentCount: s.studentCount, editable: s.editable,
      curriculum: s.curriculum.flatMap((c) => {
        const subject = subjects.get(c.subjectId);
        const hours = c.component === "LECTURE" ? subject?.lectureHours : subject?.labHours;
        return subject && !subject.archived && hours ? [{ ...c, requiredMin: Math.round(hours * 60) }] : [];
      }),
    })),
    subjects: data.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, lectureHours: s.lectureHours, labHours: s.labHours, requiredRoomType: s.requiredRoomType })),
    faculty: data.faculty.map((f) => ({
      id: f.id, fullName: f.fullName, maxHours: f.maxHours, assignedHours: 0, teachingLevels: f.teachingLevels,
      dayOff: (f.dayOff as DayOfWeek | null) ?? null, availability: f.availability,
      assignable: f.status === "ACTIVE" && !f.foreign,
    })),
    rooms: data.rooms.map((r) => ({
      id: r.id, roomNumber: r.roomNumber, roomName: r.roomName, capacity: r.capacity, roomType: r.roomType, status: r.status,
      availability: r.availability, programIds: r.programIds, assignable: !r.archived && !r.foreign && r.status === "AVAILABLE",
    })),
    rules: data.rules,
    ruleCtx: {
      rooms: new Map(data.rooms.map((r) => [r.id, { name: r.roomName, capacity: r.capacity, isGeneralShared: r.programIds === null, programIds: r.programIds ?? [] }])),
      sections: new Map(data.sections.map((s) => [s.id, { name: s.shortName, studentCount: s.studentCount, programId: s.programId, departmentId: s.departmentId }])),
      subjects: new Map(data.subjects.map((s) => [s.id, { code: s.code, name: s.name }])),
      faculty: new Map(data.faculty.map((f) => [f.id, { name: f.fullName }])),
      programNames: new Map(data.programs.map((p) => [p.id, p.name])),
    },
    termRanges: new Map(data.terms.map((t) => [t.id, { start: t.start, end: t.end }])),
    bounds: { startMin: DEFAULT_GRID.dayStart, endMin: DEFAULT_GRID.dayEnd },
    step: DEFAULT_GRID.slot,
  };
}
