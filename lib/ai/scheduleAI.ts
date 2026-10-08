import { getGeminiClient, SCHEDULING_MODEL } from "./geminiClient";
import {
  DayOfWeek,
  SchedFaculty,
  SchedRoom,
  SchedSection,
  SchedSubject,
  SchedEntry,
  SchedulingConstraints,
  SubjectComponent,
  toHHMM,
  toMinutes,
} from "@/lib/scheduler/types";

const DAY_CODES: Record<DayOfWeek, string> = {
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
  SATURDAY: "SAT",
  SUNDAY: "SUN",
};
const DAY_FROM_CODE: Record<string, DayOfWeek> = Object.fromEntries(
  Object.entries(DAY_CODES).map(([full, code]) => [code, full as DayOfWeek])
);

/** One required class meeting (a subject's lecture or lab component for one section) the AI must place or explain. */
export interface RequiredMeeting {
  sectionId: string;
  subjectId: string;
  component: SubjectComponent;
  durationMin: number;
}

export interface AIScheduleRequest {
  semesterId: string;
  requiredMeetings: RequiredMeeting[];
  sections: SchedSection[];
  subjects: SchedSubject[];
  faculty: SchedFaculty[];
  rooms: SchedRoom[];
  existingEntries: SchedEntry[];
  constraints: SchedulingConstraints;
}

export interface AIScheduleEntry {
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: SubjectComponent;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface AIUnscheduledMeeting {
  sectionId: string;
  subjectId: string;
  component: SubjectComponent;
  reason: string;
}

export interface AIScheduleResult {
  entries: AIScheduleEntry[];
  unscheduled: AIUnscheduledMeeting[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    schedule: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_id: { type: "string" },
          subject_id: { type: "string" },
          component: { type: "string", enum: ["LECTURE", "LABORATORY"] },
          faculty_id: { type: "string" },
          room_id: { type: "string" },
          day_of_week: { type: "string", enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
          start_time: { type: "string", description: "HH:MM, 24-hour" },
          end_time: { type: "string", description: "HH:MM, 24-hour" },
        },
        required: [
          "section_id",
          "subject_id",
          "component",
          "faculty_id",
          "room_id",
          "day_of_week",
          "start_time",
          "end_time",
        ],
        additionalProperties: false,
      },
    },
    unscheduled: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_id: { type: "string" },
          subject_id: { type: "string" },
          component: { type: "string", enum: ["LECTURE", "LABORATORY"] },
          reason: { type: "string" },
        },
        required: ["section_id", "subject_id", "component", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["schedule", "unscheduled"],
  additionalProperties: false,
} as const;

function buildPrompt(req: AIScheduleRequest): string {
  const meetingsToSchedule = req.requiredMeetings.map((m) => ({
    section_id: m.sectionId,
    subject_id: m.subjectId,
    component: m.component,
    duration_minutes: m.durationMin,
  }));

  const sections = req.sections.map((s) => ({
    id: s.id,
    name: s.name,
    student_count: s.studentCount,
  }));

  const subjects = req.subjects.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    required_room_type: s.requiredRoomType,
  }));

  const faculty = req.faculty.map((f) => ({
    id: f.id,
    name: f.fullName,
    max_hours_per_week: f.maxHours,
    already_assigned_hours: f.assignedHours,
    availability_windows: f.availability.map((a) => ({
      day: DAY_CODES[a.dayOfWeek],
      start: toHHMM(a.startMin),
      end: toHHMM(a.endMin),
    })),
  }));

  const rooms = req.rooms.map((r) => ({
    id: r.id,
    name: r.roomName,
    capacity: r.capacity,
    room_type: r.roomType,
    availability_windows: r.availability.map((a) => ({
      day: DAY_CODES[a.dayOfWeek],
      start: toHHMM(a.startMin),
      end: toHHMM(a.endMin),
    })),
  }));

  const existingFixed = req.existingEntries.map((e) => ({
    section_id: e.sectionId,
    subject_id: e.subjectId,
    faculty_id: e.facultyId,
    room_id: e.roomId,
    day_of_week: DAY_CODES[e.dayOfWeek],
    start_time: toHHMM(e.startMin),
    end_time: toHHMM(e.endMin),
  }));

  return `You are an academic scheduling engine. Generate a class schedule that satisfies ALL hard constraints below. A schedule with even ONE violation is unusable — do not guess or approximate.

## HARD CONSTRAINTS (must never be violated)
1. No faculty member can be assigned to two sections at overlapping times (including against the existing fixed schedule).
2. No room can be assigned to two sections at overlapping times (including against the existing fixed schedule).
3. A section cannot have two classes at overlapping times (including against the existing fixed schedule).
4. A section's assigned room must have capacity >= the section's student count.
5. A room's status must be usable, and its room_type must match the subject's required_room_type (LABORATORY components require a COMPUTER_LABORATORY or SCIENCE_LABORATORY room).
6. A faculty member can only be scheduled within one of their availability_windows on that day. If a faculty member has no availability_windows listed, treat them as available at any time within the allowed scheduling window below.
7. A room can only be scheduled within one of its availability_windows on that day. If a room has no availability_windows listed, treat it as available at any time within the allowed scheduling window below.
8. Assigning a meeting to a faculty member must not push their total weekly hours (already_assigned_hours + all NEW meetings you assign them) past their max_hours_per_week.
9. A section cannot have more than ${req.constraints.maxClassesPerDayPerSection ?? 4} class meetings on the same day.
10. All classes must be scheduled on one of these days: ${req.constraints.allowedDays.map((d) => DAY_CODES[d]).join(", ")}, between ${toHHMM(req.constraints.dayStartMin)} and ${toHHMM(req.constraints.dayEndMin)}.
11. Each meeting in "schedule" must run for exactly its given duration_minutes (end_time - start_time), on a single contiguous block.

## INPUT DATA
Semester: ${req.semesterId}

Meetings that need to be scheduled (each is one required class block - schedule it once):
${JSON.stringify(meetingsToSchedule, null, 2)}

Sections:
${JSON.stringify(sections, null, 2)}

Subjects:
${JSON.stringify(subjects, null, 2)}

Available faculty:
${JSON.stringify(faculty, null, 2)}

Available rooms:
${JSON.stringify(rooms, null, 2)}

Existing fixed schedule (already committed, treat as immovable and never assign over it):
${JSON.stringify(existingFixed, null, 2)}

## RULES FOR THIS TASK
- Every entry in "meetings that need to be scheduled" must end up in exactly one of "schedule" or "unscheduled" in your output.
- If a meeting genuinely cannot be scheduled without breaking a hard constraint, put it in "unscheduled" with a clear reason instead of forcing an invalid assignment.
- Double-check your own output before returning it: verify no faculty_id, room_id, or section_id appears twice at an overlapping day/time, against both your own new "schedule" entries and the existing fixed schedule.
- Do not invent section_id, subject_id, faculty_id, or room_id values that were not in the input data above.
- Spread classes across the week and across faculty/rooms where possible rather than clustering everything into the same day or the same faculty member.`;
}

