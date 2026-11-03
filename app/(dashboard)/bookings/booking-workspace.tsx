"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isOverride, type Priority } from "@/lib/bookings/plan";
import { bookRoomAction, cancelBookingAction, findRoomsAction, type RoomOption } from "./actions";
import { BookDialog } from "./book-dialog";
import { BookingsList } from "./bookings-list";
import { BookingDrawer } from "./booking-drawer";
import { AcknowledgementPanel } from "./acknowledgements";
import { AvailabilityGrid } from "./availability-grid";
import { RoomResults, type Caps } from "./room-results";
import { SearchForm, type SearchRequest } from "./search-form";

export interface MoveRow { label: string; faculty: string; from: string; to: string; kind: string; reason: string }

export interface BookingRow {
  id: string;
  roomId: string;
  date: string;
  dateLabel: string;
  /** "Today", "Tomorrow", or "in 4 days"; null once the booking is over. */
  relative: string | null;
  past: boolean;
  startMin: number;
  endMin: number;
  roomName: string;
  purpose: string;
  attendees: number;
  status: string;
  statusLabel: string;
  priority: Priority;
  reason: string | null;
  reasonDetail: string | null;
  reviewNote: string | null;
  awaitingDepartment: string | null;
  canApprove: boolean;
  bookedBy: string;
  mine: boolean;
  canCancel: boolean;
  canEdit: boolean;
  moves: MoveRow[];
  displaced: { purpose: string; outcome: string }[];
  acknowledgements: { faculty: string; status: string; note: string | null }[];
}

export interface AckRow { id: string; status: string; note: string | null; purpose: string; room: string; when: string; bookedBy: string }

const HIGHLIGHT_MS = 4000;

/** Find a room (optionally as an urgent override), confirm the impact, then manage bookings below. */
export function BookingWorkspace({ bookings, acknowledgements, showBookedBy, defaults, clock, priorities, caps: initialCaps, hours, openId }: {
  bookings: BookingRow[];
  acknowledgements: AckRow[];
  showBookedBy: boolean;
  defaults: { date: string; startMin: number };
  clock: { today: string; nowMin: number };
  priorities: readonly Priority[];
  caps: Caps;
  hours: { openMin: number; closeMin: number; buffer: number };
  openId: string | null;
}) {
  const router = useRouter();
  const [searching, startSearch] = useTransition();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [options, setOptions] = useState<RoomOption[] | null>(null);
  const [caps, setCaps] = useState<Caps>(initialCaps);
  const [confirm, setConfirm] = useState<RoomOption | null>(null);
  const [seed, setSeed] = useState<{ key: number; values: Partial<SearchRequest> | null }>({ key: 0, values: null });
  const [detail, setDetail] = useState<string | null>(openId);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function announce(ok: boolean, message: string) {
    setAnnouncement(message);
    if (ok) toast.success(message, { duration: 8000 });
    else toast.error(message, { duration: 12000 });
  }

  function search(r: SearchRequest) {
    setRequest(r);
    setOptions(null);
    startSearch(async () => {
      const res = await findRoomsAction({ ...r, roomType: (r.roomType || undefined) as never });
      if (!res.ok) return announce(false, res.error);
      setOptions(res.data.options);
      if (res.data.caps) setCaps(res.data.caps);
    });
  }

  /** Refills the form (duplicate, or switch to an urgent override) and brings it into view. */
  function prefill(values: Partial<SearchRequest>) {
    setSeed((s) => ({ key: s.key + 1, values }));
    setOptions(null);
    setTimeout(() => document.getElementById(values.priority && isOverride(values.priority) ? "b-urgentReason" : "b-purpose")?.focus(), 50);
  }

  function book(option: RoomOption) {
    if (!request) return;
    startTransition(async () => {
      const res = await bookRoomAction({ ...request, roomId: option.roomId, urgentReason: request.urgentReason || null, reasonDetail: request.reasonDetail || null });
      setConfirm(null);
      if (!res.ok) return announce(false, res.error);
      const { bookingId: id, status, items, displaced } = res.data;
      if (status === "AWAITING_APPROVAL") announce(true, `Request sent. ${option.needsApproval} must approve before ${option.name} is yours.`);
      else announce(true, `${option.name} booked.${items.length ? ` ${items.length} class(es) moved.` : ""}${displaced.length ? ` ${displaced.length} booking(s) moved.` : ""}${items.length + displaced.length ? " Everyone affected was notified." : ""}`);
      setOptions(null);
      setHighlightId(id);
      router.refresh();
      // Wait for the refreshed list, then bring the new booking into view.
      setTimeout(() => document.getElementById(`booking-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
      setTimeout(() => setHighlightId((h) => (h === id ? null : h)), HIGHLIGHT_MS);
    });
  }

  function cancel(id: string, restore: boolean) {
    startTransition(async () => {
      const res = await cancelBookingAction(id, restore);
      if (!res.ok) {
        setAnnouncement(res.error);
        // Original slots can be taken since; offer to cancel the booking but leave the classes moved.
        toast.error(res.error, restore ? { action: { label: "Cancel booking only", onClick: () => cancel(id, false) }, duration: 12000 } : undefined);
        return;
      }
      announce(true, restore ? "Booking cancelled. Displaced classes and bookings are back where they were, and everyone was notified." : "Booking cancelled; moved classes stay where they are.");
      router.refresh();
    });
  }

  const duplicate = (b: BookingRow) => prefill({ purpose: b.purpose, attendees: b.attendees, date: b.date < clock.today ? clock.today : b.date, startMin: b.startMin, endMin: b.endMin, priority: priorities.includes(b.priority) ? b.priority : "REGULAR" });
  const active = bookings.find((b) => b.id === detail) ?? null;

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <AcknowledgementPanel items={acknowledgements} />

      <section aria-labelledby="find-title" className="space-y-4 rounded-xl border bg-card p-5">
        <h2 id="find-title" className="text-base font-semibold">Find a room</h2>
        <SearchForm key={seed.key} initial={seed.values} defaults={defaults} clock={clock} pending={searching} onSearch={search} priorities={priorities} hours={hours} />
        <p className="text-xs text-muted-foreground">Rooms open {hours.buffer ? `with ${hours.buffer} minutes kept free between bookings` : "without a buffer between bookings"}. Holidays and no-class days need an urgent booking.</p>
      </section>

      <RoomResults options={options} caps={caps} request={request} pending={searching} canOverride={priorities.some(isOverride)} onBook={setConfirm} onOverride={() => request && prefill({ ...request, priority: priorities.filter(isOverride)[0] })} />

      <BookingsList bookings={bookings} showBookedBy={showBookedBy} highlightId={highlightId} pending={pending} onCancel={cancel} onDuplicate={duplicate} onOpen={(b) => setDetail(b.id)} onFindRoom={() => document.getElementById("b-purpose")?.focus()} />

      <AvailabilityGrid today={clock.today} hours={hours} />

      <BookDialog option={confirm} request={request} pending={pending} onConfirm={() => confirm && book(confirm)} onClose={() => setConfirm(null)} />
      <BookingDrawer booking={active} onClose={() => setDetail(null)} onCancel={cancel} onDuplicate={duplicate} pending={pending} />
    </div>
  );
}
