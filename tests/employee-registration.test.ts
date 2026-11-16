import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), create: vi.fn(), department: vi.fn(), employee: vi.fn(), setting: vi.fn(), audit: vi.fn(), verify: vi.fn(), captcha: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth/captcha", () => ({ verifyCaptcha: mocks.captcha }));
vi.mock("@/lib/auth/verification", () => ({ sendVerification: mocks.verify }));
vi.mock("@/lib/email/mailer", () => ({ appUrl: (path: string) => path, sendMail: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  user: { findFirst: mocks.user, create: mocks.create },
  department: { findUnique: mocks.department }, faculty: { findFirst: mocks.employee },
  systemSetting: { findUnique: mocks.setting }, auditLog: { create: mocks.audit },
} }));

import { registerAction } from "@/actions/auth";
import { registerSchema, studentRegisterSchema } from "@/lib/validation/auth";

const input = () => ({
  name: "Juan Dela Cruz", email: "juan@example.com", employeeId: "GC-001", departmentId: "computing",
  employmentType: "PART_TIME" as const, sex: "FEMALE" as const, password: "Password123!", confirmPassword: "Password123!", acceptTerms: true,
});

describe("employee registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.captcha.mockResolvedValue(true);
    mocks.user.mockResolvedValue(null);
    mocks.employee.mockResolvedValue(null);
    mocks.department.mockResolvedValue({ id: "computing" });
    mocks.setting.mockResolvedValue({ value: true });
    mocks.create.mockResolvedValue({ id: "new-user", name: "Juan Dela Cruz", email: "juan@example.com" });
  });

  it.each([true, false])("saves employee details atomically with the account (approval required: %s)", async (required) => {
    mocks.setting.mockResolvedValue({ value: required });
    expect(await registerAction({ ...input(), name: " Juan Dela Cruz ", email: " JUAN@example.com ", role: "SUPER_ADMINISTRATOR" } as ReturnType<typeof input>)).toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      name: "Juan Dela Cruz", email: "juan@example.com", passwordHash: expect.stringMatching(/^\$2[aby]\$/), role: "FACULTY",
      status: required ? "PENDING" : "ACTIVE", termsAcceptedAt: expect.any(Date),
      faculty: { create: {
        fullName: "Juan Dela Cruz", suffix: null, sex: "FEMALE", email: "juan@example.com", employeeId: "GC-001", department: { connect: { id: "computing" } },
        employmentType: "PART_TIME", status: "INACTIVE",
      } },
    } });
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledOnce();
  });

  it("rejects a removed or forged department before creating anything", async () => {
    mocks.department.mockResolvedValue(null);
    expect(await registerAction(input())).toMatchObject({ ok: false, fieldErrors: { departmentId: expect.any(String) } });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("never claims or overwrites an existing faculty record using a public employee ID", async () => {
    mocks.employee.mockResolvedValue({ id: "existing-employee" });
    expect(await registerAction(input())).toMatchObject({ ok: false, fieldErrors: { employeeId: expect.stringContaining("administrator") } });
    expect(mocks.employee).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [
      { employeeId: { equals: "GC-001", mode: "insensitive" } }, { email: { equals: "juan@example.com", mode: "insensitive" } },
    ] } }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an existing account email", async () => {
    mocks.user.mockResolvedValue({ id: "existing-user" });
    expect(await registerAction(input())).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["employeeId", "email"])("handles a concurrent duplicate %s without reporting success", async (target) => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "7", meta: { target: [target] } }));
    expect(await registerAction(input())).toMatchObject({ ok: false, fieldErrors: { [target]: expect.any(String) } });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("handles a department deleted between validation and saving", async () => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Missing department", { code: "P2025", clientVersion: "7" }));
    expect(await registerAction(input())).toMatchObject({ ok: false, fieldErrors: { departmentId: expect.any(String) } });
  });

  it("blocks invalid CAPTCHA before querying employee records", async () => {
    mocks.captcha.mockResolvedValue(false);
    expect(await registerAction(input())).toMatchObject({ ok: false, error: expect.stringContaining("CAPTCHA") });
    expect(mocks.department).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    { employeeId: "001" }, { departmentId: "" }, { employmentType: "CONTRACTOR" },
    { confirmPassword: "different" }, { acceptTerms: false },
  ])("validates employee details and account security: %j", async (change) => {
    const values = { ...input(), ...change };
    expect(registerSchema.safeParse(values).success).toBe(false);
    expect(await registerAction(values as ReturnType<typeof input>)).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps employee fields out of student registration", () => {
    expect(studentRegisterSchema.safeParse({
      name: "Student Name", email: "student@example.com", studentNumber: "GC-2026-001", programId: "bsit", yearLevel: "FIRST", sectionId: "section-1",
      password: "Password123!", confirmPassword: "Password123!", acceptTerms: true,
    }).success).toBe(true);
  });
});

describe("registration name suffix", () => {
  it("appends the suffix to the full name and stores it separately", async () => {
    mocks.captcha.mockResolvedValue(true); mocks.user.mockResolvedValue(null); mocks.employee.mockResolvedValue(null);
    mocks.department.mockResolvedValue({ id: "computing" }); mocks.setting.mockResolvedValue({ value: false });
    mocks.create.mockResolvedValue({ id: "new-user", name: "Juan Dela Cruz Jr.", email: "juan@example.com" });
    await registerAction({ ...input(), suffix: "Jr." });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.name).toBe("Juan Dela Cruz Jr.");
    expect(data.faculty.create).toMatchObject({ fullName: "Juan Dela Cruz Jr.", suffix: "Jr.", sex: "FEMALE" });
  });
});

describe("registration approval default", () => {
  it("keeps new accounts pending when the approval setting has never been saved", async () => {
    mocks.captcha.mockResolvedValue(true); mocks.user.mockResolvedValue(null); mocks.employee.mockResolvedValue(null);
    mocks.department.mockResolvedValue({ id: "computing" }); mocks.setting.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "new-user", name: "Juan Dela Cruz", email: "juan@example.com" });
    await registerAction(input());
    expect(mocks.create.mock.calls.at(-1)![0].data.status).toBe("PENDING");
  });
});
