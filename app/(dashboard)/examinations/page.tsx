import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { PageHeader } from "@/components/ux/states";
import { ExamManager, type ExamRow } from "./exam-manager";

export const metadata = { title: "Examinations · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ExaminationsPage() {
  const scope = await getScope();
  const canEdit = scope.role !== "FACULTY";
  const departmentSections = scope.isAdmin ? {} : { program: { departmentId: scope.manageDepartmentId } };

  // Faculty see examinations they proctor or that belong to sections they teach; Heads of Department also see their department.
  const visible = scope.isAdmin
    ? {}
    : {
        OR: [
          ...(scope.facultyId ? [{ proctorId: scope.facultyId }, { section: { schedules: { some: { facultyId: scope.facultyId } } } }] : []),
          ...(canEdit ? [{ section: departmentSections }] : []),
        ],
      };

  const [exams, terms, sections, subjects, rooms, faculty] = await Promise.all([
    prisma.examination.findMany({
      where: visible,
      include: {
        subject: { select: { code: true, name: true } },
        section: { select: { name: true } },
        room: { select: { roomName: true } },
        proctor: { select: { fullName: true } },
        semester: { select: { level: true, type: true, academicYear: { select: { name: true } } } },
      },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    canEdit ? prisma.semester.findMany({ where: { academicYear: { isActive: true } }, orderBy: [{ level: "asc" }, { startDate: "asc" }] }) : [],
    canEdit ? prisma.section.findMany({ where: { ...departmentSections, archivedAt: null }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }] }) : [],
    canEdit ? prisma.subject.findMany({ where: { archivedAt: null }, orderBy: [{ level: "asc" }, { code: "asc" }] }) : [],
    canEdit ? prisma.room.findMany({ where: { status: "AVAILABLE", archivedAt: null }, orderBy: { roomName: "asc" } }) : [],
    canEdit ? prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null }, orderBy: { fullName: "asc" } }) : [],
  ]);

  const rows: ExamRow[] = exams.map((e) => ({
    id: e.id,
    semesterId: e.semesterId,
    sectionId: e.sectionId,
    subjectId: e.subjectId,
    roomId: e.roomId,
    proctorId: e.proctorId,
    type: e.type,
    date: e.date.toISOString().slice(0, 10),
    startMin: e.startMin,
    endMin: e.endMin,
    notes: e.notes ?? "",
    subject: `${e.subject.code} ${e.subject.name}`,
    section: e.section.name,
    room: e.room.roomName,
    proctor: e.proctor.fullName,
    term: `${levelLabel(e.semester.level)} ${termLabel(e.semester.type)} ${e.semester.academicYear.name}`,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Examinations"
        description={
          canEdit
            ? "Schedule examinations by date, time, room, proctor, subject, and section. Rooms, proctors, and sections can never be double-booked."
            : "Examinations you proctor and examinations of the sections you teach."
        }
      />
      <ExamManager
        rows={rows}
        canEdit={canEdit}
        options={{
          terms: terms.map((t) => ({ value: t.id, label: `${levelLabel(t.level)} · ${termLabel(t.type)}`, level: t.level })),
          sections: sections.map((s) => ({ value: s.id, label: `${s.name} (${s.studentCount} students)`, level: s.level })),
          subjects: subjects.map((s) => ({ value: s.id, label: `${s.code} ${s.name}`, level: s.level })),
          rooms: rooms.map((r) => ({ value: r.id, label: `${r.roomName} (${r.capacity} seats)` })),
          faculty: faculty.map((f) => ({ value: f.id, label: f.fullName })),
        }}
      />
    </div>
  );
}
