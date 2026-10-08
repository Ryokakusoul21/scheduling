import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { DIRECT_EDIT_ROLES, PUBLISH_ROLES, STAFF_ROLES, type AppRole } from "@/lib/permissions/roles";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { SchedulerWorkspace } from "@/components/scheduler/scheduler-workspace";
import { AcademicYearSwitcher } from "@/components/scheduler/academic-year-switcher";
import type { SchedulerData } from "@/components/scheduler/types";
import { EmptyState } from "@/components/ux/states";

export const metadata = { title: "Scheduler · GCST Scheduling" };

function location(r: { floor: { name: string; building: { name: string } } | null }) {
  return r.floor ? `${r.floor.building.name}, ${r.floor.name}` : "No building";
}

export default async function SchedulerPage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const user = await requireUser();
  const role = user.role as AppRole;
  const { ay } = await searchParams;

  const academicYears = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const academicYear = academicYears.find((y) => y.id === ay) ?? academicYears.find((y) => y.isActive) ?? academicYears[0];

  if (!academicYear) {
    return (
      <EmptyState
        title="No academic year yet"
        description="Create an academic year and its terms under Academic Years & Terms before scheduling classes."
      />
    );
  }

  const [terms, departments, programs, sections, subjects, faculty, rooms, ownFaculty] = await Promise.all([
    prisma.semester.findMany({
      where: { academicYearId: academicYear.id },
      include: { program: { select: { code: true } } },
      orderBy: [{ level: "asc" }, { startDate: "asc" }],
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.program.findMany({ orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { code: "asc" }] }),
    prisma.section.findMany({ orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.subject.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.faculty.findMany({ include: { availability: true }, orderBy: { fullName: "asc" } }),
    prisma.room.findMany({
      include: { availability: true, floor: { select: { name: true, building: { select: { name: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { roomName: "asc" }],
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { facultyId: true } }),
  ]);

  const entries = await prisma.schedule.findMany({
    where: { semesterId: { in: terms.map((t) => t.id) }, status: { not: "ARCHIVED" } },
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
      requiredRoomType: s.requiredRoomType,
    })),
    faculty: faculty.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      maxHours: f.maxHours,
      departmentId: f.departmentId,
      teachingLevels: f.teachingLevels,
      status: f.status,
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
    })),
    entries: entries.map((e) => ({
      id: e.id,
      semesterId: e.semesterId,
      sectionId: e.sectionId,
      subjectId: e.subjectId,
      facultyId: e.facultyId,
      roomId: e.roomId,
      component: e.component,
      dayOfWeek: e.dayOfWeek,
      startMin: e.startMin,
      endMin: e.endMin,
      status: e.status,
      notes: e.notes,
    })),
  };

  const ownFacultyId = role === "FACULTY" ? (ownFaculty?.facultyId ?? null) : null;

  return (
    <div className="space-y-3">
      <AcademicYearSwitcher years={data.academicYears} currentId={academicYear.id} />
      <SchedulerWorkspace
        // Remount when switching academic year so filters reset to that year's terms.
        key={academicYear.id}
        data={data}
        permissions={{
          canEdit: STAFF_ROLES.includes(role),
          canPublish: PUBLISH_ROLES.includes(role),
          directEdit: DIRECT_EDIT_ROLES.includes(role),
          ownFacultyId,
        }}
        defaults={ownFacultyId ? { facultyId: ownFacultyId } : {}}
      />
    </div>
  );
}
