import "server-only";
import { prisma } from "@/lib/db/prisma";
import { FinishReason, ThinkingLevel } from "@google/genai";
import { getGeminiClient, SCHEDULING_MODEL } from "./geminiClient";
import { isStaff, type AppRole } from "@/lib/permissions/roles";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { levelLabel, termLabel } from "@/lib/academics/levels";

export const ASSISTANT_MODEL = process.env.GEMINI_ASSISTANT_MODEL ?? SCHEDULING_MODEL;

/** How many prior messages are replayed to the model on each turn. */
const HISTORY_LIMIT = 20;

const SCHOOL_TIME_ZONE = "Asia/Manila";

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function fmtTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

type ScheduleRow = {
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  component: string;
  status: string;
  subject: { code: string; name: string };
  faculty: { fullName: string };
  room: RoomLocation;
  section: { name: string };
};

type RoomLocation = { roomName: string; roomNumber: string; floor: { name: string; building: { name: string } } | null };

function roomLocation(r: RoomLocation) {
  return `${r.roomName} (room ${r.roomNumber}${r.floor ? `, ${r.floor.building.name} ${r.floor.name}` : ""})`;
}

const floorSelect = { select: { name: true, building: { select: { name: true } } } } as const;

function formatSchedule(rows: ScheduleRow[], perspective: "student" | "faculty") {
  if (rows.length === 0) return "(no classes scheduled)";
  return [...rows]
    .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startMin - b.startMin)
    .map((s) => {
      const room = roomLocation(s.room);
      const who = perspective === "student" ? `instructor: ${s.faculty.fullName}` : `section: ${s.section.name}`;
      return `- ${titleCase(s.dayOfWeek)} ${fmtTime(s.startMin)}-${fmtTime(s.endMin)} | ${s.subject.code} ${s.subject.name} (${titleCase(s.component)}) | ${who} | ${room} | status: ${titleCase(s.status)}`;
    })
    .join("\n");
}

const scheduleInclude = {
  subject: { select: { code: true, name: true } },
  faculty: { select: { fullName: true } },
  room: { select: { roomName: true, roomNumber: true, floor: floorSelect } },
  section: { select: { name: true } },
} as const;

/** Builds the data the assistant may answer from, scoped to what this user is allowed to see. */
async function buildContext(userId: string, role: AppRole): Promise<string> {
  const [user, activeTerms, rooms] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        faculty: { select: { id: true, fullName: true, position: true, maxHours: true } },
        requestsMade: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { type: true, status: true, reason: true, reviewNote: true, createdAt: true },
        },
        notifications: {
          where: { isRead: false },
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { title: true, message: true, createdAt: true },
        },
      },
    }),
    prisma.semester.findMany({
      where: { isActive: true },
      select: {
        id: true,
        type: true,
        level: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { name: true } },
        program: { select: { code: true } },
      },
    }),
    prisma.room.findMany({
      orderBy: { roomNumber: "asc" },
      select: { roomName: true, roomNumber: true, floor: floorSelect, roomType: true, status: true },
    }),
  ]);

  const now = new Date();
  const parts: string[] = [
    `Current date and time: ${now.toLocaleString("en-US", { timeZone: SCHOOL_TIME_ZONE, dateStyle: "full", timeStyle: "short" })} (Philippine time)`,
    `User: ${user?.name ?? "Unknown"} (role: ${titleCase(role)})`,
    activeTerms.length
      ? `Active terms:\n${activeTerms
          .map(
            (t) =>
              `- ${levelLabel(t.level)}${t.program ? ` ${t.program.code}` : ""}: ${termLabel(t.type)}, A.Y. ${t.academicYear.name} (${t.startDate.toDateString()} to ${t.endDate.toDateString()})`
          )
          .join("\n")}`
      : "Active term: none is currently set.",
  ];

  const activeTermIds = activeTerms.map((t) => t.id);
  const semesterFilter = { semesterId: { in: activeTermIds }, status: { not: "ARCHIVED" as const } };

  if (user?.faculty) {
    const f = user.faculty;
    const classes = await prisma.schedule.findMany({
      where: { facultyId: f.id, ...semesterFilter },
      include: scheduleInclude,
    });
    const hours = classes.reduce((sum, c) => sum + (c.endMin - c.startMin), 0) / 60;
    parts.push(
      `## Faculty profile\nPosition: ${f.position ?? "not set"}\nTeaching load: ${hours} of max ${f.maxHours} hours/week`,
      `## The faculty member's weekly teaching schedule\n${formatSchedule(classes, "faculty")}`
    );
  }

  if (isStaff(role)) {
    parts.push(...(await buildStaffOverview(activeTermIds)));
  }

  parts.push(
    `## The user's schedule requests (latest 10)\n${
      user?.requestsMade.length
        ? user.requestsMade
            .map((r) => `- ${r.createdAt.toDateString()}: ${titleCase(r.type)}, ${titleCase(r.status)}${r.reason ? `. Reason: ${r.reason}` : ""}${r.reviewNote ? `. Reviewer note: ${r.reviewNote}` : ""}`)
            .join("\n")
        : "(none)"
    }`,
    `## The user's unread notifications\n${
      user?.notifications.length
        ? user.notifications.map((n) => `- ${n.createdAt.toDateString()}: ${n.title}: ${n.message}`).join("\n")
        : "(none)"
    }`,
    `## Campus rooms\n${rooms
      .map((r) => `- ${roomLocation(r)}: ${titleCase(r.roomType)}, ${titleCase(r.status)}`)
      .join("\n")}`
  );

  return parts.join("\n\n");
}

