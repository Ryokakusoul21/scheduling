import { z } from "zod";

/** Every employee ID starts with "GC-". */
export const EMPLOYEE_ID_PREFIX = "GC-";

export const employeeIdSchema = z.string().trim().regex(/^GC-[A-Za-z0-9-]+$/, `Employee ID must start with "${EMPLOYEE_ID_PREFIX}"`);
