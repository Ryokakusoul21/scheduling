import { Buildings } from "@phosphor-icons/react/ssr";
import type { BuildingPurpose } from "@/lib/rooms/buildings";
import { cn } from "@/lib/utils";

/** Photo of the building, or a calm theme-aware card with one stripe per floor (up to six). */
export function BuildingArt({ name, floors, photo, className }: { name: string; purpose?: BuildingPurpose; floors: number; photo: string | null; className?: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own guarded route, so next/image adds nothing here
    return <img src={photo} alt={`Photo of ${name}`} className={cn("h-full w-full object-cover", className)} loading="lazy" />;
  }
  const stripes = Math.min(Math.max(floors, 1), 6);
  return (
    <div role="img" aria-label={`Illustration of ${name}`} className={cn("flex h-full w-full items-center justify-center gap-4 bg-gradient-to-br from-slate-100 via-sky-50 to-indigo-100 text-slate-600 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950 dark:text-sky-200", className)}>
      <Buildings className="size-1/3 max-h-14 min-h-6" weight="duotone" aria-hidden />
      <div className="flex flex-col-reverse gap-1" aria-hidden>
        {Array.from({ length: stripes }, (_, i) => <span key={i} className="h-1.5 w-8 rounded-full bg-sky-600/30 dark:bg-sky-300/30" />)}
      </div>
    </div>
  );
}