/** Calls Gemini with Structured Outputs to produce a candidate schedule. Callers MUST still run the result through the existing hard-constraint validator before persisting - the model's own self-checking is not a substitute for it. */
export async function requestAISchedule(req: AIScheduleRequest): Promise<AIScheduleResult> {
  const client = getGeminiClient();
  const prompt = buildPrompt(req);

  const response = await client.models.generateContent({
    model: SCHEDULING_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("AI scheduling request returned no output.");
  }

  let parsed: {
    schedule: {
      section_id: string;
      subject_id: string;
      component: string;
      faculty_id: string;
      room_id: string;
      day_of_week: string;
      start_time: string;
      end_time: string;
    }[];
    unscheduled: { section_id: string; subject_id: string; component: string; reason: string }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI scheduling request returned malformed JSON.");
  }

  // Guard against hallucinated ids/components: only accept entries that map back to a meeting we
  // actually asked the AI to place, and require every required meeting to be accounted for exactly once.
  const pendingMeetingKeys = new Set(
    req.requiredMeetings.map((m) => `${m.sectionId}:${m.subjectId}:${m.component}`)
  );

  const entries: AIScheduleEntry[] = [];
  const unscheduled: AIUnscheduledMeeting[] = [];

  for (const raw of parsed.schedule ?? []) {
    const key = `${raw.section_id}:${raw.subject_id}:${raw.component}`;
    const day = DAY_FROM_CODE[raw.day_of_week];
    const startMin = toMinutes(raw.start_time);
    const endMin = toMinutes(raw.end_time);
    const component = raw.component as SubjectComponent;
    if (!pendingMeetingKeys.has(key) || !day || Number.isNaN(startMin) || Number.isNaN(endMin)) {
      unscheduled.push({
        sectionId: raw.section_id,
        subjectId: raw.subject_id,
        component: component === "LABORATORY" ? "LABORATORY" : "LECTURE",
        reason: "AI returned a malformed, duplicate, or unrecognized entry for this meeting.",
      });
      continue;
    }
    pendingMeetingKeys.delete(key);
    entries.push({
      sectionId: raw.section_id,
      subjectId: raw.subject_id,
      facultyId: raw.faculty_id,
      roomId: raw.room_id,
      component,
      dayOfWeek: day,
      startMin,
      endMin,
    });
  }

  for (const u of parsed.unscheduled ?? []) {
    const key = `${u.section_id}:${u.subject_id}:${u.component}`;
    pendingMeetingKeys.delete(key);
    const component = u.component === "LABORATORY" ? "LABORATORY" : "LECTURE";
    unscheduled.push({ sectionId: u.section_id, subjectId: u.subject_id, component, reason: u.reason });
  }

  // Anything the AI silently dropped (neither scheduled nor explained) still needs to surface.
  for (const key of pendingMeetingKeys) {
    const [sectionId, subjectId, component] = key.split(":") as [string, string, SubjectComponent];
    unscheduled.push({ sectionId, subjectId, component, reason: "AI did not report a placement or reason for this meeting." });
  }

  return { entries, unscheduled };
}
