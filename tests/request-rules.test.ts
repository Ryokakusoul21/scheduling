import { describe, expect, it } from "vitest";
import { canCancelRequest, canEditRequest, canReviewRequest, requestFormSchema, statusGroup } from "@/lib/requests/rules";

const base = { reason: "Move the class one hour later please" };

describe("requestFormSchema", () => {
  it("requires a class for change and cancel types but not for a new schedule", () => {
    expect(requestFormSchema.safeParse({ ...base, type: "NEW_SCHEDULE" }).success).toBe(true);
    const bad = requestFormSchema.safeParse({ ...base, type: "CANCEL_SCHEDULE" });
    expect(bad.success).toBe(false);
    expect(bad.success ? "" : bad.error.issues[0].path[0]).toBe("scheduleId");
  });
  it("needs at least 10 characters of details", () => {
    expect(requestFormSchema.safeParse({ type: "NEW_SCHEDULE", reason: "too short" }).success).toBe(false);
  });
  it("needs what was asked for on change types and a sensible time range", () => {
    expect(requestFormSchema.safeParse({ ...base, type: "CHANGE_ROOM", scheduleId: "s" }).success).toBe(false);
    expect(requestFormSchema.safeParse({ ...base, type: "CHANGE_ROOM", scheduleId: "s", requestedRoomId: "r" }).success).toBe(true);
    const time = (end: string) => requestFormSchema.safeParse({ ...base, type: "CHANGE_TIME", scheduleId: "s", requestedDay: "MONDAY", requestedStart: "09:00", requestedEnd: end });
    expect(time("08:00").success).toBe(false);
    expect(time("10:30").success).toBe(true);
  });
});

describe("canReviewRequest", () => {
  const head = { role: "HEAD_OF_DEPARTMENT", userId: "h", departmentIds: ["cs"] };
  const admin = { role: "REGISTRAR", userId: "a", departmentIds: [] };
  const req = (over: Record<string, unknown> = {}) => ({ status: "PENDING", type: "CHANGE_ROOM", requestedById: "f", requesterRole: "FACULTY", departmentId: "cs", targetDepartmentId: null, ...over });

  it("lets the owning Head of Department decide own-department class requests and requests aimed at them", () => {
    expect(canReviewRequest(head, req())).toBe(true);
    expect(canReviewRequest(head, req({ type: "CROSS_DEPARTMENT", departmentId: "biz", targetDepartmentId: "cs" }))).toBe(true);
  });
  it("keeps other departments, own requests, decided requests and non-heads out", () => {
    expect(canReviewRequest(head, req({ departmentId: "biz" }))).toBe(false);
    expect(canReviewRequest(head, req({ requestedById: "h" }))).toBe(false);
    expect(canReviewRequest(head, req({ status: "APPROVED" }))).toBe(false);
    expect(canReviewRequest({ role: "FACULTY", userId: "f2", departmentIds: ["cs"] }, req())).toBe(false);
  });
  it("waits for each affected department on cross-department requests", () => {
    const details = { requiredDepartmentIds: ["cs", "biz"], approvedDepartmentIds: ["biz"] };
    expect(canReviewRequest(head, req({ type: "CROSS_DEPARTMENT", departmentId: "other", details }))).toBe(true);
    expect(canReviewRequest(head, req({ type: "CROSS_DEPARTMENT", details: { ...details, approvedDepartmentIds: ["cs"] } }))).toBe(false);
    expect(canReviewRequest(head, req({ type: "CROSS_DEPARTMENT", targetDepartmentId: null }))).toBe(false);
  });
  it("does not let the Registrar decide what a Head of Department owns", () => {
    expect(canReviewRequest(admin, req())).toBe(false);
    expect(canReviewRequest(admin, req({ type: "CROSS_DEPARTMENT", targetDepartmentId: "cs" }))).toBe(false);
  });
  it("routes record changes and other heads' requests to the owning head, never the Registrar", () => {
    expect(canReviewRequest(head, req({ type: "FACULTY_CHANGE", requesterRole: "HEAD_OF_DEPARTMENT" }))).toBe(true);
    expect(canReviewRequest(head, req({ requesterRole: "HEAD_OF_DEPARTMENT", requestedById: "h2" }))).toBe(true);
    expect(canReviewRequest(head, req({ type: "SUBJECT_CHANGE" }))).toBe(true);
    for (const type of ["FACULTY_CHANGE", "SUBJECT_CHANGE", "NEW_SCHEDULE", "CROSS_DEPARTMENT"]) {
      expect(canReviewRequest(admin, req({ type }))).toBe(false);
      expect(canReviewRequest({ ...admin, role: "SUPER_ADMINISTRATOR" }, req({ type }))).toBe(false);
    }
    expect(canReviewRequest(admin, req({ departmentId: null }))).toBe(false);
  });
});

describe("edit, cancel and status grouping", () => {
  const head = { role: "HEAD_OF_DEPARTMENT", userId: "h", departmentIds: ["cs"] };
  const req = (over: Record<string, unknown> = {}) => ({ status: "PENDING", type: "CHANGE_ROOM", requestedById: "f", requesterRole: "FACULTY", departmentId: "cs", targetDepartmentId: null, ...over });

  it("lets only the owning Head of Department edit or cancel a pending request", () => {
    expect(canCancelRequest(head, req())).toBe(true);
    expect(canEditRequest(head, req())).toBe(true);
    expect(canCancelRequest(head, req({ departmentId: "biz" }))).toBe(false);
    expect(canCancelRequest(head, req({ status: "APPROVED" }))).toBe(false);
  });
  it("gives the faculty member who filed a request and the Registrar neither action", () => {
    expect(canCancelRequest({ role: "FACULTY", userId: "f", departmentIds: ["cs"] }, req())).toBe(false);
    expect(canEditRequest({ role: "FACULTY", userId: "f", departmentIds: ["cs"] }, req())).toBe(false);
    expect(canCancelRequest({ role: "REGISTRAR", userId: "a", departmentIds: [] }, req())).toBe(false);
  });
  it("lets a head change or withdraw their own request, but only edit the plain class types", () => {
    expect(canCancelRequest(head, req({ requestedById: "h", requesterRole: "HEAD_OF_DEPARTMENT", type: "SUBJECT_CHANGE" }))).toBe(true);
    expect(canEditRequest(head, req({ requestedById: "h", requesterRole: "HEAD_OF_DEPARTMENT", type: "SUBJECT_CHANGE" }))).toBe(false);
    expect(canEditRequest(head, req({ requestedById: "h", requesterRole: "HEAD_OF_DEPARTMENT" }))).toBe(true);
  });
  it("counts applied requests as approved", () => {
    expect(statusGroup("COMPLETED")).toBe("APPROVED");
    expect(statusGroup("REJECTED")).toBe("REJECTED");
  });
});
