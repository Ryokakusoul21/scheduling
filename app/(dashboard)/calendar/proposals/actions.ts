"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { ACADEMIC_LEVELS, isAcademicLevel } from "@/lib/academics/levels";
import { inferActivityCategory, parseActivityDate, parseActivityTime, PROPOSAL_CATEGORIES } from "@/lib/activities/proposals";

const rowSchema = z.object({
  id: z.string().optional(), date: z.string().trim().min(1), activity: z.string().trim().min(2).max(180),
  time: z.string().trim().max(50).optional(), location: z.string().trim().max(120).optional(),
  level: z.union([z.enum(ACADEMIC_LEVELS), z.literal("")]).optional(),
  category: z.union([z.enum(PROPOSAL_CATEGORIES), z.literal("")]).optional(),
});
const proposalSchema = z.object({ semesterId: z.string().min(1), departmentId: z.string().min(1), level: z.enum(ACADEMIC_LEVELS), preparedBy: z.string().trim().min(2).max(120), designation: z.string().trim().min(2).max(120), rows: z.array(rowSchema).min(1).max(300) });
type Input = z.input<typeof proposalSchema>;
type Result = { ok: true; proposalId?: string; version?: number; warnings?: string[][] } | { ok: false; error: string; errors?: string[][] };

function refresh() { revalidatePath("/calendar"); revalidatePath("/calendar/proposals"); revalidatePath("/reports"); }
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function validateInput(input: Input, departmentId: string, excludeProposalId?: string) {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the proposal." } as const;
  const term = await prisma.semester.findUnique({ where: { id: parsed.data.semesterId }, select: { id: true, startDate: true, endDate: true, academicYear: { select: { startDate: true, endDate: true } } } });
  if (!term) return { error: "Select a valid semester." } as const;
  const rows = parsed.data.rows.map((r, index) => {
    const dates = parseActivityDate(r.date); const times = parseActivityTime(r.time);
    const errors: string[] = [];
    if (!dates) errors.push("Invalid date or date range.");
    if (!times) errors.push("Invalid time range.");
    return { raw: r, index, dates, times, errors };
  });
  const seen = new Map<string, number>();
  for (const row of rows) if (row.dates) {
    const key = `${row.dates.startDate}|${row.dates.endDate}|${row.raw.activity.toLowerCase()}`;
    if (seen.has(key)) row.errors.push(`Duplicate of row ${(seen.get(key) ?? 0) + 1}.`); else seen.set(key, row.index);
    if (day(row.dates.startDate) < term.academicYear.startDate || day(row.dates.endDate) > term.academicYear.endDate) row.errors.push("Date is outside the selected school year.");
    const startYear = term.academicYear.startDate.getUTCFullYear();
    const schoolYearEnd = term.academicYear.endDate.getUTCFullYear();
    const month = Number(row.dates.startDate.slice(5, 7));
    const year = Number(row.dates.startDate.slice(0, 4));
    if (month <= 5 && year === startYear && schoolYearEnd > startYear) row.errors.push(`Use ${schoolYearEnd} for January to May dates in this school year.`);
  }
  const valid = rows.filter((r) => r.dates && r.times);
  await Promise.all(valid.map(async (r) => {
    const dates = r.dates!; const level = r.raw.level || parsed.data.level;
    const [duplicate, exams, activities] = await Promise.all([
      prisma.activity.findFirst({ where: { title: { equals: r.raw.activity, mode: "insensitive" }, startDate: day(dates.startDate), endDate: day(dates.endDate), departmentId, ...(excludeProposalId ? { NOT: { id: { in: (await prisma.activityProposalRow.findMany({ where: { proposalId: excludeProposalId, activityId: { not: null } }, select: { activityId: true } })).map((x) => x.activityId!) } } } : {}) }, select: { id: true } }),
      prisma.examination.count({ where: { semesterId: parsed.data.semesterId, date: { gte: day(dates.startDate), lte: day(dates.endDate) }, section: { departmentId, level } } }),
      prisma.activity.findMany({ where: { status: "APPROVED", departmentId, level, startDate: { lte: day(dates.endDate) }, endDate: { gte: day(dates.startDate) } }, select: { title: true }, take: 3 }),
    ]);
    if (duplicate) r.errors.push("This activity already exists on the official calendar.");
    if (exams) r.errors.push(`Conflicts with ${exams} scheduled examination${exams === 1 ? "" : "s"}.`);
    for (const a of activities) r.errors.push(`Overlaps approved activity “${a.title}”.`);
  }));
  return { data: parsed.data, term, rows } as const;
}

