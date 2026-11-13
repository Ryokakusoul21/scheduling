"use server";
import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { loadTimetableEditor, previewTimetableChange, saveTimetableChange } from "@/lib/timetable/service";
export async function loadTimetableConfigurationAction(input: unknown) { return loadTimetableEditor(await requireScope(...STAFF_ROLES), input); }
export async function previewTimetableConfigurationAction(input: unknown) { return previewTimetableChange(await requireScope(...STAFF_ROLES), input); }
export async function saveTimetableConfigurationAction(input: unknown) {
  const result = await saveTimetableChange(await requireScope(...STAFF_ROLES), input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
