"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ux/native-select";
import type { SubjectSemester } from "@/lib/subjects/terms";

export function SubjectSemesterFilter({ academicYear, options, semester }: {
  academicYear: string | null; options: { value: string; label: string }[]; semester: SubjectSemester;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
    <p>Academic year <span className="ml-2 font-semibold">{academicYear ?? "No active academic year"}</span></p>
    <label className="flex items-center gap-2">Semester
      <NativeSelect aria-label="Filter subjects by semester" value={semester} disabled={!options.length}
        options={[{ value: "ALL", label: "All semesters" }, ...options]}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("semester", e.target.value);
          next.delete("ay");
          next.delete("term");
          router.replace(`${pathname}?${next}`);
        }} />
    </label>
  </div>;
}
