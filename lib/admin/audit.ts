import type { Prisma } from "@prisma/client";
import { PRIVATE_APPROVAL_AUDIT } from "@/lib/permissions/notifications";

export type AuditJson = null | string | number | boolean | AuditJson[] | { [key: string]: AuditJson };
const sensitive = /password|passwd|secret|token|credential|authorization|cookie|privatekey|apikey|accesskey|recoverycode|backupcode|connectionstring|databaseurl|smtp.*pass/i;
const sensitiveKey = (key: string) => sensitive.test(key.replace(/[^a-z0-9]/gi, ""));

/** Redact before data is serialized into client props or exported. */
export function sanitizeAuditValue(value: unknown, depth = 0): AuditJson {
  if (value === null || value === undefined) return null;
  if (depth > 8) return "[Details truncated]";
  if (typeof value === "string") {
    if (/^\s*[\[{]/.test(value)) {
      try { return sanitizeAuditValue(JSON.parse(value), depth + 1); } catch { /* Ordinary text. */ }
    }
    return value.length > 4000 ? `${value.slice(0, 4000)}… [truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const protectedSetting = [record.key, record.name].some((key) => typeof key === "string" && sensitiveKey(key));
    return Object.fromEntries(Object.entries(record).slice(0, 200).map(([key, item]) => [key,
      sensitiveKey(key) || (protectedSetting && ["value", "oldValue", "newValue"].includes(key)) ? "[Redacted]" : sanitizeAuditValue(item, depth + 1),
    ]));
  }
  return String(value);
}

export function auditChanges(before: AuditJson, after: AuditJson) {
  const flatten = (value: AuditJson, path = "", result: Record<string, AuditJson> = {}) => {
    if (value === null && !path) return result;
    if (value && !Array.isArray(value) && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) flatten(item, path ? `${path}.${key}` : key, result);
    } else result[path || "Record"] = value;
    return result;
  };
  const left = flatten(before), right = flatten(after);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map((field) => ({ field, before: left[field] ?? null, after: right[field] ?? null }));
}

export interface AuditFilters { q: string; actor: string; entity: string; record: string; from: string; to: string; blocked: boolean }
export function auditQuery(params: Record<string, unknown>) {
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filters: AuditFilters = { q: text("q").trim().slice(0, 200), actor: text("actor").slice(0, 150), entity: text("entity").slice(0, 100), record: text("record").slice(0, 150), from: text("from").slice(0, 10), to: text("to").slice(0, 10), blocked: text("blocked") === "1" };
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const invalid = (filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to);
  const conditions: Prisma.AuditLogWhereInput[] = [PRIVATE_APPROVAL_AUDIT];
  if (invalid) conditions.push({ id: "__invalid_date_filter__" });
  if (filters.q) conditions.push({ OR: [{ action: { contains: filters.q, mode: "insensitive" } }, { entity: { contains: filters.q, mode: "insensitive" } }, { entityId: { contains: filters.q, mode: "insensitive" } }, { reason: { contains: filters.q, mode: "insensitive" } }, { user: { name: { contains: filters.q, mode: "insensitive" } } }, { user: { email: { contains: filters.q, mode: "insensitive" } } }] });
  if (filters.actor) conditions.push({ userId: filters.actor === "SYSTEM" ? null : filters.actor });
  if (filters.entity) conditions.push({ entity: filters.entity });
  if (filters.record) conditions.push({ entityId: filters.record });
  if (filters.blocked) conditions.push({ action: { startsWith: "Blocked:" } });
  if (!invalid && filters.from) conditions.push({ createdAt: { gte: new Date(`${filters.from}T00:00:00+08:00`) } });
  if (!invalid && filters.to) conditions.push({ createdAt: { lt: new Date(Date.parse(`${filters.to}T00:00:00+08:00`) + 86400000) } });
  const requestedPage = Number(text("page"));
  return { filters, where: { AND: conditions } satisfies Prisma.AuditLogWhereInput, requestedPage: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, error: invalid ? "Choose valid dates with the end date on or after the start date." : null };
}

export interface AuditListRow {
  id: string; userId: string | null; actor: string; email: string | null; role: string | null; action: string; entity: string; entityId: string | null;
  createdAt: string; reason: string | null; ipAddress: string | null; oldValue: AuditJson; newValue: AuditJson;
}
