import { z } from "zod";

export const DEPARTMENT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const DEPARTMENT_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const departmentProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter a department name.").max(150, "Use 150 characters or fewer."),
  updatedAt: z.iso.datetime({ offset: true }),
  removeLogo: z.boolean(),
});

export interface DepartmentProfile {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  updatedAt: string;
  counts: { programs: number; faculty: number; sections: number; rooms: number };
}

export function departmentInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "D";
}
