"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowSquareOut, CaretRight, MagnifyingGlass, PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ux/native-select";
import { ConfirmDialog } from "@/components/ux/form-dialog";
import { DepartmentLogo } from "@/components/departments/department-logo";
import { DEFAULT_SHS_STRANDS, levelLabel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { deleteProgramAction, saveProgramAction } from "../../programs/actions";
import { assignDepartmentHeadAction, deleteDepartmentAction, removeDepartmentHeadAssignmentAction, saveDepartmentAction } from "./actions";

type Program = { id: string; code: string; name: string; level: string; sections: number; subjects: number };
type Department = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  counts: { programs: number; faculty: number; sections: number; rooms: number; subjects: number };
  programs: Program[];
  heads: { id: string; name: string; email: string; acting: boolean; linkedThroughFaculty: boolean }[];
  headOptions: { id: string; label: string }[];
  facultyCandidates: { id: string; name: string; detail: string }[];
};
type Result = { ok: boolean; error?: string };

// Programs can be College courses or Senior High School strands; one level is shown at a time.
const PROGRAM_LEVELS = ["COLLEGE", "SENIOR_HIGH"] as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function DepartmentManager({ departments }: { departments: Department[] }) {
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [noHead, setNoHead] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [program, setProgram] = useState<{ departmentId: string; row: Program | null; level: string } | null>(null);
  const [level, setLevel] = useState<string>("COLLEGE");
  const [headId, setHeadId] = useState("");

  const open = departments.find((d) => d.id === openId) ?? null;
  const q = query.trim().toLowerCase();
  const rows = departments.filter((d) => (!noHead || !d.heads.length) && (!q || `${d.code} ${d.name}`.toLowerCase().includes(q)));
  const headless = departments.filter((d) => !d.heads.length).length;

  const run = (task: () => Promise<Result>, done: string, after?: () => void) => start(async () => {
    const res = await task();
    if (res.ok) { toast.success(done); after?.(); } else toast.error(res.error ?? "Something went wrong.");
  });
  const blockers = (d: Department) => (["programs", "faculty", "rooms", "sections", "subjects"] as const).filter((k) => d.counts[k] > 0).map((k) => plural(d.counts[k], k.replace(/s$/, "")));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-60 flex-1"><MagnifyingGlass className="absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search departments" placeholder="Search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div role="group" aria-label="Filter departments" className="flex gap-1 rounded-lg bg-muted/60 p-1">
          {[false, true].map((v) => <button key={String(v)} type="button" aria-pressed={noHead === v} onClick={() => setNoHead(v)}
            className="h-7 rounded-md px-3 text-xs font-medium text-muted-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-sm">
            {v ? "No head" : "All"}<span className="ml-1.5 tabular-nums opacity-70">{v ? headless : departments.length}</span></button>)}
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="size-4" />Add department</Button>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => { setOpenId(d.id); setLevel("COLLEGE"); setHeadId(""); }} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
              <DepartmentLogo name={d.name} logoUrl={d.logoUrl} className="size-10 shrink-0 rounded-lg" />
              <span className="min-w-48 flex-1"><span className="block font-medium">{d.name}</span><span className="block text-xs text-muted-foreground">{d.code}</span></span>
              <span className="text-sm">{d.heads.length ? d.heads.map((h) => h.name + (h.acting ? " (Acting)" : "")).join(", ") : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200">No head</Badge>}</span>
              <span className="flex flex-wrap gap-1.5 text-xs">{(["programs", "faculty", "sections", "rooms"] as const).map((k) => <span key={k} className="rounded-md bg-muted px-2 py-1 tabular-nums">{d.counts[k]} {k}</span>)}</span>
              <CaretRight className="size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
        {!rows.length && <li className="py-10 text-center text-sm text-muted-foreground">No matches</li>}
      </ul>

      <Sheet open={!!open} onOpenChange={(o) => !o && !pending && setOpenId(null)}>
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          {open && <>
            <SheetHeader className="flex-row items-center gap-3">
              <DepartmentLogo name={open.name} logoUrl={open.logoUrl} className="size-11 shrink-0 rounded-lg" />
              <div className="min-w-0"><SheetTitle className="truncate">{open.name}</SheetTitle>
                <div className="flex gap-3 text-xs"><Link className="text-primary hover:underline" href={`/department?department=${encodeURIComponent(open.id)}`}>Profile <ArrowSquareOut className="inline size-3" /></Link><Link className="text-primary hover:underline" href={`/analytics?department=${encodeURIComponent(open.id)}`}>Analytics <ArrowSquareOut className="inline size-3" /></Link></div></div>
            </SheetHeader>
            <Tabs defaultValue="details" className="px-4 pb-6">
              <TabsList className="w-full"><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="programs">Programs <span className="ml-1 tabular-nums opacity-70">{open.programs.length}</span></TabsTrigger><TabsTrigger value="head">Head</TabsTrigger></TabsList>

              <TabsContent value="details" className="space-y-5 pt-4">
                <form key={open.id} className="space-y-3" action={(fd) => run(() => saveDepartmentAction(open.id, fd), "Department saved.")}>
                  <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                    <label className="grid gap-1 text-sm font-medium">Code<Input name="code" defaultValue={open.code} maxLength={20} required /></label>
                    <label className="grid gap-1 text-sm font-medium">Name<Input name="name" defaultValue={open.name} maxLength={150} required /></label>
                  </div>
                  <Button type="submit" disabled={pending}>Save</Button>
                </form>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 p-3">
                  <span className="text-sm">{blockers(open).length ? <span className="text-muted-foreground">Linked: {blockers(open).join(", ")}</span> : "Empty department"}</span>
                  <Button variant="destructive" size="sm" disabled={pending || blockers(open).length > 0} onClick={() => setDeleting(open)}><Trash className="size-4" />Delete</Button>
                </div>
              </TabsContent>

              <TabsContent value="programs" className="space-y-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div role="tablist" aria-label="Academic level" className="flex gap-1 rounded-lg bg-muted/60 p-1">
                    {PROGRAM_LEVELS.map((l) => <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => setLevel(l)}
                      className="h-7 rounded-md px-3 text-xs font-medium text-muted-foreground aria-selected:bg-card aria-selected:text-primary aria-selected:shadow-sm">
                      {levelLabel(l)}<span className="ml-1.5 tabular-nums opacity-70">{open.programs.filter((p) => p.level === l).length}</span></button>)}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setProgram({ departmentId: open.id, row: null, level })}><Plus className="size-4" />{level === "SENIOR_HIGH" ? "Strand" : "Program"}</Button>
                </div>
                <ul className="divide-y rounded-lg border">
                  {open.programs.filter((p) => p.level === level).map((p) => {
                    const used = p.sections + p.subjects > 0;
                    return <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{[p.code, p.sections && plural(p.sections, "section"), p.subjects && plural(p.subjects, "subject")].filter(Boolean).join(" · ")}</span></span>
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setProgram({ departmentId: open.id, row: p, level: p.level })}><PencilSimple className="size-4" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${p.name}`} disabled={pending || used} title={used ? "In use" : undefined}
                        onClick={() => run(() => deleteProgramAction(p.id), `${p.code} deleted.`)}><Trash className="size-4" /></Button>
                    </li>;
                  })}
                  {!open.programs.some((p) => p.level === level) && <li className="py-6 text-center text-sm text-muted-foreground">None</li>}
                </ul>
              </TabsContent>

              <TabsContent value="head" className="space-y-3 pt-4">
                {open.heads.length > 1 && <p role="alert" className="text-sm text-destructive">More than one head. Remove the extra assignment.</p>}
                {open.heads.map((h) => <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{h.name}{h.acting && <Badge variant="outline" className="ml-2">Acting</Badge>}</span><span className="block truncate text-xs text-muted-foreground">{h.email}</span></span>
                  {h.linkedThroughFaculty ? <span className="text-xs text-muted-foreground">Faculty link</span>
                    : <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDepartmentHeadAssignmentAction(open.id, h.id), "Head removed.")}>Remove</Button>}
                </div>)}
                {!open.heads.length && <div className="space-y-2">
                  <div className="flex gap-2">
                    <NativeSelect aria-label="Head of Department" className="flex-1" value={headId} onChange={(e) => setHeadId(e.target.value)} disabled={!open.headOptions.length}
                      placeholder={open.headOptions.length ? "Choose a Head of Department" : "No eligible accounts"} options={open.headOptions.map((o) => ({ value: o.id, label: o.label }))} />
                    <Button disabled={pending || !headId} onClick={() => run(() => assignDepartmentHeadAction(open.id, headId), "Head assigned.", () => setHeadId(""))}>Assign</Button>
                  </div>
                  {open.facultyCandidates.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-xs text-muted-foreground">{plural(open.facultyCandidates.length, "faculty candidate")}</summary>
                    <ul className="mt-2 space-y-1">{open.facultyCandidates.map((f) => <li key={f.id}>{f.name} <span className="text-xs text-muted-foreground">{f.detail}</span></li>)}</ul></details>}
                </div>}
              </TabsContent>
            </Tabs>
          </>}
        </SheetContent>
      </Sheet>

      {adding && <Dialog open onOpenChange={(o) => !o && !pending && setAdding(false)}><DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add department</DialogTitle></DialogHeader>
        <form className="space-y-3" action={(fd) => run(() => saveDepartmentAction(null, fd), "Department created.", () => setAdding(false))}>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="grid gap-1 text-sm font-medium">Code<Input name="code" maxLength={20} required placeholder="SCI" autoFocus /></label>
            <label className="grid gap-1 text-sm font-medium">Name<Input name="name" maxLength={150} required placeholder="College of Science" /></label>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>Create</Button>
        </form>
      </DialogContent></Dialog>}

      {program && <Dialog open onOpenChange={(o) => !o && !pending && setProgram(null)}><DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{program.row ? `Edit ${program.row.code}` : program.level === "SENIOR_HIGH" ? "Add strand" : "Add program"}</DialogTitle></DialogHeader>
        <form className="space-y-3" action={(fd) => run(() => saveProgramAction(program.row?.id ?? null, fd), program.row ? "Saved." : "Added.", () => setProgram(null))}>
          <input type="hidden" name="level" value={program.level} />
          <input type="hidden" name="departmentId" value={program.departmentId} />
          {program.level === "SENIOR_HIGH"
            ? <NativeSelect name="code" aria-label="Strand" required defaultValue={program.row?.code ?? ""} placeholder="Choose a strand" options={DEFAULT_SHS_STRANDS.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
            : <Input name="code" aria-label="Code" required maxLength={20} placeholder="Code, for example BSIT" defaultValue={program.row?.code} />}
          <Input name="name" aria-label="Name" required maxLength={150} placeholder="Name" defaultValue={program.row?.name} />
          <Button type="submit" className={cn("w-full")} disabled={pending}>Save</Button>
        </form>
      </DialogContent></Dialog>}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This cannot be undone."
        onConfirm={async () => { const res = await deleteDepartmentAction(deleting!.id); if (res.ok) setOpenId(null); return res; }}
        successMessage="Department deleted"
      />
    </div>
  );
}
