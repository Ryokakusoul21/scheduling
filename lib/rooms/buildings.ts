/** Building purposes, status, and hours for the Rooms pages (browser-safe). */
import { formatTime } from "@/lib/scheduler/timetable";

export const BUILDING_PURPOSES = ["ACADEMIC", "SCIENCE_TECHNOLOGY", "LIBRARY", "ARTS", "SPORTS", "ADMINISTRATION", "MIXED_USE"] as const;
export type BuildingPurpose = (typeof BUILDING_PURPOSES)[number];

export const PURPOSE_LABELS: Record<BuildingPurpose, string> = {
  ACADEMIC: "Academic",
  SCIENCE_TECHNOLOGY: "Science and technology",
  LIBRARY: "Library and learning",
  ARTS: "Arts and performance",
  SPORTS: "Sports and recreation",
  ADMINISTRATION: "Administration",
  MIXED_USE: "Mixed use",
};

/** Accent hue per purpose for the illustration placeholder (sky, roof, and wall tints). */
export const PURPOSE_HUES: Record<BuildingPurpose, { sky: string; wall: string; roof: string }> = {
  ACADEMIC: { sky: "#dbeafe", wall: "#c2410c", roof: "#334155" },
  SCIENCE_TECHNOLOGY: { sky: "#e0f2fe", wall: "#0f766e", roof: "#1e293b" },
  LIBRARY: { sky: "#ede9fe", wall: "#a16207", roof: "#3f3f46" },
  ARTS: { sky: "#fce7f3", wall: "#be123c", roof: "#3b0764" },
  SPORTS: { sky: "#dcfce7", wall: "#1d4ed8", roof: "#1e3a8a" },
  ADMINISTRATION: { sky: "#fef3c7", wall: "#78716c", roof: "#292524" },
  MIXED_USE: { sky: "#e2e8f0", wall: "#475569", roof: "#0f172a" },
};

/** A building is operational when every room is open; otherwise it shows how many are not. */
export function buildingStatus(roomStatuses: string[]) {
  const closed = roomStatuses.filter((s) => s !== "AVAILABLE").length;
  return { operational: closed === 0, closed, label: closed === 0 ? "Operational" : "Maintenance" };
}

/** "Open 7:00 AM to 7:00 PM", or null when hours are not set. */
export function hoursText(openingMin: number | null, closingMin: number | null) {
  if (openingMin === null || closingMin === null) return null;
  return `Open ${formatTime(openingMin)} to ${formatTime(closingMin)}`;
}

/** Photo address with a version so a new upload is never served from the browser cache. */
export function photoUrl(buildingId: string, version: string | null) {
  return version ? `/rooms/${buildingId}/photo?v=${encodeURIComponent(version)}` : null;
}
