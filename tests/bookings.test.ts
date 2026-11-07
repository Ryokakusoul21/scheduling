import { describe, expect, it } from "vitest";
import { expandSessions, sessionOccupant, type Occupant, type PlanContext, type RoomInfo, type WeeklyClass } from "@/lib/occupancy/engine";
import {
  approvalDepartment, capStatus, DEFAULT_BOOKING_SETTINGS, lockKeys, maxPriority, planBooking, restorableAfterShortening, statusLabel, weeklyDates,
  type BookingMeta, type BookingRequest, type PlanSnapshot,
} from "@/lib/bookings/plan";

// 2026-10-12 is a Monday; one class meets in r1 from 8:00 to 9:30.
const MONDAY = "2026-10-12";
const term = { id: "t1", start: "2026-08-03", end: "2026-12-18" };
const settings = { ...DEFAULT_BOOKING_SETTINGS, bufferMinutes: 10 };
const room = (id: string, over: Partial<RoomInfo> = {}): RoomInfo => ({ id, name: id.toUpperCase(), capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", buildingId: "b1", ...over });
const cls = (id: string, over: Partial<WeeklyClass> = {}): WeeklyClass => ({
  id, semesterId: "t1", sectionId: "s1", subjectId: "sub1", facultyId: "f1", roomId: "r1", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 570, ...over,
});
const booking = (id: string, over: Partial<BookingMeta> = {}): BookingMeta => ({ id, roomId: "r1", date: MONDAY, startMin: 600, endMin: 660, priority: "REGULAR", purpose: id, attendees: 20, bookedById: "u-other", ...over });
const occupant = (b: BookingMeta): Occupant => ({ kind: "BOOKING", refId: b.id, date: b.date, startMin: b.startMin, endMin: b.endMin, roomId: b.roomId, facultyIds: [], sectionIds: [], label: b.purpose });

function snapshot(opts: { classes?: WeeklyClass[]; rooms?: RoomInfo[]; bookings?: BookingMeta[]; extra?: Occupant[]; holidays?: string[] } = {}): PlanSnapshot {
  const classes = opts.classes ?? [cls("c1")];
  const sessions = expandSessions(classes, [term], [], MONDAY, "2026-10-18");
  const bookings = opts.bookings ?? [];
  const ctx: PlanContext = {
    rooms: opts.rooms ?? [room("r1"), room("r2"), room("lab", { roomType: "COMPUTER_LABORATORY" })],
    faculty: new Map([["f1", { id: "f1", name: "F1", departmentId: "d1", teachingLevels: ["COLLEGE"], availability: [] }]]),
    occupants: [...sessions.map((s) => sessionOccupant(s, `Class ${s.scheduleId}`)), ...bookings.map(occupant), ...(opts.extra ?? [])],
    unavailable: [],
    holidays: new Set(opts.holidays ?? []),
    sectionSize: new Map([["s1", 30]]),
    sectionLevel: new Map([["s1", "COLLEGE"]]),
    subjectRoomType: new Map([["sub1", "LECTURE_ROOM"]]),
  };
  return { ctx, sessions, bookings, roomName: new Map(ctx.rooms.map((r) => [r.id, r.name])), facultyName: new Map([["f1", "F1"]]), classInfo: new Map(), label: (s) => `Class ${s.scheduleId}` };
}
const req = (over: Partial<BookingRequest> = {}): BookingRequest => ({ roomId: "r1", date: MONDAY, startMin: 480, endMin: 570, purpose: "Accreditation visit", attendees: 30, priority: "REGULAR", ...over });

describe("conflict detection and priority rules", () => {
  it("blocks a regular booking on a class and offers an urgent override", () => {
    const plan = planBooking(snapshot(), req(), settings);
    expect(plan.blockers[0]).toMatch(/class in this room/);
    expect(plan.overridable).toBe(true);
  });

  it("keeps the buffer between bookings", () => {
    const snap = snapshot({ classes: [], bookings: [booking("b1", { startMin: 540, endMin: 600 })] });
    expect(planBooking(snap, req({ startMin: 605, endMin: 660 }), settings).blockers).toHaveLength(1);
    expect(planBooking(snap, req({ startMin: 605, endMin: 660 }), { ...settings, bufferMinutes: 0 }).blockers).toHaveLength(0);
  });

  it("serves equal priority first come, first served and lets higher priority win", () => {
    const snap = snapshot({ classes: [], bookings: [booking("b1", { startMin: 480, endMin: 570 })] });
    const equal = planBooking(snap, req(), settings);
    expect(equal.blockers[0]).toMatch(/first come, first served/);
    const high = planBooking(snap, req({ priority: "HIGH" }), settings);
    expect(high.blockers).toHaveLength(0);
    expect(high.displaced).toEqual([expect.objectContaining({ bookingId: "b1", toRoomId: "r2" })]);
  });

  it("never lets an urgent booking take another urgent booking, but Critical outranks it", () => {
    const snap = snapshot({ classes: [], bookings: [booking("u1", { startMin: 480, endMin: 570, priority: "URGENT" })] });
    const urgent = planBooking(snap, req({ priority: "URGENT" }), settings);
    expect(urgent.blockers).toHaveLength(1);
    expect(urgent.overridable).toBe(false);
    expect(planBooking(snap, req({ priority: "CRITICAL" }), settings).displaced).toHaveLength(1);
  });

  it("never overrides examinations or closed rooms", () => {
    const exam: Occupant = { kind: "EXAMINATION", refId: "e1", date: MONDAY, startMin: 480, endMin: 600, roomId: "r1", facultyIds: [], sectionIds: [], label: "Examination: IT101" };
    expect(planBooking(snapshot({ extra: [exam] }), req({ priority: "CRITICAL" }), settings).blockers.some((b) => /never displaced/.test(b))).toBe(true);
    const closed = snapshot({ rooms: [room("r1", { status: "UNDER_MAINTENANCE" }), room("r2")] });
    expect(planBooking(closed, req({ priority: "CRITICAL" }), settings).blockers[0]).toMatch(/under maintenance or closed/);
  });

  it("respects operating hours and holidays", () => {
    expect(planBooking(snapshot({ classes: [] }), req({ startMin: 360, endMin: 420 }), settings).blockers[0]).toMatch(/can be booked from/);
    const holiday = snapshot({ classes: [], holidays: [MONDAY] });
    expect(planBooking(holiday, req(), settings).blockers[0]).toMatch(/holiday/);
    expect(planBooking(holiday, req({ priority: "URGENT" }), settings).notes[0]).toMatch(/holiday/);
  });
});

describe("displacement", () => {
  it("moves a displaced class to another free room of the right type at the same time", () => {
    const plan = planBooking(snapshot(), req({ priority: "URGENT" }), settings);
    expect(plan.blockers).toHaveLength(0);
    expect(plan.items).toEqual([expect.objectContaining({ scheduleId: "c1", kind: "MOVED", after: expect.objectContaining({ roomId: "r2", startMin: 480 }) })]);
    expect(plan.notes[0]).toBe("1 class will be moved.");
  });

  it("falls back to online delivery when no room or time slot fits", () => {
    // The only other lecture room is too small for the section, so nothing fits.
    const snap = snapshot({ rooms: [room("r1"), room("tiny", { capacity: 10 })] });
    const plan = planBooking(snap, req({ priority: "URGENT" }), settings);
    expect(plan.items).toEqual([expect.objectContaining({ kind: "ONLINE", after: expect.objectContaining({ roomId: "", startMin: 480 }) })]);
  });

  it("cancels a displaced booking when no other room of its type is free", () => {
    const snap = snapshot({ classes: [], rooms: [room("r1"), room("lab", { roomType: "COMPUTER_LABORATORY" })], bookings: [booking("b1", { startMin: 480, endMin: 570 })] });
    expect(planBooking(snap, req({ priority: "HIGH" }), settings).displaced[0]).toMatchObject({ bookingId: "b1", toRoomId: null });
  });
});

describe("permissions, caps, and restore", () => {
  it("maps roles to the highest priority they may use", () => {
    expect([maxPriority("FACULTY"), maxPriority("HEAD_OF_DEPARTMENT"), maxPriority("REGISTRAR")]).toEqual(["REGULAR", "URGENT", "CRITICAL"]);
  });

  it("needs the owning department's approval only for another department's room", () => {
    const head = { isAdmin: false, departmentIds: ["ccs"] };
    expect(approvalDepartment(head, "ccs")).toBeNull();
    expect(approvalDepartment(head, null)).toBeNull();
    expect(approvalDepartment(head, "cba")).toBe("cba");
    expect(approvalDepartment({ isAdmin: true, departmentIds: [] }, "cba")).toBeNull();
  });

  it("warns near the monthly cap and refuses at it", () => {
    expect(capStatus(3, 4)).toMatchObject({ near: true, reached: false, remaining: 1 });
    expect(capStatus(4, 4)).toMatchObject({ near: false, reached: true, remaining: 0 });
  });

  it("restores only the meetings a shortened override no longer overlaps", () => {
    const originals = [{ id: "a", roomId: "r1", date: MONDAY, startMin: 480, endMin: 570 }, { id: "b", roomId: "r1", date: MONDAY, startMin: 600, endMin: 690 }];
    expect(restorableAfterShortening(originals, { roomId: "r1", date: MONDAY, startMin: 480, endMin: 570 }).map((o) => o.id)).toEqual(["b"]);
  });

  it("locks rooms in the same order whatever order they are given in", () => {
    expect(lockKeys(["r2", "r1", "", "r2"], MONDAY)).toEqual(lockKeys(["r1", "r2"], MONDAY));
    expect(lockKeys(["r2", "r1"], MONDAY)).toEqual([`room-booking|r1|${MONDAY}`, `room-booking|r2|${MONDAY}`]);
  });

  it("labels urgent and finished bookings", () => {
    expect(statusLabel({ status: "CONFIRMED", priority: "URGENT", past: false })).toBe("Urgent - Confirmed");
    expect(statusLabel({ status: "CONFIRMED", priority: "REGULAR", past: true })).toBe("Completed");
    expect(statusLabel({ status: "AWAITING_APPROVAL", priority: "URGENT", past: false })).toBe("Awaiting approval");
  });
});

describe("weekly repeats", () => {
  it("lists the same weekday each week after the first date, up to the end date", () => {
    expect(weeklyDates("2026-10-12", "2026-10-26")).toEqual(["2026-10-19", "2026-10-26"]);
    expect(weeklyDates("2026-10-12", "2026-10-25")).toEqual(["2026-10-19"]);
    expect(weeklyDates("2026-10-12", "2026-10-18")).toEqual([]);
    expect(weeklyDates("2026-12-28", "2027-01-11")).toEqual(["2027-01-04", "2027-01-11"]);
  });
});

describe("urgent override: choices, protected classes, and sensible times", () => {
  it("offers the best placements first and online last, using the first by default", () => {
    const [item] = planBooking(snapshot(), req({ priority: "URGENT" }), settings).items;
    const keys = item.alternatives!.map((a) => a.key);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.at(-1)).toBe("ONLINE");
    expect(new Set(keys).size).toBe(keys.length);
    expect(item.chosen).toBe(keys[0]);
    expect(item.alternatives![0]).toMatchObject({ kind: "MOVED", placement: { roomId: "r2", startMin: 480 } });
  });

  it("applies the placement the person chose for a class", () => {
    const first = planBooking(snapshot(), req({ priority: "URGENT" }), settings).items[0];
    const other = first.alternatives![1];
    const plan = planBooking(snapshot(), req({ priority: "URGENT" }), settings, { choices: { c1: other.key } });
    expect(plan.items[0].chosen).toBe(other.key);
    expect(plan.items[0].after).toEqual(other.placement);
    const online = planBooking(snapshot(), req({ priority: "URGENT" }), settings, { choices: { c1: "ONLINE" } });
    expect(online.items[0]).toMatchObject({ kind: "ONLINE", after: { roomId: "" } });
    // A stale choice that is no longer offered falls back to the best placement.
    expect(planBooking(snapshot(), req({ priority: "URGENT" }), settings, { choices: { c1: "gone" } }).items[0].chosen).toBe(first.chosen);
  });

  it("does not displace a class marked do not move unless the Registrar confirms", () => {
    const snap = snapshot();
    snap.classInfo.set("c1", { departmentId: "d1", fixed: true });
    const blocked = planBooking(snap, req({ priority: "URGENT" }), settings);
    expect(blocked.blockers[0]).toMatch(/do not move/);
    expect(blocked.overridable).toBe(false);
    const registrar = planBooking(snap, req({ priority: "URGENT" }), settings, { canMoveFixed: true });
    expect(registrar.blockers).toHaveLength(0);
    expect(registrar.items).toHaveLength(1);
    expect(registrar.notes.join(" ")).toMatch(/1 protected class/);
  });

  it("moves a class to a time after lunch rather than into it when both are the same distance away", () => {
    // r2 is held 8:00 to 11:30, so its first free starts are 12:00 and 12:30 (over lunch) and then 1:00 PM.
    const snap = snapshot({ rooms: [room("r1"), room("r2")], bookings: [booking("b2", { roomId: "r2", startMin: 480, endMin: 690 })] });
    const [item] = planBooking(snap, req({ priority: "URGENT" }), settings).items;
    expect(item.after).toMatchObject({ roomId: "r2", startMin: 780 });
  });
});
