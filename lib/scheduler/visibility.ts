/** Faculty and students only ever see classes and examinations the Registrar has published. */
export const PUBLISHED_ONLY_ROLES = ["FACULTY", "STUDENT"] as const;

/** Prisma status filter for a viewer's role; management roles are limited by scope instead. */
export function publishedFilter(role: string) {
  return (PUBLISHED_ONLY_ROLES as readonly string[]).includes(role) ? { status: "PUBLISHED" as const } : {};
}

/** Management can inspect live rows only after the Head submits them; revisions become private again. */
export function submittedTimetableFilter(role: string) {
  if (role !== "SUPER_ADMINISTRATOR" && role !== "REGISTRAR") return {};
  return {
    OR: [
      { status: "PUBLISHED" as const },
      { status: "REVIEW" as const, submission: { is: { status: { in: ["SUBMITTED" as const, "APPROVED" as const] } } } },
    ],
  };
}
