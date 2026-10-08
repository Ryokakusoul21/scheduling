"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CircleNotch } from "@phosphor-icons/react/ssr";
import { NativeSelect } from "@/components/ux/native-select";

/** Switching academic year reloads the Scheduler with that year's terms and classes. */
export function AcademicYearSwitcher({
  years,
  currentId,
}: {
  years: { id: string; name: string; isActive: boolean }[];
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      {pending && <CircleNotch className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      <label htmlFor="scheduler-ay" className="text-muted-foreground">
        Academic year
      </label>
      <NativeSelect
        id="scheduler-ay"
        className="w-44"
        value={currentId}
        onChange={(e) => startTransition(() => router.push(`/scheduler?ay=${e.target.value}`))}
        options={years.map((y) => ({ value: y.id, label: `${y.name}${y.isActive ? " (active)" : ""}` }))}
      />
    </div>
  );
}
