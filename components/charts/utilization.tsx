"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HEATMAP_DAYS, HEATMAP_HOURS, type RateRow } from "@/lib/analytics/timetable";
import { DAY_LONG, formatTime } from "@/lib/scheduler/timetable";

/** Size charts assume before the browser measures them, so server rendering does not warn about a zero-size box. */
export const CHART_SIZE = { width: 480, height: 240 };

/** Tooltip style shared by every chart so it follows the light and dark theme. */
export const TOOLTIP_STYLE = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" };

const MARK_TEXT = { MOST: "most used", LEAST: "least used" } as const;

/**
 * Utilization bars for the top rows. Rows marked MOST or LEAST are always shown, drawn in full color with
 * the others muted, and named in the label so the highlight never depends on color alone.
 */
export function RateChart({ title, rows, unit, limit = 10 }: { title: string; rows: (RateRow & { mark?: "MOST" | "LEAST" | null })[]; unit: string; limit?: number }) {
  const marked = rows.some((r) => r.mark);
  const shown = marked ? [...rows.slice(0, limit - 1).filter((r) => r.mark !== "LEAST"), ...rows.filter((r) => r.mark === "LEAST")] : rows.slice(0, limit);
  const data = shown.map((r) => ({ name: r.mark ? `${r.name} (${MARK_TEXT[r.mark]})` : r.name, rate: r.rate, used: r.usedHours, cap: r.capacityHours, mark: r.mark ?? null }));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent style={{ height: Math.max(160, data.length * 30 + 40) }}>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for these filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
              <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} unit="%" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={170} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.05 }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(_v, _n, p) => [`${p.payload.rate}% (${p.payload.used} of ${p.payload.cap} ${unit})`, "Utilization Rate"]}
              />
              <Bar dataKey="rate" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={14} minPointSize={2}>
                {data.map((d) => <Cell key={d.name} fill="var(--chart-1)" fillOpacity={!marked || d.mark ? 1 : 0.35} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Day-by-hour heatmap in one hue, light to dark, with counts printed in each cell. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Peak scheduling hours</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[11px]">
            <thead>
              <tr>
                <th />
                {HEATMAP_HOURS.map((h) => <th key={h} className="font-normal text-muted-foreground">{formatTime(h * 60).replace(":00", "")}</th>)}
              </tr>
            </thead>
            <tbody>
              {HEATMAP_DAYS.map((d, i) => (
                <tr key={d}>
                  <th className="pr-2 text-left font-normal text-muted-foreground">{DAY_LONG[d]}</th>
                  {grid[i].map((n, j) => (
                    <td
                      key={j}
                      title={`${DAY_LONG[d]} ${formatTime(HEATMAP_HOURS[j] * 60)}: ${n} class meeting(s) in session`}
                      className="h-8 rounded text-center tabular-nums"
                      // One hue, light to dark: opacity scales with the count.
                      style={{ background: n ? `color-mix(in oklab, var(--chart-1) ${Math.round(15 + (n / max) * 85)}%, transparent)` : "var(--muted)", color: n / max > 0.55 ? "white" : undefined }}
                    >
                      {n || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Each cell counts the class meetings in session during that hour. Darker cells are busier.</p>
      </CardContent>
    </Card>
  );
}

