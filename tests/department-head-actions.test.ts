import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), scope: vi.fn(), lock: vi.fn(), heads: vi.fn(), user: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(),
  department: vi.fn(), assignment: vi.fn(), upsert: vi.fn(), audit: vi.fn(), transaction: vi.fn(), faculty: vi.fn(), updateFaculty: vi.fn(), notify: vi.fn(), mail: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: mocks.scope, canManageDepartment: () => true, policyUserFromScope: (scope: { role: string }) => scope, OUTSIDE_DEPARTMENT: "Outside department" }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  $transaction: mocks.transaction, user: { findUnique: mocks.user },
  faculty: { findUnique: mocks.faculty }, notification: { create: mocks.notify }, auditLog: { create: mocks.audit },
} }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));
vi.mock("@/lib/email/mailer", () => ({ appUrl: (path: string) => path, sendMail: mocks.mail }));
vi.mock("@/lib/avatar/storage", () => ({ deleteAvatarFiles: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));

import { assignDepartmentHeadAction } from "@/app/(dashboard)/admin/departments/actions";
import { approveUserAction, createUserAction, updateUserAction } from "@/app/(dashboard)/admin/users/actions";
import { updateFacultyAction } from "@/app/(dashboard)/faculty/actions";
import { setArchived } from "@/lib/archive/archive";

const leader = (id: string, departmentId: string | null = "cs") => ({ id, name: id, role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, facultyId: "faculty", faculty: { departmentId }, departmentAssignments: [] });
const form = () => {
  const input = new FormData();
  for (const [key, value] of Object.entries({ name: "Candidate", email: "candidate@example.com", password: "Strong!Password123", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "cs", facultyId: "faculty" })) input.set(key, value);
  return input;
};

describe("department head assignment boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.role.mockResolvedValue({ id: "admin", role: "SUPER_ADMINISTRATOR" });
    mocks.scope.mockResolvedValue({ userId: "registrar", role: "REGISTRAR", isAdmin: true });
    mocks.user.mockResolvedValue(leader("candidate"));
    mocks.createUser.mockResolvedValue(leader("candidate"));
    mocks.updateUser.mockResolvedValue(leader("candidate"));
    mocks.faculty.mockResolvedValue({ id: "faculty", fullName: "Candidate", email: "candidate@example.com", departmentId: "cs", archivedAt: null, user: null });
    mocks.updateFaculty.mockResolvedValue({ fullName: "Candidate", user: { id: "candidate" } });
    mocks.department.mockResolvedValue({ id: "cs", name: "Computing" });
    mocks.assignment.mockResolvedValue(null);
    mocks.heads.mockResolvedValue([leader("existing"), leader("candidate")]);
    mocks.transaction.mockImplementation(async (work) => work({
      $executeRaw: mocks.lock,
      user: { findMany: mocks.heads, findUnique: mocks.user, create: mocks.createUser, update: mocks.updateUser, updateMany: mocks.updateUser },
      department: { findUnique: mocks.department },
      userDepartmentAssignment: { findUnique: mocks.assignment, upsert: mocks.upsert, deleteMany: vi.fn() },
      faculty: { findUnique: mocks.faculty, update: mocks.updateFaculty }, auditLog: { create: mocks.audit },
    }));
  });

  it("rejects a second department assignment and writes no success audit", async () => {
    expect(await assignDepartmentHeadAction("cs", "candidate")).toMatchObject({ ok: false, error: expect.stringContaining("Only one active") });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.department.mock.invocationCallOrder[0]);
    expect(mocks.heads).toHaveBeenCalledWith(expect.objectContaining({ where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null } }));
  });

  it("assigns a vacant department and audits the change", async () => {
    mocks.heads.mockResolvedValue([leader("candidate")]);
    expect(await assignDepartmentHeadAction("cs", "candidate")).toEqual({ ok: true });
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.scope).toHaveBeenCalledWith("REGISTRAR");
  });

  it.each(["FACULTY", "SUPER_ADMINISTRATOR"])("refuses a %s candidate without changing their role", async (role) => {
    mocks.user.mockResolvedValue({ ...leader("candidate"), role });
    expect(await assignDepartmentHeadAction("cs", "candidate")).toMatchObject({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before entering a transaction", async () => {
    expect(await assignDepartmentHeadAction("", "candidate")).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks bypass through account creation", async () => {
    expect(await createUserAction(form())).toMatchObject({ ok: false, error: expect.stringContaining("Only one active") });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.role).toHaveBeenCalledWith("SUPER_ADMINISTRATOR");
  });

  it("blocks bypass through promotion, reactivation, or department reassignment", async () => {
    expect(await updateUserAction("candidate", form())).toMatchObject({ ok: false, error: expect.stringContaining("Only one active") });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
  });

  it("blocks conflicting account approvals before sending approval messages", async () => {
    mocks.user.mockResolvedValue({ ...leader("candidate"), status: "PENDING", emailVerified: new Date() });
    expect(await approveUserAction("candidate")).toMatchObject({ ok: false, error: expect.stringContaining("Only one active") });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("blocks moving a faculty-linked head into an occupied department", async () => {
    const input = new FormData();
    for (const [key, value] of Object.entries({ employeeId: "GC-001", fullName: "Candidate", email: "candidate@example.com", departmentId: "cs", maxHours: "24", status: "ACTIVE", employmentType: "FULL_TIME", teachingLevels: "COLLEGE" })) input.set(key, value);
    expect(await updateFacultyAction("faculty", input)).toMatchObject({ ok: false, error: expect.stringContaining("Only one active") });
  });

  it.each(["USER", "FACULTY"] as const)("blocks restoring a conflicting %s in the restore transaction", async (kind) => {
    await expect(setArchived(kind, kind === "USER" ? "candidate" : "faculty", "admin", false)).rejects.toThrow("Only one active");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("allows archiving a head to release authority even when legacy duplicates exist", async () => {
    expect(await setArchived("USER", "candidate", "admin", true)).toBe("candidate");
    expect(mocks.heads).not.toHaveBeenCalled();
  });
});

describe("account approval requires a verified email", () => {
  it("refuses to approve before the user verifies their email", async () => {
    mocks.role.mockResolvedValue({ id: "admin" });
    mocks.user.mockResolvedValue({ ...leader("candidate"), status: "PENDING", emailVerified: null });
    expect(await approveUserAction("candidate")).toEqual({ ok: false, error: "The user has not verified their email yet." });
    expect(mocks.mail).not.toHaveBeenCalled();
  });
});
