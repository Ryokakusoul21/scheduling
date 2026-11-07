"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarBlank, CaretDown, CheckCircle, Copy, DotsThree, Export, Eye, FilePdf, FileXls, FunnelSimple, PencilSimple, XCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PrintHeader } from "@/components/ux/export-buttons";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { downloadText, toCsv } from "@/lib/export/csv";
import { formatRange, formatTime } from "@/lib/scheduler/timetable";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/bookings/plan";
import { cn } from "@/lib/utils";
import { editBookingAction, shortenBookingAction } from "./actions";
import type { BookingRow } from "./booking-workspace";

type Tab = "upcoming" | "past";
const classes = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;

/** Red for Urgent and Critical, amber for High; Regular shows no badge. */
export function PriorityBadge({ priority }: { priority: BookingRow["priority"] }) {
  if (priority === "REGULAR") return null;
  return <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", priority === "HIGH" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger")}>{PRIORITY_LABEL[priority]}</span>;
}

export function StatusBadge({ b }: { b: BookingRow }) {
  const tone = ["CANCELLED", "REJECTED", "NO_SHOW"].includes(b.status) ? "border text-muted-foreground" : b.status === "AWAITING_APPROVAL" || b.status === "PENDING" ? "bg-warning/10 text-warning" : b.past ? "bg-muted text-muted-foreground" : "bg-success/10 text-success";
  return <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{b.statusLabel}</span>;
}

const COLUMNS = [
  { header: "Date", value: (r: BookingRow) => r.dateLabel },
  { header: "Time", value: (r: BookingRow) => formatRange(r.startMin, r.endMin) },
  { header: "Room", value: (r: BookingRow) => r.roomName },
  { header: "Purpose", value: (r: BookingRow) => r.purpose },
  { header: "Attendees", value: (r: BookingRow) => r.attendees },
  { header: "Booked by", value: (r: BookingRow) => r.bookedBy },
  { header: "Priority", value: (r: BookingRow) => PRIORITY_LABEL[r.priority] },
  { header: "Reason", value: (r: BookingRow) => [r.reason, r.reasonDetail].filter(Boolean).join(": ") },
  { header: "Status", value: (r: BookingRow) => r.statusLabel },
  { header: "Classes moved", value: (r: BookingRow) => r.moves.length },
  { header: "Moved classes", value: (r: BookingRow) => r.moves.map((m) => `${m.label} to ${m.to}`).join("; ") },
];
const exportRows = (rows: BookingRow[], name = "room-bookings.csv") => downloadText(name, toCsv(rows, COLUMNS));

// Same columns on every row; below lg each row stacks into a card.
const ROW_GRID = "grid gap-2 lg:items-start lg:gap-4";

