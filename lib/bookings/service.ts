import "server-only";
import type { Prisma } from "@prisma/client";
import type { Scope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere, logBlocked } from "@/lib/permissions/department";
import { getBookingSettings } from "@/lib/settings";
import { notifyFacultyEach, notifyManagers, notifyUsers } from "@/lib/notify";
import { sendMail } from "@/lib/email/mailer";
import { loadPlan } from "@/lib/occupancy/load";
import { addDays, findClashes, isoDate } from "@/lib/occupancy/engine";
import { undoProblems, writePlan, type PlanItem } from "@/lib/occupancy/adjust";
import { formatRange } from "@/lib/scheduler/timetable";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import {
  allowedPriorities, approvalDepartment, capStatus, isOverride, lockKeys, planBooking, PRIORITY_LABEL, restorableAfterShortening, URGENT_REASONS,
  type BookingPlan, type DisplacedBooking, type Priority, type UrgentReason,
} from "./plan";

type Fail = { ok: false; error: string };
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const STALE = "Someone changed this room or its classes a moment ago. Search again to see the latest.";
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const reasonLabel = (r: string | null) => URGENT_REASONS.find((x) => x.value === r)?.label ?? "Urgent need";

export interface SlotInput { date: string; startMin: number; endMin: number; attendees: number; purpose: string }
export interface BookingInput extends SlotInput { roomId: string; priority: Priority; urgentReason?: UrgentReason | null; reasonDetail?: string | null }

/** Start of the current month in Manila, for the monthly override caps. */
function monthStart() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return new Date(`${today.slice(0, 8)}01T00:00:00+08:00`);
}

/** Overrides used this month by the person and their department against the configured caps. */
export async function overrideCaps(scope: Scope) {
  const settings = await getBookingSettings();
  const base = { priority: { in: ["URGENT", "CRITICAL"] as Priority[] }, createdAt: { gte: monthStart() }, status: { not: "REJECTED" as const } };
  const [mine, department] = await Promise.all([
    prisma.roomBooking.count({ where: { ...base, bookedById: scope.userId } }),
    scope.departmentId ? prisma.roomBooking.count({ where: { ...base, departmentId: scope.departmentId } }) : Promise.resolve(0),
  ]);
  return { user: capStatus(mine, settings.urgentCapPerUser), department: scope.departmentId ? capStatus(department, settings.urgentCapPerDepartment) : null };
}

/** Other departments' classes appear only as "a class of another department", never by name. */
function redact(items: PlanItem[], scope: Scope) {
  return scope.isAdmin ? items : items.map((i) => (i.departmentId && scope.departmentIds.includes(i.departmentId) ? i : { ...i, label: "A class of another department" }));
}

export interface RoomOption {
  roomId: string;
  name: string;
  location: string;
  capacity: number;
  roomType: string;
  equipment: string[];
  status: "FREE" | "MOVES" | "BLOCKED";
  items: PlanItem[];
  displaced: DisplacedBooking[];
  blockers: string[];
  notes: string[];
  overridable: boolean;
  /** Name of the department that must approve, for an override of another department's room. */
  needsApproval: string | null;
  ownership: "OWN" | "SHARED" | "OTHER";
}

/**
 * Rates every room for the slot: free, free after moving classes or lower bookings, or blocked. Overrides
 * also see other departments' rooms (they need that department's approval). Ranked by availability, fewest
 * moves, own department first, then the closest capacity fit.
 */
