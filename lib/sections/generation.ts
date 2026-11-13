export function distributeLearners(total: number, maximum: number, balanced = true, minimumSections = 0) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(maximum) || maximum < 1) return [];
  const count = Math.max(Math.ceil(total / maximum), minimumSections);
  if (!balanced) return Array.from({ length: count }, (_, index) => Math.max(0, Math.min(maximum, total - index * maximum)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function sectionSuffix(index: number) {
  if (!Number.isInteger(index) || index < 0) throw new Error("Section index must be zero or greater.");
  let value = index + 1;
  let suffix = "";
  while (value > 0) { value--; suffix = String.fromCharCode(65 + value % 26) + suffix; value = Math.floor(value / 26); }
  return suffix;
}

export function sectionSuffixIndex(suffix: string) {
  if (!/^[A-Z]+$/.test(suffix)) return -1;
  return [...suffix].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function nextSectionIndex(existingNames: string[]) {
  return Math.max(-1, ...existingNames.map((name) => sectionSuffixIndex(name.match(/-([A-Z]+)$/i)?.[1]?.toUpperCase() ?? ""))) + 1;
}

export function generateSectionNames(prefix: string, yearNumber: number, count: number, existingCount = 0) {
  return Array.from({ length: count }, (_, index) => `${prefix} ${yearNumber}-${sectionSuffix(existingCount + index)}`);
}

export function sectionSummary<T extends { studentCount: number }>(rows: T[]) {
  return { sections: rows.length, learners: rows.reduce((total, row) => total + row.studentCount, 0) };
}

export interface ExistingGenerationSection {
  id: string;
  name: string;
  studentCount: number;
  enrolledStudents: number;
}

export interface SectionGenerationContext {
  existing: ExistingGenerationSection[];
  reservedNames: string[];
  fingerprint: string;
  curriculumClasses: number;
}

export interface GenerationPreviewRow {
  id: string | null;
  name: string;
  current: number | null;
  proposed: number;
  status: "UNCHANGED" | "UPDATED" | "NEW";
}

export function planSectionGeneration(input: {
  totalLearners: number; maximum: number; balanced: boolean; mode: "ADD" | "REBALANCE"; prefix: string; yearNumber: number;
}, existing: ExistingGenerationSection[], reservedNames: string[]) {
  const { totalLearners, maximum, balanced, mode } = input;
  const currentTotal = existing.reduce((sum, s) => sum + s.studentCount, 0);
  const fail = (error: string) => ({ ok: false as const, error, rows: [] as GenerationPreviewRow[], currentTotal });
  if (!Number.isInteger(totalLearners) || totalLearners < 1 || totalLearners > 10000) return fail("Enter a total of 1–10,000 students.");
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 500) return fail("Enter a maximum of 1–500 students per section.");
  if (mode === "ADD" && totalLearners < currentTotal) return fail(`Existing sections already account for ${currentTotal} students. Increase the total or choose Rebalance all sections.`);
  const remaining = mode === "ADD" ? totalLearners - currentTotal : totalLearners;
  const distribution = remaining > 0 ? distributeLearners(remaining, maximum, balanced, mode === "REBALANCE" ? existing.length : 0) : [];
  const newCounts = mode === "ADD" ? distribution : distribution.slice(existing.length);
  const names = generateSectionNames(input.prefix, input.yearNumber, newCounts.length, nextSectionIndex(reservedNames));
  const rows: GenerationPreviewRow[] = existing.map((s, index) => ({
    id: s.id, name: s.name, current: s.studentCount, proposed: mode === "ADD" ? s.studentCount : distribution[index],
    status: mode === "ADD" || s.studentCount === distribution[index] ? "UNCHANGED" : "UPDATED",
  }));
  for (let index = 0; index < existing.length; index++) {
    if (rows[index].proposed < existing[index].enrolledStudents) return fail(`${existing[index].name} already has ${existing[index].enrolledStudents} enrolled students. Its planning count cannot be lower; enrolled students are not moved automatically.`);
  }
  rows.push(...newCounts.map((proposed, index) => ({ id: null, name: names[index], current: null, proposed, status: "NEW" as const })));
  return { ok: true as const, rows, currentTotal,
    unchanged: rows.filter((r) => r.status === "UNCHANGED").length,
    updated: rows.filter((r) => r.status === "UPDATED").length,
    created: newCounts.length, total: rows.reduce((sum, r) => sum + r.proposed, 0),
    remaining: mode === "ADD" ? remaining : Math.max(0, totalLearners - currentTotal),
  };
}
