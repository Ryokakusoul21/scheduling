/** Plain-language text for changes and unresolved issues, written from templates so it works with no language model. */
import { isLabRoom } from "../slot-check";
import type { ChangeType, Issue, Proposal, ResolverInput, Unresolved } from "./types";

export const CHANGE_LABELS: Record<ChangeType, string> = {
  PLACED: "Placed",
  MOVED: "Moved",
  ROOM_CHANGED: "Room changed",
  TIME_CHANGED: "Time changed",
  HOURS_ADJUSTED: "Hours adjusted",
  REMOVED: "Meeting removed",
};

/** Why the solver gave up on an issue. */
export type Cause = "NO_ROOM" | "NO_FACULTY" | "NO_SLOT" | "DATA" | "NOT_EDITABLE" | "LIMIT";

const ROOM_WORD: Record<string, string> = {
  COMPUTER_LABORATORY: "computer laboratory",
  SCIENCE_LABORATORY: "science laboratory",
  LECTURE_ROOM: "lecture room",
  CONFERENCE_ROOM: "conference room",
  OTHER: "room",
};

/** Reason, suggested actions, and a link for an issue the solver could not fix. */
export function unresolved(issue: Issue, cause: Cause, input: ResolverInput): Unresolved {
  const section = input.sections.find((s) => s.id === issue.sectionId);
  const subject = input.subjects.find((s) => s.id === issue.subjectId);
  const lab = issue.component === "LABORATORY";
  const roomWord = lab ? ROOM_WORD[subject && isLabRoom(subject.requiredRoomType) ? subject.requiredRoomType : "COMPUTER_LABORATORY"] : "lecture room";
  const subjectLink = subject ? { href: "/subjects", label: `Check ${subject.code} in Subjects` } : undefined;

  switch (cause) {
    case "DATA":
      return {
        issue,
        reason: "The scheduled hours are far above the subject's requirement, which usually means the subject's lecture or laboratory hours are set up wrong.",
        actions: ["Check the subject's lecture and laboratory hours.", "If the hours are right, remove the extra meetings by hand."],
        link: subjectLink,
      };
    case "NO_ROOM":
      return {
        issue,
        reason: `No ${roomWord} seats ${section?.studentCount ?? "this many"} students and is open to this section's program.`,
        actions: [`Add or open a ${roomWord} with at least ${section?.studentCount ?? 0} seats.`, "Split the section, or mark a room as General / Shared."],
        link: { href: "/rooms", label: "Open Rooms" },
      };
    case "NO_FACULTY":
      return {
        issue,
        reason: "No active faculty member who teaches this level is free at any time that also suits a room.",
        actions: ["Assign another faculty member, or turn off Keep faculty assignments and run again.", "Widen the faculty member's available hours."],
        link: { href: "/faculty", label: "Open Faculty" },
      };
    case "NOT_EDITABLE":
      return { issue, reason: "This involves classes you can view but not change.", actions: ["Ask the department that owns them, or the Registrar."] };
    case "LIMIT":
      return { issue, reason: "The search stopped at its time limit before reaching this issue.", actions: ["Run again for fewer sections, or for this issue only."] };
    default:
      return {
        issue,
        reason: `No time on Monday to Saturday has the section, a faculty member, and a free ${roomWord} available together${lab ? " for the full laboratory session" : ""}.`,
        actions: [
          lab ? `Open another ${roomWord} on Saturday or extend laboratory room hours.` : "Open another lecture room or extend room hours.",
          "Allow moving classes in complete sections, then run again.",
          ...(lab ? ["Check that the laboratory hours match the subject requirement."] : []),
        ],
        link: lab ? { href: "/rooms", label: "Open Rooms" } : subjectLink,
      };
  }
}

/** Template summary used when no language model is configured. */
export function templateSummary(p: Proposal) {
  const fixedUnscheduled = p.before.unscheduled - p.after.unscheduled;
  const parts = [
    `${p.changes.length} change${p.changes.length === 1 ? "" : "s"} proposed.`,
    p.before.unscheduled ? `Unscheduled components go from ${p.before.unscheduled} to ${p.after.unscheduled}${fixedUnscheduled > 0 ? ` (${fixedUnscheduled} placed)` : ""}.` : "",
    p.before.warnings !== p.after.warnings ? `Warnings go from ${p.before.warnings} to ${p.after.warnings}.` : "",
    p.before.conflicts ? `Double bookings go from ${p.before.conflicts} to ${p.after.conflicts}.` : "",
    p.classesMoved ? `${p.classesMoved} existing class${p.classesMoved === 1 ? "" : "es"} move, affecting ${p.facultyAffected} faculty member${p.facultyAffected === 1 ? "" : "s"}.` : "No existing class moves.",
    p.unresolved.length ? `${p.unresolved.length} issue${p.unresolved.length === 1 ? "" : "s"} could not be fixed automatically; see Unresolved.` : "",
    p.stoppedEarly ? "The search reached its time limit, so this is the best result found so far." : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Anonymized figures for the optional language-model summary: counts and reasons only, no names. */
export function summaryFacts(p: Proposal) {
  return {
    before: p.before,
    after: p.after,
    changes: p.changes.length,
    classesMoved: p.classesMoved,
    facultyAffected: p.facultyAffected,
    stoppedEarly: p.stoppedEarly,
    unresolved: p.unresolved.map((u) => ({ kind: u.issue.kind, component: u.issue.component ?? null, reason: u.reason })),
  };
}
