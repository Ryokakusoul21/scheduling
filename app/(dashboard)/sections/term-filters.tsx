"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ux/native-select";

export function SectionTermFilters({ years, selectedYear, selectedSemester, status, showSemester = true }: { years: string[]; selectedYear: string; selectedSemester: string; status: string; showSemester?: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const update = (key: string, value: string) => { const params = new URLSearchParams(search.toString()); params.set(key, value); router.replace(`${pathname}?${params}`); };
  return <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" role="search" aria-label="Section term filters">
    <label className="space-y-1 text-xs font-medium">Academic Year<NativeSelect value={selectedYear} onChange={(event) => update("year", event.target.value)} options={years.map((year) => ({ value: year, label: year }))} /></label>
    {showSemester && <label className="space-y-1 text-xs font-medium">Semester<NativeSelect value={selectedSemester} onChange={(event) => update("semester", event.target.value)} options={[{ value: "1", label: "First Semester" }, { value: "2", label: "Second Semester" }, { value: "MIDYEAR", label: "Midyear" }]} /></label>}
    <fieldset className="flex rounded-md border p-1"><legend className="sr-only">Section status</legend>{["ACTIVE", "ARCHIVED"].map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => update("status", value)} className="rounded px-3 py-1.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground">{value === "ACTIVE" ? "Active" : "Archived"}</button>)}</fieldset>
  </div>;
}
