"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NAVY = "#2c3d8f";
const GOLD = "#e0b74a";

export function AnalyticsCharts({
  classesPerDay,
  roomUtilization,
  workloadData,
  studentsPerSection,
  totalClasses,
  conflictCount,
}: {
  classesPerDay: { day: string; classes: number }[];
  roomUtilization: { room: string; utilization: number }[];
  workloadData: { name: string; value: number }[];
  studentsPerSection: { section: string; students: number }[];
  totalClasses: number;
  conflictCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{totalClasses}</p><p className="text-xs text-muted-foreground">Total Class Meetings</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className={`text-2xl font-semibold ${conflictCount > 0 ? "text-destructive" : "text-emerald-600"}`}>{conflictCount}</p><p className="text-xs text-muted-foreground">Detected Conflicts</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{roomUtilization[0]?.utilization ?? 0}%</p><p className="text-xs text-muted-foreground">Peak Room Utilization</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{workloadData.find((w) => w.name === "Normal")?.value ?? 0}</p><p className="text-xs text-muted-foreground">Faculty at Normal Load</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Classes Per Day</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classesPerDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "currentColor", opacity: 0.05 }} />
                <Bar dataKey="classes" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Room Utilization (Top 8)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomUtilization} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" opacity={0.1} />
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                <YAxis dataKey="room" type="category" fontSize={12} tickLine={false} axisLine={false} width={60} />
                <Tooltip cursor={{ fill: "currentColor", opacity: 0.05 }} />
                <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                  {roomUtilization.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? GOLD : NAVY} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Faculty Workload Distribution</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "currentColor", opacity: 0.05 }} />
                <Bar dataKey="value" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Students Per Section (Top 10)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentsPerSection}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="section" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "currentColor", opacity: 0.05 }} />
                <Bar dataKey="students" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