/** System-wide scheduling data for staff (admins, registrars, schedulers). */
async function buildStaffOverview(termIds: string[]): Promise<string[]> {
  const activeOnly = { semesterId: { in: termIds }, status: { not: "ARCHIVED" as const } };
  const [counts, schedules, conflicts, pendingRequests, faculty, roomLoad] = await Promise.all([
    Promise.all([
      prisma.section.count(),
      prisma.faculty.count({ where: { status: "ACTIVE" } }),
      prisma.subject.count(),
      prisma.room.count(),
    ]),
    prisma.schedule.findMany({ where: activeOnly, include: scheduleInclude, take: 600 }),
    activeOverlapConflicts(),
    prisma.scheduleRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { type: true, reason: true, createdAt: true, requestedBy: { select: { name: true, role: true } } },
    }),
    prisma.faculty.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { fullName: true, maxHours: true, schedules: { where: activeOnly, select: { startMin: true, endMin: true } } },
    }),
    prisma.room.findMany({
      orderBy: { roomNumber: "asc" },
      select: { roomName: true, capacity: true, schedules: { where: activeOnly, select: { startMin: true, endMin: true } } },
    }),
  ]);

  const [sections, facultyCount, subjects, rooms] = counts;
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const describe = (id?: string) => {
    const row = id ? byId.get(id) : undefined;
    return row
      ? `${row.subject.code} ${row.section.name} ${titleCase(row.dayOfWeek)} ${fmtTime(row.startMin)}-${fmtTime(row.endMin)}`
      : "a class";
  };
  const hours = (rows: { startMin: number; endMin: number }[]) =>
    Math.round((rows.reduce((sum, r) => sum + (r.endMin - r.startMin), 0) / 60) * 10) / 10;

  const bySection = new Map<string, ScheduleRow[]>();
  for (const row of schedules) {
    bySection.set(row.section.name, [...(bySection.get(row.section.name) ?? []), row]);
  }

  return [
    `## System overview\nSections: ${sections}\nActive faculty: ${facultyCount}\nSubjects: ${subjects}\nRooms: ${rooms}\nScheduled class meetings in active terms: ${schedules.length}`,
    `## Current double-booking conflicts (${conflicts.length})\n${
      conflicts.length
        ? conflicts
            .slice(0, 30)
            .map((c) => `- ${titleCase(c.type)}: ${c.description} (${describe(c.entryA.id)} vs ${describe(c.entryB?.id)})`)
            .join("\n")
        : "(none)"
    }`,
    `## Pending schedule requests awaiting review (${pendingRequests.length})\n${
      pendingRequests.length
        ? pendingRequests
            .map((r) => `- ${r.createdAt.toDateString()}: ${titleCase(r.type)} from ${r.requestedBy.name} (${titleCase(r.requestedBy.role)})${r.reason ? `. Reason: ${r.reason}` : ""}`)
            .join("\n")
        : "(none)"
    }`,
    `## Faculty teaching load this semester (assigned / max hours per week)\n${faculty
      .map((f) => `- ${f.fullName}: ${hours(f.schedules)} / ${f.maxHours}`)
      .join("\n")}`,
    `## Room usage this semester (booked hours per week, capacity)\n${roomLoad
      .map((r) => `- ${r.roomName}: ${hours(r.schedules)} hrs, capacity ${r.capacity}`)
      .join("\n")}`,
    `## Full timetable by section (active semester)\n${
      bySection.size
        ? [...bySection.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, rows]) => `Section ${name}:\n${formatSchedule(rows, "student")}`)
            .join("\n\n")
        : "(no classes scheduled)"
    }`,
  ];
}

