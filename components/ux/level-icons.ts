import { GraduationCap, Student, Backpack, BookOpenText } from "@phosphor-icons/react/ssr";
import type { AcademicLevel } from "@/lib/academics/levels";

/** Icon per academic level, used on level selection cards. */
export const LEVEL_ICONS: Record<AcademicLevel, typeof GraduationCap> = {
  COLLEGE: GraduationCap,
  SENIOR_HIGH: Student,
  JUNIOR_HIGH: BookOpenText,
  ELEMENTARY: Backpack,
};

/** Accent classes per level so cards are easy to tell apart. */
export const LEVEL_ACCENTS: Record<AcademicLevel, string> = {
  COLLEGE: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  SENIOR_HIGH: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  JUNIOR_HIGH: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  ELEMENTARY: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
};
