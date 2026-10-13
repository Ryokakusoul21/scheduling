import "server-only";
import type { AdjustmentCause } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notifyFaculty } from "@/lib/notify";
import { formatRange } from "@/lib/scheduler/timetable";
import {
  addDays,
  commitRelocation,
  describeClash,
  findClashes,
  isoDate,
  makeUpOptions,
  relocate,
  type Relocation,
  type Session,
} from "./engine";
import { loadPlan, type LoadedPlan } from "./load";

export interface Placement {
  date: string;
  roomId: string;
  roomName: string;
  facultyId: string;
  facultyName: string;
  startMin: number;
  endMin: number;
}

/** One affected class meeting: where it was, where it goes (null when cancelled), and why. */
export interface PlanItem {
  scheduleId: string;
  label: string;
  departmentId: string | null;
  before: Placement;
  after: Placement | null;
  kind: "MOVED" | "CANCELLED";
  reason: string;
}

export interface AdjustmentPlan {
  items: PlanItem[];
  /** Problems that stop the change (for example an examination already in the room). */
  blockers: string[];
  /** Things to know that do not stop the change. */
  notes: string[];
}

const placement = (p: LoadedPlan, r: Relocation | Session): Placement => ({
  date: r.date,
  roomId: r.roomId,
  roomName: p.roomName.get(r.roomId) ?? "Room",
  facultyId: r.facultyId,
  facultyName: p.facultyName.get(r.facultyId) ?? "Faculty",
  startMin: r.startMin,
  endMin: r.endMin,
});

function item(p: LoadedPlan, s: Session, r: Relocation | null, cancelReason: string): PlanItem {
  return {
    scheduleId: s.scheduleId,
    label: p.label(s),
    departmentId: p.classInfo.get(s.scheduleId)?.departmentId ?? null,
    before: placement(p, s),
    after: r ? placement(p, r) : null,
    kind: r ? "MOVED" : "CANCELLED",
    reason: r ? r.reason : cancelReason,
  };
}

const overlaps = (s: { startMin: number; endMin: number }, startMin?: number | null, endMin?: number | null) =>
  startMin == null || endMin == null || (s.startMin < endMin && startMin < s.endMin);

// ---------------------------------------------------------------------------
// Planning (read-only; used for previews and again at apply time)
// ---------------------------------------------------------------------------

export interface BookingRequest {
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
  purpose: string;
}

/** Classes in the requested room are moved to the nearest free room or time; examinations and bookings block. */
export async function planRoomBooking(req: BookingRequest): Promise<AdjustmentPlan> {
  return planRoomBookingWith(await loadPlan(req.date, req.date), req);
}

/** Same as planRoomBooking on an already loaded snapshot (left unchanged), so many rooms can be compared cheaply. */
export function planRoomBookingWith(loaded: LoadedPlan, req: BookingRequest): AdjustmentPlan {
  const p = { ...loaded, ctx: { ...loaded.ctx, occupants: [...loaded.ctx.occupants] } };
  const clashes = findClashes(p.ctx.occupants, { ...req, roomId: req.roomId });
  const blockers = clashes.filter((c) => c.occupant.kind !== "CLASS").map(describeClash);
  const room = p.ctx.rooms.find((r) => r.id === req.roomId);
  if (!room) blockers.push("The room no longer exists.");
  else if (room.status !== "AVAILABLE") blockers.push(`${room.name} is not open for use.`);
  else if (p.ctx.unavailable.some((u) => u.roomId === req.roomId && req.date >= u.start && req.date <= u.end)) blockers.push(`${room.name} is marked unavailable on this date.`);
  if (blockers.length) return { items: [], blockers, notes: [] };

  p.ctx.occupants.push({ kind: "BOOKING", refId: "new", date: req.date, startMin: req.startMin, endMin: req.endMin, roomId: req.roomId, facultyIds: [], sectionIds: [], label: req.purpose });

  const items: PlanItem[] = [];
  for (const c of clashes) {
    const s = p.sessions.find((x) => x.scheduleId === c.occupant.refId && x.date === req.date);
    if (!s) continue;
    const r = relocate(s, p.ctx, { allowOtherDays: true });
    if (!r) {
      blockers.push(`${p.label(s)} (${formatRange(s.startMin, s.endMin)}) has no free room or time slot that fits its size, room type, and faculty availability this week.`);
      continue;
    }
    commitRelocation(p.ctx, s, r, p.label(s));
    items.push(item(p, s, { ...r, reason: `${r.reason} ${room!.name} was booked for "${req.purpose}".` }, ""));
  }
  return { items, blockers, notes: [] };
}

