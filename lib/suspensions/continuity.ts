import type { AdjustmentPlan } from "@/lib/occupancy/adjust";

export type DeliveryMode = "SUSPEND" | "VIRTUAL";

/** The dated adjustments are the durable source of truth for how an order changes delivery. */
export function deliveryMode(items: readonly { kind: string }[]): DeliveryMode {
  return items.some((item) => item.kind === "ONLINE") ? "VIRTUAL" : "SUSPEND";
}

export function virtualClassPlan(plan: AdjustmentPlan, reason: string, meetingLink?: string, instructions?: string): AdjustmentPlan {
  return {
    ...plan,
    items: plan.items.map((item) => ({
      ...item, kind: "ONLINE",
      after: { ...item.before, roomId: "", roomName: "Virtual class" },
      reason: ["Class continues virtually at its original time.", reason, instructions, meetingLink ? `Join: ${meetingLink}` : "Follow your faculty member’s joining instructions."].filter(Boolean).join(" "),
    })),
    notes: [...plan.notes, "Faculty and students keep their original meeting time. The physical room is released; no make-up class is required."],
  };
}
