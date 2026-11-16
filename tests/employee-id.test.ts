import { describe, expect, it } from "vitest";
import { employeeIdSchema } from "@/lib/faculty/employee-id";

describe("employee ID", () => {
  it("must start with GC-", () => {
    expect(employeeIdSchema.safeParse("GC-001").success).toBe(true);
    for (const bad of ["F-001", "gc-001", "GC001", "GC-", "001", ""]) expect(employeeIdSchema.safeParse(bad).success).toBe(false);
  });
});