export interface UnavailableRequest {
  start: string;
  end: string;
  startMin?: number | null;
  endMin?: number | null;
}

/** A faculty member is away: find a substitute (same department first), otherwise cancel for a make-up. */
export async function planFacultyUnavailable(facultyId: string, req: UnavailableRequest): Promise<AdjustmentPlan> {
  const p = await loadPlan(req.start, req.end);
  p.ctx.unavailable.push({ facultyId, ...req });
  const name = p.facultyName.get(facultyId) ?? "The faculty member";
  const items: PlanItem[] = [];
  for (const s of p.sessions.filter((x) => x.facultyId === facultyId && overlaps(x, req.startMin, req.endMin))) {
    const r = relocate(s, p.ctx, { avoidFacultyId: facultyId });
    commitRelocation(p.ctx, s, r, p.label(s));
    items.push(item(p, s, r, `${name} is unavailable and no qualified substitute is free at this time; schedule a make-up class.`));
  }
  const notes = p.ctx.occupants
    .filter((o) => o.kind === "EXAMINATION" && o.facultyIds.includes(facultyId) && o.date >= req.start && o.date <= req.end && overlaps(o, req.startMin, req.endMin))
    .map((o) => `${o.label} on ${o.date} needs a new proctor; edit it in Examinations.`);
  return { items, blockers: [], notes };
}

/** A room is closed: move each class to the nearest suitable room or time, otherwise cancel for a make-up. */
export async function planRoomUnavailable(roomId: string, req: UnavailableRequest): Promise<AdjustmentPlan> {
  const p = await loadPlan(req.start, req.end);
  p.ctx.unavailable.push({ roomId, ...req });
  const name = p.roomName.get(roomId) ?? "The room";
  const items: PlanItem[] = [];
  for (const s of p.sessions.filter((x) => x.roomId === roomId && overlaps(x, req.startMin, req.endMin))) {
    const r = relocate(s, p.ctx, { avoidRoomId: roomId });
    commitRelocation(p.ctx, s, r, p.label(s));
    items.push(item(p, s, r ? { ...r, reason: `${r.reason} ${name} is unavailable.` } : null, `${name} is unavailable and no other suitable room or time is free that day; schedule a make-up class.`));
  }
  const notes = p.ctx.occupants
    .filter((o) => o.kind !== "CLASS" && o.roomId === roomId && o.date >= req.start && o.date <= req.end && overlaps(o, req.startMin, req.endMin))
    .map((o) => `${o.label} on ${o.date} is in this room; move it manually.`);
  return { items, blockers: [], notes };
}

/** Classes suspended for the dates (all sections, or only the listed ones) are cancelled; make-up options are offered per class. */
export async function planSuspension(sectionIds: string[], req: UnavailableRequest): Promise<AdjustmentPlan> {
  const p = await loadPlan(req.start, req.end);
  const items = p.sessions
    .filter((s) => (sectionIds.length === 0 || sectionIds.includes(s.sectionId)) && overlaps(s, req.startMin, req.endMin))
    .map((s) => item(p, s, null, "Classes are suspended; choose a make-up class option."));
  return { items, blockers: [], notes: [] };
}

/** Make-up options for a cancelled meeting, searching the two weeks after `after`. */
export async function findMakeUpOptions(scheduleId: string, date: string, after: string) {
  const p = await loadPlan(date, addDays(after, 15));
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return [];
  const s: Session = { scheduleId, date, sectionId: schedule.sectionId, subjectId: schedule.subjectId, facultyId: schedule.facultyId, roomId: schedule.roomId, component: schedule.component, startMin: schedule.startMin, endMin: schedule.endMin, status: "REGULAR" };
  return makeUpOptions(s, p.ctx, after).map((r) => ({ ...placement(p, r), reason: r.reason }));
}

// ---------------------------------------------------------------------------
// Applying, notifying, and undoing
// ---------------------------------------------------------------------------

const when = (p: Placement) => `${p.date}, ${formatRange(p.startMin, p.endMin)} in ${p.roomName}`;

