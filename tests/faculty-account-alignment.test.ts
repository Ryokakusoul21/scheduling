import { beforeEach, describe, expect, it, vi } from "vitest";
import { facultyAccountSummary, facultyContactPending } from "@/lib/admin/faculty-alignment";
import { needsFacultyLinkReview } from "@/lib/admin/accounts";

const m = vi.hoisted(() => ({ role: vi.fn(), user: vi.fn(), faculty: vi.fn(), create: vi.fn(), update: vi.fn(), audit: vi.fn(), assignments: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: m.role }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
  $executeRaw: vi.fn(), user: { findUnique: m.user, create: m.create, update: m.update, findMany: vi.fn(async () => []) },
  faculty: { findUnique: m.faculty }, auditLog: { create: m.audit }, userDepartmentAssignment: { deleteMany: m.assignments, upsert: m.assignments },
}) } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));
vi.mock("@/lib/email/mailer", () => ({ appUrl: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/avatar/storage", () => ({ deleteAvatarFiles: vi.fn() }));
import { createUserAction, linkFacultyAccountAction, updateUserAction } from "@/app/(dashboard)/admin/users/actions";

const faculty = { id: "faculty", fullName: "Registrar Faculty Name", email: "faculty@school.edu", employeeId: "GC-300001", departmentId: "coics", archivedAt: null, user: null };
const account = { role: "FACULTY", facultyId: null, name: "Registered name", archivedAt: null };
function form() {
  const fd = new FormData();
  Object.entries({ name: "Forged name", email: "wrong@school.edu", password: "Strong!Password123", role: "FACULTY", departmentId: "other", facultyId: "faculty", status: "ACTIVE" }).forEach(([k, v]) => fd.set(k, v));
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.role.mockResolvedValue({ id: "admin", role: "SUPER_ADMINISTRATOR" });
  m.user.mockResolvedValue(account); m.faculty.mockResolvedValue(faculty); m.create.mockResolvedValue({ id: "new-account" });
});
describe("Registrar faculty identity and Administrator account access", () => {
  it("creates a teaching account from canonical faculty fields instead of submitted duplicates", async () => {
    expect(await createUserAction(form())).toEqual({ ok: true });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: faculty.fullName, email: faculty.email, facultyId: faculty.id, role: "FACULTY" }) });
    expect(m.assignments).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ departmentId: "coics" }) }));
  });
  it("requires a current roster record and real contact details before provisioning", async () => {
    m.faculty.mockResolvedValue(null);
    expect((await createUserAction(form())).ok).toBe(false);
    m.faculty.mockResolvedValue({ ...faculty, email: "temp@faculty.invalid" });
    expect(await createUserAction(form())).toMatchObject({ ok: false, error: expect.stringContaining("temporary contact") });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate or archived faculty identities", async () => {
    for (const patch of [{ user: { id: "existing" } }, { archivedAt: new Date() }]) {
      m.faculty.mockResolvedValue({ ...faculty, ...patch });
      expect((await createUserAction(form())).ok).toBe(false);
    }
    expect(m.create).not.toHaveBeenCalled();
  });
  it("links an explicitly selected account without changing its login, role or access status", async () => {
    expect(await linkFacultyAccountAction("user", "faculty")).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "user" }, data: { facultyId: "faculty", name: faculty.fullName, sessionVersion: { increment: 1 } } });
    expect(m.assignments).not.toHaveBeenCalled();
  });
  it("does not replace another person's existing faculty identity", async () => {
    m.user.mockResolvedValue({ ...account, facultyId: "different-person" });
    expect((await linkFacultyAccountAction("user", "faculty")).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not hand department-head access to a temporary faculty profile", async () => {
    m.user.mockResolvedValue({ ...account, role: "HEAD_OF_DEPARTMENT" });
    m.faculty.mockResolvedValue({ ...faculty, email: "head@faculty.invalid" });
    expect((await linkFacultyAccountAction("head", "faculty")).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("prevents account edits from overriding the Registrar's linked name and faculty department", async () => {
    m.user.mockResolvedValue({ ...account, facultyId: "faculty", faculty });
    expect(await updateUserAction("user", form())).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: faculty.fullName }) }));
    expect(m.assignments).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ departmentId: "coics" }) }));
  });
  it("keeps account administration restricted to the Administrator", async () => {
    m.role.mockRejectedValue(new Error("Forbidden"));
    await expect(linkFacultyAccountAction("user", "faculty")).rejects.toThrow("Forbidden");
    expect(m.role).toHaveBeenCalledWith("SUPER_ADMINISTRATOR");
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe("faculty account gap reporting", () => {
  it("counts faculty independently of accounts and marks placeholder contacts", () => {
    const row = { ...faculty, status: "ACTIVE", departmentName: "Computing", account: null };
    expect(facultyAccountSummary([row, { ...row, id: "temp", email: "temp@faculty.invalid" }])).toMatchObject({ total: 2, missing: 2, linked: 0, contactPending: 1 });
    expect(facultyContactPending("TEMP@FACULTY.INVALID")).toBe(true);
  });
  it("flags archived faculty links as needing review without revoking account access", () => {
    expect(needsFacultyLinkReview({ role: "HEAD_OF_DEPARTMENT", facultyId: "archived-faculty", facultyArchived: true } as Parameters<typeof needsFacultyLinkReview>[0])).toBe(true);
  });
});
