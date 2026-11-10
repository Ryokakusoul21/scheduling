import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, WarningOctagon } from "@phosphor-icons/react/ssr";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { PUBLISH_ROLES } from "@/lib/permissions/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { termLabel } from "@/lib/academics/levels";
import { concurrentTermIds, detectConflictsForTerms } from "@/lib/scheduler/term-conflicts";
import { isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import { loadExamContext } from "@/lib/examinations/context";
import { checkExaminations } from "@/lib/examinations/rules";
import { LOCKED_STATUSES, SUBMISSION_LABEL, submissionChanges, submissionRows, type SnapshotRow } from "@/lib/scheduler/submissions";
import type { SchedulerData, SchedulerEntry } from "@/components/scheduler/types";
import { CommentBox, DecisionPanel } from "../review-panel";
import { ReviewSheets, type ReviewSheetData } from "../review-sheets";

export const metadata = { title: "Timetable Review · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const fmt = (d: Date) => d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** Rows of an examination submission with rule conflicts. */
async function examConflicts(submissionId: string, type: Parameters<typeof loadExamContext>[0]) {
  const exams = await prisma.examination.findMany({ where: { submissionId }, include: { room: { select: { capacity: true } }, section: { select: { studentCount: true } } } });
  const ctx = await loadExamContext(type, null, null);
  const issues = checkExaminations(
    exams.map((e) => ({ id: e.id, date: e.date.toISOString().slice(0, 10), startMin: e.startMin, endMin: e.endMin, sectionId: e.sectionId, roomId: e.roomId, proctorId: e.proctorId })),
    { window: ctx.window, blockedDates: ctx.blockedDates, roomCapacity: new Map(exams.map((e) => [e.roomId, e.room.capacity])), sectionSize: new Map(exams.map((e) => [e.sectionId, e.section.studentCount])) }
  );
  return new Set(issues.filter((i) => i.severity === "conflict").map((i) => i.examId));
}

/** The department's whole term timetable for every section in the submission, as the Head of Department sees it in the Scheduler. */
async function classSheets(s: { id: string; departmentId: string; semesterId: string; snapshot: unknown }, open: boolean) {
  // The package holds the whole timetable; drafts sent with it (new or changed classes) are the ones outlined.
  const linked = open
    ? await prisma.schedule.findMany({ where: { submissionId: s.id }, select: { id: true, status: true } })
    : ((s.snapshot ?? []) as SnapshotRow[]).map((r) => ({ id: r.id, status: "PUBLISHED" }));
  const submitted = linked.filter((x) => x.status === "REVIEW").map((x) => x.id);
  const packaged = linked.map((x) => x.id);
  const sections = await prisma.section.findMany({
    where: { OR: [{ departmentId: s.departmentId }, { schedules: { some: { id: { in: packaged } } } }], schedules: { some: { semesterId: s.semesterId, status: { not: "ARCHIVED" } } } },
    include: { program: { select: { code: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const rows = await prisma.schedule.findMany({ where: { semesterId: s.semesterId, sectionId: { in: sections.map((x) => x.id) }, status: { not: "ARCHIVED" } } });
  const ids = <K extends "subjectId" | "facultyId" | "roomId">(k: K) => [...new Set(rows.map((r) => r[k]))];
  const [subjects, faculty, rooms, conflicts] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: ids("subjectId") } }, select: { id: true, code: true, name: true, units: true } }),
    prisma.faculty.findMany({ where: { id: { in: ids("facultyId") } }, select: { id: true, fullName: true } }),
    prisma.room.findMany({ where: { id: { in: ids("roomId") } }, select: { id: true, roomName: true } }),
    open ? detectConflictsForTerms(await concurrentTermIds(s.semesterId)) : Promise.resolve([]),
  ]);
  const inScope = new Set(rows.map((r) => r.id));
  const flagged = [...new Set(conflicts.filter(isOverlapConflict).flatMap((c) => [c.entryA.id, c.entryB?.id]).filter((x): x is string => !!x && inScope.has(x)))];
  return {
    submitted,
    flagged,
    sections: sections.map((x) => ({
      ...x, programName: x.program?.name ?? null,
      shortName: x.program ? `${x.program.code} ${x.name.split(" ").at(-1)}` : x.name,
    })) as unknown as ReviewSheetData["sections"],
    entries: rows.map((r) => ({ ...r, notes: r.notes ?? null })) as unknown as SchedulerEntry[],
    subjects: subjects as unknown as SchedulerData["subjects"],
    faculty: faculty as unknown as SchedulerData["faculty"],
    rooms: rooms as unknown as SchedulerData["rooms"],
  };
}

export default async function TimetableReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await requireScope("SUPER_ADMINISTRATOR", "REGISTRAR");
  const { id } = await params;
  const s = await prisma.timetableSubmission.findUnique({
    where: { id },
    include: { department: { select: { name: true } }, semester: { include: { academicYear: true } }, submittedBy: { select: { name: true } }, decidedBy: { select: { name: true } }, comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!s) notFound();

  const open = LOCKED_STATUSES.includes(s.status);
  const decides = PUBLISH_ROLES.includes(scope.role) && open;
  const exam = s.kind === "EXAMINATION";
  const term = `${termLabel(s.semester.type)} ${s.semester.academicYear.name}`;
  const changes = await submissionChanges(s);
  const sheets = exam ? null : await classSheets(s, open);
  const examRows: SnapshotRow[] = exam ? (open ? await submissionRows(s.id, s.kind) : ((s.snapshot ?? []) as unknown as SnapshotRow[])) : [];
  const examFlagged = exam && open && s.examType ? await examConflicts(s.id, s.examType) : new Set<string>();
  const conflictCount = sheets ? sheets.flagged.length : examFlagged.size;
  const submittedCount = sheets ? sheets.submitted.length : examRows.length;

  const stats: [string, number | string][] = sheets
    ? [["Classes in timetable", sheets.entries.length], ["New or changed", submittedCount], ["Sections", sheets.sections.length], ["Faculty", new Set(sheets.entries.map((e) => e.facultyId)).size], ["Rooms", new Set(sheets.entries.map((e) => e.roomId)).size]]
    : [["Examinations", submittedCount], ["Sections", new Set(examRows.map((r) => r.section)).size], ["Proctors", new Set(examRows.map((r) => r.person)).size], ["Rooms", new Set(examRows.map((r) => r.room)).size]];

  return (
    <div className="space-y-5">
      <Link href={`/admin/review-center?queue=${exam ? "examinations" : "class-schedules"}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to the Review Center</Link>

      <header className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{exam ? "Examination timetable" : "Class timetable"} · Version {s.version}</p>
            <h1 className="text-2xl font-bold">{s.department.name}</h1>
            <p className="text-sm text-muted-foreground">{term} · Submitted by {s.submittedBy.name ?? "the Head of Department"} on {fmt(s.submittedAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant={open ? "secondary" : "outline"} className="text-sm">{SUBMISSION_LABEL[s.status]}</Badge>
            {s.publishAt && s.status === "APPROVED" && <span className="text-xs text-muted-foreground">Publishes {fmt(s.publishAt)}</span>}
            {s.decidedBy && s.decidedAt && <span className="text-xs text-muted-foreground">Decided by {s.decidedBy.name}, {fmt(s.decidedAt)}</span>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-bold tabular-nums">{value}</dd></div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">Conflicts</dt>
            <dd className={`flex items-center gap-1.5 text-xl font-bold tabular-nums ${conflictCount ? "text-red-600" : "text-emerald-600"}`}>
              {open ? <>{conflictCount ? <WarningOctagon className="size-5" weight="fill" /> : <CheckCircle className="size-5" weight="fill" />}{conflictCount}</> : <span className="text-sm font-medium text-muted-foreground">Not checked</span>}
            </dd>
          </div>
        </dl>
        {s.reason && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">Reason:</span> {s.reason}</p>}
        {s.overrideReason && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm"><span className="font-medium">Workload override:</span> {s.overrideReason}</p>}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {changes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Changes since version {changes.previousVersion}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!changes.added.length && !changes.removed.length && !changes.changed.length && <p className="text-muted-foreground">No differences from the previous version.</p>}
                {changes.added.length > 0 && <ChangeList title="Added" tone="text-emerald-700 dark:text-emerald-400" items={changes.added.map((r) => `${r.section} · ${r.subject} · ${r.when} · ${r.room}`)} />}
                {changes.changed.length > 0 && <ChangeList title="Changed" tone="text-amber-700 dark:text-amber-400" items={changes.changed.map((c) => `${c.row.section} · ${c.row.subject}: ${c.what}`)} />}
                {changes.removed.length > 0 && <ChangeList title="Removed" tone="text-red-700 dark:text-red-400" items={changes.removed.map((r) => `${r.section} · ${r.subject} · ${r.when}`)} />}
              </CardContent>
            </Card>
          )}

          {sheets ? (
            <ReviewSheets data={{
              submissionId: s.id, departmentName: s.department.name, termLabel: term, ...sheets, canComment: decides,
              comments: s.comments.filter((c) => c.rowId).map((c) => ({ id: c.id, rowId: c.rowId!, author: c.author.name ?? "Reviewer", body: c.body })),
            }} />
          ) : (
            <ExamTable rows={examRows} flagged={examFlagged} submissionId={s.id} canComment={decides} comments={s.comments.filter((c) => c.rowId).map((c) => ({ id: c.id, rowId: c.rowId!, text: `${c.author.name}: ${c.body}` }))} />
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-4">
          {decides && (
            <Card>
              <CardHeader><CardTitle className="text-base">Decision</CardTitle></CardHeader>
              <CardContent><DecisionPanel id={s.id} status={s.status as "SUBMITTED" | "APPROVED"} /></CardContent>
            </Card>
          )}
          {!PUBLISH_ROLES.includes(scope.role) && <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">View only. The Registrar decides on submitted timetables.</p>}
          <Card>
            <CardHeader><CardTitle className="text-base">Comments</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!s.comments.length && <p className="text-muted-foreground">No comments yet. Comment on a class with the button in its row, or on the whole timetable below.</p>}
              {s.comments.map((c) => (
                <div key={c.id} className="rounded-lg border p-2.5">
                  {c.rowLabel && <p className="text-xs font-medium text-muted-foreground">{c.rowLabel}</p>}
                  <p>{c.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.author.name} · {fmt(c.createdAt)}</p>
                </div>
              ))}
              {decides && <CommentBox submissionId={s.id} />}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ExamTable({ rows, flagged, submissionId, canComment, comments }: { rows: SnapshotRow[]; flagged: Set<string>; submissionId: string; canComment: boolean; comments: { id: string; rowId: string; text: string }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">This timetable has no examinations.</p>;
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr><th className="px-4 py-2 font-medium">Section</th><th className="px-4 py-2 font-medium">Subject</th><th className="px-4 py-2 font-medium">Date and time</th><th className="px-4 py-2 font-medium">Room</th><th className="px-4 py-2 font-medium">Proctor</th>{canComment && <th className="w-10" />}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={flagged.has(r.id) ? "border-t bg-red-500/5" : "border-t"}>
                <td className="px-4 py-2 align-top">{r.section}</td>
                <td className="px-4 py-2 align-top font-medium">
                  {r.subject}{flagged.has(r.id) && <Badge variant="destructive" className="ml-2">Conflict</Badge>}
                  {comments.filter((c) => c.rowId === r.id).map((c) => <p key={c.id} className="mt-1 text-xs font-normal text-amber-700 dark:text-amber-400">{c.text}</p>)}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap">{r.when}</td>
                <td className="px-4 py-2 align-top">{r.room}</td>
                <td className="px-4 py-2 align-top">{r.person}</td>
                {canComment && <td className="px-2 py-1 align-top"><CommentBox compact submissionId={submissionId} rowId={r.id} rowLabel={`${r.section} · ${r.subject} · ${r.when}`} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ChangeList({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div>
      <p className={`font-semibold ${tone}`}>{title} ({items.length})</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
