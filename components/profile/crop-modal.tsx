"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const VIEW = 280;
const OUTPUT = 512;
const KEY_STEP = 12;

/** Circular crop with drag, arrow keys, and a zoom slider; hands back a square JPEG of the visible area. */
export function CropModal({ src, onCancel, onConfirm }: { src: string; onCancel: () => void; onConfirm: (blob: Blob) => void }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Scale at which the image just covers the circle; zoom multiplies it.
  const scale = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) * zoom : 1;

  /** Keeps the image covering the viewport after any move or zoom. */
  const clamp = useCallback(
    (x: number, y: number, s: number) => {
      if (!natural) return { x: 0, y: 0 };
      const mx = Math.max(0, (natural.w * s - VIEW) / 2);
      const my = Math.max(0, (natural.h * s - VIEW) / 2);
      return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
    },
    [natural],
  );

  /** Draws the visible square into a canvas; the same maths serves the preview and the saved file. */
  const draw = useCallback(
    (canvas: HTMLCanvasElement, size: number) => {
      const img = imgRef.current;
      if (!img || !natural) return;
      const side = VIEW / scale;
      const sx = natural.w / 2 - side / 2 - offset.x / scale;
      const sy = natural.h / 2 - side / 2 - offset.y / scale;
      canvas.width = canvas.height = size;
      canvas.getContext("2d")?.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    },
    [natural, scale, offset],
  );

  useEffect(() => {
    if (previewRef.current) draw(previewRef.current, 96);
  }, [draw]);

  function setZoomClamped(z: number) {
    setZoom(z);
    if (natural) setOffset((o) => clamp(o.x, o.y, Math.max(VIEW / natural.w, VIEW / natural.h) * z));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const d = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] }[e.key];
    if (d) {
      e.preventDefault();
      setOffset((o) => clamp(o.x + d[0], o.y + d[1], scale));
    } else if (e.key === "+" || e.key === "=") setZoomClamped(Math.min(3, zoom + 0.1));
    else if (e.key === "-") setZoomClamped(Math.max(1, zoom - 0.1));
  }

  function save() {
    const canvas = document.createElement("canvas");
    draw(canvas, OUTPUT);
    canvas.toBlob((b) => b && onConfirm(b), "image/jpeg", 0.92);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
        <div
          role="group"
          tabIndex={0}
          aria-label="Crop area. Drag or use the arrow keys to move the photo, plus and minus to zoom."
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (drag.current) setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y, scale));
          }}
          onPointerUp={() => (drag.current = null)}
          className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/60 active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
            style={{
              width: natural ? natural.w * scale : undefined,
              height: natural ? natural.h * scale : undefined,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          {/* Dimmed corners leave a clear circle showing what will be kept. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.55)] ring-2 ring-white/80" />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <canvas ref={previewRef} aria-hidden className="size-24 rounded-full border bg-muted" />
          <span className="text-sm text-muted-foreground">Preview</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-xs items-center gap-3">
        <label htmlFor="avatar-zoom" className="text-sm font-medium">Zoom</label>
        <input
          id="avatar-zoom"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomClamped(Number(e.target.value))}
          className="h-6 w-full accent-primary"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Back</Button>
        <Button onClick={save} disabled={!natural}>Save photo</Button>
      </div>
    </div>
  );
}
