import { roomLabel } from "@/lib/rooms/label";
import { publishedFilter, submittedTimetableFilter } from "@/lib/scheduler/visibility";
import "server-only";
import { z } from "zod";
import type { FunctionDeclaration } from "@google/genai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { canAccessPath } from "@/lib/permissions/routes";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { roomAvailability } from "@/lib/bookings/availability";
import { loadPlan } from "@/lib/occupancy/load";
import { dayOfWeek, ONLINE_ROOM } from "@/lib/occupancy/engine";
import { loadNotifications } from "@/lib/notifications/service";
import { formatTime } from "@/lib/scheduler/timetable";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import type { AssistantSource } from "./assistant-contract";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const queryFields = { query: z.string().trim().max(100).optional(), offset: z.number().int().min(0).max(100_000).optional() };
const querySchema = z.object(queryFields).strict();
const loadSchema = z.object({ ...queryFields, status: z.enum(["OVERLOADED", "UNDERLOADED", "BALANCED"]).optional() }).strict();
const dateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date");
const scheduleSchema = z.object({ ...queryFields, date: dateSchema.optional(), day: z.enum(DAYS).optional(), mine: z.boolean().optional(), termId: z.string().max(100).optional() }).strict();
const availabilitySchema = z.object({
  ...queryFields, date: dateSchema,
  startMin: z.number().int().min(0).max(1439), endMin: z.number().int().min(1).max(1440),
  capacity: z.number().int().min(0).max(100_000).optional(),
}).strict().refine((v) => v.startMin < v.endMin, "End must follow start");

const definitions = [
  { name: "getSchedule", description: "Search class meetings by subject, faculty, section or room. For today, tomorrow or a specific date, supply date (YYYY-MM-DD): this applies holidays, cancellations and class moves. Without date, returns the recurring weekly timetable. Defaults to active terms. Use mine=true for the caller's own teaching schedule. Supports pagination; always report partial results.", schema: scheduleSchema },
  { name: "getWorkloads", description: "Get teaching loads calculated by the same workload engine as the Faculty Workload page, including unscheduled assignments, configured limits and hours/units. Filter by faculty name or status.", schema: loadSchema },
  { name: "getRooms", description: "Search room details and scheduled weekly hours across active terms. This is usage, not live availability. Use getRoomAvailability for a specific date/time.", schema: querySchema },
  { name: "getRoomAvailability", description: "Check room occupancy for an exact calendar date and time (minutes since midnight), including classes, exams and bookings. Results need final booking validation. Ask for date/time if missing.", schema: availabilitySchema },
  { name: "getConflicts", description: "Get current double-booking conflicts from the scheduling engine. Foreign departments' classes remain anonymous.", schema: querySchema.pick({ offset: true }) },
  { name: "getRequests", description: "List pending requests the caller is permitted to review, or their own requests. Department approvals are private to Heads and requesters.", schema: querySchema },
  { name: "getNotifications", description: "Get the caller's latest unread notifications.", schema: z.object({}).strict() },
] as const;

const floorSelect = { select: { name: true, building: { select: { name: true } } } } as const;
const scheduleSelect = {
  id: true, semesterId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true, status: true, component: true,
  subject: { select: { code: true, name: true } }, faculty: { select: { fullName: true } },
  room: { select: { roomName: true, roomNumber: true } }, section: { select: { name: true } },
  semester: { select: { academicYearId: true } },
} as const;

function pageOf<T>(rows: T[], offset = 0) {
  return { total: rows.length, rows: rows.slice(offset, offset + 20), nextOffset: rows.length > offset + 20 ? offset + 20 : null };
}

