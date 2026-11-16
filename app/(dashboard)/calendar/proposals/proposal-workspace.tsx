"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportButtons } from "@/components/ux/export-buttons";
import { downloadText } from "@/lib/export/csv";
import { levelLabel, isAcademicLevel, ACADEMIC_LEVELS, type AcademicLevel } from "@/lib/academics/levels";
import { inferActivityCategory, parseActivityDate, parseActivityTime, PROPOSAL_CATEGORIES, type ProposalListItem, type ProposalRowInput } from "@/lib/activities/proposals";
import { previewProposalAction, saveProposalDraftAction, submitProposalAction } from "./actions";

const STATUS: Record<string, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Ready to publish", APPROVED: "Published", REJECTED: "Rejected", CHANGES_REQUESTED: "Changes Requested" };
const LEVEL_OPTIONS = ACADEMIC_LEVELS.map((v) => ({ value: v, label: levelLabel(v) }));
const CATEGORY_LABELS = { SCHOOL_EVENT: "School event", EXAMINATION_WEEK: "Examinations", HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension" } as const;
const CATEGORY_OPTIONS = PROPOSAL_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
const blank = (): ProposalRowInput => ({ date: "", activity: "", time: "", location: "", level: "", category: "" });
const TEMPLATE = ["Date,Activity,Time,Location,School Level", '"July 28, 2026",Freshmen Orientation,8:00 AM-10:00 AM,Auditorium,COLLEGE', ""].join("\r\n");

function parseDelimited(text: string) {
  return text.trim().split(/\r?\n/).map((line) => {
    const cells = line.includes("\t") ? line.split("\t") : line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((x) => x.replace(/^\"|\"$/g, "").replace(/\"\"/g, '"'));
    return { date: cells[0]?.trim() ?? "", activity: cells[1]?.trim() ?? "", time: cells[2]?.trim() ?? "", location: cells[3]?.trim() ?? "", level: (cells[4]?.trim().toUpperCase().replaceAll(" ", "_") ?? "") as ProposalRowInput["level"] };
  }).filter((r) => r.date || r.activity);
}

export function ProposalWorkspace({ viewerName, isAdmin, ownDepartmentId, selectedId, proposals, terms, departments }: { viewerName: string; isAdmin: boolean; ownDepartmentId: string | null; selectedId?: string; proposals: ProposalListItem[]; terms: { id: string; label: string; level: string }[]; departments: { id: string; name: string }[] }) {
  const router = useRouter(); const [busy, start] = useTransition();
  const initial = proposals.find((p) => p.id === selectedId) ?? proposals[0] ?? null;
  const [activeId, setActiveId] = useState(initial?.id ?? ""); const active = proposals.find((p) => p.id === activeId) ?? null;
  const firstTerm = (l: string) => terms.find((t) => t.level === l)?.id ?? "";
  const [level, setLevel] = useState<AcademicLevel>(isAcademicLevel(initial?.level) ? initial.level : "COLLEGE");
  const [semesterId, setSemesterId] = useState(initial?.semesterId ?? firstTerm(isAcademicLevel(initial?.level) ? initial.level : "COLLEGE"));
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? ownDepartmentId ?? departments[0]?.id ?? "");
  const [preparedBy, setPreparedBy] = useState(initial?.preparedBy ?? viewerName);
  const [designation, setDesignation] = useState(initial?.designation ?? "Program Head (Acting)");
  const [rows, setRows] = useState<ProposalRowInput[]>(initial?.rows.map(({ date, activity, time, location, level, category }) => ({ date, activity, time, location, level, category })) ?? [blank()]);
  const [errors, setErrors] = useState<string[][]>([]); const [validated, setValidated] = useState(false); const [paste, setPaste] = useState("");
  const [detailsRow, setDetailsRow] = useState<number | null>(null); const [previewOpen, setPreviewOpen] = useState(false);
  const editable = !isAdmin;

  function open(p: ProposalListItem | null) {
    setActiveId(p?.id ?? ""); setSemesterId(p?.semesterId ?? firstTerm("COLLEGE")); setLevel(isAcademicLevel(p?.level) ? p.level : "COLLEGE"); setDepartmentId(p?.departmentId ?? ownDepartmentId ?? departments[0]?.id ?? ""); setPreparedBy(p?.preparedBy ?? viewerName); setDesignation(p?.designation ?? "Program Head (Acting)");
    setRows(p?.rows.map(({ date, activity, time, location, level, category }) => ({ date, activity, time, location, level, category })) ?? [blank()]); setErrors([]); setValidated(false);
  }
  function patch(i: number, key: keyof ProposalRowInput, value: string) { setRows((old) => old.map((r, n) => n === i ? { ...r, [key]: value } : r)); setErrors([]); }
  // Errors stay hidden on untouched fields until the user tries to validate or save.
  const localErrors = useMemo(() => rows.map((r) => ({ date: (validated || r.date) && !parseActivityDate(r.date) ? "Enter a valid date or range." : "", activity: (validated || r.activity) && !r.activity.trim() ? "Activity is required." : "", time: !parseActivityTime(r.time) ? "Enter a valid time range." : "" })), [rows, validated]);
  const hasLocalErrors = rows.some((r) => !parseActivityDate(r.date) || !r.activity.trim() || !parseActivityTime(r.time)) || !preparedBy.trim() || !designation.trim() || !departmentId;
  const guard = (fn: () => void) => { if (hasLocalErrors) { setValidated(true); toast.error("Complete the highlighted fields first."); return; } fn(); };
  const run = (fn: () => Promise<{ ok: boolean; error?: string; errors?: string[][]; proposalId?: string }>, success: string) => start(async () => { const res = await fn(); if (!res.ok) { setErrors(res.errors ?? []); toast.error(res.error); return; } toast.success(success); router.refresh(); if (res.proposalId) setActiveId(res.proposalId); });
  function importRows(imported: ProposalRowInput[]) { if (!imported.length) return toast.error("No rows found."); setRows((old) => old.length === 1 && !old[0].date && !old[0].activity ? imported : [...old, ...imported]); setPaste(""); setErrors([]); }

  const currentDepartment = departments.find((d) => d.id === departmentId)?.name ?? active?.department ?? "All Departments";
  const currentTerm = terms.find((t) => t.id === semesterId)?.label ?? "";
  const exportDoc = {
    title: "School Activities", term: currentTerm, filename: `school-activities-${currentTerm.toLowerCase().replaceAll(" ", "-")}`,
    department: currentDepartment, preparedBy, designation, officialActivities: true, rows: (active?.status === "APPROVED" ? active.rows.filter((r) => r.status === "APPROVED") : rows).slice().sort((a,b) => (parseActivityDate(a.date)?.startDate ?? "").localeCompare(parseActivityDate(b.date)?.startDate ?? "")),
    columns: [{ header: "Date", value: (r: ProposalRowInput) => r.date }, { header: "Activities", value: (r: ProposalRowInput) => r.activity }],
  };
  const payload = () => ({ semesterId, departmentId, level, preparedBy, designation, rows: rows.map((row) => ({ ...row, level: isAcademicLevel(row.level) ? row.level : "" as const })) });

  const readyRows = rows.filter((r) => parseActivityDate(r.date) && r.activity.trim() && parseActivityTime(r.time)).length;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {proposals.length > 0 && <NativeSelect aria-label="Proposal history" value={activeId} onChange={(e) => open(proposals.find((p) => p.id === e.target.value) ?? null)} placeholder="Proposal history" options={proposals.map((p) => ({ value: p.id, label: `${p.schoolYear} · ${p.semester} · ${p.department} · v${p.version} · ${STATUS[p.status]}` }))} className="w-full sm:w-[28rem]" />}
      {!isAdmin && <Button variant="outline" onClick={() => open(null)} disabled={!ownDepartmentId}>New proposal</Button>}
    </div>

    <div className="space-y-4">
      <h2 className="text-sm font-semibold">1. Details</h2>
      <Card><CardContent className="grid items-end gap-3 pt-6 md:grid-cols-2 xl:grid-cols-4">
        <div><label className="mb-1 block text-xs font-medium">School year and semester</label><NativeSelect value={semesterId} onChange={(e) => setSemesterId(e.target.value)} disabled={!editable || !!active} options={terms.filter((t) => t.level === level).map((t) => ({ value: t.id, label: t.label }))} /></div>
        <div><label className="mb-1 block text-xs font-medium">College / Department</label><NativeSelect value={departmentId} onChange={(e)=>setDepartmentId(e.target.value)} disabled={!editable || !isAdmin || !!active} options={departments.map((d)=>({value:d.id,label:d.name}))} /></div>
        <div><label className="mb-1 block text-xs font-medium">School level</label><NativeSelect value={level} onChange={(e) => { const next = e.target.value as AcademicLevel; setLevel(next); if (!active) setSemesterId(firstTerm(next)); }} disabled={!editable || !!active} options={LEVEL_OPTIONS} /></div>
        <div><label className="mb-1 block text-xs font-medium">Prepared by (Name)</label><Input value={preparedBy} onChange={(e)=>setPreparedBy(e.target.value)} disabled={!editable} placeholder="Full name" /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium">Designation / Title</label><Input value={designation} onChange={(e)=>setDesignation(e.target.value)} disabled={!editable} placeholder="Position or title" /></div>
        {active && <Badge variant="outline" className="h-9 px-3">{STATUS[active.status]} · Version {active.version}</Badge>}
        {active?.status === "APPROVED" && <ReportButtons doc={exportDoc} />}
      </CardContent></Card>

      {active?.reviewNote && <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"><strong>Previous review note:</strong> {active.reviewNote}</div>}
      <h2 className="text-sm font-semibold">2. Activities</h2>
      {editable && !isAdmin && <details className="rounded-xl border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">Import rows from a spreadsheet</summary><div className="space-y-3 border-t p-4">
        <p className="text-sm text-muted-foreground">Paste rows in this order: Date, Activity, Time, Location, School Level.</p>
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"July 28, 2026	Freshmen Orientation	8:00 AM-10:00 AM	Auditorium	COLLEGE"} rows={3} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => importRows(parseDelimited(paste))}>Add pasted rows</Button>
          <Button variant="outline" onClick={() => downloadText("school-activities-template.csv", TEMPLATE)}>Download template</Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Upload CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f=e.target.files?.[0]; if(f) importRows(parseDelimited(await f.text())); e.target.value=""; }} /></label>
        </div>
      </div></details>}

      <Card><CardContent className="overflow-x-auto pt-6"><Table><TableHeader><TableRow><TableHead className="min-w-52">Date / Date Range</TableHead><TableHead className="min-w-72">Activity</TableHead><TableHead className="min-w-40">Time</TableHead><TableHead className="min-w-40">Location</TableHead><TableHead className="w-40"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r,i)=><TableRow key={i} className={(errors[i]?.length || localErrors[i].date || localErrors[i].activity || localErrors[i].time) ? "bg-destructive/5 align-top" : "align-top"}>
          <TableCell><Input value={r.date} onChange={(e)=>patch(i,"date",e.target.value)} disabled={!editable} placeholder="e.g. August 14-17, 2026" />{localErrors[i].date && <p className="mt-1 text-xs text-destructive">{localErrors[i].date}</p>}{errors[i]?.filter((x)=>/date|year|range/i.test(x)).map((x,n)=><p key={n} className="mt-1 text-xs text-destructive">{x}</p>)}</TableCell>
          <TableCell><Input value={r.activity} onChange={(e)=>patch(i,"activity",e.target.value)} disabled={!editable} placeholder="Activity name" />{localErrors[i].activity && <p className="mt-1 text-xs text-destructive">{localErrors[i].activity}</p>}<div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge variant="outline">{CATEGORY_LABELS[(r.category || inferActivityCategory(r.activity)) as keyof typeof CATEGORY_LABELS]}</Badge>{errors[i]?.filter((x)=>!/date|year|range/i.test(x)).map((x,n)=><span key={n} className="text-xs text-destructive">{x}</span>)}</div></TableCell>
          <TableCell><Input value={r.time} onChange={(e)=>patch(i,"time",e.target.value)} disabled={!editable} placeholder="Whole day" />{localErrors[i].time && <p className="mt-1 text-xs text-destructive">{localErrors[i].time}</p>}</TableCell>
          <TableCell><Input value={r.location} onChange={(e)=>patch(i,"location",e.target.value)} disabled={!editable} placeholder="Optional" /></TableCell>
          <TableCell><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>setDetailsRow(i)}>{editable ? "Level and type" : "View"}</Button>{editable && <Button size="sm" variant="ghost" onClick={()=>setRows((old)=>old.length>1?old.filter((_,n)=>n!==i):[blank()])}>Remove</Button>}</div></TableCell>
        </TableRow>)}</TableBody></Table>
        {editable && <Button className="mt-3" variant="outline" onClick={()=>setRows((r)=>[...r,blank()])}>Add row</Button>}
      </CardContent></Card>

      <h2 className="text-sm font-semibold">3. Review and save</h2>
      <div className="flex flex-wrap items-center gap-2">
        {editable && <p className="mr-2 text-sm text-muted-foreground" aria-live="polite">{readyRows} of {rows.length} rows ready{readyRows < rows.length ? ". Rows missing a valid date or activity are highlighted when you validate." : "."}</p>}
        {editable && <><Button variant="outline" disabled={busy} onClick={()=>guard(()=>start(async()=>{const res=await previewProposalAction(payload());if(!res.ok){setErrors(res.errors??[]);toast.error(res.error);return;}setPreviewOpen(true);}))}>Preview &amp; validate</Button>
          <Button disabled={busy} onClick={()=>guard(()=>run(()=>saveProposalDraftAction(payload(),active?.id),isAdmin?"Proposal changes saved.":"Draft saved."))}>{active?.status==="APPROVED"&&!isAdmin?"Create revision":"Save as Draft"}</Button></>}
        {!isAdmin && active && ["DRAFT","CHANGES_REQUESTED","REJECTED","PENDING_APPROVAL"].includes(active.status) && <Button disabled={busy} onClick={()=>guard(()=>run(async()=>{const saved=await saveProposalDraftAction(payload(),active.id);if(!saved.ok || !saved.proposalId)return saved;return submitProposalAction(saved.proposalId);},"Activities published."))}>Publish activities</Button>}

      </div>
      <Dialog open={detailsRow !== null} onOpenChange={(o)=>!o&&setDetailsRow(null)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Level and type</DialogTitle></DialogHeader>{detailsRow !== null && <div className="space-y-3"><div><label className="mb-1 block text-xs font-medium">School level</label><NativeSelect disabled={!editable} value={rows[detailsRow]?.level||level} onChange={(e)=>patch(detailsRow,"level",e.target.value)} options={LEVEL_OPTIONS}/></div><div><label className="mb-1 block text-xs font-medium">Category override (optional)</label><NativeSelect disabled={!editable} value={rows[detailsRow]?.category??""} onChange={(e)=>patch(detailsRow,"category",e.target.value)} placeholder={`Automatically detected: ${CATEGORY_LABELS[inferActivityCategory(rows[detailsRow]?.activity??"")]}`} options={CATEGORY_OPTIONS}/></div><Button className="w-full" onClick={()=>setDetailsRow(null)}>Done</Button></div>}</DialogContent></Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Official School Activities Preview</DialogTitle></DialogHeader><OfficialPreview department={currentDepartment} term={currentTerm} preparedBy={preparedBy} designation={designation} rows={exportDoc.rows}/><div className="flex justify-end"><ReportButtons doc={exportDoc}/></div></DialogContent></Dialog>
    </div>
  </div>;
}

