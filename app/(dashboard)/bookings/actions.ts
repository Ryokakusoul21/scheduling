"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getScope } from "@/lib/permissions/scope";
import { MAX_REPEATS, PRIORITIES, URGENT_REASONS, weeklyDates } from "@/lib/bookings/plan";
import {
  bookingTimeline, cancelBooking, createBooking, editBookingDetails, respondAcknowledgement, reviewOverride, searchRooms, shortenBooking,
  type RoomOption,
} from "@/lib/bookings/service";
import { roomAvailability, type AvailabilityBlock } from "@/lib/bookings/availability";
import type { PlanItem } from "@/lib/occupancy/adjust";
import type { DisplacedBooking } from "@/lib/bookings/plan";

export type { RoomOption };
type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ROOM_TYPES = ["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"] as const;
const REASONS = URGENT_REASONS.map((r) => r.value) as [string, ...string[]];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const slotSchema = z
  .object({
    date,
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    attendees: z.number().int().min(1, "Enter the number of attendees").max(1000),
    purpose: z.string().trim().min(3, "Describe the purpose in at least 3 characters").max(200),
    priority: z.enum(PRIORITIES).default("REGULAR"),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time" });

// A chosen room replaces the room type filter: the result is that one room, free or not.
const searchSchema = slotSchema.and(z.object({ roomType: z.enum(ROOM_TYPES).optional(), roomId: z.string().min(1).optional() }));
const bookSchema = slotSchema.and(z.object({
  roomId: z.string().min(1),
  urgentReason: z.enum(REASONS).optional().nullable(),
  reasonDetail: z.string().trim().max(300).optional().nullable(),
  repeatUntil: date.optional().nullable(),
  // The placement picked for each displaced class (class id to placement key).
  choices: z.record(z.string(), z.string().max(120)).optional(),
}));

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function revalidate() {
  for (const p of ["/bookings", "/calendar", "/adjustments", "/scheduler", "/analytics"]) revalidatePath(p);
}

type Caps = Awaited<ReturnType<typeof searchRooms>>["caps"];

/** Rates every room the person may use for the slot (overrides also see other departments' rooms). */
export async function findRoomsAction(input: z.input<typeof searchSchema>): Promise<Result<{ options: RoomOption[]; caps: Caps }>> {
  const scope = await getScope();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the booking details." };
  if (parsed.data.date < today()) return { ok: false, error: "Bookings must be for today or a later date." };
  return { ok: true, data: await searchRooms(scope, parsed.data) };
}

/** Books the room; overrides displace classes and lower bookings, or wait for the owning department's approval. */
export async function bookRoomAction(input: z.input<typeof bookSchema>): Promise<Result<{ bookingId: string; status: string; items: PlanItem[]; displaced: DisplacedBooking[]; repeat?: { booked: number; skipped: { date: string; reason: string }[] } }>> {
  const scope = await getScope();
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the booking details." };
  if (parsed.data.date < today()) return { ok: false, error: "Bookings must be for today or a later date." };
  const { repeatUntil, ...slot } = parsed.data;
  const later = repeatUntil ? weeklyDates(slot.date, repeatUntil) : [];
  if (repeatUntil && slot.priority !== "REGULAR") return { ok: false, error: "Only Regular bookings can repeat weekly." };
  if (repeatUntil && later.length === 0) return { ok: false, error: "Choose a repeat end date at least one week after the first booking." };
  if (later.length > MAX_REPEATS) return { ok: false, error: `A repeat can run for up to ${MAX_REPEATS} more weeks.` };
  const result = await createBooking(scope, { ...slot, urgentReason: slot.urgentReason as never });
  if (!result.ok) return result;
  // Each later date is booked on its own as a Regular booking, so a taken room is skipped and never displaces anything.
  const skipped: { date: string; reason: string }[] = [];
  let booked = 0;
  for (const d of later) {
    const again = await createBooking(scope, { ...slot, date: d, urgentReason: null, choices: undefined });
    if (again.ok) booked++;
    else skipped.push({ date: d, reason: again.error });
  }
  revalidate();
  const { bookingId, status, items, displaced } = result;
  return { ok: true, data: { bookingId, status, items, displaced, ...(repeatUntil ? { repeat: { booked, skipped } } : {}) } };
}

/** Cancels a booking; `restore` puts displaced classes and bookings back when their slots are still free. */
export async function cancelBookingAction(id: string, restore = true): Promise<Result> {
  const scope = await getScope();
  const result = await cancelBooking(scope, z.string().min(1).parse(id), restore);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: undefined };
}

export async function shortenBookingAction(input: { id: string; startMin: number; endMin: number; restore: boolean }): Promise<Result<{ restored: number }>> {
  const scope = await getScope();
  const parsed = z.object({ id: z.string().min(1), startMin: z.number().int().min(0), endMin: z.number().int().max(24 * 60), restore: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid time." };
  const result = await shortenBooking(scope, parsed.data.id, parsed.data.startMin, parsed.data.endMin, parsed.data.restore);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: { restored: result.restored } };
}

export async function editBookingAction(input: { id: string; purpose: string; attendees: number }): Promise<Result> {
  const scope = await getScope();
  const parsed = z.object({ id: z.string().min(1), purpose: z.string().trim().min(3, "Describe the purpose in at least 3 characters").max(200), attendees: z.number().int().min(1).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const result = await editBookingDetails(scope, parsed.data.id, parsed.data.purpose, parsed.data.attendees);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: undefined };
}

/** The owning department approves or rejects an urgent override of its room. */
export async function reviewOverrideAction(id: string, approve: boolean, note?: string): Promise<Result> {
  const scope = await getScope();
  const result = await reviewOverride(scope, z.string().min(1).parse(id), approve, note?.slice(0, 500));
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: undefined };
}

export async function respondAcknowledgementAction(id: string, status: "ACKNOWLEDGED" | "ALTERNATIVE_REQUESTED", note?: string): Promise<Result> {
  const scope = await getScope();
  const result = await respondAcknowledgement(scope, z.string().min(1).parse(id), z.enum(["ACKNOWLEDGED", "ALTERNATIVE_REQUESTED"]).parse(status), note?.slice(0, 500));
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: undefined };
}

export async function bookingTimelineAction(id: string): Promise<Result<{ id: string; at: string; who: string; action: string }[]>> {
  const scope = await getScope();
  return { ok: true, data: await bookingTimeline(scope, z.string().min(1).parse(id)) };
}

/** Occupancy grid for one day or a six-day week. */
export async function availabilityAction(from: string, days: 1 | 6): Promise<Result<{ rooms: { id: string; name: string; capacity: number; building: string; closed: boolean }[]; blocks: AvailabilityBlock[] }>> {
  const scope = await getScope();
  const parsed = z.object({ from: date, days: z.union([z.literal(1), z.literal(6)]) }).safeParse({ from, days });
  if (!parsed.success) return { ok: false, error: "Choose a date." };
  return { ok: true, data: await roomAvailability(scope, parsed.data.from, parsed.data.days) };
}
