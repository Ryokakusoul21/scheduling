"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NativeSelect, type NativeOption } from "@/components/ux/native-select";

export function LevelSelect({ value, options }: { value: string; options: NativeOption[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2 md:hidden print:hidden" aria-busy={pending}>
      <label htmlFor={id} className="text-sm font-medium">Education level</label>
      <NativeSelect id={id} value={value} options={options} disabled={pending} className="[&_select]:h-12 [&_select]:rounded-xl [&_select]:bg-card [&_select]:px-3 [&_select]:pr-9 [&_select]:text-base"
        onChange={(event) => { const href = event.target.value; if (options.some((option) => option.value === href)) startTransition(() => router.push(href)); }} />
    </div>
  );
}
