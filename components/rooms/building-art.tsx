import { PURPOSE_HUES, type BuildingPurpose } from "@/lib/rooms/buildings";
import { cn } from "@/lib/utils";

/** Photo of the building, or a drawn facade colored by purpose with one row of windows per floor (up to four). */
export function BuildingArt({ name, purpose, floors, photo, className }: { name: string; purpose: BuildingPurpose; floors: number; photo: string | null; className?: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own guarded route, so next/image adds nothing here
    return <img src={photo} alt={`Photo of ${name}`} className={cn("h-full w-full object-cover", className)} loading="lazy" />;
  }
  const hue = PURPOSE_HUES[purpose];
  const stories = Math.min(Math.max(floors, 1), 4);
  const top = 108 - stories * 20;
  // Slightly different widths per building so cards do not look identical.
  const wide = 150 + ([...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) * 20;
  const left = (320 - wide) / 2;
  const columns = Math.floor((wide - 20) / 22);
  return (
    <svg viewBox="0 0 320 140" role="img" aria-label={`Illustration of ${name}`} preserveAspectRatio="xMidYMid slice" className={cn("h-full w-full", className)}>
      <rect width="320" height="140" fill={hue.sky} />
      <circle cx="270" cy="30" r="14" fill="#fde68a" opacity="0.8" />
      <rect y="112" width="320" height="28" fill="#86efac" />
      <rect y="118" width="320" height="22" fill="#4ade80" opacity="0.5" />
      <rect x={left - 6} y={top - 8} width={wide + 12} height="8" rx="2" fill={hue.roof} />
      <rect x={left} y={top} width={wide} height={112 - top} fill={hue.wall} />
      {Array.from({ length: stories }, (_, row) =>
        Array.from({ length: columns }, (_, col) => (
          <rect key={`${row}-${col}`} x={left + 12 + col * 22} y={top + 6 + row * 20} width="12" height="11" rx="1" fill="#e0f2fe" opacity="0.9" />
        )),
      )}
      <rect x={160 - 11} y="94" width="22" height="18" fill={hue.roof} />
      <rect x={160 - 9} y="96" width="18" height="16" fill="#bae6fd" opacity="0.7" />
      {[30, 56, 266, 292].map((x) => (
        <g key={x}>
          <rect x={x - 2} y="98" width="4" height="14" fill="#78350f" />
          <circle cx={x} cy="92" r="11" fill="#16a34a" />
        </g>
      ))}
    </svg>
  );
}
