"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, DoorOpen, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { saveRoomPreferencesAction } from "./actions";

const MAX_ROOMS = 3;

/** Preferred rooms of one faculty member, best first; faculty without any get an automatic room. */
export function RoomPreferences({ facultyId, name, selected, rooms }: { facultyId: string; name: string; selected: string[]; rooms: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(selected);
  const [pending, start] = useTransition();
  const label = (id: string) => rooms.find((r) => r.id === id)?.label ?? "Room";
  const move = (i: number, by: number) => setIds((list) => { const next = [...list]; [next[i], next[i + by]] = [next[i + by], next[i]]; return next; });
  const save = () => start(async () => {
    const res = await saveRoomPreferencesAction(facultyId, ids);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Preferred rooms saved");
    setOpen(false);
    router.refresh();
  });

  // Clicks inside the dialog bubble through the portal; stop them so the table row does not open Edit.
  return <span className="contents" onClick={(e) => e.stopPropagation()}>
    <Button variant="ghost" size="sm" onClick={() => { setIds(selected); setOpen(true); }} aria-label={`Preferred rooms of ${name}`}>
      <DoorOpen className="size-4" /> Rooms {selected.length > 0 && <Badge variant="secondary">{selected.length}</Badge>}
    </Button>
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Preferred rooms · {name}</DialogTitle></DialogHeader>
        <ol className="space-y-1.5">
          {ids.map((id, i) => <li key={id} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm">
            <Badge variant="outline">{i + 1}</Badge>
            <span className="min-w-0 flex-1 truncate">{label(id)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === ids.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setIds(ids.filter((x) => x !== id))}><X className="size-4" /></Button>
          </li>)}
        </ol>
        {ids.length < MAX_ROOMS && <NativeSelect aria-label="Add a room" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])} placeholder="Add a room" options={rooms.filter((r) => !ids.includes(r.id)).map((r) => ({ value: r.id, label: r.label }))} />}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </span>;
}
