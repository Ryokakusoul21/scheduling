import { roomLabel } from "@/lib/rooms/label";
import { availableDays } from "@/lib/faculty/available-days";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { FacultyBrowser } from "./faculty-browser";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { activeTermIds } from "@/lib/workload/auto";

export const metadata = { title: "Faculty · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { q } = await searchParams;
  // A Head of Department can view their own department's faculty.
  const own = scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId };
  // Room preferences are for the Head of Department and the Registrar only.
  const canPrefer = scope.role === "HEAD_OF_DEPARTMENT" || scope.role === "REGISTRAR";
  const [faculty, departments, workload, rooms] = await Promise.all([
    prisma.faculty.findMany({
      where: { ...own, archivedAt: null },
      include: {
        department: { select: { code: true, name: true } },
        user: { select: { image: true } },
        roomPreferences: { orderBy: { rank: "asc" }, select: { roomId: true } },
        availability: { select: { dayOfWeek: true } },
        // Teaching load counts classes in currently active terms only.
        schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true }, ...submittedTimetableFilter(scope.role) }, select: { startMin: true, endMin: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({ where: scope.isAdmin ? {} : { id: scope.manageDepartmentId ?? "__none__" }, orderBy: { name: "asc" } }),
    // Load and status come from the workload engine, the same numbers as Faculty Workload.
    activeTermIds().then((ids) => loadWorkload(ids, null, { visibilityRole: scope.role })),
    canPrefer ? prisma.room.findMany({ where: { archivedAt: null, ...(scope.isAdmin ? {} : { OR: [{ departmentId: scope.manageDepartmentId }, { departmentId: null }] }) }, orderBy: { roomNumber: "asc" }, select: { id: true, roomNumber: true, roomName: true, capacity: true } }) : Promise.resolve(null),
  ]);
  const loads = new Map(loadReport(workload.faculty, workload.assignments, workload.limits).map((r) => [r.facultyId, r]));

  return (
    <FacultyBrowser
      canManage={can(policyUserFromScope(scope), "edit", { type: "faculty" })}
      initialQuery={q ?? ""}
      rooms={rooms?.map((r) => ({ id: r.id, label: `${roomLabel(r)} · ${r.capacity} seats` })) ?? null}
      departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      faculty={faculty.map((f) => ({
        id: f.id,
        employeeId: f.employeeId,
        fullName: f.fullName,
        image: f.user?.image ?? null,
        email: f.email,
        position: f.position ?? "",
        specialization: f.specialization ?? "",
        departmentId: f.departmentId ?? "",
        department: f.department?.name ?? null,
        maxHours: f.maxHours,
        employmentType: f.employmentType,
        dayOff: f.dayOff ?? "",
        availableDays: f.employmentType === "PART_TIME" ? availableDays(f) : [],
        status: f.status,
        teachingLevels: f.teachingLevels,
        load: loads.get(f.id) ?? null,
        loadUnit: workload.limits.measure === "HOURS" ? "hours" : "units",
        classes: f.schedules.length,
        preferredRoomIds: canPrefer ? f.roomPreferences.map((p) => p.roomId) : [],
      }))}
    />
  );
}
