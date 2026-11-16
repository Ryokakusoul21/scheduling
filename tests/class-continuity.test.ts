import { describe, expect, it } from "vitest";
import { virtualClassPlan, deliveryMode } from "@/lib/suspensions/continuity";
import { expandSessions, sessionOccupant } from "@/lib/occupancy/engine";
import { isCancelled, wholeDayClosure } from "@/lib/student/schedule";
import { activityApplies } from "@/lib/reports/affected";
import type { AdjustmentPlan } from "@/lib/occupancy/adjust";
import type { PortalActivity } from "@/lib/student/portal";

const before = { date: "2026-11-16", roomId: "room", roomName: "Room 1", facultyId: "teacher", facultyName: "Teacher", startMin: 480, endMin: 540 };
const cancelled: AdjustmentPlan = { items: [{ scheduleId: "class1", label: "IT101", departmentId: "cs", kind: "CANCELLED", reason: "Suspended", before, after: null }], blockers: [], notes: [] };
const suspension: PortalActivity = { id: "order", type: "CLASS_SUSPENSION", title: "Selected class suspension", description: "Weather", startDate: before.date, endDate: before.date, startMin: null, endMin: null, scheduleIds: ["class1"] };

describe("virtual class continuity", () => {
  it("preserves the teacher, date, and times and releases only the physical room", () => {
    const plan = virtualClassPlan(cancelled, "Campus closure", "https://meet.example.com/class", "Use your student account.");
    expect(plan.items[0]).toMatchObject({ kind: "ONLINE", after: { ...before, roomId: "", roomName: "Virtual class" } });
    expect(plan.items[0].reason).toContain("https://meet.example.com/class");
    expect(cancelled.items[0].kind).toBe("CANCELLED");
    expect(deliveryMode(plan.items)).toBe("VIRTUAL");
    expect(deliveryMode([...cancelled.items, { kind: "MAKE_UP" }])).toBe("SUSPEND");
  });

  it("keeps virtual meetings in the occupancy plan with faculty and section still occupied", () => {
    const sessions = expandSessions([{ id: "class1", semesterId: "term", sectionId: "section", subjectId: "subject", facultyId: "teacher", roomId: "room", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540 }],
      [{ id: "term", start: "2026-11-01", end: "2026-11-30" }], [{ scheduleId: "class1", date: before.date, kind: "ONLINE" }], before.date, before.date);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ roomId: "", facultyId: "teacher", sectionId: "section", startMin: 480, endMin: 540 });
    expect(sessionOccupant(sessions[0], "IT101")).toMatchObject({ facultyIds: ["teacher"], sectionIds: ["section"] });
  });

  it("cancels only the selected class in the student portal", () => {
    const first = { id: "class1", startMin: 480, endMin: 540 };
    const second = { id: "class2", startMin: 540, endMin: 600 };
    expect(isCancelled(first, [suspension])).toBe(true);
    expect(isCancelled(second, [suspension])).toBe(false);
    expect(wholeDayClosure([first, second], [suspension])).toBeNull();
    expect(wholeDayClosure([first], [suspension])?.id).toBe("order");
    expect(isCancelled(first, [{ ...suspension, type: "SCHOOL_EVENT" }])).toBe(false);
  });

  it("narrows report impacts to the exact class while preserving section and program checks", () => {
    const activity = { ...suspension, departmentId: "cs", level: "COLLEGE", sectionIds: ["section"] };
    const cls = { id: "class1", sectionId: "section", departmentId: "cs", level: "COLLEGE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, termStart: "2026-11-01", termEnd: "2026-11-30" };
    expect(activityApplies(activity, cls)).toBe(true);
    expect(activityApplies(activity, { ...cls, id: "class2" })).toBe(false);
    expect(activityApplies(activity, { ...cls, departmentId: "foreign" })).toBe(false);
  });
});
