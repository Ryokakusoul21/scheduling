"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";

const formSchema = z.object({
  semesterId: z.string().min(1, "Choose a term."),
  kind: z.enum(["CLASS_TIMETABLE", "EXAMINATION"]),
  name: z.string().trim().min(1, "Enter a period name.").max(100),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a start date and time."),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose an end date and time."),
});

type Result = { ok: true } | { ok: false; error: string };

function localDate(value: string) {
  return new Date(`${value}:00+08:00`);
}

export async function saveSchedulingPeriodAction(formData: FormData): Promise<Result> {
  const scope = await requireScope("REGISTRAR");
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the period details." };
  const startsAt = localDate(parsed.data.startsAt);
  const endsAt = localDate(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { ok: false, error: "The end date and time must be after the start." };
  }
  const semesterExists = await prisma.semester.count({ where: { id: parsed.data.semesterId } });
  if (!semesterExists) return { ok: false, error: "That term no longer exists." };

  const key = { semesterId: parsed.data.semesterId, kind: parsed.data.kind };
  const previous = await prisma.schedulingPeriod.findUnique({ where: { semesterId_kind: key } });
  const period = await prisma.schedulingPeriod.upsert({
    where: { semesterId_kind: key },
    update: { name: parsed.data.name, startsAt, endsAt },
    create: { ...key, name: parsed.data.name, startsAt, endsAt, createdById: scope.userId },
  });
  await prisma.auditLog.create({
    data: {
      userId: scope.userId,
      role: scope.role,
      action: `${previous ? "Updated" : "Created"} ${parsed.data.kind.toLowerCase().replace("_", " ")} scheduling period`,
      entity: "SchedulingPeriod",
      entityId: period.id,
      ...(previous ? { oldValue: { name: previous.name, startsAt: previous.startsAt.toISOString(), endsAt: previous.endsAt.toISOString(), status: previous.status } } : {}),
      newValue: { name: period.name, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), status: period.status },
    },
  });
  revalidatePath("/admin/scheduling-periods");
  return { ok: true };
}

export async function setSchedulingPeriodStatusAction(id: string, status: "OPEN" | "CLOSED"): Promise<Result> {
  const scope = await requireScope("REGISTRAR");
  const period = await prisma.schedulingPeriod.findUnique({ where: { id } });
  if (!period) return { ok: false, error: "This scheduling period no longer exists." };
  if (status === "OPEN" && period.endsAt <= new Date()) return { ok: false, error: "An expired scheduling period cannot be reopened. Update its dates first." };
  if (period.status === status) return { ok: true };

  await prisma.schedulingPeriod.update({ where: { id }, data: { status } });
  await prisma.auditLog.create({
    data: {
      userId: scope.userId,
      role: scope.role,
      action: `${status === "OPEN" ? "Opened" : "Closed"} scheduling period: ${period.name}`,
      entity: "SchedulingPeriod",
      entityId: id,
      oldValue: { status: period.status },
      newValue: { status },
    },
  });
  revalidatePath("/admin/scheduling-periods");
  revalidatePath("/scheduler");
  return { ok: true };
}
