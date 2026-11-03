import { getScope, policyUserFromScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { activeRules } from "@/lib/scheduler/constraints-server";
import { departmentWhere, isForeign } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { DIRECT_EDIT_ROLES, PUBLISH_ROLES, STAFF_ROLES } from "@/lib/permissions/roles";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { SchedulerWorkspace } from "@/components/scheduler/scheduler-workspace";
import { AcademicYearSwitcher } from "@/components/scheduler/academic-year-switcher";
import type { SchedulerData } from "@/components/scheduler/types";
import { EmptyState } from "@/components/ux/states";
import { ModeSwitch } from "@/components/scheduler/mode-switch";
import { ExamMode } from "./exam-mode";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { activeTermIds } from "@/lib/workload/auto";

export const metadata = { title: "Scheduler · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

function location(r: { floor: { name: string; building: { name: string } } | null }) {
  return r.floor ? `${r.floor.building.name}, ${r.floor.name}` : "No building";
}

export default async function SchedulerPage({ searchParams }: { searchParams: Promise<{ ay?: string; termId?: string; mode?: string }> }) {
  const [scope, { ay, termId, mode: modeParam }, academicYears] = await Promise.all([
    getScope(),
    searchParams,
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
  ]);
  const role = scope.role;
  // Examination scheduling is for staff only; anything else falls back to the class schedule.
  const mode = modeParam === "examinations" && STAFF_ROLES.includes(role) ? "examinations" : "classes";

  const academicYear = academicYears.find((y) => y.id === ay) ?? academicYears.find((y) => y.isActive) ?? academicYears[0];

  if (!academicYear) {
    return (
      <EmptyState
        title="No academic year yet"
        description="Create an academic year and its terms under Academic Years and Terms before scheduling classes."
      />
    );
  }

  if (mode === "examinations") {
    return (
      <div data-viewport-lock className="flex flex-col gap-2 lg:h-full lg:min-h-0 lg:overflow-hidden">
        <ModeSwitch mode={mode} academicYearId={academicYear.id} />
        <div className="lg:min-h-0 lg:flex-1">
          <ExamMode scope={scope} academicYearId={academicYear.id} academicYearControl={<AcademicYearSwitcher key="academic-year-switcher" years={academicYears.map((y) => ({ id: y.id, name: y.name, isActive: y.isActive }))} currentId={academicYear.id} />} />
        </div>
      </div>
    );
  }

  // A Head of Department (and a faculty member) gets their own department's records only. Other departments'
  // faculty and rooms come marked as foreign (choosing one sends a request), and their classes arrive only
  // as anonymous busy blocks so conflicts are still caught.
  const scheduleScope = scope.isAdmin
    ? {}
    : scope.role === "HEAD_OF_DEPARTMENT"
      ? departmentWhere.schedule(scope)
      : { facultyId: scope.facultyId ?? "__none__" };
  const inYear = { semester: { academicYearId: academicYear.id }, status: { not: "ARCHIVED" as const } };
  // Everything that does not depend on the visible classes loads in one round.
  const [allEntries, busyRows, programs, allTerms, departments, faculty, rooms, rules, assignmentRows, workload] = await Promise.all([
    prisma.schedule.findMany({ where: { AND: [scheduleScope, inYear] }, include: { section: { select: { departmentId: true, programId: true } } } }),
    // Other departments' classes arrive only as anonymous busy blocks (time, room, and faculty known to this scope).
    role === "HEAD_OF_DEPARTMENT"
      ? prisma.schedule.findMany({ where: { ...inYear, NOT: scheduleScope }, select: { semesterId: true, facultyId: true, roomId: true, dayOfWeek: true, startMin: true, endMin: true } })
      : Promise.resolve([]),
    prisma.program.findMany({ where: departmentWhere.program(scope), orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { code: "asc" }] }),
    prisma.semester.findMany({ where: { academicYearId: academicYear.id }, include: { program: { select: { code: true } } }, orderBy: [{ level: "asc" }, { startDate: "asc" }] }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { code: "asc" } }),
    prisma.faculty.findMany({ where: departmentWhere.faculty(scope), include: { availability: true }, orderBy: { fullName: "asc" } }),
    prisma.room.findMany({
      // Rooms stay campus-wide for availability; other departments' rooms are marked and only ever show as busy.
      where: { archivedAt: null },
      include: { availability: true, programs: { select: { id: true } }, floor: { select: { name: true, building: { select: { name: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { roomName: "asc" }],
    }),
    // Rules the Resolve issues solver checks in the browser: school-wide ones and the viewer's department's.
    STAFF_ROLES.includes(role) ? activeRules() : Promise.resolve([]),
    prisma.subjectAssignment.findMany({ where: { status: "ACTIVE", semester: { academicYearId: academicYear.id } }, select: { subjectId: true, sectionId: true, facultyId: true } }),
    // Loads come from the workload engine so the warnings match the Faculty Workload page exactly.
    STAFF_ROLES.includes(role) ? activeTermIds().then((ids) => loadWorkload(ids, null)) : Promise.resolve(null),
  ]);
  // A Head of Department restricted to programs sees only those programs' classes.
  const inProgramScope = (programId: string | null) => !scope.programIds.length || (!!programId && scope.programIds.includes(programId));
  const visible = (e: (typeof allEntries)[number]) => scope.isAdmin || (scope.role === "HEAD_OF_DEPARTMENT" && scope.departmentIds.includes(e.section.departmentId ?? "") && inProgramScope(e.section.programId)) || (!!scope.facultyId && e.facultyId === scope.facultyId);
  const entries = allEntries.filter(visible);
  const shownSections = new Set(entries.map((e) => e.sectionId));
  const shownSubjects = new Set(entries.map((e) => e.subjectId));
  const facultyIds = new Set(faculty.map((f) => f.id));
  // Other departments' faculty teaching visible classes (often General Education): name and department only.
  const outsideIds = [...new Set(entries.map((e) => e.facultyId))].filter((id) => id && !facultyIds.has(id));

  // Second round: records that depend on which classes are visible.
  const [sections, subjects, outsideFaculty] = await Promise.all([
    prisma.section.findMany({
      where: { AND: [{ OR: [departmentWhere.section(scope), { id: { in: [...shownSections] } }] }, { semester: { academicYearId: academicYear.id } }] },
      include: { classPlaceholders: { select: { subjectId: true, component: true } } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.subject.findMany({ where: { OR: [departmentWhere.subject(scope), { id: { in: [...shownSubjects] } }] }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    outsideIds.length
      ? prisma.faculty.findMany({ where: { id: { in: outsideIds }, archivedAt: null }, select: { id: true, fullName: true, department: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);
  // Levels, terms, and filters of a Head of Department follow the scoped programs and sections only.
  const scopedLevelList = [...new Set([...programs.map((p) => p.level), ...sections.map((s) => s.level)])];
  const onlyLevel = role === "HEAD_OF_DEPARTMENT" && scopedLevelList.length === 1 ? scopedLevelList[0] : null;
  const programIds = new Set(programs.map((p) => p.id));
  const terms = role === "HEAD_OF_DEPARTMENT" ? allTerms.filter((t) => scopedLevelList.includes(t.level) && (!t.programId || programIds.has(t.programId))) : allTerms;
  const policyUser = policyUserFromScope(scope);
  const programCode = new Map(programs.map((p) => [p.id, p.code]));
  const toEntry = (e: (typeof allEntries)[number]) => ({
    id: e.id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, facultyId: e.facultyId, roomId: e.roomId,
    component: e.component, dayOfWeek: e.dayOfWeek, startMin: e.startMin, endMin: e.endMin, status: e.status, notes: e.notes,
  });

  const data: SchedulerData = {
    academicYears: academicYears.map((y) => ({ id: y.id, name: y.name, isActive: y.isActive })),
    academicYearId: academicYear.id,
    terms: terms.map((t) => ({
      id: t.id,
      academicYearId: t.academicYearId,
      level: t.level,
      programId: t.programId,
      type: t.type,
      label: `${levelLabel(t.level)}${t.program ? ` ${t.program.code}` : ""} · ${termLabel(t.type)}${t.isActive ? " (active)" : ""}`,
      isActive: t.isActive,
      start: t.startDate.getTime(),
      end: t.endDate.getTime(),
    })),
    departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name })),
    programs: programs.map((p) => ({ id: p.id, code: p.code, name: p.name, level: p.level, departmentId: p.departmentId })),
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      programId: s.programId,
      yearLevel: s.yearLevel,
      gradeLevel: s.gradeLevel,
      semesterId: s.semesterId,
      studentCount: s.studentCount,
      curriculum: s.classPlaceholders,
      archived: !!s.archivedAt,
      departmentId: s.departmentId,
      // "BSIT 1-A" from the program code and the last word of the name.
      shortName: s.programId && programCode.has(s.programId) ? `${programCode.get(s.programId)} ${s.name.split(" ").at(-1)}` : s.name,
      editable: STAFF_ROLES.includes(role) && !s.archivedAt && can(policyUser, "edit", { type: "section", id: s.id, departmentId: s.departmentId, programId: s.programId }),
    })),
    subjects: subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      level: s.level,
      programId: s.programId,
      yearLevel: s.yearLevel,
      gradeLevel: s.gradeLevel,
      lectureHours: s.lectureHours,
      labHours: s.labHours,
      units: s.units,
      requiredRoomType: s.requiredRoomType,
      archived: !!s.archivedAt,
    })),
    faculty: faculty.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      maxHours: f.maxHours,
      dayOff: f.employmentType === "PART_TIME" ? f.dayOff : null,
      departmentId: f.departmentId,
      teachingLevels: f.teachingLevels,
      // Archived faculty count as inactive: kept on existing classes, never suggested.
      status: f.archivedAt ? "ARCHIVED" : f.status,
      foreign: isForeign(scope, f.departmentId),
      availability: f.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomName: r.roomName,
      capacity: r.capacity,
      roomType: r.roomType,
      status: r.status,
      location: location(r),
      availability: r.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
      programIds: r.isGeneralShared ? null : r.programs.map((p) => p.id),
      archived: !!r.archivedAt,
      foreign: isForeign(scope, r.departmentId),
    })),
    rules: rules.filter((r) => scope.isAdmin || !r.departmentId || scope.departmentIds.includes(r.departmentId)),
    // Only assignments for sections this viewer can see; all-sections rows apply to any of them.
    assignments: assignmentRows.filter((a) => !a.sectionId || sections.some((s) => s.id === a.sectionId)),
    workload: {
      measure: workload?.limits.measure ?? "HOURS",
      loads: workload ? loadReport(workload.faculty.filter((f) => facultyIds.has(f.id)), workload.assignments, workload.limits).map(({ facultyId, name, load, minimum, maximum }) => ({ facultyId, name, load, minimum, maximum })) : [],
    },
    outsideFaculty: outsideFaculty.map((f) => ({ id: f.id, fullName: f.fullName, department: f.department?.name ?? "another department" })),
    entries: entries.map(toEntry),
    // Other departments' classes: only who and where is busy, never which class (each gets its own placeholder section).
    busy: STAFF_ROLES.includes(role)
      ? [...allEntries.filter((e) => !visible(e)), ...busyRows.map((e) => ({ ...e, sectionId: "", subjectId: "" }))].map((e, i) => ({
          id: `busy-${i}`, semesterId: e.semesterId, sectionId: `busy-${i}`, subjectId: "", roomId: e.roomId, component: "LECTURE" as const,
          dayOfWeek: e.dayOfWeek, startMin: e.startMin, endMin: e.endMin, status: "PUBLISHED" as const, notes: null, busy: true,
          // Faculty of other departments stay unnamed; the id is kept only for people this scope already sees.
          facultyId: facultyIds.has(e.facultyId) ? e.facultyId : "",
        }))
      : [],
  };

  const ownFacultyId = role === "FACULTY" ? scope.facultyId : null;

  return (
    <div data-viewport-lock className="flex flex-col gap-2 lg:h-full lg:min-h-0 lg:overflow-hidden">
      {STAFF_ROLES.includes(role) && <ModeSwitch mode={mode} academicYearId={academicYear.id} />}
      <div className="lg:min-h-0 lg:flex-1">
      <SchedulerWorkspace
        // Remount when switching academic year so filters reset to that year's terms.
        key={academicYear.id}
        data={data}
        permissions={{
          canEdit: STAFF_ROLES.includes(role),
          canPublish: PUBLISH_ROLES.includes(role),
          canSubmit: role === "HEAD_OF_DEPARTMENT",
          directEdit: DIRECT_EDIT_ROLES.includes(role),
          queueOnly: role === "HEAD_OF_DEPARTMENT",
          lockedLevel: onlyLevel,
          ownFacultyId,
        }}
        defaults={ownFacultyId ? { facultyId: ownFacultyId } : role === "HEAD_OF_DEPARTMENT" ? {
          ...(onlyLevel ? { level: onlyLevel } : {}),
          termId: terms.some((term) => term.id === termId) ? termId : (terms.find((term) => term.isActive)?.id ?? terms[0]?.id ?? ""),
        } : {}}
        academicYearControl={<AcademicYearSwitcher key="academic-year-switcher" years={data.academicYears} currentId={academicYear.id} />}
      />
      </div>
    </div>
  );
}
