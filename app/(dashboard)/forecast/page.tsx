import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { loadForecast, upcomingTerms } from "@/lib/forecast/load";
import { narrate } from "@/lib/ai/narrative";
import { PageHeader, EmptyState } from "@/components/ux/states";
import { ForecastBoard } from "./forecast-board";

export const metadata = { title: "Enrollment Forecast · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ target?: string; department?: string; explain?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;
  const records = await prisma.enrollmentRecord.findMany({ select: { academicYear: true, termType: true } });
  if (records.length === 0) {
    return <EmptyState title="No enrollment history yet" description="Enrollment records are needed to forecast sections, faculty, and rooms." />;
  }

  const targets = upcomingTerms(records);
  const target = targets.find((t) => t.value === params.target) ?? targets[0];
  const departmentId = scope.isAdmin ? params.department || null : scope.departmentId;
  const data = await loadForecast(target, departmentId);

  // Optional narrative on request; only aggregated figures are sent.
  const narrative = params.explain
    ? await narrate(`Summarize this enrollment forecast for ${target.label} and the resource shortages or surpluses it implies.`, {
        programs: data.series.map((s) => ({ name: s.name, last: s.lastActual, forecast: s.prediction?.value, confidence: s.prediction?.confidence, sectionsNeeded: s.sectionsNeeded, sectionsNow: s.sectionsNow })),
        faculty: data.facultyRows.map((f) => ({ department: f.name, needed: f.needed, now: f.now })),
        rooms: data.roomRows.map((r) => ({ type: r.type, needed: r.needed, now: r.now })),
      })
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Enrollment Forecast"
        description="Predicted enrollment from historical data, with the sections, faculty, and rooms it requires compared against current resources."
      />
      <ForecastBoard
        target={target.value}
        targetLabel={target.label}
        targets={targets.map((t) => ({ value: t.value, label: t.label }))}
        department={departmentId ?? ""}
        departments={scope.isAdmin ? data.departments.map((d) => ({ value: d.id, label: d.name })) : []}
        series={data.series}
        facultyRows={data.facultyRows}
        roomRows={data.roomRows}
        assumptions={data.assumptions}
        narrative={narrative}
        aiEnabled={!!process.env.GEMINI_API_KEY}
      />
    </div>
  );
}
