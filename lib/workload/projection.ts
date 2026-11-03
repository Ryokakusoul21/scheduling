/** Projected load after a change, as a warning when it leaves the allowed range (null when it stays inside). Pure. */
export function projectionWarning(f: { name: string; load: number; minimum: number; maximum: number }, delta: number, unit: string) {
  const after = Math.round((f.load + delta) * 10) / 10;
  const tail = "The change still saves, and a fix proposal goes to the Head of Department for approval.";
  if (delta > 0 && after > f.maximum) return `${f.name}: ${f.load} to ${after} ${unit}, above the maximum of ${f.maximum}. ${tail}`;
  if (delta < 0 && after < f.minimum) return `${f.name}: ${f.load} to ${after} ${unit}, below the minimum of ${f.minimum}. ${tail}`;
  return null;
}
