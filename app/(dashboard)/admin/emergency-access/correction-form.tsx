"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { emergencyCorrectionAction } from "./actions";

const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function CorrectionForm({ schedule, rooms }: {
  schedule: { id: string; updatedAt: string; roomId: string; dayOfWeek: typeof days[number]; startMin: number; endMin: number };
  rooms: { id: string; roomName: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = (key: string) => { const [h, m] = String(form.get(key)).split(":").map(Number); return h * 60 + m; };
    startTransition(async () => {
      setMessage("");
      try {
        const result = await emergencyCorrectionAction({
          id: schedule.id, updatedAt: schedule.updatedAt, roomId: String(form.get("roomId")),
          dayOfWeek: String(form.get("dayOfWeek")) as typeof days[number], startMin: minutes("start"), endMin: minutes("end"),
          reason: String(form.get("reason")), confirmed: form.get("confirmed") === "on",
        });
        setMessage(result.ok ? "Emergency correction saved and logged. The Registrar and affected users have been notified." : result.error ?? "Could not save the correction.");
        if (result.ok) router.refresh();
      } catch {
        setMessage("Could not save the correction. Reload the class and check the audit log before retrying.");
      }
    });
  }}>
    <fieldset disabled={pending} className="space-y-4">
      <label className="grid gap-1 text-sm">Room<NativeSelect name="roomId" defaultValue={schedule.roomId} required options={rooms.map((room) => ({ value: room.id, label: room.roomName }))} /></label>
      <label className="grid gap-1 text-sm">Day<NativeSelect name="dayOfWeek" defaultValue={schedule.dayOfWeek} options={days.map((day) => ({ value: day, label: day }))} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">Start time<Input name="start" type="time" defaultValue={time(schedule.startMin)} required /></label>
        <label className="grid gap-1 text-sm">End time<Input name="end" type="time" defaultValue={time(schedule.endMin)} required /></label>
      </div>
      <label className="grid gap-1 text-sm">Emergency reason<Textarea name="reason" minLength={20} maxLength={1000} required placeholder="Describe the emergency and why an immediate technical correction is needed." /></label>
      <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required className="mt-1" />I confirm this is an emergency. This correction will be logged and the Registrar and affected users will be notified.</label>
      <Button type="submit" variant="destructive">{pending ? "Saving correction…" : "Save emergency correction"}</Button>
    </fieldset>
    <p role="status" className="text-sm">{message}</p>
  </form>;
}
