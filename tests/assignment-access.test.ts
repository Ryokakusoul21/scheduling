import { describe, expect, it } from "vitest";
import { facultyAssignmentRoute } from "@/lib/subjects/assignment-access";
import { canManageSubject } from "@/lib/subjects/permissions";

const head = { role: "HEAD_OF_DEPARTMENT", departmentId: "coics", departmentIds: ["coics"], actingDepartmentIds: ["cas"] };
describe("section and faculty assignment authority", () => {
  it("permits own and acting-department faculty directly without permitting GE catalog edits", () => {
    expect(facultyAssignmentRoute(head, "coics")).toBe("DIRECT");
    expect(facultyAssignmentRoute(head, "cas")).toBe("DIRECT");
    expect(canManageSubject(head, { departmentId: null, programId: null })).toBe(false);
  });
  it("requires external faculty department approval", () => expect(facultyAssignmentRoute(head, "gened")).toBe("APPROVAL"));
  it("denies missing-department faculty, inactive users, faculty and student callers", () => {
    expect(facultyAssignmentRoute(head, null)).toBe("DENIED");
    expect(facultyAssignmentRoute({ ...head, status: "INACTIVE" }, "coics")).toBe("DENIED");
    for (const role of ["FACULTY", "STUDENT"]) expect(facultyAssignmentRoute({ role }, "coics")).toBe("DENIED");
  });
  it("lets academic administrators assign across departments", () => {
    expect(facultyAssignmentRoute({ role: "REGISTRAR" }, "gened")).toBe("DIRECT");
  });
});
