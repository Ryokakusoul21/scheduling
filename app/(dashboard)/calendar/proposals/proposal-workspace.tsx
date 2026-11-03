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
import { levelLabel, ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { inferActivityCategory, parseActivityDate, parseActivityTime, PROPOSAL_CATEGORIES, type ProposalListItem, type ProposalRowInput } from "@/lib/activities/proposals";
import { previewProposalAction, reviewProposalAction, saveProposalDraftAction, submitProposalAction } from "./actions";

const STATUS: Record<string, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Pending Approval", APPROVED: "Approved", REJECTED: "Rejected", CHANGES_REQUESTED: "Changes Requested" };
const LEVEL_OPTIONS = ACADEMIC_LEVELS.map((v) => ({ value: v, label: levelLabel(v) }));
const CATEGORY_LABELS = { SCHOOL_EVENT: "School event", EXAMINATION_WEEK: "Examinations", HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension" } as const;
const CATEGORY_OPTIONS = PROPOSAL_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
const blank = (): ProposalRowInput => ({ date: "", activity: "", time: "", location: "", level: "", category: "" });
const SAMPLE: ProposalRowInput[] = [
  ["July 28, 2026", "Freshmen and Transferees Departmental Orientation"], ["July 29, 2026", "First Year Opening of Classes"],
  ["August 3, 2026", "Second and Third Year Opening of Classes"], ["August 8, 2026", "General Assembly (All Class Officers)"],
  ["August 10, 2026", "Filing of Candidacy (Student Body Organization Officers)"], ["August 13, 2026", "Announcement of Official Candidates"],
  ["August 14-17, 2026", "Campaign Period"], ["August 22, 2026", "Election and Announcement of Winners"],
  ["August 27-29, 2026", "Tuition Fee Payments (Information Technology Department)"], ["September 1 to September 5, 2026", "Preliminary Examinations"],
  ["September 19, 2026", "Student Body Organization Officers Leadership Training and Workshop (In-campus)"], ["October 1-7, 2026", "Midterm Examinations"],
  ["October 19-24, 2026", "Sportsfest"], ["November 1, 2026", "All Saints Day"], ["November 4-10, 2026", "Semi-Finals Examination"],
  ["November 21, 2026", "Educational Tour (Information Technology Department)"], ["November 30, 2026", "Bonifacio Day"],
  ["December 2, 2026", "Granby Foundation"], ["December 7-11, 2026", "Final Examination"], ["December 12, 2026", "Information Technology Day"],
  ["December 17-19, 2026", "Christmas Party"], ["December 20, 2026", "Start of Christmas Break and Semestral Break"],
  ["January 4, 2027", "Enrolment Period (School Year 2026-2027, Second Semester)"], ["January 7-13, 2027", "Submission of Grades to the Registrar's Office"],
].map(([date, activity]) => ({ date, activity, time: "", location: "", level: "COLLEGE" } as ProposalRowInput));

function parseDelimited(text: string) {
  return text.trim().split(/\r?\n/).map((line) => {
    const cells = line.includes("\t") ? line.split("\t") : line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((x) => x.replace(/^\"|\"$/g, "").replace(/\"\"/g, '"'));
    return { date: cells[0]?.trim() ?? "", activity: cells[1]?.trim() ?? "", time: cells[2]?.trim() ?? "", location: cells[3]?.trim() ?? "", level: (cells[4]?.trim().toUpperCase().replaceAll(" ", "_") ?? "") as ProposalRowInput["level"] };
  }).filter((r) => r.date || r.activity);
}

export function ProposalWorkspace({ isAdmin, ownDepartmentId, selectedId, proposals, terms, departments }: { isAdmin: boolean; ownDepartmentId: string | null; selectedId?: string; proposals: ProposalListItem[]; terms: { id: string; label: string; level: string }[]; departments: { id: string; name: string }[] }) {
  const router = useRouter(); const [busy, start] = useTransition();
  const initial = proposals.find((p) => p.id === selectedId) ?? proposals[0] ?? null;
  const [activeId, setActiveId] = useState(initial?.id ?? ""); const active = proposals.find((p) => p.id === activeId) ?? null;
  const [semesterId, setSemesterId] = useState(initial?.semesterId ?? terms[0]?.id ?? "");
  const [level, setLevel] = useState(initial?.level ?? (terms.find((t) => t.id === semesterId)?.level as ProposalListItem["level"] ?? "COLLEGE"));
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? ownDepartmentId ?? departments[0]?.id ?? "");
  const [preparedBy, setPreparedBy] = useState(initial?.preparedBy ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "Program Head (Acting)");
  const [rows, setRows] = useState<ProposalRowInput[]>(initial?.rows.map(({ date, activity, time, location, level, category }) => ({ date, activity, time, location, level, category })) ?? [blank()]);
  const [errors, setErrors] = useState<string[][]>([]); const [paste, setPaste] = useState(""); const [note, setNote] = useState("");
  const [detailsRow, setDetailsRow] = useState<number | null>(null); const [previewOpen, setPreviewOpen] = useState(false);
  const editable = !active || isAdmin || ["DRAFT", "CHANGES_REQUESTED", "REJECTED", "APPROVED"].includes(active.status);
  const pendingReview = isAdmin && active?.status === "PENDING_APPROVAL";

  function open(p: ProposalListItem | null) {
    setActiveId(p?.id ?? ""); setSemesterId(p?.semesterId ?? terms[0]?.id ?? ""); setLevel(p?.level ?? "COLLEGE"); setDepartmentId(p?.departmentId ?? ownDepartmentId ?? departments[0]?.id ?? ""); setPreparedBy(p?.preparedBy ?? ""); setDesignation(p?.designation ?? "Program Head (Acting)");
    setRows(p?.rows.map(({ date, activity, time, location, level, category }) => ({ date, activity, time, location, level, category })) ?? [blank()]); setErrors([]); setNote("");
  }
  function patch(i: number, key: keyof ProposalRowInput, value: string) { setRows((old) => old.map((r, n) => n === i ? { ...r, [key]: value } : r)); setErrors([]); }
  const localErrors = useMemo(() => rows.map((r) => ({ date: !parseActivityDate(r.date) ? "Enter a valid date or range." : "", activity: !r.activity.trim() ? "Activity is required." : "", time: !parseActivityTime(r.time) ? "Enter a valid time range." : "" })), [rows]);
  const hasLocalErrors = localErrors.some((e) => e.date || e.activity || e.time) || !preparedBy.trim() || !designation.trim() || !departmentId;
  const run = (fn: () => Promise<{ ok: boolean; error?: string; errors?: string[][]; proposalId?: string }>, success: string) => start(async () => { const res = await fn(); if (!res.ok) { setErrors(res.errors ?? []); toast.error(res.error); return; } toast.success(success); router.refresh(); if (res.proposalId) setActiveId(res.proposalId); });
  function importRows(imported: ProposalRowInput[]) { if (!imported.length) return toast.error("No rows found."); setRows((old) => old.length === 1 && !old[0].date && !old[0].activity ? imported : [...old, ...imported]); setPaste(""); setErrors([]); }

  const currentDepartment = departments.find((d) => d.id === departmentId)?.name ?? active?.department ?? "All Departments";
  const currentTerm = terms.find((t) => t.id === semesterId)?.label ?? "";
  const exportDoc = {
    title: "School Activities", term: currentTerm, filename: `school-activities-${currentTerm.toLowerCase().replaceAll(" ", "-")}`,
    department: currentDepartment, preparedBy, designation, officialActivities: true, rows: (active?.status === "APPROVED" ? active.rows.filter((r) => r.status === "APPROVED") : rows).slice().sort((a,b) => (parseActivityDate(a.date)?.startDate ?? "").localeCompare(parseActivityDate(b.date)?.startDate ?? "")),
    columns: [{ header: "Date", value: (r: ProposalRowInput) => r.date }, { header: "Activities", value: (r: ProposalRowInput) => r.activity }],
  };
  const payload = () => ({ semesterId, departmentId, level, preparedBy, designation, rows });

  return <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
    <Card><CardHeader><CardTitle className="text-base">Proposal history</CardTitle></CardHeader><CardContent className="space-y-2">
      {!isAdmin && <Button className="w-full" onClick={() => open(null)} disabled={!ownDepartmentId}>New proposal</Button>}
      {proposals.map((p) => <button key={p.id} onClick={() => open(p)} className={`w-full rounded-lg border p-3 text-left text-sm ${activeId === p.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
        <div className="flex justify-between gap-2"><span className="font-medium">{p.schoolYear} · {p.semester}</span><Badge variant="outline">v{p.version}</Badge></div>
        <p className="mt-1 text-xs text-muted-foreground">{p.department} · {levelLabel(p.level)}</p><p className="mt-1 text-xs font-medium">{STATUS[p.status]}</p>
      </button>)}
      {!proposals.length && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
    </CardContent></Card>

    <div className="space-y-4">
      <Card><CardContent className="grid items-end gap-3 pt-6 md:grid-cols-2 xl:grid-cols-4">
        <div><label className="mb-1 block text-xs font-medium">School year and semester</label><NativeSelect value={semesterId} onChange={(e) => { setSemesterId(e.target.value); const t=terms.find((x)=>x.id===e.target.value); if(t) setLevel(t.level as ProposalListItem["level"]); }} disabled={!editable || !!active} options={terms.map((t) => ({ value: t.id, label: t.label }))} /></div>
        <div><label className="mb-1 block text-xs font-medium">College / Department</label><NativeSelect value={departmentId} onChange={(e)=>setDepartmentId(e.target.value)} disabled={!editable || !isAdmin || !!active} options={departments.map((d)=>({value:d.id,label:d.name}))} /></div>
        <div><label className="mb-1 block text-xs font-medium">School level</label><NativeSelect value={level} onChange={(e) => setLevel(e.target.value as ProposalListItem["level"])} disabled={!editable} options={LEVEL_OPTIONS} /></div>
        <div><label className="mb-1 block text-xs font-medium">Prepared by (Name)</label><Input value={preparedBy} onChange={(e)=>setPreparedBy(e.target.value)} disabled={!editable} placeholder="MR. MARVIN A. RAMOS" /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium">Designation / Title</label><Input value={designation} onChange={(e)=>setDesignation(e.target.value)} disabled={!editable} placeholder="Program Head (Acting)" /></div>
        {active && <Badge variant="outline" className="h-9 px-3">{STATUS[active.status]} · Version {active.version}</Badge>}
        {active?.status === "APPROVED" && <ReportButtons doc={exportDoc} />}
      </CardContent></Card>

      {active?.reviewNote && <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"><strong>Administrator note:</strong> {active.reviewNote}</div>}
      {editable && !isAdmin && <Card><CardHeader><CardTitle className="text-base">Bulk entry</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Paste spreadsheet rows in this order: Date, Activity, Time, Location, School Level.</p>
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"July 28, 2026\tFreshmen Orientation\t8:00 AM-10:00 AM\tAuditorium\tCOLLEGE"} rows={3} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => importRows(parseDelimited(paste))}>Add pasted rows</Button>
          <Button variant="outline" onClick={() => setRows(SAMPLE)}>Load Sample Semester (College of Informatics)</Button>
          <Button variant="outline" onClick={() => downloadText("school-activities-template.csv", "Date,Activity,Time,Location,School Level\r\n\"July 28, 2026\",Freshmen Orientation,8:00 AM-10:00 AM,Auditorium,COLLEGE\r\n")}>Download template</Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Upload CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f=e.target.files?.[0]; if(f) importRows(parseDelimited(await f.text())); e.target.value=""; }} /></label>
        </div>
      </CardContent></Card>}

      <Card><CardContent className="overflow-x-auto pt-6"><Table><TableHeader><TableRow><TableHead className="w-[38%] min-w-56">Date / Date Range</TableHead><TableHead className="w-[62%] min-w-96">Activity</TableHead><TableHead className="w-44">Details and Action</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r,i)=><TableRow key={i} className={(errors[i]?.length || localErrors[i].date || localErrors[i].activity || localErrors[i].time) ? "bg-destructive/5 align-top" : "align-top"}>
          <TableCell><Input value={r.date} onChange={(e)=>patch(i,"date",e.target.value)} disabled={!editable} placeholder="August 14-17, 2026" />{localErrors[i].date && <p className="mt-1 text-xs text-destructive">{localErrors[i].date}</p>}{errors[i]?.filter((x)=>/date|year|range/i.test(x)).map((x,n)=><p key={n} className="mt-1 text-xs text-destructive">{x}</p>)}</TableCell>
          <TableCell><Input value={r.activity} onChange={(e)=>patch(i,"activity",e.target.value)} disabled={!editable} placeholder="Activity name" />{localErrors[i].activity && <p className="mt-1 text-xs text-destructive">{localErrors[i].activity}</p>}<div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge variant="outline">{CATEGORY_LABELS[(r.category || inferActivityCategory(r.activity)) as keyof typeof CATEGORY_LABELS]}</Badge>{errors[i]?.filter((x)=>!/date|year|range/i.test(x)).map((x,n)=><span key={n} className="text-xs text-destructive">{x}</span>)}</div></TableCell>
          <TableCell><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={()=>setDetailsRow(i)}>Add time &amp; room details</Button>{editable && <Button size="sm" variant="ghost" onClick={()=>setRows((old)=>old.filter((_,n)=>n!==i))}>Remove</Button>}{pendingReview && active?.rows[i] && <><Button size="sm" variant="outline" onClick={()=>run(()=>reviewProposalAction({proposalId:active.id,decision:"APPROVED",rowIds:[active.rows[i].id]}),"Row approved.")}>Approve</Button><Button size="sm" variant="outline" disabled={!note.trim()} onClick={()=>run(()=>reviewProposalAction({proposalId:active.id,decision:"REJECTED",note,rowIds:[active.rows[i].id]}),"Row rejected.")}>Reject</Button></>}</div>{(r.time||r.location) && <p className="mt-1 text-xs text-muted-foreground">{[r.time,r.location].filter(Boolean).join(" · ")}</p>}</TableCell>
        </TableRow>)}</TableBody></Table>
        {editable && <Button className="mt-3" variant="outline" onClick={()=>setRows((r)=>[...r,blank()])}>Add row</Button>}
      </CardContent></Card>

      <div className="flex flex-wrap gap-2">
        {editable && <><Button variant="outline" disabled={busy || hasLocalErrors} onClick={()=>start(async()=>{const res=await previewProposalAction(payload());if(!res.ok){setErrors(res.errors??[]);toast.error(res.error);return;}setPreviewOpen(true);})}>Preview &amp; validate</Button>
          <Button disabled={busy || hasLocalErrors} onClick={()=>run(()=>saveProposalDraftAction(payload(),active?.id),isAdmin?"Proposal changes saved.":"Draft saved.")}>{active?.status==="APPROVED"&&!isAdmin?"Create revision":"Save as Draft"}</Button></>}
        {!isAdmin && active && ["DRAFT","CHANGES_REQUESTED","REJECTED"].includes(active.status) && <Button disabled={busy} onClick={()=>run(()=>submitProposalAction(active.id),"Proposal submitted.")}>Submit Proposal</Button>}
        {pendingReview && <><Input className="max-w-md" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Reason required for rejection or requested changes" />
          <Button disabled={busy} onClick={()=>run(()=>reviewProposalAction({proposalId:active.id,decision:"APPROVED"}),"Proposal approved and published.")}>Approve all</Button>
          <Button variant="destructive" disabled={busy||!note.trim()} onClick={()=>run(()=>reviewProposalAction({proposalId:active.id,decision:"REJECTED",note}),"Proposal rejected.")}>Reject all</Button>
          <Button variant="outline" disabled={busy||!note.trim()} onClick={()=>run(()=>reviewProposalAction({proposalId:active.id,decision:"CHANGES_REQUESTED",note}),"Changes requested.")}>Request changes</Button></>}
      </div>
      <Dialog open={detailsRow !== null} onOpenChange={(o)=>!o&&setDetailsRow(null)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Add time &amp; room details</DialogTitle></DialogHeader>{detailsRow !== null && <div className="space-y-3"><div><label className="mb-1 block text-xs font-medium">Time (optional)</label><Input value={rows[detailsRow]?.time??""} onChange={(e)=>patch(detailsRow,"time",e.target.value)} placeholder="8:00 AM-10:00 AM" />{localErrors[detailsRow]?.time&&<p className="mt-1 text-xs text-destructive">{localErrors[detailsRow].time}</p>}</div><div><label className="mb-1 block text-xs font-medium">Location (optional)</label><Input value={rows[detailsRow]?.location??""} onChange={(e)=>patch(detailsRow,"location",e.target.value)} placeholder="Auditorium or room" /></div><div><label className="mb-1 block text-xs font-medium">School level</label><NativeSelect value={rows[detailsRow]?.level||level} onChange={(e)=>patch(detailsRow,"level",e.target.value)} options={LEVEL_OPTIONS}/></div><div><label className="mb-1 block text-xs font-medium">Category override (optional)</label><NativeSelect value={rows[detailsRow]?.category??""} onChange={(e)=>patch(detailsRow,"category",e.target.value)} placeholder={`Automatically detected: ${CATEGORY_LABELS[inferActivityCategory(rows[detailsRow]?.activity??"")]}`} options={CATEGORY_OPTIONS}/></div><Button className="w-full" onClick={()=>setDetailsRow(null)}>Done</Button></div>}</DialogContent></Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Official School Activities Preview</DialogTitle></DialogHeader><OfficialPreview department={currentDepartment} term={currentTerm} preparedBy={preparedBy} designation={designation} rows={exportDoc.rows}/><div className="flex justify-end"><ReportButtons doc={exportDoc}/></div></DialogContent></Dialog>
    </div>
  </div>;
}

function OfficialPreview({ department, term, preparedBy, designation, rows }: { department: string; term: string; preparedBy: string; designation: string; rows: { date: string; activity: string }[] }) {
  const [schoolYear, semester] = term.split(" · ");
  return <div className="rounded-sm border bg-white p-6 font-serif text-black shadow-sm">
    <div className="grid grid-cols-[72px_1fr_72px] items-center border-b-2 border-black pb-3 text-center">
      <Image src="/branding/logo.jpg" alt="School seal" width={64} height={64} className="size-16 object-contain" />
      <div><p className="text-sm font-bold">GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY</p><p className="text-lg font-bold">{department}</p><p className="text-xs">Naic, Cavite, Philippines</p><p className="text-xs">Tel: (046) 412-0437</p></div>
      <Image src="/branding/logo.jpg" alt={`${department} seal`} width={64} height={64} className="size-16 object-contain" />
    </div>
    <div className="my-5 text-center font-bold uppercase"><p>SCHOOL ACTIVITIES FOR S.Y. {schoolYear}</p><p>{department}</p><p>{semester}</p></div>
    <table className="w-full border-collapse text-sm"><thead><tr><th className="w-[38%] border-2 border-black p-2 text-center">DATE</th><th className="w-[62%] border-2 border-black p-2 text-center">ACTIVITIES</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td className="border border-black p-2 align-top">{r.date}</td><td className="border border-black p-2 align-top">{r.activity}</td></tr>)}</tbody></table>
    <div className="mt-12 w-72"><p>Prepared by:</p><p className="mt-8 border-b border-black text-center font-bold uppercase">{preparedBy}</p><p className="text-center text-sm">{designation}</p></div>
  </div>;
}
