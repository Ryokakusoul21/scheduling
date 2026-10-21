/** Approval states of school activities (browser-safe labels and badge colors). */
export const ACTIVITY_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes Requested",
};

export const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, string> = {
  PENDING: "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  APPROVED: "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  REJECTED: "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-200",
  CHANGES_REQUESTED: "border-sky-500/50 bg-sky-500/15 text-sky-900 dark:text-sky-200",
};

/** One activity as listed in the table view and the approvals board. */
export interface ActivityListItem {
  id: string;
  type: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  departmentId: string | null;
  department: string;
  level: string | null;
  roomId: string | null;
  /** Free-text location as entered; `location` combines it with the room name for display. */
  locationText: string;
  location: string;
  participants: string;
  status: ActivityStatus;
  reviewNote: string;
  submittedBy: string;
  submittedAt: string;
  conflicts: string[];
}
