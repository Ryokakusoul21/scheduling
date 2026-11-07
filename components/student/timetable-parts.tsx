import { Desktop, Chalkboard } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

/** Small lecture or laboratory tag with an icon so it reads without color. */
export function ComponentTag({ component, className }: { component: string; className?: string }) {
  const lab = component === "LABORATORY";
  const Icon = lab ? Desktop : Chalkboard;
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 rounded border border-current/25 px-1.5 py-px text-xs font-medium whitespace-nowrap", className)}>
      <Icon className="size-3" aria-hidden />
      {lab ? "Laboratory" : "Lecture"}
    </span>
  );
}
