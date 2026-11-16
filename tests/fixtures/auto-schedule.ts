import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";
import type { ResolverInput } from "@/lib/scheduler/resolver/types";

export function autoFixture(count = 8): ResolverInput {
  const sections = Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `BSIT 1-${i}`, level: "COLLEGE", programId: "bsit", departmentId: "cs", termId: "t1", studentCount: 38, editable: true, curriculum: [{ subjectId: "cc101", component: "LECTURE" as const, requiredMin: 180 }] }));
  const room = { id: "r1", roomName: "Room 1", roomNumber: "101", capacity: 40, roomType: "LECTURE_ROOM" as const, availability: [], status: "AVAILABLE" as const, programIds: null, assignable: true };
  return {
    entries: [], sections,
    subjects: [{ id: "cc101", code: "CC101", name: "Computing", lectureHours: 3, labHours: 0, requiredRoomType: "LECTURE_ROOM" }],
    assignments: sections.map((s) => ({ sectionId: s.id, subjectId: "cc101", semesterId: "t1", facultyId: "ana" })),
    faculty: ["ana", "ben"].map((id) => ({ id, fullName: id, maxHours: 24, availability: [], assignedHours: 0, teachingLevels: ["COLLEGE"], assignable: true })),
    rooms: [room], rules: [],
    ruleCtx: { rooms: new Map([["r1", { name: room.roomName, capacity: 40, isGeneralShared: true, programIds: [] }]]), sections: new Map(sections.map((s) => [s.id, { name: s.name, studentCount: s.studentCount, programId: s.programId, departmentId: "cs" }])), faculty: new Map([["ana", { name: "ana" }], ["ben", { name: "ben" }]]), subjects: new Map([["cc101", { code: "CC101", name: "Computing" }]]), programNames: new Map() },
    termRanges: new Map([["t1", { start: 0, end: 1 }]]), bounds: { startMin: 420, endMin: 1140 }, step: 30,
    timetables: Object.fromEntries(sections.map((s) => [s.id, { ...DEFAULT_TIMETABLE, classSession: "BLOCK_180" as const }])),
  };
}
