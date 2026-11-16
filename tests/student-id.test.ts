import { describe, expect, it } from "vitest";
import { studentRegisterSchema } from "@/lib/validation/auth";

const studentNumberSchema = studentRegisterSchema.shape.studentNumber;

describe("student ID", () => {
  it.each(["GC-136512090001", "GC-2026-001", "GC-AB123", `GC-${"1".repeat(17)}`])("accepts a prefixed ID: %s", (id) => {
    expect(studentNumberSchema.parse(id)).toBe(id);
  });

  it("trims surrounding whitespace while preserving the full ID", () => {
    expect(studentNumberSchema.parse("  GC-136512090001  ")).toBe("GC-136512090001");
  });

  it.each(["136512090001", "2026-001", "gc-123", "GC123", "GC-", "", "GC-123 456", "GC-123/456", `GC-${"1".repeat(18)}`])("rejects an invalid ID: %s", (id) => {
    expect(studentNumberSchema.safeParse(id).success).toBe(false);
  });
});