function systemInstruction(context: string, role: AppRole) {
  const staff = isStaff(role);
  return `You are the GCST Scheduling Assistant, a helpful chat assistant inside the scheduling system of Granby Colleges of Science & Technology (Naic, Cavite).

Your job is to answer questions about this scheduling system: ${
    staff
      ? "the whole school's timetable (College, Senior High, Junior High, and Elementary), sections, faculty workloads, room usage, schedule conflicts, pending requests, the active terms, and how to use the system"
      : "the user's class schedule, rooms, instructors, subjects, the active terms, their schedule requests and notifications, and how to use the system"
  }.

Rules:
- Answer ONLY from the data below. If the answer is not in the data, say you don't have that information and suggest contacting the Registrar or submitting a request on the Schedule Requests page. Never invent classes, times, rooms, or people.
${
    staff
      ? `- You cannot change data yourself. Point the user to the right page: "Scheduler" to view, edit (drag and drop), and publish classes and to fix conflicts from its Conflicts panel; "Academic Years & Terms", "Programs & Strands", "Subjects", "Sections", "Faculty", and "Rooms" for setup data; "Schedule Requests" to review requests; and the Reports & Analytics pages for workload and room utilization.
- When asked for analysis (e.g. overloaded faculty, underused rooms, free time slots), work it out from the data and explain briefly.`
      : `- You cannot change schedules. To request a change (time, room, instructor, cancellation), tell the user to open "Schedule Requests" in the sidebar and submit a request.
- Other useful pages: "Scheduler" (weekly timetable filtered by level, grade or program, and section) and "Notifications".`
  }
- If asked who developed, made, built, or created this system (or this assistant), answer that it was developed by KC FADRIQUILA.
- Politely decline questions unrelated to school scheduling and steer back to scheduling topics.
- Be concise and friendly. Use 12-hour times. Write plain text; for lists, use short lines starting with "- ". Do not use markdown headings, tables, or asterisks.
- Use the current date and time below to answer questions like "what's my next class" or "do I have class today".

=== SCHEDULING SYSTEM DATA ===
${context}`;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

/** Generates the assistant's reply to `message`, given prior turns of the conversation. */
export async function generateAssistantReply(
  userId: string,
  role: AppRole,
  history: AssistantTurn[],
  message: string
): Promise<string> {
  const client = getGeminiClient();
  const context = await buildContext(userId, role);

  const contents = [
    ...history.slice(-HISTORY_LIMIT).map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const response = await client.models.generateContent({
    model: ASSISTANT_MODEL,
    contents,
    config: {
      systemInstruction: systemInstruction(context, role),
      // Thinking tokens count against maxOutputTokens, so keep thinking light and leave
      // plenty of room for long answers like a full weekly schedule.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 8192,
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("The assistant returned an empty reply.");
  if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
    return `${text}…

(This answer was cut short. Try asking about a specific day or subject.)`;
  }
  return text;
}
