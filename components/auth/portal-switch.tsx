"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react/ssr";

/** Links to the other portal, based on the current address. */
export function PortalSwitch() {
  const student = usePathname().startsWith("/student");
  return (
    <Link href={student ? "/login" : "/student/login"} className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-brand-link focus-visible:ring-2 focus-visible:ring-ring">
      {student ? "Employee portal" : "Student portal"} <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  );
}
