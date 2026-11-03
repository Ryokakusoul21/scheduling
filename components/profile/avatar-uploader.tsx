"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Trash, UploadSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/avatar/url";
import { cn } from "cn";
import { CropModal } from "./crop-modal";

type Step = "pick" | "camera" | "crop";

/** Picks, crops, and uploads a profile photo; open it from the avatar or from a "Change photo" button. */
export function AvatarDialog({
  open,
  onOpenChange,
  name,
  image,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  image: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // The dialog content mounts only after the client opens it, so reading navigator here is safe.
  const canCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  /** Releases the camera and clears the flow whenever the dialog closes. */
  function change(next: boolean) {
    if (!next) {
      stopCamera();
      setStep("pick");
      setError(null);
      setProgress(null);
      if (source) URL.revokeObjectURL(source);
      setSource(null);
    }
    onOpenChange(next);
  }

  function choose(file: File | undefined) {
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return setError("Use a JPG, PNG, or WebP image.");
    if (file.size > AVATAR_MAX_BYTES) return setError("The photo must be 5 MB or smaller.");
    setError(null);
    setSource(URL.createObjectURL(file));
    setStep("crop");
  }

  async function startCamera() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStep("camera");
      requestAnimationFrame(() => {
        if (video.current) video.current.srcObject = stream.current;
      });
    } catch {
      setError("The camera is not available. Allow camera access or upload a photo instead.");
    }
  }

  function capture() {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    stopCamera();
    canvas.toBlob((b) => {
      if (!b) return;
      setSource(URL.createObjectURL(b));
      setStep("crop");
    }, "image/jpeg", 0.92);
  }

  function upload(blob: Blob) {
    const body = new FormData();
    body.append("file", blob, "avatar.jpg");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/profile/avatar");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.timeout = 30_000;
    xhr.onload = () => {
      // A server crash returns an HTML page, so a body that is not JSON must still end the upload.
      let res: { error?: string } = {};
      try {
        res = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status === 200) {
        toast.success("Profile photo updated");
        change(false);
        router.refresh();
      } else fail(res.error ?? "The server could not save the photo. Please try again.");
    };
    xhr.onerror = () => fail();
    xhr.ontimeout = () => fail("The upload took too long. Please try again.");
    xhr.onabort = () => fail();
    setProgress(0);
    setError(null);
    xhr.send(body);
  }

  function fail(message?: string) {
    setProgress(null);
    setError(message ?? "The upload failed. Check your connection and try again.");
    toast.error(message ?? "Upload failed");
  }

  async function remove() {
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (res.ok) {
      toast.success("Profile photo removed");
      change(false);
      router.refresh();
    } else fail((await res.json().catch(() => ({}))).error);
  }

  const uploading = progress !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && change(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Profile photo</DialogTitle>
          <DialogDescription>JPG, PNG, or WebP, up to 5 MB. Everyone you work with will see this photo.</DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => (e.preventDefault(), setDragging(false), choose(e.dataTransfer.files[0]))}
              className={cn(
                "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <UserAvatar name={name} image={image} className="size-24" />
              <p className="text-sm text-muted-foreground">Drag a photo here, or choose one.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => fileInput.current?.click()}>
                  <UploadSimple className="size-4" /> Upload photo
                </Button>
                {canCamera && (
                  <Button variant="outline" onClick={startCamera}>
                    <Camera className="size-4" /> Take photo
                  </Button>
                )}
              </div>
              <input ref={fileInput} type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} />
            </div>
            {image && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                <Trash className="size-4" /> Remove photo
              </Button>
            )}
          </div>
        )}

        {step === "camera" && (
          <div className="space-y-4">
            <video ref={video} autoPlay playsInline muted className="mx-auto aspect-square w-full max-w-xs rounded-xl bg-black object-cover [transform:scaleX(-1)]" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => (stopCamera(), setStep("pick"))}>Back</Button>
              <Button onClick={capture}>Capture</Button>
            </div>
          </div>
        )}

        {step === "crop" && source && (
          uploading ? (
            <div className="space-y-2 py-6" role="status">
              <p className="text-sm font-medium">{progress === 100 ? "Saving your photo..." : `Uploading ${progress}%`}</p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <CropModal src={source} onCancel={() => setStep("pick")} onConfirm={upload} />
          )
        )}

        <p role="alert" className={cn("text-sm text-destructive", !error && "sr-only")}>{error}</p>
      </DialogContent>
    </Dialog>
  );
}

/** The avatar with a camera overlay on hover and focus. */
export function AvatarButton({ name, image, className, onClick }: { name: string; image: string | null; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Change profile photo"
      className={cn("group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60", className)}
    >
      <UserAvatar name={name} image={image} className="size-full text-3xl" />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
        <Camera className="size-7" weight="fill" />
      </span>
    </button>
  );
}
