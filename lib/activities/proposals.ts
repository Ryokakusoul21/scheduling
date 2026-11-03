import type { AcademicLevel, ActivityProposalRowStatus, ActivityProposalStatus, ActivityType } from "@prisma/client";

export interface ProposalRowInput {
  id?: string;
  date: string;
  activity: string;
  time?: string;
  location?: string;
  level?: AcademicLevel | "";
  category?: ActivityType | "";
}

export interface ParsedProposalRow extends ProposalRowInput {
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
}

export interface ProposalListItem {
  id: string;
  semesterId: string;
  semester: string;
  schoolYear: string;
  department: string;
  departmentId: string;
  level: AcademicLevel;
  version: number;
  status: ActivityProposalStatus;
  reviewNote: string;
  createdBy: string;
  preparedBy: string;
  designation: string;
  updatedAt: string;
  rows: (ProposalRowInput & { id: string; status: ActivityProposalRowStatus; reviewNote: string; activityId: string | null })[];
}

export const PROPOSAL_CATEGORIES = ["SCHOOL_EVENT", "EXAMINATION_WEEK", "HOLIDAY", "CLASS_SUSPENSION"] as const;

export function inferActivityCategory(title: string): ActivityType {
  const value = title.toLowerCase();
  if (/prelim|midterm|semi[- ]?final|final exam|examination/.test(value)) return "EXAMINATION_WEEK";
  if (/holiday|all saints|bonifacio|christmas break|new year|independence day|national heroes/.test(value)) return "HOLIDAY";
  if (/suspension|classes suspended|no classes/.test(value)) return "CLASS_SUSPENSION";
  return "SCHOOL_EVENT";
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
function iso(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** Accepts "July 28, 2026", "August 14-17, 2026", and cross-month ranges. */
export function parseActivityDate(value: string): { startDate: string; endDate: string } | null {
  const text = value.trim().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  let m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const date = iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return date ? { startDate: date, endDate: date } : null;
  }
  m = text.match(/^([A-Za-z]+)\s+(\d{1,2})\s*(?:-|to)\s*(\d{1,2}),\s*(\d{4})$/i);
  if (m) {
    const startDate = iso(+m[4], MONTHS[m[1].toLowerCase()], +m[2]);
    const endDate = iso(+m[4], MONTHS[m[1].toLowerCase()], +m[3]);
    return startDate && endDate && startDate <= endDate ? { startDate, endDate } : null;
  }
  m = text.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(?:-|to)\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/i);
  if (m) {
    const startDate = iso(+m[5], MONTHS[m[1].toLowerCase()], +m[2]);
    const endDate = iso(+m[5], MONTHS[m[3].toLowerCase()], +m[4]);
    return startDate && endDate && startDate <= endDate ? { startDate, endDate } : null;
  }
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+to\s+(\d{4})-(\d{2})-(\d{2}))?$/i);
  if (m) {
    const startDate = iso(+m[1], +m[2], +m[3]);
    const endDate = m[4] ? iso(+m[4], +m[5], +m[6]) : startDate;
    return startDate && endDate && startDate <= endDate ? { startDate, endDate } : null;
  }
  return null;
}

function clockPart(value: string) {
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = +m[1]; const minute = +(m[2] ?? 0); const meridiem = m[3]?.toUpperCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  return hour * 60 + minute;
}

export function parseActivityTime(value?: string) {
  if (!value?.trim() || /^(whole|all) day$/i.test(value.trim())) return { startMin: null, endMin: null };
  const parts = value.replace(/[–—]/g, "-").split(/\s+(?:to)\s+|\s*-\s*/i);
  if (parts.length !== 2) return null;
  const startMin = clockPart(parts[0]); const endMin = clockPart(parts[1]);
  return startMin !== null && endMin !== null && endMin > startMin ? { startMin, endMin } : null;
}

export function formatProposalDate(start: string, end: string) {
  const long = (v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return start === end ? long(start) : `${long(start)} to ${long(end)}`;
}
