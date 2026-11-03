"use client";

import type { ReactNode } from "react";
import { can, type PolicyAction, type PolicyResource, type PolicyUser } from "@/lib/permissions/policy";

export function usePermission(user: PolicyUser | null | undefined, action: PolicyAction, resource: PolicyResource) {
  return can(user, action, resource);
}

export function Can({ user, action, resource, children, fallback = null }: {
  user: PolicyUser | null | undefined;
  action: PolicyAction;
  resource: PolicyResource;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return can(user, action, resource) ? children : fallback;
}
