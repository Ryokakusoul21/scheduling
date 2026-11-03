export function distributeLearners(total: number, maximum: number) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(maximum) || maximum < 1) return [];
  const count = Math.ceil(total / maximum);
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
