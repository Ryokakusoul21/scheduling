"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDots, DoorOpen, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { isOverride, type Priority } from "@/lib/bookings/plan";
import { bookRoomAction, cancelBookingAction, findRoomsAction, reviewOverrideAction, type RoomOption } from "./actions";
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
export function BookingWorkspace({ readOnly = false, bookings, acknowledgements, showBookedBy, defaults, clock, priorities, roomChoices, caps: initialCaps, hours, openId }: {
  readOnly?: boolean;
  bookings: BookingRow[];
  acknowledgements: AckRow[];
  showBookedBy: boolean;
  defaults: { date: string; startMin: number };
  clock: { today: string; nowMin: number };
  priorities: readonly Priority[];
  roomChoices: { value: string; label: string }[];
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
  const [panel, setPanel] = useState<"find" | "availability">("find");

  function announce(ok: boolean, message: string) {
    setAnnouncement(message);
    if (ok) toast.success(message, { duration: 8000 });
    else toast.error(message, { duration: 12000 });
  }

  function search(r: SearchRequest) {
    setRequest(r);
    setOptions(null);
    startSearch(async () => {
      const res = await findRoomsAction({ ...r, roomType: (r.roomType || undefined) as never, roomId: r.roomId || undefined });
      if (!res.ok) return announce(false, res.error);
      setOptions(res.data.options);
      if (res.data.caps) setCaps(res.data.caps);
    });
  }

  /** Refills the form (duplicate, or switch to an urgent override) and brings it into view. */
  function prefill(values: Partial<SearchRequest>) {
    setPanel("find");
    setSeed((s) => ({ key: s.key + 1, values }));
    setOptions(null);
    setTimeout(() => document.getElementById(values.priority && isOverride(values.priority) ? "b-urgentReason" : "b-purpose")?.focus(), 50);
  }

  function book(option: RoomOption, choices: Record<string, string> = {}) {
    if (!request) return;
    startTransition(async () => {
      const res = await bookRoomAction({ ...request, roomId: option.roomId, urgentReason: request.urgentReason || null, reasonDetail: request.reasonDetail || null, repeatUntil: request.repeatUntil || null, choices });
      setConfirm(null);
      if (!res.ok) return announce(false, res.error);
      const { bookingId: id, status, items, displaced, repeat } = res.data;
      if (repeat) toast.message(`${repeat.booked} weekly repeat${repeat.booked === 1 ? "" : "s"} requested${repeat.skipped.length ? `; ${repeat.skipped.length} skipped: ${repeat.skipped.map((x) => `${x.date} (${x.reason.split(". ")[0].replace(/\.$/, "")})`).join(", ")}` : ""}.`, { duration: 20000 });
      if (status === "AWAITING_APPROVAL") announce(true, `Request sent. ${option.needsApproval} must approve before the booking is confirmed.`);
      else announce(true, `${option.name} booked.${items.length ? ` ${items.length} class(es) moved.` : ""}${displaced.length ? ` ${displaced.length} booking(s) moved.` : ""}${items.length + displaced.length ? " Everyone affected was notified." : ""}`);
      setOptions(null);
      setHighlightId(id);
      router.refresh();
      // Wait for the refreshed list, then bring the new booking into view.
      setTimeout(() => document.getElementById(`booking-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
      setTimeout(() => setHighlightId((h) => (h === id ? null : h)), HIGHLIGHT_MS);
    });
  }

  /** Approves an urgent override of a room this person owns; the planned moves are applied and everyone is notified. */
  function approve(id: string) {
    startTransition(async () => {
      const res = await reviewOverrideAction(id, true);
      if (!res.ok) return announce(false, res.error);
      announce(true, "Booking approved and applied. Affected classes were moved and everyone was notified.");
      router.refresh();
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

  const duplicate = (b: BookingRow) => prefill({ purpose: b.purpose, attendees: b.attendees, date: b.date < clock.today ? clock.today : b.date, startMin: b.startMin, endMin: b.endMin, roomId: b.roomId, priority: priorities.includes(b.priority) ? b.priority : "REGULAR" });
  const active = bookings.find((b) => b.id === detail) ?? null;

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <AcknowledgementPanel items={acknowledgements} />

      {!readOnly && <><div role="tablist" aria-label="Room booking" className="grid w-full max-w-md grid-cols-2 gap-1 rounded-2xl bg-muted p-1.5">
        {([["find", "Find a room", MagnifyingGlass], ["availability", "Room availability", CalendarDots]] as const).map(([value, label, TabIcon]) => (
          <button key={value} type="button" role="tab" aria-selected={panel === value} onClick={() => setPanel(value)}
            className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              panel === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <TabIcon className="size-4.5" weight={panel === value ? "fill" : "regular"} /> {label}
          </button>
        ))}
      </div>

      {panel === "find" ? (
        <div className="grid gap-6 xl:grid-cols-[28rem_minmax(0,1fr)] xl:items-start">
          <section aria-labelledby="find-title" className="max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-sm xl:max-w-none">
            <header className="flex items-center gap-3 border-b bg-primary/5 px-5 py-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><DoorOpen className="size-5" weight="duotone" aria-hidden /></span>
              <div>
                <h2 id="find-title" className="scroll-mt-4 text-base leading-tight font-semibold">Find or book a room</h2>
                <p className="text-xs text-muted-foreground">Describe what you need and matching rooms are listed.</p>
              </div>
            </header>
            <div className="space-y-4 p-5">
            <SearchForm key={seed.key} initial={seed.values} defaults={defaults} clock={clock} pending={searching} onSearch={search} priorities={priorities} hours={hours} roomChoices={roomChoices} />
            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Rooms open {hours.buffer ? `with ${hours.buffer} minutes kept free between bookings` : "without a buffer between bookings"}. Holidays and no-class days need an urgent booking.</p>
            </div>
          </section>

          <div className="min-w-0">
            <RoomResults options={options} caps={caps} request={request} pending={searching} canOverride={priorities.some(isOverride)} onBook={setConfirm} onOverride={() => request && prefill({ ...request, priority: priorities.filter(isOverride)[0] })} onAnyRoom={() => request && prefill({ ...request, roomId: "" })} />
            {!options && !searching && (
              <div className="hidden min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-card/50 p-10 text-center xl:flex">
                <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><DoorOpen className="size-8" weight="duotone" aria-hidden /></span>
                <div className="space-y-1">
                  <p className="text-base font-semibold">No search yet</p>
                  <p className="max-w-xs text-sm text-muted-foreground">Fill in the details and press the button. Matching rooms appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <AvailabilityGrid today={clock.today} hours={hours} onPick={(slot) => { prefill({ ...slot, priority: "REGULAR" }); setTimeout(() => document.getElementById("find-title")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} />
      )}

      </>}

      <BookingsList readOnly={readOnly} bookings={bookings} showBookedBy={showBookedBy} highlightId={highlightId} pending={pending} onCancel={cancel} onDuplicate={duplicate} onOpen={(b) => setDetail(b.id)} onApprove={approve} onFindRoom={() => { setPanel("find"); setTimeout(() => { document.getElementById("find-title")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("b-purpose")?.focus(); }, 60); }} />

      <BookDialog option={confirm} request={request} pending={pending} onConfirm={(choices) => confirm && book(confirm, choices)} onClose={() => setConfirm(null)} />
      <BookingDrawer readOnly={readOnly} booking={active} onClose={() => setDetail(null)} onCancel={cancel} onDuplicate={duplicate} pending={pending} />
    </div>
  );
}
