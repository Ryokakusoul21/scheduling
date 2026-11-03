"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { notifyManagers, notifyUsers } from "@/lib/notify";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
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
  const scope = await requireScope("HEAD_OF_DEPARTMENT", "ADMINISTRATOR");
  if (!scope.departmentId && !scope.isAdmin) return { ok: false, error: "Your account is not linked to a department." };
  const departmentId = scope.isAdmin ? input.departmentId : scope.departmentId ?? "";
  if (!departmentId || (!scope.isAdmin && departmentId !== input.departmentId)) return { ok: false, error: "You can only prepare proposals for your department." };
  const checked = await validateInput(input, departmentId);
  if ("error" in checked) return { ok: false, error: checked.error ?? "Check the proposal." };
  const errors = checked.rows.map((r) => r.errors);
  return errors.some((e) => e.length) ? { ok: false, error: "Resolve the highlighted rows before saving.", errors } : { ok: true, warnings: errors };
}

export async function saveProposalDraftAction(input: Input, proposalId?: string): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT", "ADMINISTRATOR");
  const existing = proposalId ? await prisma.activityProposal.findUnique({ where: { id: proposalId }, include: { rows: true } }) : null;
  const departmentId = existing?.departmentId ?? (scope.isAdmin ? input.departmentId : scope.departmentId);
  if (!departmentId || (!scope.isAdmin && departmentId !== scope.departmentId)) return { ok: false, error: "You can only edit your department's proposal." };
  if (existing && !scope.isAdmin && !["DRAFT", "CHANGES_REQUESTED", "REJECTED", "APPROVED"].includes(existing.status)) return { ok: false, error: "A pending proposal cannot be edited." };
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

export async function submitProposalAction(id: string): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const proposal = await prisma.activityProposal.findUnique({ where: { id }, include: { rows: true, semester: { include: { academicYear: true } }, department: true } });
  if (!proposal || proposal.departmentId !== scope.departmentId || !["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(proposal.status)) return { ok: false, error: "This proposal cannot be submitted." };
  if (!proposal.rows.length) return { ok: false, error: "Add at least one activity." };
  await prisma.activityProposal.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), reviewNote: null, rows: { updateMany: { where: {}, data: { status: "PENDING", reviewNote: null } } } } });
  await notifyManagers(null, { title: "School activities proposal", message: `${scope.name} submitted ${proposal.department.name} activities for ${proposal.semester.academicYear.name}, ${proposal.semester.name}.`, link: `/calendar/proposals?proposal=${id}` });
  refresh(); return { ok: true };
}

const reviewSchema = z.object({ proposalId: z.string(), decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), note: z.string().trim().max(500).optional(), rowIds: z.array(z.string()).optional() }).refine((x) => x.decision === "APPROVED" || !!x.note, { message: "A reason is required." });
export async function reviewProposalAction(input: z.input<typeof reviewSchema>): Promise<Result> {
  const scope = await requireScope("ADMINISTRATOR"); const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  const p = await prisma.activityProposal.findUnique({ where: { id: parsed.data.proposalId }, include: { rows: true, semester: { include: { academicYear: true } }, department: true } });
  if (!p || p.status !== "PENDING_APPROVAL") return { ok: false, error: "This proposal is not awaiting review." };
  const ids = parsed.data.rowIds?.length ? parsed.data.rowIds : p.rows.map((r) => r.id);
  const rowStatus = parsed.data.decision === "APPROVED" ? "APPROVED" : parsed.data.decision;
  await prisma.activityProposalRow.updateMany({ where: { proposalId: p.id, id: { in: ids } }, data: { status: rowStatus, reviewNote: parsed.data.note || null } });
  const rows = await prisma.activityProposalRow.findMany({ where: { proposalId: p.id }, orderBy: { sortOrder: "asc" } });
  const pending = rows.some((r) => r.status === "PENDING");
  const requested = rows.some((r) => r.status === "CHANGES_REQUESTED");
  const allRejected = rows.every((r) => r.status === "REJECTED");
  const status = pending ? "PENDING_APPROVAL" : requested ? "CHANGES_REQUESTED" : allRejected ? "REJECTED" : "APPROVED";
  if (!pending) {
    await prisma.$transaction(async (tx) => {
      const approved = rows.filter((r) => r.status === "APPROVED" && !r.activityId).map((row) => ({ row, activityId: crypto.randomUUID() }));
      if (approved.length) {
        await tx.activity.createMany({
          data: approved.map(({ row, activityId }) => {
            const category = row.category ?? inferActivityCategory(row.title);
            const examType = category === "EXAMINATION_WEEK" ? (/prelim/i.test(row.title) ? "PRELIMINARY" : /midterm/i.test(row.title) ? "MIDTERM" : /semi/i.test(row.title) ? "SEMI_FINAL" : /final/i.test(row.title) ? "FINAL" : null) : null;
            return { id: activityId, type: category, examinationType: examType, title: row.title, startDate: row.startDate, endDate: row.endDate, startMin: row.startMin, endMin: row.endMin, sectionIds: [], departmentId: p.departmentId, level: row.level ?? p.level, location: row.location, status: "APPROVED" as const, createdById: p.createdById, reviewedById: scope.userId, reviewedAt: new Date() };
          }),
        });
        await tx.$executeRaw`UPDATE "ActivityProposalRow" AS r SET "activityId" = v.aid FROM (VALUES ${Prisma.join(approved.map((a) => Prisma.sql`(${a.row.id}, ${a.activityId})`))}) AS v(id, aid) WHERE r."id" = v.id`;
      }
      await tx.activityProposal.update({ where: { id: p.id }, data: { status, reviewNote: parsed.data.note || null, reviewedById: scope.userId, reviewedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: scope.userId, action: `Reviewed school activities proposal v${p.version}: ${status}`, entity: "ActivityProposal", entityId: p.id, newValue: { status, note: parsed.data.note || null } } });
    });
    await notifyUsers([p.createdById], { title: `Activities proposal ${status.toLowerCase().replaceAll("_", " ")}`, message: `${p.department.name} v${p.version} was ${status.toLowerCase().replaceAll("_", " ")}${parsed.data.note ? `: ${parsed.data.note}` : "."}`, link: `/calendar/proposals?proposal=${p.id}`, type: status === "APPROVED" ? "SUCCESS" : status === "REJECTED" ? "ERROR" : "WARNING" });
  }
  refresh(); return { ok: true };
}