/** Saves the plan as one undoable batch and notifies every affected faculty member. Returns the batch id. */
export async function applyPlan(plan: AdjustmentPlan, cause: AdjustmentCause, summary: string, userId: string) {
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.adjustmentBatch.create({ data: { cause, summary, createdById: userId } });
    await tx.scheduleAdjustment.createMany({
      data: plan.items.map((i) => ({
        batchId: b.id,
        scheduleId: i.scheduleId,
        kind: i.kind,
        date: new Date(`${i.before.date}T00:00:00Z`),
        newDate: i.after && i.after.date !== i.before.date ? new Date(`${i.after.date}T00:00:00Z`) : null,
        roomId: i.after && i.after.roomId !== i.before.roomId ? i.after.roomId : null,
        facultyId: i.after && i.after.facultyId !== i.before.facultyId ? i.after.facultyId : null,
        startMin: i.after && i.after.startMin !== i.before.startMin ? i.after.startMin : null,
        endMin: i.after && i.after.endMin !== i.before.endMin ? i.after.endMin : null,
        reason: i.reason,
      })),
    });
    return b;
  });

  for (const i of plan.items) {
    const message = i.after
      ? `${i.label} on ${when(i.before)} now meets ${when(i.after)}${i.after.facultyId !== i.before.facultyId ? ` with ${i.after.facultyName}` : ""}. ${i.reason}`
      : `${i.label} on ${when(i.before)} is cancelled. ${i.reason}`;
    const ids = [i.before.facultyId, ...(i.after ? [i.after.facultyId] : [])];
    await notifyFaculty(ids, { title: i.after ? "Class rescheduled" : "Class cancelled", message, link: "/calendar", type: "WARNING" });
  }
  return batch.id;
}

/** Saves a chosen make-up session into an existing batch after checking it is still free. */
export async function addMakeUp(batchId: string, scheduleId: string, date: string, choice: { date: string; roomId: string; startMin: number; endMin: number }) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return "The class no longer exists.";
  const p = await loadPlan(choice.date, choice.date);
  const clashes = findClashes(p.ctx.occupants, { ...choice, facultyIds: [schedule.facultyId], sectionIds: [schedule.sectionId] });
  if (clashes.length) return `That slot is no longer free: ${clashes.map(describeClash).join(" ")}`;
  await prisma.scheduleAdjustment.create({
    data: {
      batchId, scheduleId, kind: "MAKE_UP", date: new Date(`${date}T00:00:00Z`), newDate: new Date(`${choice.date}T00:00:00Z`),
      roomId: choice.roomId, startMin: choice.startMin, endMin: choice.endMin, reason: `Make-up class for the meeting on ${date}.`,
    },
  });
  await notifyFaculty([schedule.facultyId], {
    title: "Make-up class scheduled",
    message: `A make-up class for ${date} is set on ${choice.date}, ${formatRange(choice.startMin, choice.endMin)} in ${p.roomName.get(choice.roomId) ?? "a room"}.`,
    link: "/calendar",
  });
  return null;
}

/**
 * Reverts every adjustment in a batch after confirming the original meetings are still free.
 * `ignoreRefIds` are occupants being removed at the same time (for example the booking being cancelled).
 */
export async function undoBatch(batchId: string, ignoreRefIds: string[] = []): Promise<string | null> {
  const batch = await prisma.adjustmentBatch.findUnique({ where: { id: batchId }, include: { adjustments: true } });
  if (!batch) return "This change no longer exists.";
  if (batch.undoneAt) return "This change was already undone.";

  const restored = batch.adjustments.filter((a) => a.kind !== "MAKE_UP");
  if (restored.length) {
    const dates = restored.map((a) => isoDate(a.date)).sort();
    const p = await loadPlan(dates[0], dates[dates.length - 1], { excludeBatchId: batchId });
    const problems: string[] = [];
    for (const a of restored) {
      const s = p.sessions.find((x) => x.scheduleId === a.scheduleId && x.date === isoDate(a.date));
      if (!s) continue;
      const clashes = findClashes(
        p.ctx.occupants,
        { date: s.date, startMin: s.startMin, endMin: s.endMin, roomId: s.roomId, facultyIds: [s.facultyId], sectionIds: [s.sectionId] },
        (o) => ignoreRefIds.includes(o.refId) || (o.kind === "CLASS" && o.refId === s.scheduleId)
      );
      problems.push(...clashes.map((c) => `${p.label(s)} cannot return to its original slot: ${describeClash(c)}`));
    }
    if (problems.length) return problems.join(" ");
  }

  await prisma.adjustmentBatch.update({ where: { id: batchId }, data: { undoneAt: new Date() } });
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: batch.adjustments.map((a) => a.scheduleId) } },
    select: { facultyId: true },
  });
  await notifyFaculty(
    [...schedules.map((s) => s.facultyId), ...batch.adjustments.flatMap((a) => (a.facultyId ? [a.facultyId] : []))],
    { title: "Schedule change undone", message: `This change was undone and classes are back in their original slots: ${batch.summary}`, link: "/calendar" }
  );
  return null;
}
