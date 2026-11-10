/**
 * Room booking rules and planning. A booking may take a room only when every occupant can give way: higher
 * priority always wins over another booking, equal priority is first come first served, Urgent and Critical
 * bookings may displace classes (to another room or time, else online), and examinations, closed rooms, and
 * equal-or-higher urgent bookings are never overridden. Pure and browser-safe (tests/bookings.test.ts).
 */
import { commitRelocation, ONLINE_ROOM, relocateOptions, type Occupant, type PlanContext, type Relocation, type Session } from "@/lib/occupancy/engine";
import { formatRange } from "@/lib/scheduler/timetable";
import type { Placement, PlanAlternative, PlanItem } from "@/lib/occupancy/adjust";

export const PRIORITIES = ["REGULAR", "HIGH", "URGENT", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { REGULAR: "Regular", HIGH: "High", URGENT: "Urgent", CRITICAL: "Critical" };

export const URGENT_REASONS = [
  { value: "ACCREDITATION", label: "Accreditation or inspection" },
  { value: "EMERGENCY_MEETING", label: "Emergency meeting" },
  { value: "ADMINISTRATIVE_DIRECTIVE", label: "Administrative directive" },
  { value: "EXAMINATION", label: "Examination or make-up examination" },
  { value: "EVENT", label: "Event or guest speaker" },
  { value: "OTHER", label: "Other" },
] as const;
export type UrgentReason = (typeof URGENT_REASONS)[number]["value"];

/** Days of the timetable loaded when planning, so a displaced class can be moved to a make-up slot up to three weeks ahead. */
export const PLAN_WINDOW_DAYS = 21;

/** Key of a placement a person may choose for a displaced class. */
export const slotKey = (r: { date: string; roomId: string; startMin: number }) => `${r.date}|${r.roomId}|${r.startMin}`;

/** A weekly repeat can book at most this many dates after the first one. */
export const MAX_REPEATS = 15;

/** The same weekday each week after `start`, up to and including `until` (ISO dates). */
export function weeklyDates(start: string, until: string) {
  const dates: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000; t <= Date.parse(`${until}T00:00:00Z`); t += 7 * 86_400_000) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

export const rank = (p: Priority) => PRIORITIES.indexOf(p);
/** Urgent and Critical bookings are overrides: they may displace classes. */
export const isOverride = (p: Priority) => rank(p) >= rank("URGENT");
/** A booking takes another booking's room only with strictly higher priority. */
export const outranks = (incoming: Priority, existing: Priority) => rank(incoming) > rank(existing);

/** Administrators and Faculty book Regular rooms; only academic authorities may displace classes. */
export function maxPriority(role: string): Priority {
  return role === "REGISTRAR" ? "CRITICAL" : role === "HEAD_OF_DEPARTMENT" ? "URGENT" : "REGULAR";
}
export const allowedPriorities = (role: string) => PRIORITIES.slice(0, rank(maxPriority(role)) + 1);

/** System ownership does not confer authority over urgent bookings that move academic classes. */
export function canManageBooking(actor: { role: string; userId: string; departmentIds?: readonly string[] }, booking: { bookedById: string; priority: string; approvalDepartmentId?: string | null; departmentId?: string | null }) {
  if (!["HEAD_OF_DEPARTMENT", "FACULTY"].includes(actor.role)) return false;
  const department = booking.approvalDepartmentId ?? booking.departmentId;
  return booking.bookedById === actor.userId || (actor.role === "HEAD_OF_DEPARTMENT" && !!department && !!actor.departmentIds?.includes(department));
}

export function canReviewOverride(actor: { role: string; departmentIds: readonly string[] }, approvalDepartmentId: string | null) {
  return actor.role === "HEAD_OF_DEPARTMENT" && !!approvalDepartmentId && actor.departmentIds.includes(approvalDepartmentId);
}

export interface BookingSettings {
  /** Minutes kept free between two bookings of the same room. */
  bufferMinutes: number;
  openMin: number;
  closeMin: number;
  /** Urgent and Critical bookings allowed per person and per department each month. */
  urgentCapPerUser: number;
  urgentCapPerDepartment: number;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = { bufferMinutes: 10, openMin: 7 * 60, closeMin: 21 * 60, urgentCapPerUser: 4, urgentCapPerDepartment: 12 };

/** Monthly override allowance: reached blocks new overrides; near warns once a fifth (at least one) is left. */
export function capStatus(used: number, cap: number) {
  const remaining = Math.max(cap - used, 0);
  return { used, cap, remaining, reached: used >= cap, near: used < cap && remaining <= Math.max(1, Math.floor(cap / 5)) };
}

/** The department whose Head of Department must approve an override of its room, or null when none is needed. */
export function approvalDepartment(actor: { isAdmin: boolean; departmentIds: readonly string[] }, roomDepartmentId: string | null) {
  return !actor.isAdmin && !!roomDepartmentId && !actor.departmentIds.includes(roomDepartmentId) ? roomDepartmentId : null;
}

/** Advisory lock keys for every room a booking touches on a date, sorted so concurrent writers lock in the same order. */
export const lockKeys = (roomIds: Iterable<string>, date: string) => [...new Set([...roomIds].filter(Boolean))].sort().map((r) => `room-booking|${r}|${date}`);

export interface BookingMeta {
  id: string;
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
  priority: Priority;
  purpose: string;
  attendees: number;
  bookedById: string;
}

export interface DisplacedBooking {
  bookingId: string;
  purpose: string;
  priority: Priority;
  bookedById: string;
  fromRoomId: string;
  /** Alternative room at the same time, or null when none fits and the booking is cancelled. */
  toRoomId: string | null;
  toRoomName: string | null;
}

/** What the planner needs from a loaded occupancy snapshot. */
export interface PlanSnapshot {
  ctx: PlanContext;
  sessions: Session[];
  bookings: BookingMeta[];
  roomName: Map<string, string>;
  facultyName: Map<string, string>;
  classInfo: Map<string, { departmentId: string | null; fixed?: boolean }>;
  label: (s: Pick<Session, "scheduleId">) => string;
}

export interface BookingRequest {
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
  purpose: string;
  attendees: number;
  priority: Priority;
}

export interface BookingPlan {
  items: PlanItem[];
  displaced: DisplacedBooking[];
  blockers: string[];
  notes: string[];
  /** Every blocker would give way to an Urgent booking (classes and lower-priority bookings only). */
  overridable: boolean;
}

const overlaps = (o: { startMin: number; endMin: number }, start: number, end: number) => o.startMin < end && start < o.endMin;

/**
 * Plans a booking against a snapshot (left unchanged). `ignoreBookingId` is the booking being edited, so it
 * never conflicts with itself.
 */
export function planBooking(
  snap: PlanSnapshot,
  req: BookingRequest,
  settings: BookingSettings,
  /** `choices` maps a class to the placement key the person picked; `canMoveFixed` lets the Registrar move a class marked do not move. */
  opts: { ignoreBookingId?: string; choices?: Record<string, string>; canMoveFixed?: boolean } = {}
): BookingPlan {
  const ctx: PlanContext = { ...snap.ctx, occupants: [...snap.ctx.occupants] };
  const blockers: string[] = [];
  const notes: string[] = [];
  const room = ctx.rooms.find((r) => r.id === req.roomId);
  const name = (id: string) => snap.roomName.get(id) ?? "Room";
  if (!room) return { items: [], displaced: [], blockers: ["The room no longer exists."], notes, overridable: false };
  if (room.status !== "AVAILABLE") blockers.push(`${room.name} is under maintenance or closed.`);
  else if (ctx.unavailable.some((u) => u.roomId === req.roomId && req.date >= u.start && req.date <= u.end && (u.startMin == null || u.endMin == null || overlaps(u as { startMin: number; endMin: number }, req.startMin, req.endMin))))
    blockers.push(`${room.name} is marked unavailable at this time.`);
  if (req.startMin < settings.openMin || req.endMin > settings.closeMin) blockers.push(`Rooms can be booked from ${formatRange(settings.openMin, settings.closeMin)}.`);
  if (room.capacity < req.attendees) blockers.push(`${room.name} seats only ${room.capacity}.`);
  if (ctx.holidays.has(req.date)) {
    if (isOverride(req.priority)) notes.push("This date is a holiday or no-class day.");
    else blockers.push("This date is a holiday or no-class day; only Urgent or Critical bookings may use rooms then.");
  }
  if (blockers.length) return { items: [], displaced: [], blockers, notes, overridable: false };

  // Bookings keep a buffer between them; classes and examinations clash only on overlap.
  const buffer = settings.bufferMinutes;
  const inRoom = ctx.occupants.filter((o) =>
    o.date === req.date && o.roomId === req.roomId && o.refId !== opts.ignoreBookingId &&
    (o.kind === "BOOKING" ? overlaps(o, req.startMin - buffer, req.endMin + buffer) : overlaps(o, req.startMin, req.endMin)));
  let hard = false;
  const classClashes: Occupant[] = [];
  const bumped: BookingMeta[] = [];
  for (const o of inRoom) {
    const when = formatRange(o.startMin, o.endMin);
    if (o.kind === "EXAMINATION") {
      hard = true;
      blockers.push(`${o.label} (${when}) is an examination and is never displaced.`);
    } else if (o.kind === "BOOKING") {
      const meta = snap.bookings.find((b) => b.id === o.refId);
      if (meta && outranks(req.priority, meta.priority)) bumped.push(meta);
      else {
        if (!meta || isOverride(meta.priority)) hard = true;
        const p = meta ? PRIORITY_LABEL[meta.priority] : "Regular";
        blockers.push(`${o.label} (${when}, ${p} priority) holds the room${buffer ? ` with a ${buffer}-minute buffer` : ""}; equal or higher priority is first come, first served.`);
      }
    } else if (isOverride(req.priority)) {
      if (snap.classInfo.get(o.refId)?.fixed && !opts.canMoveFixed) {
        hard = true;
        blockers.push(`${o.label} (${when}) is marked do not move. Only the Registrar can displace it; choose another room or ask the Registrar.`);
      } else classClashes.push(o);
    } else blockers.push(`${o.label} (${when}) has a class in this room. An Urgent booking can move it.`);
  }
  if (blockers.length) return { items: [], displaced: [], blockers, notes, overridable: !hard };

  ctx.occupants = ctx.occupants.filter((o) => !(o.kind === "BOOKING" && bumped.some((b) => b.id === o.refId)));
  ctx.occupants.push({ kind: "BOOKING", refId: "new", date: req.date, startMin: req.startMin, endMin: req.endMin, roomId: req.roomId, facultyIds: [], sectionIds: [], label: req.purpose });

  // Displaced bookings move to the smallest free room of the same type that seats them.
  const displaced: DisplacedBooking[] = bumped.map((b) => {
    const type = ctx.rooms.find((r) => r.id === b.roomId)?.roomType;
    const alt = ctx.rooms
      .filter((r) => r.id !== req.roomId && r.status === "AVAILABLE" && r.roomType === type && r.capacity >= b.attendees &&
        !ctx.unavailable.some((u) => u.roomId === r.id && b.date >= u.start && b.date <= u.end) &&
        !ctx.occupants.some((o) => o.date === b.date && o.roomId === r.id && (o.kind === "BOOKING" ? overlaps(o, b.startMin - buffer, b.endMin + buffer) : overlaps(o, b.startMin, b.endMin))))
      .sort((x, y) => x.capacity - y.capacity)[0];
    if (alt) ctx.occupants.push({ kind: "BOOKING", refId: b.id, date: b.date, startMin: b.startMin, endMin: b.endMin, roomId: alt.id, facultyIds: [], sectionIds: [], label: b.purpose });
    return { bookingId: b.id, purpose: b.purpose, priority: b.priority, bookedById: b.bookedById, fromRoomId: b.roomId, toRoomId: alt?.id ?? null, toRoomName: alt ? alt.name : null };
  });

  // Displaced classes go to another room or time; with no slot left they meet online at the same time.
  const items: PlanItem[] = [];
  const why = `${room.name} was taken for an urgent booking: "${req.purpose}".`;
  const placement = (r: { date: string; roomId: string; facultyId: string; startMin: number; endMin: number }): Placement => ({
    date: r.date, roomId: r.roomId, roomName: r.roomId ? name(r.roomId) : ONLINE_ROOM, facultyId: r.facultyId, facultyName: snap.facultyName.get(r.facultyId) ?? "Faculty", startMin: r.startMin, endMin: r.endMin,
  });
  let protectedMoved = 0;
  for (const o of classClashes) {
    const s = snap.sessions.find((x) => x.scheduleId === o.refId && x.date === req.date);
    if (!s) continue;
    if (snap.classInfo.get(s.scheduleId)?.fixed) protectedMoved++;
    const base = { scheduleId: s.scheduleId, label: snap.label(s), departmentId: snap.classInfo.get(s.scheduleId)?.departmentId ?? null, before: placement(s) };
    // Up to three placements, best first, up to three weeks ahead; meeting online at the usual time is always the last choice.
    const found = relocateOptions(s, ctx, { allowOtherDays: true, avoidRoomId: req.roomId, lookAheadDays: PLAN_WINDOW_DAYS }, 3);
    const online = { date: s.date, roomId: "", facultyId: s.facultyId, startMin: s.startMin, endMin: s.endMin };
    const options: (PlanAlternative & { move: Relocation | null })[] = [
      ...found.map((r) => ({ key: slotKey(r), placement: placement(r), kind: "MOVED" as const, reason: `${r.reason} ${why}`, move: r })),
      { key: "ONLINE", placement: placement(online), kind: "ONLINE" as const, reason: `No better room or time slot is free, so the class meets online or asynchronously at its usual time. ${why}`, move: null },
    ];
    const picked = options.find((x) => x.key === opts.choices?.[s.scheduleId]) ?? options[0];
    commitRelocation(ctx, s, picked.move ?? { ...online, reason: "" }, base.label);
    items.push({
      ...base, after: picked.placement, kind: picked.kind, reason: picked.reason, chosen: picked.key,
      alternatives: options.map((x) => ({ key: x.key, placement: x.placement, kind: x.kind, reason: x.reason })),
    });
  }
  if (protectedMoved) notes.push(`${protectedMoved} protected ${protectedMoved === 1 ? "class" : "classes"} marked do not move will be moved.`);
  if (items.length) notes.push(`${items.length} ${items.length === 1 ? "class" : "classes"} will be moved.`);
  if (displaced.length) notes.push(`${displaced.length} lower-priority ${displaced.length === 1 ? "booking" : "bookings"} will be ${displaced.every((d) => d.toRoomId) ? "moved to another room" : "moved or cancelled"}.`);
  return { items, displaced, blockers, notes, overridable: false };
}

/**
 * After an override is shortened, the displaced class meetings that no longer overlap it (and may go back),
 * given each meeting's original room and time.
 */
export function restorableAfterShortening<T extends { date: string; roomId: string; startMin: number; endMin: number }>(originals: T[], booking: { roomId: string; date: string; startMin: number; endMin: number }) {
  return originals.filter((o) => !(o.roomId === booking.roomId && o.date === booking.date && overlaps(o, booking.startMin, booking.endMin)));
}

/** Status shown to people: overrides read "Urgent - Confirmed"; confirmed bookings that ended read "Completed". */
export function statusLabel(b: { status: string; priority: Priority; past: boolean }) {
  if (b.status === "CONFIRMED") return b.past ? "Completed" : isOverride(b.priority) ? `${PRIORITY_LABEL[b.priority]} - Confirmed` : "Confirmed";
  return ({ PENDING: "Pending", AWAITING_APPROVAL: "Awaiting approval", REJECTED: "Rejected", CANCELLED: "Cancelled", COMPLETED: "Completed", NO_SHOW: "No-show" } as Record<string, string>)[b.status] ?? b.status;
}

/** Faculty, sections, and people a set of displaced classes touches (the people to notify). */
export function affected(items: PlanItem[], sectionOf: (scheduleId: string) => string | undefined) {
  return {
    facultyIds: [...new Set(items.flatMap((i) => [i.before.facultyId, ...(i.after ? [i.after.facultyId] : [])]))],
    sectionIds: [...new Set(items.map((i) => sectionOf(i.scheduleId)).filter((s): s is string => !!s))],
  };
}

