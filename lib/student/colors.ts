// Accessible subject palette: tinted fill, strong left border, and readable text in light and dark mode.
const PALETTE = [
  "border-l-blue-600 bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-100",
  "border-l-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100",
  "border-l-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100",
  "border-l-violet-600 bg-violet-50 text-violet-950 dark:bg-violet-950/60 dark:text-violet-100",
  "border-l-rose-600 bg-rose-50 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100",
  "border-l-cyan-600 bg-cyan-50 text-cyan-950 dark:bg-cyan-950/60 dark:text-cyan-100",
  "border-l-orange-600 bg-orange-50 text-orange-950 dark:bg-orange-950/60 dark:text-orange-100",
  "border-l-teal-600 bg-teal-50 text-teal-950 dark:bg-teal-950/60 dark:text-teal-100",
  "border-l-fuchsia-600 bg-fuchsia-50 text-fuchsia-950 dark:bg-fuchsia-950/60 dark:text-fuchsia-100",
  "border-l-lime-700 bg-lime-50 text-lime-950 dark:bg-lime-950/60 dark:text-lime-100",
];

/** Stable color classes per subject code, assigned in alphabetical order so colors never collide within ten subjects. */
export function subjectColors(codes: string[]) {
  const sorted = [...new Set(codes)].sort();
  return new Map(sorted.map((code, i) => [code, PALETTE[i % PALETTE.length]]));
}
