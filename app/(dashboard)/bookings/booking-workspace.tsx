"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, MagnifyingGlass, CheckCircle, ArrowCounterClockwise } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ActionButton } from "@/components/ux/action-button";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { ChangeList } from "@/components/scheduler/change-list";
import { DEFAULT_GRID, formatRange, timeOptions } from "@/lib/scheduler/timetable";
import type { PlanItem } from "@/lib/occupancy/adjust";
import { bookRoomAction, cancelBookingAction, findRoomsAction, type RoomOption } from "./actions";

export interface BookingRow {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  roomName: string;
  purpose: string;
  attendees: number;
  status: string;
  bookedBy: string;
  canCancel: boolean;
  moves: { label: string; reason: string }[];
}

const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: 21 * 60 }).map((t) => ({ value: String(t.value), label: t.label }));
const ROOM_TYPES = [
  { value: "", label: "Any room type" },
  { value: "LECTURE_ROOM", label: "Lecture room" },
  { value: "COMPUTER_LABORATORY", label: "Computer laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference room" },
  { value: "OTHER", label: "Other (halls, audio-visual rooms)" },
];
const STATUS_TEXT = { FREE: "Available", MOVES: "Available after moving classes", BLOCKED: "Not available" };

export function BookingWorkspace({ bookings, showBookedBy }: { bookings: BookingRow[]; showBookedBy: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ date: new Date().toLocaleDateString("en-CA"), startMin: "540", endMin: "660", attendees: "30", purpose: "", roomType: "" });
  const [options, setOptions] = useState<RoomOption[] | null>(null);
  const [confirm, setConfirm] = useState<RoomOption | null>(null);
  const [result, setResult] = useState<{ bookingId: string; room: string; items: PlanItem[] } | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const request = () => ({
    date: form.date,
    startMin: Number(form.startMin),
    endMin: Number(form.endMin),
    attendees: Number(form.attendees),
    purpose: form.purpose,
  });

  function search(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await findRoomsAction({ ...request(), roomType: (form.roomType || undefined) as never });
      if (res.ok) setOptions(res.data);
      else toast.error(res.error);
    });
  }

  function book(option: RoomOption) {
    startTransition(async () => {
      const res = await bookRoomAction({ ...request(), roomId: option.roomId });
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      setResult({ bookingId: res.data.bookingId, room: option.name, items: res.data.items });
      setOptions(null);
      toast.success(res.data.items.length ? `Booked. ${res.data.items.length} class meeting(s) moved and their faculty notified.` : "Room booked.");
      router.refresh();
    });
  }

  function cancel(id: string, keepMoves = false) {
    startTransition(async () => {
      const res = await cancelBookingAction(id, keepMoves);
      if (!res.ok) {
        toast.error(res.error, keepMoves ? undefined : { action: { label: "Cancel booking only", onClick: () => cancel(id, true) }, duration: 12000 });
        return;
      }
      toast.success(keepMoves ? "Booking cancelled; moved classes stay where they are." : "Booking cancelled and moved classes restored.");
      if (result?.bookingId === id) setResult(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Find a room</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={search} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="b-purpose">Purpose</FieldLabel>
              <Input id="b-purpose" value={form.purpose} onChange={set("purpose")} placeholder="Department meeting" required minLength={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-date">Date</FieldLabel>
              <Input id="b-date" type="date" value={form.date} onChange={set("date")} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-start">Start</FieldLabel>
              <NativeSelect id="b-start" value={form.startMin} onChange={set("startMin")} options={TIMES} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-end">End</FieldLabel>
              <NativeSelect id="b-end" value={form.endMin} onChange={set("endMin")} options={TIMES} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-attendees">Attendees</FieldLabel>
              <Input id="b-attendees" type="number" min={1} value={form.attendees} onChange={set("attendees")} required />
            </Field>
            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="b-type">Room type</FieldLabel>
              <NativeSelect id="b-type" value={form.roomType} onChange={set("roomType")} options={ROOM_TYPES} />
            </Field>
            <div className="flex items-end lg:col-span-4">
              <Button type="submit" disabled={pending}>
                {pending ? <CircleNotch className="size-4 animate-spin" /> : <MagnifyingGlass className="size-4" />} Find available rooms
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/40">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="size-5 text-emerald-600" /> {result.room} is booked
            </CardTitle>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(result.bookingId)}>
              <ArrowCounterClockwise className="size-4" /> Undo
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {result.items.length
                ? "These classes were moved to make room. Their faculty members were notified. Undo cancels the booking and puts them back."
                : "No classes had to move."}
            </p>
            <ChangeList items={result.items} />
          </CardContent>
        </Card>
      )}

      {options && (
        <Card>
          <CardHeader><CardTitle className="text-base">Rooms for {form.date}, {formatRange(Number(form.startMin), Number(form.endMin))}</CardTitle></CardHeader>
          <CardContent>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open room of that type seats {form.attendees} people.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {options.map((o) => (
                  <li key={o.roomId} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{o.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{o.location} · {o.capacity} seats</p>
                      </div>
                      <Badge variant={o.status === "FREE" ? "default" : o.status === "MOVES" ? "secondary" : "destructive"}>{STATUS_TEXT[o.status]}</Badge>
                    </div>
                    {o.status === "MOVES" && <p className="text-xs text-muted-foreground">{o.items.length} class meeting(s) will be moved automatically.</p>}
                    {o.status === "BLOCKED" && <p className="text-xs text-destructive">{o.blockers[0]}</p>}
                    {o.status !== "BLOCKED" && (
                      <Button size="sm" variant={o.status === "FREE" ? "default" : "outline"} className="mt-auto self-start" onClick={() => (o.status === "FREE" ? book(o) : setConfirm(o))} disabled={pending}>
                        {o.status === "FREE" ? "Book this room" : "Review and book"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{showBookedBy ? "All bookings" : "My bookings"}</CardTitle>
          <ExportButtons
            filename="room-bookings"
            rows={bookings}
            columns={[
              { header: "Date", value: (r) => r.date },
              { header: "Time", value: (r) => formatRange(r.startMin, r.endMin) },
              { header: "Room", value: (r) => r.roomName },
              { header: "Purpose", value: (r) => r.purpose },
              { header: "Attendees", value: (r) => r.attendees },
              { header: "Booked by", value: (r) => r.bookedBy },
              { header: "Status", value: (r) => (r.status === "CONFIRMED" ? "Confirmed" : "Cancelled") },
              { header: "Classes moved", value: (r) => r.moves.length },
            ]}
          />
        </CardHeader>
        <CardContent>
          <PrintHeader title="Room Bookings" />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date and time</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Purpose</TableHead>
                  {showBookedBy && <TableHead>Booked by</TableHead>}
                  <TableHead>Classes moved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="print:hidden" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No bookings yet.</TableCell></TableRow>
                )}
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{b.date}<br /><span className="text-xs text-muted-foreground">{formatRange(b.startMin, b.endMin)}</span></TableCell>
                    <TableCell>{b.roomName}</TableCell>
                    <TableCell className="max-w-56">{b.purpose}<br /><span className="text-xs text-muted-foreground">{b.attendees} attendees</span></TableCell>
                    {showBookedBy && <TableCell>{b.bookedBy}</TableCell>}
                    <TableCell className="max-w-72 text-xs">
                      {b.moves.length === 0 ? "None" : b.moves.map((m) => <p key={m.label + m.reason} title={m.reason}>{m.label}</p>)}
                    </TableCell>
                    <TableCell><Badge variant={b.status === "CONFIRMED" ? "default" : "outline"}>{b.status === "CONFIRMED" ? "Confirmed" : "Cancelled"}</Badge></TableCell>
                    <TableCell className="print:hidden">
                      {b.status === "CONFIRMED" && b.canCancel && (
                        <ActionButton kind="cancel" disabled={pending} onClick={() => cancel(b.id)}>Cancel booking</ActionButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Book {confirm?.name}?</DialogTitle>
            <DialogDescription>
              These classes already use the room. They will move to the nearest available room or time that fits their size, room type, and faculty availability. Their faculty members will be notified, and you can undo this.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto">{confirm && <ChangeList items={confirm.items} />}</div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => confirm && book(confirm)}>
              {pending && <CircleNotch className="size-4 animate-spin" />} Book and move classes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
