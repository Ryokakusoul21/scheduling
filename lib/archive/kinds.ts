/** Record types that are archived instead of deleted. */
export const ARCHIVE_KINDS = ["USER", "FACULTY", "SUBJECT", "ROOM", "SECTION"] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

export const ARCHIVE_LABELS: Record<ArchiveKind, string> = {
  USER: "User account",
  FACULTY: "Faculty record",
  SUBJECT: "Subject",
  ROOM: "Room",
  SECTION: "Section",
};

export const ARCHIVE_CONFIRM_TEXT =
  "The record is kept, not deleted. It is hidden from new schedules and choices, its past schedules and reports stay viewable, and the Administrator can restore it from the Archived list.";
