import { describe, expect, it } from "vitest";
import { generateExaminationSchedule, type AutoScheduleClass, type AutoScheduleExisting } from "@/lib/examinations/auto-schedule";
import type { ExamContext } from "@/lib/examinations/rules";

const classItem = (overrides: Partial<AutoScheduleClass> = {}): AutoScheduleClass => ({
  sectionId: "section-a",
  sectionName: "BSIT 1-A",
  sectionLevel: "COLLEGE",
  yearLevel: "FIRST",
  gradeLevel: null,
  studentCount: 25,
  subjectId: "subject-a",
  subjectCode: "IT101",
  proctorId: "faculty-a",
  proctorName: "Faculty A",
  proctorDayOff: null,
  proctorAvailability: [],
  roomId: "room-a",
  startMin: 480,
  endMin: 600,
  ...overrides,
});

const context: ExamContext = {
  window: { start: "2026-11-02", end: "2026-11-04" },
  blockedDates: new Map([["2026-11-02", "School holiday"]]),
  roomCapacity: new Map([["room-a", 30], ["room-b", 40]]),
  sectionSize: new Map([["section-a", 25], ["section-b", 20]]),
};

const slot = (overrides: Partial<AutoScheduleExisting> = {}): AutoScheduleExisting => ({
  id: "existing",
  date: "2026-11-03",
  startMin: 480,
  endMin: 600,
  sectionId: "section-c",
  roomId: "room-a",
  proctorId: "faculty-c",
  ...overrides,
});

describe("examination auto-scheduler", () => {
  it("orders generated exams by academic level and year level", () => {
    const result = generateExaminationSchedule(
      [
        classItem({ sectionId: "second", sectionName: "BSIT 2-A", yearLevel: "SECOND", subjectId: "subject-2", subjectCode: "IT201" }),
        classItem({ sectionId: "first", sectionName: "BSIT 1-A", yearLevel: "FIRST", subjectId: "subject-1", subjectCode: "IT101" }),
      ],
      [],
      [{ id: "room-a", roomName: "Room A", capacity: 30, availability: [] }],
      context,
    );

    expect(result.proposals.map((proposal) => proposal.sectionId)).toEqual(["first", "second"]);
    expect(result.proposals[0].yearGroup).toBe("College · First Year");
  });

  it("keeps existing exams, skips blocked dates, and avoids shared room or proctor conflicts", () => {
    const result = generateExaminationSchedule(
      [
        classItem({ sectionId: "section-a", subjectId: "subject-a" }),
        classItem({ sectionId: "section-b", subjectId: "subject-b", proctorId: "faculty-a", roomId: "room-a" }),
        classItem({ sectionId: "section-c", subjectId: "subject-c" }),
      ],
      [slot({ sectionId: "section-c", subjectId: "subject-c" })],
      [{ id: "room-a", roomName: "Room A", capacity: 30, availability: [] }],
      context,
    );

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((proposal) => proposal.date !== "2026-11-02")).toBe(true);
    expect(result.proposals[0]).toMatchObject({ date: "2026-11-04", startMin: 480 });
    expect(result.proposals[1].date === result.proposals[0].date && result.proposals[1].startMin === result.proposals[0].startMin).toBe(false);
    expect(result.unscheduled).toEqual([]);
  });

  it("uses a larger fitting room or explains why a class could not be placed", () => {
    const result = generateExaminationSchedule(
      [classItem({ studentCount: 35 })],
      [],
      [
        { id: "room-a", roomName: "Small Room", capacity: 30, availability: [] },
        { id: "room-b", roomName: "Large Room", capacity: 40, availability: [] },
      ],
      context,
    );

    expect(result.proposals[0].roomId).toBe("room-b");
    const none = generateExaminationSchedule([classItem({ studentCount: 50 })], [], [], context);
    expect(none.proposals).toHaveLength(0);
    expect(none.unscheduled[0].reason).toContain("No available department room");
  });

  it("respects teacher and room availability and avoids scheduled class meetings", () => {
    const result = generateExaminationSchedule(
      [classItem({
        proctorDayOff: "WEDNESDAY",
        proctorAvailability: [{ dayOfWeek: "TUESDAY", startMin: 480, endMin: 720 }],
      })],
      [],
      [{ id: "room-a", roomName: "Room A", capacity: 30, availability: [{ dayOfWeek: "TUESDAY", startMin: 480, endMin: 720 }] }],
      context,
      [{
        id: "class-meeting",
        date: "2026-11-03",
        startMin: 480,
        endMin: 600,
        sectionId: "section-a",
        roomId: "room-a",
        proctorId: "faculty-a",
      }],
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ date: "2026-11-03", startMin: 600, endMin: 720 });
  });

  it("avoids a reported time-specific room or faculty unavailability", () => {
    const result = generateExaminationSchedule(
      [classItem()],
      [],
      [{ id: "room-a", roomName: "Room A", capacity: 30, availability: [] }],
      context,
      [],
      [{
        facultyId: "faculty-a",
        roomId: null,
        start: "2026-11-03",
        end: "2026-11-03",
        startMin: 480,
        endMin: 720,
      }],
    );

    expect(result.proposals[0].date).toBe("2026-11-04");
  });

  it("does not guess dates when there is no approved examination window", () => {
    const result = generateExaminationSchedule(
      [classItem()],
      [],
      [{ id: "room-a", roomName: "Room A", capacity: 30, availability: [] }],
      { ...context, window: null },
    );

    expect(result.proposals).toHaveLength(0);
    expect(result.unscheduled[0].reason).toContain("no approved examination window");
  });
});