/** Every tool binds to the authenticated scope, never to model-supplied user/department IDs. */
export async function createAssistantData(scope: Scope) {
  const terms = await prisma.semester.findMany({
    where: { isActive: true }, orderBy: [{ startDate: "desc" }, { id: "asc" }],
    select: { id: true, type: true, level: true, academicYear: { select: { name: true } }, program: { select: { code: true } } },
  });
  const termNames = terms.map((t) => `${levelLabel(t.level)}${t.program ? ` ${t.program.code}` : ""}: ${termLabel(t.type)}, ${t.academicYear.name}`);
  const active = { semesterId: { in: terms.map((t) => t.id) }, status: publishedFilter(scope.role).status ?? { not: "ARCHIVED" as const }, ...submittedTimetableFilter(scope.role) };
  const sources = new Map<string, AssistantSource>();
  const retrievedAt = new Date().toISOString();
  function source(label: string, href: string) {
    if (sources.size < 12 && canAccessPath(href.split(/[?#]/)[0], scope.role)) sources.set(href, { label: label.slice(0, 180), href });
  }
  const allowed = definitions.filter((d) => d.name !== "getRequests" || canAccessPath("/requests", scope.role));
  const declarations: FunctionDeclaration[] = allowed.map(({ name, description, schema }) => ({
    name, description, parametersJsonSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
  }));

  async function execute(name: string, args: unknown): Promise<Record<string, unknown>> {
    const definition = allowed.find((d) => d.name === name);
    if (!definition) return { error: "This query is not available to your role." };
    const input = args ?? {};
    const parsed = definition.schema.safeParse(input);
    if (!parsed.success) return { error: "Invalid query arguments. Check the date, time and filters." };

    if (name === "getSchedule") {
      const { query, date, day, mine, offset = 0, termId } = scheduleSchema.parse(input);
      if (termId && !terms.some((t) => t.id === termId)) return { error: "Choose one of the active term IDs provided." };
      if (date) {
        if (day && day !== dayOfWeek(date)) return { error: "The weekday does not match this date." };
        const [plan, visible] = await Promise.all([
          loadPlan(date, date),
          prisma.schedule.findMany({ where: { AND: [active, departmentWhere.schedule(scope), termId ? { semesterId: termId } : {}] }, select: scheduleSelect }),
        ]);
        const byId = new Map(visible.map((s) => [s.id, s]));
        const rows = plan.sessions.filter((s) => byId.has(s.scheduleId) && (!mine || s.facultyId === scope.facultyId))
          .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.scheduleId.localeCompare(b.scheduleId))
          .map((s) => {
            const row = byId.get(s.scheduleId)!;
            return {
              subject: `${row.subject.code} ${row.subject.name}`, section: row.section.name,
              faculty: plan.facultyName.get(s.facultyId) ?? "Instructor to be confirmed",
              room: s.roomId ? plan.roomName.get(s.roomId) ?? "Room to be confirmed" : ONLINE_ROOM,
              date, start: formatTime(s.startMin), end: formatTime(s.endMin), status: row.status,
              adjustment: s.status, termId: row.semesterId,
            };
          })
          .filter((row) => !query || [row.subject, row.section, row.faculty, row.room].some((v) => v.toLowerCase().includes(query.toLowerCase())));
        source("School calendar", `/calendar?date=${date}&view=day`);
        source("Scheduler", "/scheduler");
        return { date, ...pageOf(rows, offset), note: "Date-specific meetings include current moves, cancellations and holidays." };
      }
      const where: Prisma.ScheduleWhereInput = { AND: [
        active, departmentWhere.schedule(scope),
        mine ? { facultyId: scope.facultyId ?? "__none__" } : {},
        day ? { dayOfWeek: day } : {}, termId ? { semesterId: termId } : {},
        query ? { OR: [
          { subject: { code: { contains: query, mode: "insensitive" } } }, { subject: { name: { contains: query, mode: "insensitive" } } },
          { section: { name: { contains: query, mode: "insensitive" } } }, { faculty: { fullName: { contains: query, mode: "insensitive" } } },
          { room: { roomName: { contains: query, mode: "insensitive" } } }, { room: { roomNumber: { contains: query, mode: "insensitive" } } },
        ] } : {},
      ] };
      const [rows, total] = await Promise.all([
        prisma.schedule.findMany({ where, select: scheduleSelect, orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }, { id: "asc" }], skip: offset, take: 20 }),
        prisma.schedule.count({ where }),
      ]);
      source("Scheduler", "/scheduler");
      for (const row of rows) source(`${row.section.name} · ${row.subject.code}`, `/scheduler?ay=${encodeURIComponent(row.semester.academicYearId)}&termId=${encodeURIComponent(row.semesterId)}`);
      return { total, nextOffset: total > offset + rows.length ? offset + rows.length : null, rows: rows.map((s) => ({
        subject: `${s.subject.code} ${s.subject.name}`, section: s.section.name, faculty: s.faculty.fullName, termId: s.semesterId,
        room: (roomLabel(s.room) || "Online (live)"), day: s.dayOfWeek,
        start: formatTime(s.startMin), end: formatTime(s.endMin), status: s.status, component: s.component,
      })) };
    }

    if (name === "getWorkloads") {
      const { query, status, offset } = loadSchema.parse(input);
      const [data, visible] = await Promise.all([
        loadWorkload(terms.map((t) => t.id), null, { visibilityRole: scope.role }),
        prisma.faculty.findMany({ where: { archivedAt: null, ...departmentWhere.faculty(scope) }, select: { id: true } }),
      ]);
      const ids = new Set(visible.map((f) => f.id));
      const rows = loadReport(data.faculty, data.assignments, data.limits)
        .filter((r) => ids.has(r.facultyId) && (!query || r.name.toLowerCase().includes(query.toLowerCase())) && (!status || r.status === status))
        .sort((a, b) => b.load - a.load || a.name.localeCompare(b.name));
      source("Faculty Workload", "/workload");
      return { measure: data.limits.measure, ...pageOf(rows.map(({ name, load, units, minimum, maximum, status }) => ({ name, load, units, minimum, maximum, status })), offset) };
    }

    if (name === "getRooms") {
      const { query, offset = 0 } = querySchema.parse(input);
      const where: Prisma.RoomWhereInput = { AND: [{ archivedAt: null }, departmentWhere.room(scope), query ? { OR: [
        { roomName: { contains: query, mode: "insensitive" } }, { roomNumber: { contains: query, mode: "insensitive" } },
      ] } : {}] };
      const [rows, total] = await Promise.all([
        prisma.room.findMany({ where, orderBy: [{ roomNumber: "asc" }, { id: "asc" }], skip: offset, take: 20, select: {
          roomName: true, roomNumber: true, roomType: true, capacity: true, status: true, floor: floorSelect,
          schedules: { where: active, select: { startMin: true, endMin: true } },
        } }), prisma.room.count({ where }),
      ]);
      source("Buildings and Rooms", query ? `/rooms?q=${encodeURIComponent(query)}` : "/rooms");
      return { total, nextOffset: total > offset + rows.length ? offset + rows.length : null,
        note: "Scheduled weekly hours summed across active terms, not a utilization percentage or a free-slot guarantee.",
        rows: rows.map(({ schedules, floor, ...r }) => ({ ...r, roomName: roomLabel(r), building: floor?.building.name, floor: floor?.name,
          scheduledHours: Math.round(schedules.reduce((sum, s) => sum + s.endMin - s.startMin, 0) / 6) / 10,
        })),
      };
    }

    if (name === "getRoomAvailability") {
      if (!canAccessPath("/bookings", scope.role)) return { error: "Room booking is not available to your role." };
      const { query, date, startMin, endMin, capacity = 0, offset } = availabilitySchema.parse(input);
      const data = await roomAvailability(scope, date, 1);
      const rows = data.rooms.filter((r) => r.capacity >= capacity && (!query || r.name.toLowerCase().includes(query.toLowerCase()))).map((r) => ({
        name: r.name, building: r.building, capacity: r.capacity, closed: r.closed,
        busy: data.blocks.filter((b) => b.roomId === r.id && b.startMin < endMin && b.endMin > startMin)
          .map((b) => ({ kind: b.kind, start: formatTime(b.startMin), end: formatTime(b.endMin) })),
      }));
      source("Room Booking", "/bookings");
      return { date, start: formatTime(startMin), end: formatTime(endMin), ...pageOf(rows, offset),
        note: "Occupancy includes classes, examinations and bookings. A room with no busy block still requires availability and policy validation on the Room Booking page before confirmation.",
      };
    }

    if (name === "getConflicts") {
      const { offset } = querySchema.parse(input);
      const [conflicts, visible] = await Promise.all([
        activeOverlapConflicts(),
        prisma.schedule.findMany({ where: { AND: [active, departmentWhere.schedule(scope)] }, select: scheduleSelect }),
      ]);
      const byId = new Map(visible.map((s) => [s.id, s]));
      const describe = (id?: string) => {
        const s = id ? byId.get(id) : undefined;
        return s ? `${s.subject.code} ${s.section.name}, ${s.dayOfWeek} ${formatTime(s.startMin)}–${formatTime(s.endMin)}` : "A busy class outside your scope";
      };
      const rows = conflicts.filter((c) => (c.entryA.id && byId.has(c.entryA.id)) || (c.entryB?.id && byId.has(c.entryB.id)))
        .map((c) => ({ type: c.type, first: describe(c.entryA.id), second: describe(c.entryB?.id) }));
      source("Scheduler conflicts", "/scheduler");
      return pageOf(rows, offset);
    }

    if (name === "getRequests") {
      const { query, offset = 0 } = querySchema.parse(input);
      const own: Prisma.ScheduleRequestWhereInput = scope.role === "HEAD_OF_DEPARTMENT" ? { OR: [
        { requestedById: scope.userId }, { departmentId: { in: scope.departmentIds } }, { targetDepartmentId: { in: scope.departmentIds } },
        ...scope.departmentIds.map((id) => ({ details: { path: ["requiredDepartmentIds"], array_contains: [id] } })),
      ] } : { requestedById: scope.userId };
      const where: Prisma.ScheduleRequestWhereInput = { AND: [own, { status: "PENDING" }, query ? { requestedBy: { name: { contains: query, mode: "insensitive" } } } : {}] };
      const [rows, total] = await Promise.all([
        prisma.scheduleRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: offset,
          select: { type: true, status: true, reason: true, createdAt: true, requestedBy: { select: { name: true } } },
        }), prisma.scheduleRequest.count({ where }),
      ]);
      source("Schedule Requests", "/requests");
      return { total, nextOffset: total > offset + rows.length ? offset + rows.length : null, rows: rows.map((r) => ({
        type: r.type, status: r.status, reason: r.reason?.slice(0, 500), createdAt: r.createdAt.toISOString(), requestedBy: r.requestedBy.name,
      })) };
    }

    const notifications = await loadNotifications({ id: scope.userId, role: scope.role }, { unreadOnly: true, limit: 10 });
    source("Notifications", "/notifications");
    return { total: notifications.unread, partial: notifications.unread > notifications.items.length,
      rows: notifications.items.map(({ title, message, createdAt }) => ({ title, message, createdAt })),
    };
  }

  return { declarations, execute, sources, retrievedAt, termNames, terms: terms.map((t, i) => ({ id: t.id, name: termNames[i] })) };
}
