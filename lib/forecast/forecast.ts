/**
 * Enrollment Forecasting. Each program (or basic education level) gets a least-squares trend over
 * past academic years for the same term type, an 80% prediction interval, and a confidence level.
 * The forecast is then turned into sections, faculty, and rooms needed. Pure (tests/forecast.test.ts).
 */

export interface HistoryPoint {
  /** Starting calendar year of the academic year (2025 for 2025-2026). */
  year: number;
  termType: string;
  enrolled: number;
}

export type Confidence = "High" | "Medium" | "Low";

export interface Prediction {
  value: number;
  low: number;
  high: number;
  confidence: Confidence;
  /** Average yearly change in students, from the fitted trend. */
  slope: number;
  points: number;
}

// Two-sided 80% Student t critical values by degrees of freedom (1 to 10); larger samples use 1.282.
const T80 = [3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383, 1.372];

/** Linear trend forecast for `year`, using history of the same term type (falls back to first-term data). */
export function predict(history: HistoryPoint[], year: number, termType: string): Prediction | null {
  let pts = history.filter((h) => h.termType === termType);
  if (pts.length < 2) pts = history.filter((h) => h.termType === "FIRST");
  if (pts.length === 0) return null;
  const n = pts.length;
  if (n === 1) {
    const v = pts[0].enrolled;
    return { value: v, low: Math.round(v * 0.8), high: Math.round(v * 1.2), confidence: "Low", slope: 0, points: 1 };
  }
  const mx = pts.reduce((s, p) => s + p.year, 0) / n;
  const my = pts.reduce((s, p) => s + p.enrolled, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.year - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, p) => s + (p.year - mx) * (p.enrolled - my), 0) / sxx : 0;
  const intercept = my - slope * mx;
  const value = Math.max(0, intercept + slope * year);
  const residual = n > 2 ? Math.sqrt(pts.reduce((s, p) => s + (p.enrolled - (intercept + slope * p.year)) ** 2, 0) / (n - 2)) : value * 0.1;
  const t = n > 2 ? (T80[n - 3] ?? 1.282) : 3.078;
  const half = t * residual * Math.sqrt(1 + 1 / n + (sxx ? (year - mx) ** 2 / sxx : 0));
  const relative = value ? half / value : 1;
  const confidence: Confidence = n >= 5 && relative < 0.08 ? "High" : n >= 4 && relative < 0.15 ? "Medium" : "Low";
  return { value: Math.round(value), low: Math.max(0, Math.round(value - half)), high: Math.round(value + half), confidence, slope: Math.round(slope * 10) / 10, points: n };
}

export interface ResourceAssumptions {
  /** Students per section for this program (current average, or the default). */
  sectionSize: number;
  /** Weekly contact hours each section needs. */
  hoursPerSection: number;
  /** Share of those hours that need a laboratory. */
  laboratoryShare: number;
}

export interface Needs {
  sections: number;
  lectureHours: number;
  laboratoryHours: number;
}

export function needsFor(students: number, a: ResourceAssumptions): Needs {
  const sections = students > 0 ? Math.ceil(students / Math.max(a.sectionSize, 1)) : 0;
  const hours = sections * a.hoursPerSection;
  return { sections, lectureHours: Math.round(hours * (1 - a.laboratoryShare)), laboratoryHours: Math.round(hours * a.laboratoryShare) };
}

/** Faculty members needed to teach the hours at the average full load. */
export function facultyNeeded(hours: number, loadPerFaculty: number) {
  return hours > 0 ? Math.ceil(hours / Math.max(loadPerFaculty, 1)) : 0;
}

/** Rooms needed to host the hours at a target utilization of each room's weekly hours. */
export function roomsNeeded(hours: number, roomWeeklyHours: number, targetUtilization: number) {
  return hours > 0 ? Math.ceil(hours / (roomWeeklyHours * targetUtilization)) : 0;
}

export function gap(needed: number, available: number) {
  const diff = available - needed;
  return { diff, status: diff < 0 ? ("SHORTAGE" as const) : diff > 0 ? ("SURPLUS" as const) : ("MATCH" as const) };
}
