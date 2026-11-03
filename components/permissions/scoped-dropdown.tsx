"use client";

import type { SelectHTMLAttributes } from "react";
import { can, type PolicyResource, type PolicyUser } from "@/lib/permissions/policy";

export type ScopedOption = { value: string; label: string; resource: PolicyResource; disabledReason?: string };

/** Native keyboard-accessible select that never renders options the caller cannot view. */
export function ScopedDropdown({ user, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  user: PolicyUser | null | undefined;
  options: ScopedOption[];
}) {
  const visible = options.filter((option) => can(user, "view", option.resource));
  return (
    <select {...props} className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${props.className ?? ""}`}>
      {visible.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