/** Upcoming and past bookings with filters, priority and status, moved-class details, and row actions. */
export function BookingsList({ bookings, showBookedBy, highlightId, pending, onCancel, onDuplicate, onOpen, onApprove, onFindRoom }: {
  bookings: BookingRow[];
  showBookedBy: boolean;
  highlightId: string | null;
  pending: boolean;
  onCancel: (id: string, restore: boolean) => void;
  onDuplicate: (b: BookingRow) => void;
  onOpen: (b: BookingRow) => void;
  onApprove: (id: string) => void;
  onFindRoom: () => void;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancelling, setCancelling] = useState<BookingRow | null>(null);
  const [restore, setRestore] = useState(true);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: "", room: "", priority: "", from: "", to: "" });
  const set = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => bookings.filter((b) =>
    (!filters.status || b.statusLabel === filters.status) && (!filters.room || b.roomId === filters.room) && (!filters.priority || b.priority === filters.priority) &&
    (!filters.from || b.date >= filters.from) && (!filters.to || b.date <= filters.to)), [bookings, filters]);
  const key = (b: BookingRow) => `${b.date}-${String(b.startMin).padStart(4, "0")}`;
  const upcoming = filtered.filter((b) => !b.past).sort((a, b) => key(a).localeCompare(key(b)));
  const past = filtered.filter((b) => b.past).sort((a, b) => key(b).localeCompare(key(a)));
  const rows = tab === "upcoming" ? upcoming : past;
  const statuses = [...new Set(bookings.map((b) => b.statusLabel))].sort();
  const rooms = [...new Map(bookings.map((b) => [b.roomId, b.roomName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const columns = cn(ROW_GRID, showBookedBy ? "lg:grid-cols-[12rem_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_8rem_8rem_2.5rem]" : "lg:grid-cols-[12rem_minmax(0,0.8fr)_minmax(0,1.4fr)_8rem_8rem_2.5rem]");
  const anyFilter = Object.values(filters).some(Boolean);
  const waiting = bookings.filter((b) => b.canApprove);

  return (
    <section aria-labelledby="bookings-title" className="print-area space-y-4 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bookings-title" className="text-base font-semibold">{showBookedBy ? "All bookings" : "My bookings"}</h2>
        <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" className="h-9" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          <FunnelSimple className="size-4" /> Filters
          {anyFilter && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{Object.values(filters).filter(Boolean).length}</span>}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="h-9 print:hidden" />}>
            <Export className="size-4" /> Export <CaretDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={filtered.length === 0} onClick={() => exportRows(filtered)}><FileXls className="size-4" /> Spreadsheet</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}><FilePdf className="size-4" /> PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>
      <PrintHeader title="Room Bookings" subtitle={tab === "upcoming" ? "Upcoming" : "Past"} />

      {waiting.length > 0 && (
        <section aria-label="Urgent overrides awaiting your approval" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 print:hidden">
          <p className="text-sm font-semibold">{waiting.length} urgent {waiting.length === 1 ? "override awaits" : "overrides await"} your approval</p>
          <ul className="space-y-1.5">
            {waiting.slice(0, 3).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium">{b.purpose}</span> · {b.roomName}, {b.dateLabel}, {formatRange(b.startMin, b.endMin)} · {b.bookedBy}{b.reason && ` · ${b.reason}`}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onOpen(b)}>Review</Button>
                  <Button size="sm" disabled={pending} onClick={() => onApprove(b.id)}><CheckCircle className="size-4" /> Approve</Button>
                </span>
              </li>
            ))}
          </ul>
          {waiting.length > 3 && <p className="text-xs text-muted-foreground">{waiting.length - 3} more are in the list below.</p>}
        </section>
      )}

      {showFilters && (
      <div className="flex flex-wrap items-end gap-2 print:hidden" aria-label="Filter bookings">
        <NativeSelect aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value)} options={[{ value: "", label: "Any status" }, ...statuses.map((s) => ({ value: s, label: s }))]} className="h-9 w-40" />
        <NativeSelect aria-label="Room" value={filters.room} onChange={(e) => set("room", e.target.value)} options={[{ value: "", label: "Any room" }, ...rooms.map(([value, label]) => ({ value, label }))]} className="h-9 w-40" />
        <NativeSelect aria-label="Priority" value={filters.priority} onChange={(e) => set("priority", e.target.value)} options={[{ value: "", label: "Any priority" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]} className="h-9 w-36" />
        <label className="text-xs text-muted-foreground">From <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className="h-9 w-40" /></label>
        <label className="text-xs text-muted-foreground">To <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className="h-9 w-40" /></label>
        {anyFilter && <Button variant="ghost" size="sm" onClick={() => setFilters({ status: "", room: "", priority: "", from: "", to: "" })}>Clear filters</Button>}
      </div>
      )}

      <div role="tablist" aria-label="Bookings" className="flex gap-1 border-b print:hidden">
        {([["upcoming", "Upcoming", upcoming.length], ["past", "Past", past.length]] as const).map(([value, label, count]) => (
          <button key={value} id={`bookings-tab-${value}`} role="tab" type="button" aria-selected={tab === value} aria-controls="bookings-panel" onClick={() => setTab(value)}
            className={cn("-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150", tab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
            <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", tab === value ? "bg-primary/10 text-primary" : "bg-muted")}>{count}</span>
          </button>
        ))}
      </div>

      <div id="bookings-panel" role="tabpanel" aria-labelledby={`bookings-tab-${tab}`}>
        {rows.length === 0 ? (
          anyFilter ? <EmptyState icon={CalendarBlank} title="No bookings match these filters" className="py-8" />
            : tab === "upcoming" ? <EmptyState icon={CalendarBlank} title="No upcoming bookings" description="Rooms you book appear here." action={<Button onClick={onFindRoom}>Book a room</Button>} className="py-8" />
              : <EmptyState icon={CalendarBlank} title="No past bookings" description="Bookings from the last 30 days appear here." className="py-8" />
        ) : (
          <>
            <div className={cn(columns, "hidden border-b px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid")} aria-hidden>
              <span>Date and time</span><span>Room</span><span>Purpose</span>{showBookedBy && <span>Booked by</span>}<span>Classes moved</span><span>Status</span><span />
            </div>
            <ul className="space-y-3 lg:space-y-0 lg:divide-y">
              {rows.map((b) => (
                <li key={b.id} id={`booking-${b.id}`}
                  className={cn(columns, "scroll-mt-24 rounded-xl border p-4 transition-colors duration-500 lg:rounded-none lg:border-0 lg:px-3 lg:py-3", highlightId === b.id && "bg-success/10 ring-2 ring-success/50 lg:rounded-lg", ["CANCELLED", "REJECTED"].includes(b.status) && "text-muted-foreground")}>
                  <div>
                    <p className="font-medium">{b.dateLabel}</p>
                    <p className="text-[13px] text-muted-foreground">{formatRange(b.startMin, b.endMin)}{b.relative && b.status === "CONFIRMED" && <span className="ml-2 font-medium text-info">{b.relative}</span>}</p>
                  </div>
                  <p>{b.roomName}</p>
                  <div className="min-w-0 space-y-1">
                    <p className="break-words">{b.purpose}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground"><PriorityBadge priority={b.priority} />{b.attendees} attendees</div>
                  </div>
                  {showBookedBy && <p className="text-[13px]">{b.bookedBy}</p>}
                  <div>
                    {b.moves.length === 0 ? <span className="text-[13px] text-muted-foreground">No classes moved</span> : (
                      <button type="button" onClick={() => onOpen(b)} className="flex items-center gap-1 rounded-sm text-[13px] font-medium text-brand-link">{classes(b.moves.length)} moved</button>
                    )}
                  </div>
                  <div className="space-y-1"><StatusBadge b={b} />{b.awaitingDepartment && <p className="text-[11px] text-muted-foreground">Awaiting {b.awaitingDepartment}</p>}</div>
                  <div className="print:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${b.purpose} on ${b.dateLabel}`} />}>
                        <DotsThree className="size-5" weight="bold" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(b)}><Eye className="size-4" /> Details</DropdownMenuItem>
                        {b.canEdit && <DropdownMenuItem onClick={() => setEditing(b)}><PencilSimple className="size-4" /> Edit</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => onDuplicate(b)}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportRows([b], `room-booking-${b.date}.csv`)}><FileXls className="size-4" /> Export</DropdownMenuItem>
                        {b.canCancel && <DropdownMenuItem variant="destructive" onClick={() => { setRestore(true); setCancelling(b); }}><XCircle className="size-4" /> Cancel booking</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the booking for &quot;{cancelling?.purpose}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling?.roomName}, {cancelling?.dateLabel}, {cancelling && formatRange(cancelling.startMin, cancelling.endMin)}.{" "}
              {cancelling && cancelling.moves.length + cancelling.displaced.length === 0 && "Nothing was moved for this booking, so nothing else changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelling && cancelling.moves.length + cancelling.displaced.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={restore} onCheckedChange={(on) => setRestore(!!on)} className="mt-0.5" />
              Restore the {cancelling.moves.length ? classes(cancelling.moves.length) : ""}{cancelling.moves.length && cancelling.displaced.length ? " and " : ""}{cancelling.displaced.length ? `${cancelling.displaced.length} booking(s)` : ""} it displaced to their original room and time, and notify everyone again.
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => { if (cancelling) onCancel(cancelling.id, restore); setCancelling(null); }}>Cancel booking</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing && <EditDialog booking={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Purpose and attendees, or a shorter time; shortening can restore displaced classes that no longer overlap. */
function EditDialog({ booking: b, onClose }: { booking: BookingRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [purpose, setPurpose] = useState(b.purpose);
  const [attendees, setAttendees] = useState(String(b.attendees));
  const [startMin, setStartMin] = useState(String(b.startMin));
  const [endMin, setEndMin] = useState(String(b.endMin));
  const [restore, setRestore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Half-hour steps inside the current booking, since an edit can only shorten it.
  const times = Array.from({ length: Math.floor((b.endMin - b.startMin) / 30) + 1 }, (_, i) => b.startMin + i * 30).map((m) => ({ value: String(m), label: formatTime(m) }));
  const shortened = Number(startMin) !== b.startMin || Number(endMin) !== b.endMin;
  const detailsChanged = purpose.trim() !== b.purpose || Number(attendees) !== b.attendees;

  function save() {
    setError(null);
    if (purpose.trim().length < 3) return setError("Describe the purpose in at least 3 characters.");
    if (!(Number(attendees) >= 1)) return setError("Attendees must be at least 1.");
    if (Number(endMin) <= Number(startMin)) return setError("End must be after Start.");
    start(async () => {
      if (detailsChanged) {
        const r = await editBookingAction({ id: b.id, purpose: purpose.trim(), attendees: Number(attendees) });
        if (!r.ok) return setError(r.error);
      }
      if (shortened) {
        const r = await shortenBookingAction({ id: b.id, startMin: Number(startMin), endMin: Number(endMin), restore });
        if (!r.ok) return setError(r.error);
        toast.success(`Booking shortened${r.data.restored ? `; ${r.data.restored} class(es) restored and notified` : ""}.`);
      } else toast.success("Booking updated.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>{b.roomName}, {b.dateLabel}. To extend or move the booking, cancel it and book again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Purpose<Input value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Attendees<Input type="number" min={1} value={attendees} onChange={(e) => setAttendees(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-medium">Start<NativeSelect value={startMin} onChange={(e) => setStartMin(e.target.value)} options={times} /></label>
            <label className="space-y-1 text-sm font-medium">End<NativeSelect value={endMin} onChange={(e) => setEndMin(e.target.value)} options={times} /></label>
          </div>
          {shortened && b.moves.length + b.displaced.length > 0 && (
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={restore} onCheckedChange={(on) => setRestore(!!on)} className="mt-0.5" /> Restore displaced classes and bookings that no longer overlap, and notify them.</label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button disabled={pending || (!shortened && !detailsChanged)} onClick={save}>{pending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