export async function previewProposalAction(input: Input): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  if (!scope.departmentId && !scope.isAdmin) return { ok: false, error: "Your account is not linked to a department." };
  const departmentId = input.departmentId;
  if (!departmentId || !scope.departmentIds.includes(departmentId)) return { ok: false, error: "You can only prepare proposals for your department." };
  const checked = await validateInput(input, departmentId);
  if ("error" in checked) return { ok: false, error: checked.error ?? "Check the proposal." };
  const errors = checked.rows.map((r) => r.errors);
  return errors.some((e) => e.length) ? { ok: false, error: "Resolve the highlighted rows before saving.", errors } : { ok: true, warnings: errors };
}

export async function saveProposalDraftAction(input: Input, proposalId?: string): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const existing = proposalId ? await prisma.activityProposal.findUnique({ where: { id: proposalId }, include: { rows: true } }) : null;
  if (proposalId && !existing) return { ok: false, error: "This proposal no longer exists." };
  const departmentId = existing?.departmentId ?? input.departmentId;
  if (!departmentId || !scope.departmentIds.includes(departmentId)) return { ok: false, error: "You can only edit your department's proposal." };
  if (existing && !scope.isAdmin && !["DRAFT", "CHANGES_REQUESTED", "REJECTED", "APPROVED", "PENDING_APPROVAL"].includes(existing.status)) return { ok: false, error: "A pending proposal cannot be edited." };
  const checked = await validateInput(input, departmentId, existing?.id);
  if ("error" in checked) return { ok: false, error: checked.error ?? "Check the proposal." };
  const errors = checked.rows.map((r) => r.errors);
  if (errors.some((e) => e.length)) return { ok: false, error: "Resolve every row before saving.", errors };

  let target = existing;
  if (existing?.status === "APPROVED") {
    const latest = await prisma.activityProposal.aggregate({ where: { semesterId: input.semesterId, departmentId, level: input.level }, _max: { version: true } });
    target = await prisma.activityProposal.create({ data: { semesterId: input.semesterId, departmentId, level: input.level, preparedBy: input.preparedBy, designation: input.designation, version: (latest._max.version ?? existing.version) + 1, status: "DRAFT", createdById: scope.userId, parentId: existing.id }, include: { rows: true } });
  }
  const rowData = checked.rows.map((r) => ({ sortOrder: r.index, title: r.raw.activity, startDate: day(r.dates!.startDate), endDate: day(r.dates!.endDate), startMin: r.times!.startMin, endMin: r.times!.endMin, location: r.raw.location || null, level: r.raw.level || input.level, category: r.raw.category || inferActivityCategory(r.raw.activity), status: "PENDING" as const }));
  const latest = target ? null : await prisma.activityProposal.aggregate({ where: { semesterId: input.semesterId, departmentId, level: input.level }, _max: { version: true } });
  const saved = await prisma.$transaction(async (tx) => {
    const proposal = target
      ? await tx.activityProposal.update({ where: { id: target.id }, data: { semesterId: input.semesterId, level: input.level, preparedBy: input.preparedBy, designation: input.designation, status: scope.isAdmin ? target.status : "DRAFT", reviewNote: scope.isAdmin ? target.reviewNote : null, rows: { deleteMany: {}, create: rowData } } })
      : await tx.activityProposal.create({ data: { semesterId: input.semesterId, departmentId, level: input.level, preparedBy: input.preparedBy, designation: input.designation, version: (latest?._max.version ?? 0) + 1, createdById: scope.userId, rows: { create: rowData } } });
    await tx.auditLog.create({ data: { userId: scope.userId, action: `Saved school activities proposal v${proposal.version}`, entity: "ActivityProposal", entityId: proposal.id, newValue: { rows: rowData.length } } });
    return proposal;
  });
  refresh(); return { ok: true, proposalId: saved.id, version: saved.version };
}

