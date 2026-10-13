"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch, DownloadSimple, FloppyDisk, UploadSimple } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadText } from "@/lib/export/csv";
import { parseDelimited, readXlsx, rowsToRecords } from "@/lib/import/parse";
import { COLUMNS, templateCsv, type ImportKind, type RowResult } from "@/lib/import/specs";
import { cn } from "@/lib/utils";
import { commitImportAction, validateImportAction } from "./actions";

const KIND_LABELS: Record<ImportKind, string> = { subjects: "Subjects", rooms: "Rooms" };

export function ImportWorkspace({ initialKind }: { initialKind: ImportKind }) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [paste, setPaste] = useState("");
  const [records, setRecords] = useState<Record<string, string>[] | null>(null);
  const [results, setResults] = useState<RowResult<unknown>[] | null>(null);
  const [pending, startTransition] = useTransition();
  const columns = COLUMNS[kind];

  function reset(next: ImportKind) {
    setKind(next);
    setRecords(null);
    setResults(null);
    setPaste("");
  }

  function load(rows: string[][]) {
    const { records: recs, missing } = rowsToRecords(rows, columns);
    const required = missing.filter((m) => columns.find((c) => c.header === m)?.required);
    if (required.length) return void toast.error(`Missing required column(s): ${required.join(", ")}. Download the template to see the expected headers.`);
    if (recs.length === 0) return void toast.error("No data rows found below the header row.");
    setRecords(recs);
    setResults(null);
    startTransition(async () => {
      const res = await validateImportAction(kind, recs);
      if (res.ok) setResults(res.data);
      else toast.error(res.error);
    });
  }

  async function onFile(file: File) {
    try {
      const rows = /\.xlsx$/i.test(file.name) ? await readXlsx(await file.arrayBuffer()) : parseDelimited(await file.text());
      load(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file.");
    }
  }

  function save() {
    if (!records) return;
    startTransition(async () => {
      const res = await commitImportAction(kind, records);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Saved ${res.data.saved} ${kind}${res.data.skipped ? `; skipped ${res.data.skipped} row(s) with errors` : ""}.`);
      setRecords(null);
      setResults(null);
      setPaste("");
    });
  }

  const validCount = results?.filter((r) => r.data).length ?? 0;
  const errorCount = (results?.length ?? 0) - validCount;

  return (
    <div className="space-y-4">
      <div className="flex rounded-md border p-0.5 w-fit" role="tablist" aria-label="What to import">
        {(["subjects", "rooms"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => reset(k)} className={cn("rounded px-4 py-1.5 text-sm font-medium", kind === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Get the template</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" onClick={() => downloadText(`${kind}-import-template.csv`, templateCsv(kind))}>
              <DownloadSimple className="size-4" /> Download {KIND_LABELS[kind].toLowerCase()} template
            </Button>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {columns.map((c) => (
                <li key={c.key}><span className="font-medium text-foreground">{c.header}</span>{c.required && <span className="text-destructive"> *</span>}: {c.help}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2. Upload or paste</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm hover:bg-muted/50">
              <UploadSimple className="size-4" /> Choose a .csv or .xlsx file
              <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
            </label>
            <Textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Or paste rows copied from Excel or Google Sheets here, including the header row." className="font-mono text-xs" />
            <Button size="sm" variant="outline" disabled={!paste.trim() || pending} onClick={() => load(parseDelimited(paste))}>Preview pasted rows</Button>
          </CardContent>
        </Card>
      </div>

      {records && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              3. Preview
              {results && <Badge>{validCount} ready</Badge>}
              {results && errorCount > 0 && <Badge variant="destructive">{errorCount} with errors</Badge>}
              {pending && !results && <CircleNotch className="size-4 animate-spin" />}
            </CardTitle>
            <Button onClick={save} disabled={pending || validCount === 0}>
              {pending ? <CircleNotch className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />} Save {validCount} valid row(s)
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    {columns.map((c) => <TableHead key={c.key} className="whitespace-nowrap">{c.header}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r, i) => {
                    const res = results?.[i];
                    return (
                      <TableRow key={i} className={cn(res && !res.data && "bg-destructive/5")}>
                        <TableCell className="text-xs text-muted-foreground">{i + 2}</TableCell>
                        <TableCell className="min-w-56 text-xs">
                          {!res ? "Checking" : res.data ? <span className="text-emerald-600">Ready</span> : res.errors.map((e) => <p key={e} className="text-destructive">{e}</p>)}
                          {res?.warnings.map((w) => <p key={w} className="text-amber-600">{w}</p>)}
                        </TableCell>
                        {columns.map((c) => <TableCell key={c.key} className="whitespace-nowrap text-xs">{r[c.key]}</TableCell>)}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
