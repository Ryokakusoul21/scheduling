import "server-only";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import type { Scope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { termLabel } from "@/lib/academics/levels";
import { departmentLevels, type PolicyOption, type PolicyOptions } from "./policy-options";

/** Only authorized department data reaches the editor; client filtering narrows this further. */
export async function loadPolicyOptions(scope: Scope): Promise<PolicyOptions> {
  const departments = (await prisma.department.findMany({ where: departmentWhere.department(scope), select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }))
    .filter((d) => can({ ...scope, id: scope.userId }, "edit", { type: "program", departmentId: d.id }));
  const ids = departments.map((d) => d.id);
  const sectionWhere = { archivedAt: null, AND: [departmentWhere.section(scope), { departmentId: { in: ids } }] };
  const [programRows, sectionRows] = await Promise.all([
    prisma.program.findMany({ where: { AND: [departmentWhere.program(scope), { departmentId: { in: ids } }] }, select: { id: true, code: true, name: true, level: true, departmentId: true }, orderBy: { code: "asc" } }),
    prisma.section.findMany({ where: sectionWhere, select: { id: true, name: true, departmentId: true, programId: true, level: true, yearLevel: true, gradeLevel: true, semesterId: true, semester: { select: { academicYearId: true } } }, orderBy: { name: "asc" } }),
  ]);
  const restricted = !scope.isAdmin && scope.programIds.length > 0;
  const programs = programRows.filter((p) => !!p.departmentId && ids.includes(p.departmentId) && (!restricted || scope.programIds.includes(p.id)));
  const sections = sectionRows.filter((s) => !!s.departmentId && ids.includes(s.departmentId) && (!restricted || !!s.programId && scope.programIds.includes(s.programId)));
  const managed = departments.map((d) => ({ value: d.id, label: d.name, code: d.code, levels: departmentLevels(d.code, d.name, [...programs.filter((p) => p.departmentId === d.id).map((p) => p.level), ...sections.filter((s) => s.departmentId === d.id).map((s) => s.level)]).filter((level) => !scope.programIds.length || programs.some((p) => p.departmentId === d.id && p.level === level)) }));
  const levels = [...new Set(managed.flatMap((d) => d.levels))];
  const [terms, subjects, meetings] = await Promise.all([
    prisma.semester.findMany({ where: { level: { in: levels }, OR: [{ programId: null }, { programId: { in: programs.map((p) => p.id) } }] }, include: { academicYear: { select: { id: true, name: true, isActive: true } } }, orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }] }),
    prisma.subject.findMany({ where: { archivedAt: null, AND: [departmentWhere.subject(scope)], level: { in: levels } }, select: { id: true, code: true, name: true, level: true, category: true, programId: true, departmentId: true, department: { select: { code: true } }, sharedPrograms: { select: { id: true } }, classPlaceholders: { where: { section: sectionWhere }, select: { section: { select: { id: true, departmentId: true, programId: true } } } } }, orderBy: { code: "asc" } }),
    prisma.schedule.findMany({ where: { status: { not: "ARCHIVED" }, AND: [departmentWhere.schedule(scope), { section: sectionWhere }] }, select: { id: true, semesterId: true, component: true, dayOfWeek: true, startMin: true, sectionId: true, subjectId: true, section: { select: { name: true, departmentId: true, level: true, programId: true, yearLevel: true, gradeLevel: true } }, subject: { select: { code: true, category: true } } }, orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] }),
  ]);
  const termOptions = terms.flatMap((t) => {
    const departmentIds = managed.filter((d) => d.levels.includes(t.level) && (!t.programId || programs.some((p) => p.id === t.programId && p.departmentId === d.value))).map((d) => d.value);
    return departmentIds.length ? [{ value: t.id, label: termLabel(t.type), level: t.level, programId: t.programId, academicYearId: t.academicYearId, departmentIds, isActive: t.isActive }] : [];
  });
  const subjectOptions: PolicyOption[] = subjects.flatMap((s) => {
    const departmentIds = managed.filter((d) => d.levels.includes(s.level) && (
      s.departmentId === d.value && (!scope.programIds.length || !s.programId || programs.some((p) => p.id === s.programId && p.departmentId === d.value))
      || programs.some((p) => p.departmentId === d.value && (p.id === s.programId || s.sharedPrograms.some((shared) => shared.id === p.id)))
      || s.classPlaceholders.some((placeholder) => placeholder.section.departmentId === d.value)
      || !s.programId && !s.sharedPrograms.length && s.level === "COLLEGE" && (!s.departmentId || s.department?.code === "GENED")
    )).map((d) => d.value);
    return departmentIds.length ? [{ value: s.id, label: `${s.code} - ${s.name}`, level: s.level, category: s.category, programId: s.programId, programIds: [...new Set([...(s.programId ? [s.programId] : []), ...s.sharedPrograms.map((p) => p.id), ...s.classPlaceholders.flatMap((p) => p.section.programId ? [p.section.programId] : []), ...(!s.programId && !s.sharedPrograms.length ? programs.filter((p) => departmentIds.includes(p.departmentId ?? "") && p.level === s.level).map((p) => p.id) : [])])], sectionIds: s.classPlaceholders.map((p) => p.section.id), departmentIds }] : [];
  });
  const visibleTerms = new Set(termOptions.map((t) => t.value));
  return {
    departments: managed,
    years: [...new Map(terms.filter((t) => visibleTerms.has(t.id)).map((t) => [t.academicYear.id, { value: t.academicYear.id, label: t.academicYear.name, isActive: t.academicYear.isActive }])).values()],
    terms: termOptions,
    programs: programs.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}`, departmentId: p.departmentId, level: p.level })),
    sections: sections.map((s) => ({ value: s.id, label: s.name, departmentId: s.departmentId, level: s.level, programId: s.programId, yearLevel: s.yearLevel, gradeLevel: s.gradeLevel, termId: s.semesterId, academicYearId: s.semester?.academicYearId })),
    subjects: subjectOptions,
    classes: meetings.filter((m) => visibleTerms.has(m.semesterId) && sections.some((s) => s.id === m.sectionId)).map((m) => ({ value: m.id, label: `${m.section.name} - ${m.subject.code} - ${m.dayOfWeek} ${String(Math.floor(m.startMin / 60)).padStart(2, "0")}:${String(m.startMin % 60).padStart(2, "0")}`, departmentId: m.section.departmentId, level: m.section.level, programId: m.section.programId, yearLevel: m.section.yearLevel, gradeLevel: m.section.gradeLevel, sectionId: m.sectionId, subjectId: m.subjectId, termId: m.semesterId, academicYearId: terms.find((t) => t.id === m.semesterId)?.academicYearId, category: m.subject.category, component: m.component })),
  };
}