/** Publishes validated department activities directly; no separate proposal approval. */
export async function submitProposalAction(id: string): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const proposal = await prisma.activityProposal.findUnique({ where: { id }, include: { rows: { orderBy: { sortOrder: "asc" } } } });
  if (!proposal || !scope.departmentIds.includes(proposal.departmentId) || !["DRAFT", "CHANGES_REQUESTED", "REJECTED", "PENDING_APPROVAL"].includes(proposal.status)) return { ok: false, error: "This proposal cannot be published." };
  if (!isAcademicLevel(proposal.level) || proposal.rows.some((row) => row.level && !isAcademicLevel(row.level))) return { ok: false, error: "Choose an academic level offered by Granby." };
  const proposalLevel = proposal.level;
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const checked = await validateInput({
    semesterId: proposal.semesterId, departmentId: proposal.departmentId, level: proposalLevel,
    preparedBy: proposal.preparedBy ?? scope.name, designation: proposal.designation ?? "Head of Department",
    rows: proposal.rows.map((row) => ({
      date: row.startDate.getTime() === row.endDate.getTime() ? iso(row.startDate) : `${iso(row.startDate)} to ${iso(row.endDate)}`,
      activity: row.title, time: row.startMin === null || row.endMin === null ? "" : `${clock(row.startMin)}-${clock(row.endMin)}`,
      location: row.location ?? "", level: isAcademicLevel(row.level) ? row.level : proposalLevel, category: row.category ?? "",
    })),
  }, proposal.departmentId, proposal.id);
  if ("error" in checked) return { ok: false, error: checked.error ?? "Check the activities." };
  const errors = checked.rows.map((row) => row.errors);
  if (errors.some((row) => row.length)) return { ok: false, error: "Resolve the highlighted rows before publishing.", errors };
  const published = await prisma.$transaction(async (tx) => {
    const claim = await tx.activityProposal.updateMany({ where: { id, status: proposal.status, updatedAt: proposal.updatedAt }, data: { status: "APPROVED", submittedAt: new Date(), reviewedById: scope.userId, reviewedAt: new Date(), reviewNote: null } });
    if (claim.count !== 1) return false;
    for (const row of proposal.rows) {
      if (row.activityId) continue;
      const category = row.category ?? inferActivityCategory(row.title);
      const examinationType = category === "EXAMINATION_WEEK" ? (/prelim/i.test(row.title) ? "PRELIMINARY" : /midterm/i.test(row.title) ? "MIDTERM" : /semi/i.test(row.title) ? "SEMI_FINAL" : /final/i.test(row.title) ? "FINAL" : null) : null;
      const activity = await tx.activity.create({ data: { type: category, examinationType, title: row.title, startDate: row.startDate, endDate: row.endDate, startMin: row.startMin, endMin: row.endMin, sectionIds: [], departmentId: proposal.departmentId, level: row.level ?? proposal.level, location: row.location, status: "APPROVED", createdById: proposal.createdById, reviewedById: scope.userId, reviewedAt: new Date() } });
      await tx.activityProposalRow.update({ where: { id: row.id }, data: { activityId: activity.id, status: "APPROVED", reviewNote: null } });
    }
    await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: proposal.departmentId, action: `Published school activities v${proposal.version}`, entity: "ActivityProposal", entityId: id } });
    return true;
  });
  if (!published) return { ok: false, error: "These activities changed. Refresh before publishing." };
  refresh(); return { ok: true };
}
