const STOP = new Set(["and", "the", "for", "with", "of", "in", "to", "studies", "education", "general", "basic"]);

/**
 * Heuristic: does a faculty member's free-text specialization appear in the subject's code, title or description?
 * A whole phrase counts, and so does any single word of three or more letters (so "Web Development" matches "Web Systems").
 */
export function specializationMatch(specialization: string | null | undefined, subject: { code: string; name: string; description?: string | null }) {
  if (!specialization) return false;
  const haystack = ` ${subject.code} ${subject.name} ${subject.description ?? ""} `.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return specialization
    .toLowerCase()
    .split(/[,;/]/)
    .some((phrase) => {
      const clean = phrase.replace(/[^a-z0-9]+/g, " ").trim();
      if (clean.length < 3) return false;
      if (haystack.includes(` ${clean} `)) return true;
      return clean.split(" ").some((word) => word.length >= 3 && !STOP.has(word) && haystack.includes(` ${word} `));
    });
}