export async function searchRooms(scope: Scope, input: SlotInput & { roomType?: string; priority: Priority }) {
  const settings = await getBookingSettings();
  const override = isOverride(input.priority);
  const [loaded, rooms, departments] = await Promise.all([
    loadPlan(input.date, addDays(input.date, 6)),
    prisma.room.findMany({
      where: { archivedAt: null, ...(override ? {} : departmentWhere.room(scope)), ...(input.roomType ? { roomType: input.roomType as never } : {}) },
      include: { floor: { select: { name: true, building: { select: { name: true } } } } },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const options: RoomOption[] = rooms.map((r) => {
    const plan = planBooking(loaded, { ...input, roomId: r.id }, settings);
    const approval = override ? approvalDepartment(scope, r.departmentId) : null;
    return {
      roomId: r.id,
      name: r.roomName,
      location: r.floor ? `${r.floor.building.name}, ${r.floor.name}` : "No building",
      capacity: r.capacity,
      roomType: r.roomType,
      equipment: r.equipment,
      status: plan.blockers.length ? "BLOCKED" : plan.items.length || plan.displaced.length ? "MOVES" : "FREE",
      items: redact(plan.items, scope),
      displaced: plan.displaced,
      blockers: plan.blockers,
      notes: plan.notes,
      overridable: plan.overridable,
      needsApproval: approval ? (departments.find((d) => d.id === approval)?.name ?? "the owning department") : null,
      ownership: !r.departmentId ? "SHARED" : scope.departmentIds.includes(r.departmentId) ? "OWN" : "OTHER",
    };
  });
  const rank = { FREE: 0, MOVES: 1, BLOCKED: 2 };
  const own = { OWN: 0, SHARED: 1, OTHER: 2 };
  options.sort((a, b) => rank[a.status] - rank[b.status] || a.items.length + a.displaced.length - (b.items.length + b.displaced.length) || own[a.ownership] - own[b.ownership] || a.capacity - b.capacity);
  return { options, caps: override ? await overrideCaps(scope) : null };
}

/** Checks the request itself: allowed priority, a reason for overrides, the room, and the monthly caps. */
async function vet(scope: Scope, d: BookingInput) {
  if (!allowedPriorities(scope.role).includes(d.priority)) return { error: `Your role can book up to ${PRIORITY_LABEL[allowedPriorities(scope.role).at(-1)!]} priority.` } as const;
  if (isOverride(d.priority) && !d.urgentReason) return { error: "Choose the reason for the urgent booking." } as const;
  if (d.urgentReason === "OTHER" && !d.reasonDetail?.trim()) return { error: "Describe the reason for the urgent booking." } as const;
  const room = await prisma.room.findFirst({ where: { id: d.roomId, archivedAt: null, ...(isOverride(d.priority) ? {} : departmentWhere.room(scope)) }, select: { id: true, roomName: true, departmentId: true } });
  if (!room) {
    await logBlocked(scope, "book a room of another department", "RoomBooking", d.roomId);
    return { error: "That room is not available to your department." } as const;
  }
  if (isOverride(d.priority) && !scope.isAdmin) {
    const caps = await overrideCaps(scope);
    if (caps.user.reached) return { error: `You have used all ${caps.user.cap} urgent overrides allowed this month.` } as const;
    if (caps.department?.reached) return { error: `Your department has used all ${caps.department.cap} urgent overrides allowed this month.` } as const;
  }
  return { room } as const;
}

/** Books a room. Overrides of another department's room wait for that department's approval; everything else is applied now. */
export async function createBooking(scope: Scope, d: BookingInput) {
  const v = await vet(scope, d);
  if ("error" in v) return { ok: false, error: v.error! } satisfies Fail;
  const approval = isOverride(d.priority) ? approvalDepartment(scope, v.room.departmentId) : null;
  const fields: Prisma.RoomBookingUncheckedCreateInput = {
    roomId: d.roomId, bookedById: scope.userId, purpose: d.purpose, date: day(d.date), startMin: d.startMin, endMin: d.endMin, attendees: d.attendees,
    departmentId: scope.departmentId, priority: d.priority, urgentReason: isOverride(d.priority) ? d.urgentReason : null, reasonDetail: d.reasonDetail?.trim() || null,
  };
  if (approval) {
    // Nothing moves until the room's department approves; the plan is made again at that moment.
    const settings = await getBookingSettings();
    const plan = planBooking(await loadPlan(d.date, addDays(d.date, 6)), d, settings);
    if (plan.blockers.length) return { ok: false, error: plan.blockers.join(" ") } satisfies Fail;
    const booking = await prisma.roomBooking.create({ data: { ...fields, status: "AWAITING_APPROVAL", approvalDepartmentId: approval } });
    await audit(prisma, scope, booking.id, `Requested an urgent override of ${v.room.roomName}, awaiting the owning department's approval`, { ...d, displacedClasses: plan.items.length });
    await notifyManagers(approval, { title: "Urgent room override needs your approval", message: `${scope.name} asks to take ${v.room.roomName} on ${d.date}, ${formatRange(d.startMin, d.endMin)} for "${d.purpose}" (${reasonLabel(d.urgentReason ?? null)}). ${plan.items.length} class(es) would move.`, link: "/bookings", type: "WARNING" });
    return { ok: true as const, bookingId: booking.id, status: "AWAITING_APPROVAL" as const, items: redact(plan.items, scope), displaced: plan.displaced };
  }
  return commit(scope, d, { fields, roomName: v.room.roomName });
}

/**
 * Plans again, then in one transaction locks every room involved, confirms nothing changed since planning,
 * and writes the moved classes, the displaced bookings, the booking, the acknowledgements, and the audit trail.
 */
async function commit(scope: Scope, d: BookingInput, ctx: { fields: Prisma.RoomBookingUncheckedCreateInput | null; roomName: string; existingId?: string; actorId?: string }) {
  const settings = await getBookingSettings();
  const loadedAt = new Date();
  const loaded = await loadPlan(d.date, addDays(d.date, 6));
  const plan = planBooking(loaded, d, settings, { ignoreBookingId: ctx.existingId });
  if (plan.blockers.length) return { ok: false, error: plan.blockers.join(" ") } satisfies Fail;
  const rooms = [d.roomId, ...plan.displaced.map((x) => x.toRoomId ?? ""), ...plan.items.map((i) => i.after?.roomId ?? "")];
  const dates = [...new Set([d.date, ...plan.items.map((i) => i.after?.date ?? d.date)])];
  const keys = dates.flatMap((date) => lockKeys(rooms, date)).sort();
  const actorId = ctx.actorId ?? scope.userId;
  const sectionOf = new Map(loaded.sessions.map((s) => [s.scheduleId, s.sectionId]));

  const result = await prisma.$transaction(async (tx) => {
    for (const k of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
    const changed = await tx.roomBooking.count({
      where: { roomId: { in: rooms.filter(Boolean) }, date: { in: dates.map(day) }, OR: [{ createdAt: { gt: loadedAt } }, { updatedAt: { gt: loadedAt } }], ...(ctx.existingId ? { NOT: { id: ctx.existingId } } : {}) },
    });
    const moved = await tx.scheduleAdjustment.count({ where: { createdAt: { gt: loadedAt }, OR: [{ scheduleId: { in: plan.items.map((i) => i.scheduleId) } }, { roomId: { in: rooms.filter(Boolean) } }] } });
    if (changed || moved) throw new Error("STALE");

    const summary = `${ctx.roomName} taken on ${d.date} for "${d.purpose}" (${PRIORITY_LABEL[d.priority]} priority)`;
    const batchId = plan.items.length ? await writePlan(tx, plan, "ROOM_BOOKING", summary, actorId, scope.departmentId) : null;
    const booking = ctx.existingId
      ? await tx.roomBooking.update({ where: { id: ctx.existingId }, data: { status: "CONFIRMED", batchId, reviewedById: actorId, reviewedAt: new Date() } })
      : await tx.roomBooking.create({ data: { ...ctx.fields!, status: "CONFIRMED", batchId } });
    for (const x of plan.displaced) {
      await tx.roomBooking.update({ where: { id: x.bookingId }, data: x.toRoomId ? { roomId: x.toRoomId, previousRoomId: x.fromRoomId, displacedById: booking.id } : { status: "CANCELLED", displacedById: booking.id } });
      await audit(tx, scope, x.bookingId, x.toRoomId ? `Moved to ${x.toRoomName} by a higher-priority booking` : "Cancelled by a higher-priority booking; no other room was free", { by: booking.id }, actorId);
    }
    const faculty = [...new Set(plan.items.map((i) => i.before.facultyId))];
    if (isOverride(d.priority) && faculty.length) await tx.bookingAcknowledgement.createMany({ data: faculty.map((facultyId) => ({ bookingId: booking.id, facultyId })), skipDuplicates: true });
    await audit(tx, scope, booking.id, isOverride(d.priority) ? `Urgent override of ${ctx.roomName}: ${plan.items.length} class(es) and ${plan.displaced.length} booking(s) displaced` : `Booked ${ctx.roomName}${plan.displaced.length ? ` and moved ${plan.displaced.length} lower-priority booking(s)` : ""}`, {
      priority: d.priority, reason: d.urgentReason ? reasonLabel(d.urgentReason) : null, reasonDetail: d.reasonDetail ?? null,
      displacedClasses: plan.items.map((i) => ({ class: i.label, faculty: i.before.facultyName, from: `${i.before.roomName} ${i.before.date} ${formatRange(i.before.startMin, i.before.endMin)}`, to: i.after ? `${i.after.roomName} ${i.after.date} ${formatRange(i.after.startMin, i.after.endMin)}` : null, kind: i.kind })),
      displacedBookings: plan.displaced.map((x) => ({ purpose: x.purpose, to: x.toRoomName })),
    }, actorId);
    return booking;
  }, { timeout: 30000 }).catch((e: Error) => (e.message === "STALE" ? null : Promise.reject(e)));
  if (!result) return { ok: false, error: STALE } satisfies Fail;

  await notifyDisplacement(result.id, d, ctx.roomName, plan, sectionOf);
  queueWorkloadCheck(isOverride(d.priority) ? "An urgent room override moved classes" : "A room was booked", actorId);
  return { ok: true as const, bookingId: result.id, status: "CONFIRMED" as const, items: redact(plan.items, scope), displaced: plan.displaced };
}

async function audit(db: Tx | typeof prisma, scope: Scope, bookingId: string, action: string, detail: unknown, actorId = scope.userId) {
  await db.auditLog.create({ data: { userId: actorId, role: scope.role, departmentId: scope.departmentId, action, entity: "RoomBooking", entityId: bookingId, newValue: detail as never } });
}

const when = (p: { date: string; startMin: number; endMin: number; roomName: string }) => `${p.date}, ${formatRange(p.startMin, p.endMin)} in ${p.roomName}`;

/** Bell and email for affected faculty, the section's learners, the section's Head of Department, and owners of displaced bookings. */
async function notifyDisplacement(bookingId: string, d: BookingInput, roomName: string, plan: BookingPlan, sectionOf: Map<string, string>) {
  if (!plan.items.length && !plan.displaced.length) return;
  const why = `${roomName} was needed for "${d.purpose}"${d.urgentReason ? ` (${reasonLabel(d.urgentReason)})` : ""}.`;
  const line = (i: PlanItem) => `${i.label}: ${when(i.before)} now ${i.kind === "ONLINE" ? "meets online or asynchronously at the same time" : `meets ${when(i.after!)}`}.`;
  await notifyFacultyEach(plan.items.map((i) => ({ facultyIds: [i.before.facultyId], msg: { title: "Your class was moved for an urgent booking", message: `${line(i)} ${why} Please acknowledge or request an alternative in Room Booking.`, link: `/bookings?booking=${bookingId}`, type: "WARNING" as const } })));

  const sections = [...new Set(plan.items.map((i) => sectionOf.get(i.scheduleId)).filter((s): s is string => !!s))];
  const [faculty, students, sectionRows, owners] = await Promise.all([
    prisma.faculty.findMany({ where: { id: { in: plan.items.map((i) => i.before.facultyId) } }, select: { id: true, email: true } }),
    prisma.student.findMany({ where: { sectionId: { in: sections }, user: { status: "ACTIVE", archivedAt: null } }, select: { sectionId: true, userId: true, user: { select: { email: true } } } }),
    prisma.section.findMany({ where: { id: { in: sections } }, select: { id: true, departmentId: true } }),
    prisma.user.findMany({ where: { id: { in: plan.displaced.map((x) => x.bookedById) } }, select: { id: true, email: true } }),
  ]);
  for (const i of plan.items) {
    const section = sectionOf.get(i.scheduleId);
    const learners = students.filter((s) => s.sectionId === section);
    await notifyUsers(learners.map((s) => s.userId), { title: "Class moved", message: `${line(i)} ${why}`, link: "/student", type: "WARNING" });
    const email = faculty.find((f) => f.id === i.before.facultyId)?.email;
    for (const to of [email, ...learners.map((s) => s.user.email)].filter((x): x is string => !!x)) {
      await sendMail({ to, subject: `Class moved: ${i.label}`, text: `${line(i)}\n\n${why}`, html: `<p>${line(i)}</p><p>${why}</p>` });
    }
  }
  for (const dept of new Set(sectionRows.map((s) => s.departmentId).filter((x): x is string => !!x))) {
    const own = plan.items.filter((i) => sectionRows.find((s) => s.id === sectionOf.get(i.scheduleId))?.departmentId === dept);
    if (own.length) await notifyManagers(dept, { title: "Classes moved for an urgent booking", message: `${own.length} class(es) of your department moved. ${why} ${own.map(line).join(" ")}`, link: "/adjustments", type: "WARNING" });
  }
  for (const x of plan.displaced) {
    const message = x.toRoomId ? `Your booking "${x.purpose}" moved from ${roomName} to ${x.toRoomName}. ${why}` : `Your booking "${x.purpose}" in ${roomName} was cancelled because no other room was free. ${why}`;
    await notifyUsers([x.bookedById], { title: x.toRoomId ? "Room booking moved" : "Room booking cancelled", message, link: "/bookings", type: "WARNING" });
    const to = owners.find((o) => o.id === x.bookedById)?.email;
    if (to) await sendMail({ to, subject: x.toRoomId ? "Room booking moved" : "Room booking cancelled", text: message, html: `<p>${message}</p>` });
  }
}

const fromRow = (b: { roomId: string; date: Date; startMin: number; endMin: number; attendees: number; purpose: string; priority: Priority; urgentReason: string | null; reasonDetail: string | null }): BookingInput => ({
  roomId: b.roomId, date: isoDate(b.date), startMin: b.startMin, endMin: b.endMin, attendees: b.attendees, purpose: b.purpose, priority: b.priority, urgentReason: b.urgentReason as UrgentReason | null, reasonDetail: b.reasonDetail,
});

/** The owning department's Head (or the Administrator) approves an override of their room; it is planned and applied then. */
export async function reviewOverride(scope: Scope, id: string, approve: boolean, note?: string) {
  const b = await prisma.roomBooking.findUnique({ where: { id }, include: { room: { select: { roomName: true } }, bookedBy: { select: { id: true, name: true } } } });
  if (!b || b.status !== "AWAITING_APPROVAL") return { ok: false, error: "This request was already decided." } satisfies Fail;
  if (!scope.isAdmin && !(b.approvalDepartmentId && scope.departmentIds.includes(b.approvalDepartmentId))) {
    await logBlocked(scope, "decide an urgent override of another department's room", "RoomBooking", id);
    return { ok: false, error: "Only the Head of Department who owns this room, or the Administrator, can decide." } satisfies Fail;
  }
  if (!approve) {
    await prisma.roomBooking.update({ where: { id }, data: { status: "REJECTED", reviewedById: scope.userId, reviewedAt: new Date(), reviewNote: note?.trim() || null } });
    await audit(prisma, scope, id, `Rejected the urgent override of ${b.room.roomName}${note ? `: ${note}` : ""}`, { note: note ?? null });
    await notifyUsers([b.bookedById], { title: "Urgent override rejected", message: `Your request for ${b.room.roomName} on ${isoDate(b.date)} was rejected${note ? `: ${note}` : "."}`, link: "/bookings", type: "WARNING" });
    return { ok: true as const };
  }
  const bookerScope = { ...scope, userId: b.bookedById, name: b.bookedBy.name };
  const result = await commit(bookerScope, fromRow(b), { fields: null, roomName: b.room.roomName, existingId: id, actorId: scope.userId });
  if (!result.ok) return result;
  await audit(prisma, scope, id, `Approved the urgent override of ${b.room.roomName}`, { note: note ?? null });
  await notifyUsers([b.bookedById], { title: "Urgent override approved", message: `${b.room.roomName} is yours on ${isoDate(b.date)}, ${formatRange(b.startMin, b.endMin)}.`, link: "/bookings" });
  return { ok: true as const };
}

/** Bookings this booking displaced that can go back to their room (moved ones) or be confirmed again (cancelled ones). */
async function restoreDisplaced(tx: Tx, scope: Scope, bookingId: string, window: { date: string; startMin: number; endMin: number } | null) {
  const settings = await getBookingSettings();
  const victims = await tx.roomBooking.findMany({ where: { displacedById: bookingId } });
  const restored: string[] = [];
  for (const v of victims) {
    const back = v.previousRoomId ?? v.roomId;
    // Still overlapping a shortened override: it stays where it is.
    if (window && isoDate(v.date) === window.date && v.startMin < window.endMin + settings.bufferMinutes && window.startMin - settings.bufferMinutes < v.endMin) continue;
    const busy = await tx.roomBooking.count({ where: { id: { notIn: [v.id, bookingId] }, roomId: back, date: v.date, status: "CONFIRMED", startMin: { lt: v.endMin + settings.bufferMinutes }, endMin: { gt: v.startMin - settings.bufferMinutes } } });
    if (busy) continue;
    await tx.roomBooking.update({ where: { id: v.id }, data: { roomId: back, previousRoomId: null, displacedById: null, status: v.status === "CANCELLED" ? "CONFIRMED" : v.status } });
    await audit(tx, scope, v.id, "Restored after the higher-priority booking was cancelled or shortened", {});
    restored.push(v.bookedById);
  }
  return restored;
}

/** Puts back the bookings an override displaced (used when its classes are undone from Schedule Adjustments). */
export async function releaseDisplaced(scope: Scope, bookingId: string) {
  const owners = await prisma.$transaction(async (tx) => {
    await tx.bookingAcknowledgement.deleteMany({ where: { bookingId, status: "PENDING" } });
    return restoreDisplaced(tx, scope, bookingId, null);
  });
  if (owners.length) await notifyUsers(owners, { title: "Room booking restored", message: "The higher-priority booking that moved your booking was cancelled, so it is back in its original room.", link: "/bookings" });
}

/** Cancels a booking; with `restore`, displaced classes and bookings go back when their original slots are still free. */
export async function cancelBooking(scope: Scope, id: string, restore: boolean) {
  const b = await prisma.roomBooking.findUnique({ where: { id }, include: { room: { select: { roomName: true } }, batch: { include: { adjustments: true } } } });
  if (!b || ["CANCELLED", "REJECTED"].includes(b.status)) return { ok: false, error: "This booking is already cancelled." } satisfies Fail;
  if (!scope.isAdmin && b.bookedById !== scope.userId) return { ok: false, error: "Only the person who booked the room or an Administrator can cancel it." } satisfies Fail;
  const undo = restore && b.batch && !b.batch.undoneAt;
  if (undo) {
    const problems = await undoProblems(b.batch!.id, b.batch!.adjustments, [b.id]);
    if (problems.length) return { ok: false, error: problems.join(" ") } satisfies Fail;
  }
  const date = isoDate(b.date);
  const restoredOwners = await prisma.$transaction(async (tx) => {
    for (const k of lockKeys([b.roomId, ...(b.batch?.adjustments.map((a) => a.roomId ?? "") ?? [])], date)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
    if (undo) await tx.adjustmentBatch.update({ where: { id: b.batch!.id }, data: { undoneAt: new Date() } });
    const owners = restore ? await restoreDisplaced(tx, scope, b.id, null) : [];
    await tx.bookingAcknowledgement.deleteMany({ where: { bookingId: id, status: "PENDING" } });
    await tx.roomBooking.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, scope, id, `Cancelled the booking of ${b.room.roomName}${undo ? " and restored displaced classes" : ""}`, { restore });
    return owners;
  }, { timeout: 30000 });
  if (undo) await notifyRestored(b.batch!.adjustments.map((a) => a.scheduleId), b.room.roomName, b.purpose);
  if (restoredOwners.length) await notifyUsers(restoredOwners, { title: "Room booking restored", message: `The higher-priority booking of ${b.room.roomName} was cancelled, so your booking is back in its original room.`, link: "/bookings" });
  if (b.bookedById !== scope.userId) await notifyUsers([b.bookedById], { title: "Room booking cancelled", message: `Your booking of ${b.room.roomName} for "${b.purpose}" was cancelled by an Administrator.`, link: "/bookings" });
  queueWorkloadCheck("A room booking was cancelled", scope.userId);
  return { ok: true as const };
}

async function notifyRestored(scheduleIds: string[], roomName: string, purpose: string) {
  const schedules = await prisma.schedule.findMany({ where: { id: { in: scheduleIds } }, select: { facultyId: true, sectionId: true, section: { select: { departmentId: true } } } });
  const message = `The urgent booking of ${roomName} for "${purpose}" was cancelled or shortened, so your class is back in its original room and time.`;
  await notifyFacultyEach([{ facultyIds: schedules.map((s) => s.facultyId), msg: { title: "Class restored", message, link: "/calendar" } }]);
  const students = await prisma.student.findMany({ where: { sectionId: { in: schedules.map((s) => s.sectionId) } }, select: { userId: true } });
  await notifyUsers(students.map((s) => s.userId), { title: "Class restored", message, link: "/student" });
  for (const dept of new Set(schedules.map((s) => s.section.departmentId).filter((d): d is string => !!d))) await notifyManagers(dept, { title: "Classes restored", message, link: "/adjustments" });
}

/** Shortens a booking; displaced meetings that no longer overlap go back (when `restore`) if their slots are free. */
export async function shortenBooking(scope: Scope, id: string, startMin: number, endMin: number, restore: boolean) {
  const b = await prisma.roomBooking.findUnique({ where: { id }, include: { room: { select: { roomName: true } }, batch: { include: { adjustments: { include: { schedule: true } } } } } });
  if (!b || b.status !== "CONFIRMED") return { ok: false, error: "Only confirmed bookings can be shortened." } satisfies Fail;
  if (!scope.isAdmin && b.bookedById !== scope.userId) return { ok: false, error: "Only the person who booked the room or an Administrator can change it." } satisfies Fail;
  if (startMin < b.startMin || endMin > b.endMin || endMin <= startMin || (startMin === b.startMin && endMin === b.endMin)) return { ok: false, error: "Choose a shorter time inside the current booking. To extend or move it, cancel and book again." } satisfies Fail;
  const date = isoDate(b.date);
  const open = b.batch && !b.batch.undoneAt ? b.batch.adjustments.filter((a) => a.kind !== "MAKE_UP") : [];
  const back = restore ? restorableAfterShortening(open.map((a) => ({ id: a.id, a, date: isoDate(a.date), roomId: a.schedule.roomId, startMin: a.schedule.startMin, endMin: a.schedule.endMin })), { roomId: b.roomId, date, startMin, endMin }) : [];
  if (back.length) {
    const problems = await undoProblems(b.batch!.id, back.map((x) => x.a), [b.id]);
    if (problems.length) return { ok: false, error: problems.join(" ") } satisfies Fail;
  }
  const owners = await prisma.$transaction(async (tx) => {
    for (const k of lockKeys([b.roomId, ...open.map((a) => a.roomId ?? "")], date)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
    if (back.length) await tx.scheduleAdjustment.deleteMany({ where: { id: { in: back.map((x) => x.id) } } });
    const restored = restore ? await restoreDisplaced(tx, scope, b.id, { date, startMin, endMin }) : [];
    await tx.roomBooking.update({ where: { id }, data: { startMin, endMin } });
    await audit(tx, scope, id, `Shortened the booking to ${formatRange(startMin, endMin)}${back.length ? ` and restored ${back.length} class(es)` : ""}`, { from: formatRange(b.startMin, b.endMin), to: formatRange(startMin, endMin) });
    return restored;
  });
  if (back.length) await notifyRestored(back.map((x) => x.a.scheduleId), b.room.roomName, b.purpose);
  if (owners.length) await notifyUsers(owners, { title: "Room booking restored", message: `The higher-priority booking of ${b.room.roomName} was shortened, so your booking is back in its original room.`, link: "/bookings" });
  return { ok: true as const, restored: back.length };
}

/** Purpose and attendee changes; the room must still seat everyone. */
export async function editBookingDetails(scope: Scope, id: string, purpose: string, attendees: number) {
  const b = await prisma.roomBooking.findUnique({ where: { id }, include: { room: { select: { capacity: true, roomName: true } } } });
  if (!b || ["CANCELLED", "REJECTED"].includes(b.status)) return { ok: false, error: "This booking can no longer be changed." } satisfies Fail;
  if (!scope.isAdmin && b.bookedById !== scope.userId) return { ok: false, error: "Only the person who booked the room or an Administrator can change it." } satisfies Fail;
  if (attendees > b.room.capacity) return { ok: false, error: `${b.room.roomName} seats only ${b.room.capacity}.` } satisfies Fail;
  await prisma.roomBooking.update({ where: { id }, data: { purpose, attendees } });
  await audit(prisma, scope, id, "Changed the booking details", { purpose, attendees, before: { purpose: b.purpose, attendees: b.attendees } });
  return { ok: true as const };
}

/** A displaced class's faculty member acknowledges the change or asks for another option. */
export async function respondAcknowledgement(scope: Scope, ackId: string, status: "ACKNOWLEDGED" | "ALTERNATIVE_REQUESTED", note?: string) {
  const a = await prisma.bookingAcknowledgement.findUnique({ where: { id: ackId }, include: { booking: { select: { id: true, bookedById: true, purpose: true, room: { select: { roomName: true } } } } } });
  if (!a || !scope.facultyId || a.facultyId !== scope.facultyId) return { ok: false, error: "This acknowledgement is not yours." } satisfies Fail;
  if (status === "ALTERNATIVE_REQUESTED" && !note?.trim()) return { ok: false, error: "Say what alternative would work for you." } satisfies Fail;
  await prisma.bookingAcknowledgement.update({ where: { id: ackId }, data: { status, note: note?.trim() || null, respondedAt: new Date() } });
  await audit(prisma, scope, a.booking.id, status === "ACKNOWLEDGED" ? `${scope.name} acknowledged the class change` : `${scope.name} requested an alternative: ${note}`, { status, note: note ?? null });
  const msg = status === "ACKNOWLEDGED" ? `${scope.name} acknowledged the class change for "${a.booking.purpose}".` : `${scope.name} asks for another option for the class moved by "${a.booking.purpose}": ${note}`;
  await notifyUsers([a.booking.bookedById], { title: status === "ACKNOWLEDGED" ? "Class change acknowledged" : "Alternative requested", message: msg, link: `/bookings?booking=${a.booking.id}`, type: status === "ACKNOWLEDGED" ? "INFO" : "WARNING" });
  if (status === "ALTERNATIVE_REQUESTED") {
    const faculty = await prisma.faculty.findUnique({ where: { id: a.facultyId }, select: { departmentId: true } });
    await notifyManagers(faculty?.departmentId ?? null, { title: "Alternative requested for a moved class", message: msg, link: "/adjustments", type: "WARNING" });
  }
  return { ok: true as const };
}

/** Every recorded step of a booking, oldest first, from the Audit Logs. */
export async function bookingTimeline(scope: Scope, id: string) {
  const b = await prisma.roomBooking.findUnique({ where: { id }, select: { bookedById: true, approvalDepartmentId: true } });
  if (!b || !(scope.isAdmin || b.bookedById === scope.userId || (b.approvalDepartmentId && scope.departmentIds.includes(b.approvalDepartmentId)))) return [];
  const rows = await prisma.auditLog.findMany({ where: { entity: "RoomBooking", entityId: id }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), who: r.user?.name ?? "System", action: r.action }));
}

/** True when the slot clashes with nothing in the room (used by checks outside the booking flow). */
export async function roomFree(roomId: string, date: string, startMin: number, endMin: number) {
  const p = await loadPlan(date, date);
  return findClashes(p.ctx.occupants, { date, startMin, endMin, roomId }).length === 0;
}
