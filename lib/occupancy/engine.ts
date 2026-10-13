/**
 * Dated occupancy engine shared by room booking, examinations, the calendar, and dynamic adjustments.
 * Weekly classes are expanded into dated sessions, adjustments are applied, and everything that holds a
 * room, faculty member, or section at a moment becomes an Occupant. Pure and browser-safe (tests/occupancy.test.ts).
 * Dates are "YYYY-MM-DD" strings; times are minutes from midnight.
 */
import { rangesOverlap, type DayOfWeek, type RoomType } from "@/lib/scheduler/types";
import { formatRange } from "@/lib/scheduler/timetable";

const JS_DAYS: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export function dayOfWeek(date: string): DayOfWeek {
  return JS_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Converts a database @db.Date value to "YYYY-MM-DD". */
export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface WeeklyClass {
  id: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface TermWindow {
  id: string;
  start: string;
  end: string;
}

export interface DatedAdjustment {
  scheduleId: string;
  /** Regular meeting date being replaced. */
  date: string;
  kind: "MOVED" | "CANCELLED" | "MAKE_UP";
  /** New date when a session moves to another day (moves and make-up sessions). */
  newDate?: string | null;
  roomId?: string | null;
  facultyId?: string | null;
  startMin?: number | null;
  endMin?: number | null;
  reason?: string;
}

export interface Session {
  scheduleId: string;
  date: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  startMin: number;
  endMin: number;
  status: "REGULAR" | "MOVED" | "MAKE_UP";
  /** The regular meeting this session replaces (moved and make-up sessions). */
  original?: { date: string; roomId: string; facultyId: string; startMin: number; endMin: number };
  reason?: string;
}

const key = (scheduleId: string, date: string) => `${scheduleId}|${date}`;

/**
 * Expands weekly classes into dated sessions between `from` and `to` (inclusive).
 * Holidays cancel every class that day; cancelled adjustments drop a session; moved ones replace it.
 */
export function expandSessions(
  classes: WeeklyClass[],
  terms: TermWindow[],
  adjustments: DatedAdjustment[],
  from: string,
  to: string,
  holidays: Set<string> = new Set()
): Session[] {
  const termById = new Map(terms.map((t) => [t.id, t]));
  const byKey = new Map(adjustments.filter((a) => a.kind !== "MAKE_UP").map((a) => [key(a.scheduleId, a.date), a]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const out: Session[] = [];

  const withAdjustment = (c: WeeklyClass, date: string, a: DatedAdjustment, status: Session["status"]): Session => ({
    scheduleId: c.id,
    date: a.newDate ?? date,
    sectionId: c.sectionId,
    subjectId: c.subjectId,
    facultyId: a.facultyId ?? c.facultyId,
    roomId: a.roomId ?? c.roomId,
    component: c.component,
    startMin: a.startMin ?? c.startMin,
    endMin: a.endMin ?? c.endMin,
    status,
    original: { date, roomId: c.roomId, facultyId: c.facultyId, startMin: c.startMin, endMin: c.endMin },
    reason: a.reason,
  });

  // Regular meetings, including moves; a move may land on another day, so look a week either side.
  for (const date of eachDate(addDays(from, -7), addDays(to, 7))) {
    if (holidays.has(date)) continue;
    const dow = dayOfWeek(date);
    for (const c of classes) {
      if (c.dayOfWeek !== dow) continue;
      const term = termById.get(c.semesterId);
      if (!term || date < term.start || date > term.end) continue;
      const a = byKey.get(key(c.id, date));
      if (a?.kind === "CANCELLED") continue;
      const s: Session = a
        ? withAdjustment(c, date, a, "MOVED")
        : { scheduleId: c.id, date, sectionId: c.sectionId, subjectId: c.subjectId, facultyId: c.facultyId, roomId: c.roomId, component: c.component, startMin: c.startMin, endMin: c.endMin, status: "REGULAR" };
      if (s.date >= from && s.date <= to) out.push(s);
    }
  }

  for (const a of adjustments) {
    const c = classById.get(a.scheduleId);
    if (a.kind !== "MAKE_UP" || !c || !a.newDate || a.newDate < from || a.newDate > to) continue;
    out.push(withAdjustment(c, a.date, a, "MAKE_UP"));
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.startMin - y.startMin);
}

// ---------------------------------------------------------------------------
// Occupants and clash detection
// ---------------------------------------------------------------------------

export interface Occupant {
  kind: "CLASS" | "EXAMINATION" | "BOOKING";
  /** Schedule id for classes, record id otherwise. */
  refId: string;
  date: string;
  startMin: number;
  endMin: number;
  roomId: string | null;
  facultyIds: string[];
  sectionIds: string[];
  label: string;
}

export function sessionOccupant(s: Session, label: string): Occupant {
  return { kind: "CLASS", refId: s.scheduleId, date: s.date, startMin: s.startMin, endMin: s.endMin, roomId: s.roomId, facultyIds: [s.facultyId], sectionIds: [s.sectionId], label };
}

export interface Probe {
  date: string;
  startMin: number;
  endMin: number;
  roomId?: string | null;
  facultyIds?: string[];
  sectionIds?: string[];
}

export type ClashReason = "ROOM" | "FACULTY" | "SECTION";

export interface Clash {
  occupant: Occupant;
  reasons: ClashReason[];
}

/** Every occupant that shares the probe's room, faculty, or section at an overlapping time. */
export function findClashes(occupants: Occupant[], probe: Probe, ignore?: (o: Occupant) => boolean): Clash[] {
  const out: Clash[] = [];
  for (const o of occupants) {
    if (o.date !== probe.date || !rangesOverlap(o, probe) || ignore?.(o)) continue;
    const reasons: ClashReason[] = [];
    if (probe.roomId && o.roomId === probe.roomId) reasons.push("ROOM");
    if (probe.facultyIds?.some((f) => o.facultyIds.includes(f))) reasons.push("FACULTY");
    if (probe.sectionIds?.some((s) => o.sectionIds.includes(s))) reasons.push("SECTION");
    if (reasons.length) out.push({ occupant: o, reasons });
  }
  return out;
}

export function describeClash(c: Clash) {
  const what = c.reasons.map((r) => (r === "ROOM" ? "room" : r === "FACULTY" ? "faculty member" : "section")).join(", ");
  return `${c.occupant.label} (${formatRange(c.occupant.startMin, c.occupant.endMin)}) already uses the ${what}.`;
}

// ---------------------------------------------------------------------------
// Finding the nearest available room, time slot, or substitute
// ---------------------------------------------------------------------------

export interface RoomInfo {
  id: string;
  name: string;
  capacity: number;
  roomType: RoomType;
  status: string;
  buildingId: string | null;
}

export interface FacultyInfo {
  id: string;
  name: string;
  departmentId: string | null;
  teachingLevels: string[];
  availability: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[];
}

export interface Unavailable {
  facultyId?: string | null;
  roomId?: string | null;
  start: string;
  end: string;
  startMin?: number | null;
  endMin?: number | null;
}

export interface PlanContext {
  rooms: RoomInfo[];
  faculty: Map<string, FacultyInfo>;
  occupants: Occupant[];
  unavailable: Unavailable[];
  holidays: Set<string>;
  sectionSize: Map<string, number>;
  sectionLevel: Map<string, string>;
  subjectRoomType: Map<string, RoomType>;
  dayStart?: number;
  dayEnd?: number;
}

export interface Relocation {
  date: string;
  roomId: string;
  facultyId: string;
  startMin: number;
  endMin: number;
  reason: string;
}

const LAB_TYPES: RoomType[] = ["COMPUTER_LABORATORY", "SCIENCE_LABORATORY"];

/** Room fits the session: open, large enough, and the right type (laboratory work needs the subject's laboratory type). */
export function roomSuits(room: RoomInfo, s: Pick<Session, "sectionId" | "subjectId" | "component">, ctx: PlanContext) {
  if (room.status !== "AVAILABLE") return false;
  if (room.capacity < (ctx.sectionSize.get(s.sectionId) ?? 0)) return false;
  if (s.component === "LABORATORY") {
    const required = ctx.subjectRoomType.get(s.subjectId);
    return required && LAB_TYPES.includes(required) ? room.roomType === required : LAB_TYPES.includes(room.roomType);
  }
  return room.roomType === "LECTURE_ROOM";
}

function blocked(ctx: PlanContext, field: "facultyId" | "roomId", id: string, date: string, startMin: number, endMin: number) {
  return ctx.unavailable.some(
    (u) =>
      u[field] === id &&
      date >= u.start &&
      date <= u.end &&
      (u.startMin == null || u.endMin == null || rangesOverlap({ startMin: u.startMin, endMin: u.endMin }, { startMin, endMin }))
  );
}

function facultyCanTeach(ctx: PlanContext, facultyId: string, date: string, startMin: number, endMin: number) {
  const f = ctx.faculty.get(facultyId);
  if (!f || blocked(ctx, "facultyId", facultyId, date, startMin, endMin)) return false;
  const dow = dayOfWeek(date);
  return f.availability.length === 0 || f.availability.some((w) => w.dayOfWeek === dow && startMin >= w.startMin && endMin <= w.endMin);
}

/** Free means no other occupant (excluding this session itself) holds the room, faculty, or section then. */
function isFree(ctx: PlanContext, s: Session, probe: Probe) {
  const self = (o: Occupant) => o.kind === "CLASS" && o.refId === s.scheduleId && o.date === s.date;
  return findClashes(ctx.occupants, probe, self).length === 0;
}

function roomsByNearness(ctx: PlanContext, s: Session, avoidRoomId?: string) {
  const current = ctx.rooms.find((r) => r.id === s.roomId);
  const size = ctx.sectionSize.get(s.sectionId) ?? 0;
  return ctx.rooms
    .filter((r) => r.id !== avoidRoomId && roomSuits(r, s, ctx))
    .sort(
      (a, b) =>
        Number(b.id === s.roomId) - Number(a.id === s.roomId) ||
        Number(b.buildingId === current?.buildingId) - Number(a.buildingId === current?.buildingId) ||
        a.capacity - size - (b.capacity - size)
    );
}

/** Start times ordered by distance from the original start (nearest first). */
function nearbyStarts(s: Session, ctx: PlanContext) {
  const duration = s.endMin - s.startMin;
  const dayStart = ctx.dayStart ?? 7 * 60;
  const dayEnd = ctx.dayEnd ?? 19 * 60;
  const starts: number[] = [];
  for (let t = dayStart; t + duration <= dayEnd; t += 30) if (t !== s.startMin) starts.push(t);
  return starts.sort((a, b) => Math.abs(a - s.startMin) - Math.abs(b - s.startMin) || a - b);
}

function tryRooms(ctx: PlanContext, s: Session, date: string, startMin: number, facultyId: string, avoidRoomId?: string) {
  const endMin = startMin + (s.endMin - s.startMin);
  if (ctx.holidays.has(date) || !facultyCanTeach(ctx, facultyId, date, startMin, endMin)) return null;
  if (!isFree(ctx, s, { date, startMin, endMin, facultyIds: [facultyId], sectionIds: [s.sectionId] })) return null;
  return roomsByNearness(ctx, s, avoidRoomId).find(
    (r) => !blocked(ctx, "roomId", r.id, date, startMin, endMin) && isFree(ctx, s, { date, startMin, endMin, roomId: r.id })
  ) ?? null;
}

export interface RelocateOptions {
  /** The room can no longer be used (booked or unavailable). */
  avoidRoomId?: string;
  /** The faculty member can no longer teach this session. */
  avoidFacultyId?: string;
  /** Allow moving to another day of the same week when the same day is full. */
  allowOtherDays?: boolean;
}

/**
 * Finds the nearest workable alternative for one session, in order of least disruption:
 * a substitute faculty member at the same time, another room at the same time,
 * another time on the same day, then (optionally) another day that week.
 */
export function relocate(s: Session, ctx: PlanContext, opts: RelocateOptions): Relocation | null {
  const roomName = (id: string) => ctx.rooms.find((r) => r.id === id)?.name ?? "another room";
  const facultyName = (id: string) => ctx.faculty.get(id)?.name ?? "another faculty member";
  const roomOk = (id: string) =>
    id !== opts.avoidRoomId &&
    !blocked(ctx, "roomId", id, s.date, s.startMin, s.endMin) &&
    !!ctx.rooms.find((r) => r.id === id && roomSuits(r, s, ctx));

  let facultyId = s.facultyId;
  if (opts.avoidFacultyId === s.facultyId) {
    const own = ctx.faculty.get(s.facultyId);
    const level = ctx.sectionLevel.get(s.sectionId);
    const substitutes = [...ctx.faculty.values()]
      .filter((f) => f.id !== s.facultyId && (!level || f.teachingLevels.includes(level)))
      .sort((a, b) => Number(b.departmentId === own?.departmentId) - Number(a.departmentId === own?.departmentId) || a.name.localeCompare(b.name));
    const sub = substitutes.find(
      (f) => facultyCanTeach(ctx, f.id, s.date, s.startMin, s.endMin) && isFree(ctx, s, { date: s.date, startMin: s.startMin, endMin: s.endMin, facultyIds: [f.id] })
    );
    if (!sub) return null;
    facultyId = sub.id;
    if (roomOk(s.roomId)) {
      const same = sub.departmentId === own?.departmentId ? "same department, " : "";
      return { date: s.date, roomId: s.roomId, facultyId, startMin: s.startMin, endMin: s.endMin, reason: `Substitute ${facultyName(sub.id)} (${same}free and available at this time) covers the class.` };
    }
  }

  // Same time, another room.
  const room = tryRooms(ctx, s, s.date, s.startMin, facultyId, opts.avoidRoomId);
  if (room) {
    const r = { date: s.date, roomId: room.id, facultyId, startMin: s.startMin, endMin: s.endMin };
    return { ...r, reason: `Moved to ${room.name}, the nearest free room with ${room.capacity} seats of the right type, at the same time.` };
  }

  // Same day, nearest free time.
  for (const start of nearbyStarts(s, ctx)) {
    const found = tryRooms(ctx, s, s.date, start, facultyId, opts.avoidRoomId);
    if (found) {
      const end = start + (s.endMin - s.startMin);
      return { date: s.date, roomId: found.id, facultyId, startMin: start, endMin: end, reason: `Moved to ${formatRange(start, end)} in ${roomName(found.id)}, the nearest time when the room, faculty member, and section are all free.` };
    }
  }

  if (!opts.allowOtherDays) return null;
  for (let offset = 1; offset <= 6; offset++) {
    const date = addDays(s.date, offset);
    if (dayOfWeek(date) === "SUNDAY") continue;
    for (const start of [s.startMin, ...nearbyStarts(s, ctx)]) {
      const found = tryRooms(ctx, s, date, start, facultyId, opts.avoidRoomId);
      if (found) {
        const end = start + (s.endMin - s.startMin);
        return { date, roomId: found.id, facultyId, startMin: start, endMin: end, reason: `Moved to ${date}, ${formatRange(start, end)} in ${roomName(found.id)}; no free slot remained on the original day.` };
      }
    }
  }
  return null;
}

/** Updates the context after a session is moved or cancelled so later relocations see the change. */
export function commitRelocation(ctx: PlanContext, s: Session, r: Relocation | null, label: string) {
  ctx.occupants = ctx.occupants.filter((o) => !(o.kind === "CLASS" && o.refId === s.scheduleId && o.date === s.date));
  if (r) ctx.occupants.push(sessionOccupant({ ...s, ...r }, label));
}

/** Up to `limit` make-up slots on different days after `fromDate` for a cancelled session. */
export function makeUpOptions(s: Session, ctx: PlanContext, fromDate: string, days = 14, limit = 3): Relocation[] {
  const out: Relocation[] = [];
  for (let offset = 1; offset <= days && out.length < limit; offset++) {
    const date = addDays(fromDate, offset);
    if (dayOfWeek(date) === "SUNDAY") continue;
    for (const start of [s.startMin, ...nearbyStarts(s, ctx)]) {
      const probe = { ...s, date };
      const found = tryRooms(ctx, probe, date, start, s.facultyId);
      if (found) {
        const end = start + (s.endMin - s.startMin);
        out.push({ date, roomId: found.id, facultyId: s.facultyId, startMin: start, endMin: end, reason: `Make-up session on ${date}, ${formatRange(start, end)} in ${found.name}.` });
        break;
      }
    }
  }
  return out;
}
