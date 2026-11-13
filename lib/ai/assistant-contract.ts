import { z } from "zod";
import { canAccessPath } from "@/lib/permissions/routes";
import type { AppRole } from "@/lib/permissions/roles";

export interface AssistantSource { label: string; href: string }
export interface AssistantReply {
  content: string;
  sources: AssistantSource[];
  retrievedAt: string;
  terms: string[];
}

export const assistantPageSchema = z.enum([
  "/dashboard", "/scheduler", "/calendar", "/rooms", "/faculty", "/workload", "/requests",
  "/notifications", "/subjects", "/sections", "/reports", "/analytics", "/bookings", "/adjustments",
]);

export function assistantPage(value: unknown, role: AppRole) {
  const parsed = assistantPageSchema.safeParse(value);
  return parsed.success && canAccessPath(parsed.data, role) ? parsed.data : "/dashboard";
}

const sourceSchema = z.object({
  label: z.string().max(180),
  href: z.string().max(500).refine((href) => {
    if (!href.startsWith("/") || href.startsWith("//") || /[\\\u0000-\u001f]/.test(href)) return false;
    return ["/scheduler", "/calendar", "/rooms", "/workload", "/requests", "/bookings", "/notifications"].includes(href.split(/[?#]/)[0]);
  }),
});
const storedReplySchema = z.object({
  version: z.literal(1), content: z.string(), sources: z.array(sourceSchema).max(12),
  retrievedAt: z.iso.datetime(), terms: z.array(z.string()),
});

export function storeAssistantReply(reply: AssistantReply) {
  return JSON.stringify({ version: 1, ...reply });
}

/** Older chat messages were stored as plain text. */
export function readAssistantReply(value: string): Partial<AssistantReply> & { content: string } {
  try {
    const parsed = storedReplySchema.safeParse(JSON.parse(value));
    if (parsed.success) return parsed.data;
  } catch { /* Plain text from an older conversation. */ }
  return { content: value };
}
