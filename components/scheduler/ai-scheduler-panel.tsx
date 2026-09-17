"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Upload, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  generateScheduleAction,
  publishDraftAction,
  discardDraftAction,
} from "@/app/(dashboard)/ai-scheduler/actions";

interface SemesterOption {
  id: string;
  label: string;
  isActive: boolean;
}
interface SectionOption {
  id: string;
  name: string;
  program: string;
  studentCount: number;
}

type GenerateResult = Awaited<ReturnType<typeof generateScheduleAction>>;

export function AiSchedulerPanel({
  semesters,
  sections,
}: {
  semesters: SemesterOption[];
  sections: SectionOption[];
}) {
  const [semesterId, setSemesterId] = useState(semesters.find((s) => s.isActive)?.id ?? semesters[0]?.id ?? "");
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateResult | null>(null);

  const allSelected = sectionIds.length === sections.length && sections.length > 0;

  function toggleSection(id: string) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleGenerate() {
    if (!semesterId || sectionIds.length === 0) {
      toast.error("Select a semester and at least one section.");
      return;
    }
    startTransition(async () => {
      const res = await generateScheduleAction({ semesterId, sectionIds });
      setResult(res);
      if (res.ok) {
        toast.success(`Generated ${res.result.createdCount} class meeting(s) — ${res.result.scoreAfter}% optimized.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handlePublish() {
    if (!result?.ok) return;
    startTransition(async () => {
      await publishDraftAction(semesterId, result.result.version);
      toast.success("Draft schedule published.");
    });
  }

  function handleDiscard() {
    if (!result?.ok) return;
    startTransition(async () => {
      await discardDraftAction(semesterId, result.result.version);
      toast.success("Draft schedule discarded.");
      setResult(null);
    });
  }

  const scoreCards = useMemo(() => {
    if (!result?.ok) return [];
    return [
      { label: "Overall Optimization", value: result.result.scoreAfter },
    ];
  }, [result]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Semester</label>
            <Select value={semesterId} onValueChange={(v) => setSemesterId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} {s.isActive && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Sections</label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setSectionIds(allSelected ? [] : sections.map((s) => s.id))}
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
              {sections.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={sectionIds.includes(s.id)}
                    onCheckedChange={() => toggleSection(s.id)}
                  />
                  <span className="flex-1">{s.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {s.program}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{s.studentCount} stu.</span>
                </label>
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate Schedule
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-3">
        {!result && (
          <Card className="flex h-full min-h-64 items-center justify-center text-center">
            <CardContent className="max-w-sm text-sm text-muted-foreground">
              Configure a semester and sections, then generate a schedule to see the
              optimization score, explanation, and any unplaced classes here.
            </CardContent>
          </Card>
        )}

        {result && !result.ok && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Generation failed</p>
                <p className="text-sm text-muted-foreground">{result.error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {result?.ok && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Optimization Score</CardTitle>
                <span className="text-2xl font-semibold tabular-nums">{result.result.scoreAfter}%</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {scoreCards.map((c) => (
                  <div key={c.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{c.label}</span>
                      <span>{c.value}%</span>
                    </div>
                    <Progress value={c.value} />
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handlePublish} disabled={pending}>
                    <Upload className="size-4" /> Publish Draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDiscard} disabled={pending}>
                    <Trash2 className="size-4" /> Discard Draft
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Why this schedule was generated</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {result.result.explanation.map((line, i) => (
                  <p key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {line}
                  </p>
                ))}
              </CardContent>
            </Card>

            {result.result.unplaced.length > 0 && (
              <Card className="border-amber-500/40">
                <CardHeader>
                  <CardTitle className="text-base">Unplaced Meetings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {result.result.unplaced.map((u, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <span>
                        <strong>{u.subjectCode}</strong> ({u.component}) for {u.sectionName} — {u.reason}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
