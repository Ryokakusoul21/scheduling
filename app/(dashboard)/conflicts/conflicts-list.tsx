"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Wand2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findFixOptionsAction, applyResolutionAction } from "./actions";
import type { DayOfWeek } from "@/lib/scheduler/types";

interface ScheduleInfo {
  subjectLabel: string;
  sectionLabel: string;
  facultyLabel: string;
  roomLabel: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
}

interface ConflictRow {
  key: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  entryAId: string;
  entryA: ScheduleInfo;
  entryB?: ScheduleInfo;
}

interface Option {
  room: { id: string; roomName: string };
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  label: string;
  score: number;
}

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function severityVariant(s: string): "destructive" | "secondary" | "outline" {
  if (s === "CRITICAL" || s === "HIGH") return "destructive";
  if (s === "MEDIUM") return "secondary";
  return "outline";
}

export function ConflictsList({ rows }: { rows: ConflictRow[] }) {
  const [pending, startTransition] = useTransition();
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);

  function handleFindOptions(row: ConflictRow) {
    setOptionsFor(row.key);
    setOptions([]);
    startTransition(async () => {
      const res = await findFixOptionsAction(row.entryAId);
      if (res.ok) {
        setOptions(res.options);
        if (res.options.length === 0) toast.error("No legal alternative found automatically.");
      }
    });
  }

  function handleApply(row: ConflictRow, option: Option) {
    startTransition(async () => {
      await applyResolutionAction(row.entryAId, option.room.id, option.dayOfWeek as DayOfWeek, option.startMin, option.endMin);
      toast.success("Resolution applied.");
      setOptionsFor(null);
      setOptions([]);
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="flex items-center gap-3 p-6">
          <CheckCircle2 className="size-6 text-emerald-600" />
          <div>
            <p className="font-medium">No conflicts detected</p>
            <p className="text-sm text-muted-foreground">Every scanned schedule entry is currently conflict-free.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.key} className={row.severity === "CRITICAL" ? "border-destructive/40" : undefined}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">{row.type.replace(/_/g, " ")}</p>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </div>
              </div>
              <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
            </div>

            <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="font-medium">{row.entryA.subjectLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {row.entryA.sectionLabel} · {row.entryA.facultyLabel} · {row.entryA.roomLabel} ·{" "}
                  {row.entryA.dayOfWeek[0] + row.entryA.dayOfWeek.slice(1).toLowerCase()} {formatTime(row.entryA.startMin)}–{formatTime(row.entryA.endMin)}
                </p>
              </div>
              {row.entryB && (
                <div>
                  <p className="font-medium">{row.entryB.subjectLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.entryB.sectionLabel} · {row.entryB.facultyLabel} · {row.entryB.roomLabel} ·{" "}
                    {row.entryB.dayOfWeek[0] + row.entryB.dayOfWeek.slice(1).toLowerCase()} {formatTime(row.entryB.startMin)}–{formatTime(row.entryB.endMin)}
                  </p>
                </div>
              )}
            </div>

            <Button size="sm" variant="outline" onClick={() => handleFindOptions(row)} disabled={pending}>
              {pending && optionsFor === row.key ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Fix Automatically
            </Button>

            {optionsFor === row.key && options.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Recommended alternatives for {row.entryA.subjectLabel}:</p>
                {options.map((o, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>
                      Option {i + 1}: {o.label}
                    </span>
                    <Button size="sm" onClick={() => handleApply(row, o)} disabled={pending}>
                      Apply Recommendation
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
