import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { loadWorkload } from "@/lib/workload/load";
import { amountOf, loadReport, type Move } from "@/lib/workload/optimizer";
import { formatRange, DAY_LONG } from "@/lib/scheduler/timetable";
import { PageHeader } from "@/components/ux/states";
import { WorkloadBoard, type FacultyLoad, type ProposalView } from "./workload-board";

export const metadata = { title: "Faculty Workload · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const scope = await getScope();
  const staff = scope.role !== "FACULTY";
  const { term: termParam } = await searchParams;

  const terms = await prisma.semester.findMany({ where: { academicYear: { isActive: true } }, orderBy: [{ level: "asc" }, { startDate: "asc" }] });
  const term = terms.find((t) => t.id === termParam) ?? terms.find((t) => t.isActive && t.level === "COLLEGE") ?? terms.find((t) => t.isActive) ?? terms[0];
  if (!term) return <PageHeader title="Faculty Workload" description="Create an academic year and its terms first." />;

  // Faculty see only themselves; Heads of Department their department; the Administrator everyone.
  const departmentId = staff ? scope.manageDepartmentId : null;
  const { limits, faculty, assignments } = await loadWorkload([term.id], scope.role === "FACULTY" ? null : departmentId);
  const visibleFaculty = scope.role === "FACULTY" ? faculty.filter((f) => f.id === scope.facultyId) : faculty;
  const report = loadReport(visibleFaculty, assignments, limits);

  const rows: FacultyLoad[] = report.map((r) => {
    const f = visibleFaculty.find((x) => x.id === r.facultyId)!;
    const mine = assignments.filter((a) => a.facultyId === r.facultyId);
    return {
      ...r,
      department: f.departmentName,
      classes: mine.map((a) => ({
        label: `${a.subjectName}, ${a.sectionName}`,
        amount: amountOf(a, limits),
        when: a.meetings.map((m) => `${DAY_LONG[m.dayOfWeek]} ${formatRange(m.startMin, m.endMin)}`).join("; "),
      })),
    };
  });

  let proposals: ProposalView[] = [];
  if (staff) {
    const raw = await prisma.workloadProposal.findMany({
      where: { semesterId: term.id, ...(scope.isAdmin ? {} : { departmentId: scope.departmentId }) },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const names = new Map((await prisma.faculty.findMany({ select: { id: true, fullName: true } })).map((f) => [f.id, f.fullName]));
    proposals = raw.map((p) => ({
      id: p.id,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      explanation: p.explanation,
      narrative: p.narrative,
      canReview: p.status === "PENDING" && (scope.isAdmin || (!!p.departmentId && p.departmentId === scope.departmentId)),
      moves: (p.items as unknown as Move[]).map((m) => ({ ...m, from: names.get(m.fromFacultyId) ?? "Faculty", to: names.get(m.toFacultyId) ?? "Faculty" })),
    }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={staff ? "Faculty Workload" : "My Teaching Load"}
        description={
          staff
            ? `Current teaching load against the ${limits.minimum} to ${limits.maximum} ${limits.measure === "HOURS" ? "weekly hours" : "units"} set by the Administrator. The optimizer suggests reassignments that need approval before they apply.`
            : `Your teaching load against the allowed ${limits.minimum} to ${limits.maximum} ${limits.measure === "HOURS" ? "weekly hours" : "units"}.`
        }
      />
      <WorkloadBoard
        staff={staff}
        measure={limits.measure}
        termId={term.id}
        terms={terms.map((t) => ({ value: t.id, label: `${levelLabel(t.level)} · ${termLabel(t.type)}` }))}
        rows={rows}
        proposals={proposals}
        aiEnabled={!!process.env.GEMINI_API_KEY}
      />
    </div>
  );
}
