import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { policyOptionsFixture } from "./fixtures/policy-options";

const m = vi.hoisted(() => ({ options: vi.fn(), meetings: vi.fn() }));
vi.mock("@/lib/scheduler/policy-options-server", () => ({ loadPolicyOptions: m.options }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { schedule: { findMany: m.meetings } } }));
import { previewClassPolicy, validatePolicyTarget } from "@/lib/scheduler/policy-admin";

const scope = { role: "HEAD_OF_DEPARTMENT", isAdmin: false, departmentId: "cs", departmentIds: ["cs"], manageDepartmentId: "cs", programIds: [] } as unknown as Scope;
const rule = (target: object) => ({ id: "new", kind: "DELIVERY_MODE" as const, name: "Online", departmentId: "cs", params: { target, allowedModes: ["ONLINE_LIVE"], defaultMode: "ONLINE_LIVE" } });

describe("policy target department boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const options = policyOptionsFixture();
    options.departments = options.departments!.filter((d) => d.value === "cs");
    m.options.mockResolvedValue(options);
  });

  it("accepts a valid term, first-year program and selected sections in the managed department", async () => {
    await expect(validatePolicyTarget(scope, rule({ termId: "term", programId: "bsit", yearLevel: "FIRST", sectionIds: ["section", "section-b"], subjectCategory: "MINOR" }))).resolves.toBeUndefined();
  });

  it.each([
    { termId: "quarter" }, { level: "SENIOR_HIGH" }, { programId: "stem" }, { gradeLevel: "GRADE_11" },
    { sectionId: "shs-section" }, { subjectId: "stem-subject" }, { classId: "shs-meeting" }, { sectionIds: ["section", "shs-section"] },
  ])("rejects out-of-department targets even if their IDs exist: %j", async (target) => {
    await expect(validatePolicyTarget(scope, rule(target))).rejects.toThrow(/outside this department/);
  });

  it("rejects a section from another term and an unrelated meeting in the same department", async () => {
    await expect(validatePolicyTarget(scope, rule({ termId: "term", sectionId: "section-second" }))).rejects.toThrow(/outside this department/);
    await expect(validatePolicyTarget(scope, rule({ termId: "term", sectionId: "section", subjectId: "it", classId: "meeting" }))).rejects.toThrow(/outside this department/);
  });

  it("enforces a program assignment narrower than the department", async () => {
    const options = policyOptionsFixture(); options.departments = options.departments!.filter((d) => d.value === "cs"); options.programs = options.programs.filter((p) => p.value === "bsit");
    m.options.mockResolvedValue(options);
    await expect(validatePolicyTarget({ ...scope, programIds: ["bsit"] }, rule({ programId: "bscs" }))).rejects.toThrow(/outside this department/);
  });

  it("rejects unauthorized department and school-wide rules before previewing classes", async () => {
    await expect(previewClassPolicy(scope, { ...rule({}), departmentId: "shs" })).rejects.toThrow(/authorized to manage/);
    await expect(previewClassPolicy(scope, { ...rule({}), departmentId: null })).rejects.toThrow(/School-wide/);
    expect(m.meetings).not.toHaveBeenCalled();
  });
});