function OfficialPreview({ department, term, preparedBy, designation, rows }: { department: string; term: string; preparedBy: string; designation: string; rows: { date: string; activity: string }[] }) {
  const [schoolYear, semester] = term.split(" · ");
  return <div className="rounded-sm border bg-white p-6 font-serif text-black shadow-sm">
    <div className="grid grid-cols-[72px_1fr_72px] items-center border-b-2 border-black pb-3 text-center">
      <Image src="/branding/logo.jpg" alt="School seal" width={64} height={64} className="size-16 object-contain" />
      <div><p className="text-sm font-bold">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</p><p className="text-lg font-bold">{department}</p><p className="text-xs">Naic, Cavite, Philippines</p><p className="text-xs">Tel: (046) 412-0437</p></div>
      <Image src="/branding/logo.jpg" alt={`${department} seal`} width={64} height={64} className="size-16 object-contain" />
    </div>
    <div className="my-5 text-center font-bold uppercase"><p>SCHOOL ACTIVITIES FOR S.Y. {schoolYear}</p><p>{department}</p><p>{semester}</p></div>
    <table className="w-full border-collapse text-sm"><thead><tr><th className="w-[38%] border-2 border-black p-2 text-center">DATE</th><th className="w-[62%] border-2 border-black p-2 text-center">ACTIVITIES</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td className="border border-black p-2 align-top">{r.date}</td><td className="border border-black p-2 align-top">{r.activity}</td></tr>)}</tbody></table>
    <div className="mt-12 w-72"><p>Prepared by:</p><p className="mt-8 border-b border-black text-center font-bold uppercase">{preparedBy}</p><p className="text-center text-sm">{designation}</p></div>
  </div>;
}
