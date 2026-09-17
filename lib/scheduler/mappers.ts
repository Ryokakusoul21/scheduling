import type {
  Faculty,
  FacultyAvailability,
  Room,
  RoomAvailability,
  Subject,
  Section,
  Schedule,
} from "@prisma/client";
import { SchedFaculty, SchedRoom, SchedSubject, SchedSection, SchedEntry } from "./types";

type FacultyWithAvailability = Faculty & { availability: FacultyAvailability[] };
type RoomWithAvailability = Room & { availability: RoomAvailability[] };

export function toSchedFaculty(f: FacultyWithAvailability, assignedHours = 0): SchedFaculty {
  return {
    id: f.id,
    fullName: f.fullName,
    maxHours: f.maxHours,
    specialization: f.specialization,
    assignedHours,
    availability: f.availability.map((a) => ({
      dayOfWeek: a.dayOfWeek,
      startMin: a.startMin,
      endMin: a.endMin,
    })),
  };
}

export function toSchedRoom(r: RoomWithAvailability): SchedRoom {
  return {
    id: r.id,
    roomNumber: r.roomNumber,
    roomName: r.roomName,
    capacity: r.capacity,
    roomType: r.roomType,
    status: r.status,
    availability: r.availability.map((a) => ({
      dayOfWeek: a.dayOfWeek,
      startMin: a.startMin,
      endMin: a.endMin,
    })),
  };
}

export function toSchedSubject(s: Subject): SchedSubject {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    lectureHours: s.lectureHours,
    labHours: s.labHours,
    requiredRoomType: s.requiredRoomType,
  };
}

export function toSchedSection(s: Section): SchedSection {
  return { id: s.id, name: s.name, studentCount: s.studentCount };
}

export function toSchedEntry(s: Schedule): SchedEntry {
  return {
    id: s.id,
    subjectId: s.subjectId,
    sectionId: s.sectionId,
    facultyId: s.facultyId,
    roomId: s.roomId,
    component: s.component,
    dayOfWeek: s.dayOfWeek,
    startMin: s.startMin,
    endMin: s.endMin,
  };
}
