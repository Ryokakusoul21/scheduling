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
    <>
      {pending && <CircleNotch className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      <NativeSelect
        id="scheduler-ay"
        aria-label="Academic year"
        className="w-44"
        value={currentId}
        onChange={(e) => startTransition(() => router.push(`/scheduler?ay=${e.target.value}`))}
        options={years.map((y) => ({ value: y.id, label: `${y.name}${y.isActive ? " (active)" : ""}` }))}
      />
    </>
  );
}
