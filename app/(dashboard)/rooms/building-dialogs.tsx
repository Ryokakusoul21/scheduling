"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, ImageSquare } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialog } from "@/components/ux/form-dialog";
import { BUILDING_PURPOSES, PURPOSE_LABELS, type BuildingPurpose } from "@/lib/rooms/buildings";
import { formatTime } from "@/lib/scheduler/timetable";
import { removeBuildingPhotoAction, saveBuildingAction, uploadBuildingPhotoAction } from "./actions";

/** Editable details of a building. */
export interface BuildingDetails {
  id: string;
  name: string;
  code: string;
  description: string;
  location: string;
  purpose: BuildingPurpose;
  openingMin: number | null;
  closingMin: number | null;
}

// Half-hour steps from 6:00 AM to 10:00 PM.
const TIMES = Array.from({ length: 33 }, (_, i) => 6 * 60 + i * 30).map((m) => ({ value: String(m), label: formatTime(m) }));

export function BuildingDialog({ building, open, onOpenChange }: { building?: BuildingDetails; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={building ? `Edit ${building.name}` : "Add building"}
      fields={[
        { name: "name", label: "Building name", type: "text", required: true, placeholder: "Main Building" },
        { name: "code", label: "Short code", type: "text", placeholder: "MB" },
        { name: "location", label: "Location on campus", type: "text", placeholder: "Main campus, north wing", wide: true },
        { name: "purpose", label: "Purpose", type: "select", required: true, options: BUILDING_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] })) },
        { name: "openingMin", label: "Opens at", type: "select", options: [{ value: "", label: "Not set" }, ...TIMES] },
        { name: "closingMin", label: "Closes at", type: "select", options: [{ value: "", label: "Not set" }, ...TIMES] },
        { name: "description", label: "Description", type: "textarea", wide: true },
      ]}
      values={
        building
          ? { ...building, openingMin: building.openingMin?.toString() ?? "", closingMin: building.closingMin?.toString() ?? "" }
          : { purpose: "ACADEMIC", openingMin: String(7 * 60), closingMin: String(19 * 60) }
      }
      submitLabel="Save"
      successMessage="Building saved"
      onSubmit={(fd) => saveBuildingAction(building?.id ?? null, fd)}
    />
  );
}

/** Longest side after resizing; keeps uploads small and cards sharp. */
const MAX_SIDE = 1600;

/** Scales the photo down in the browser and re-encodes it as JPEG so the upload stays well under the limit. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo."))), "image/jpeg", 0.85));
}

export function PhotoDialog({ building, hasPhoto, open, onOpenChange }: { building: { id: string; name: string }; hasPhoto: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    onOpenChange(false);
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file.");
    try {
      const blob = await resize(file);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      toast.error("Could not read that photo. Try a JPEG or PNG file.");
    }
  }

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await task();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(success);
      close();
      router.refresh();
    });
  }

  function upload() {
    const fd = new FormData();
    fd.append("photo", new File([preview!.blob], "building.jpg", { type: "image/jpeg" }));
    run(() => uploadBuildingPhotoAction(building.id, fd), "Photo saved.");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Photo of {building.name}</DialogTitle>
          <DialogDescription>Shown on the building card. Large photos are resized before uploading.</DialogDescription>
        </DialogHeader>
        <label className="flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground hover:bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved file
            <img src={preview.url} alt="Preview of the new photo" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1"><ImageSquare className="size-8" aria-hidden /> Choose a JPEG, PNG, or WebP photo</span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <DialogFooter>
          {hasPhoto && (
            <Button variant="outline" className="mr-auto" disabled={pending} onClick={() => run(() => removeBuildingPhotoAction(building.id), "Photo removed.")}>
              Remove photo
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={upload} disabled={pending || !preview}>
            {pending && <CircleNotch className="size-4 animate-spin" />} Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
