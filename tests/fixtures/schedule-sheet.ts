import type { SheetSource } from "@/components/scheduler/schedule-sheet";
import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";

/** Includes repeated long labels, late classes and a large legend for print-layout checks. */
export function scheduleSheetFixture(subjectCount = 1): SheetSource {
  const section: SheetSource["section"] = {
    id: "section", name: "BSCS 1-A", shortName: "BSCS 1-A", level: "COLLEGE", programId: "bscs", yearLevel: "FIRST", gradeLevel: null,
    semesterId: "term", studentCount: 33, curriculum: [], archived: false, departmentId: "computing", editable: false,
  };
  const subjects: SheetSource["subjects"] = new Map(Array.from({ length: subjectCount }, (_, i) => [`subject-${i}`, {
    id: `subject-${i}`, code: `CC${String(i + 1).padStart(3, "0")}`, name: `Introduction to Computing and Information Technology ${i + 1}`,
    level: "COLLEGE", programId: "bscs", yearLevel: "FIRST", gradeLevel: null, lectureHours: 3, labHours: 0, units: 3,
    requiredRoomType: "LECTURE_ROOM", archived: false,
  }]));
  return {
    section, timeConfig: DEFAULT_TIMETABLE, subjects,
    entries: [...subjects.keys()].map((subjectId, i) => ({
      id: `class-${i}`, semesterId: "term", sectionId: section.id, subjectId, facultyId: "faculty", roomId: "room", component: "LECTURE",
      dayOfWeek: DEFAULT_TIMETABLE.days[i % 6], startMin: i === 0 ? 1080 : 420 + Math.floor(i / 6) * 60,
      endMin: i === 0 ? 1140 : 480 + Math.floor(i / 6) * 60, status: "PUBLISHED", notes: null,
    })),
    faculty: new Map([["faculty", { fullName: "Ana Santos", department: "Computing and Information Technology" }]]),
    rooms: new Map([["room", { id: "room", roomNumber: "GA-303", roomName: "GA-303 · Lecture room", capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", location: "Building A", availability: [], programIds: null, archived: false }]]),
    programName: "Bachelor of Science in Computer Science", departmentName: "Computing and Information Technology", termLabel: "College · First Semester (active)",
  };
}
