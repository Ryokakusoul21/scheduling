"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Row {
  id: string;
  semesterLabel: string;
  semesterId: string;
  subjectLabel: string;
  sectionLabel: string;
  sectionId: string;
  facultyLabel: string;
  facultyId: string;
  roomLabel: string;
  roomId: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  status: string;
}

const STATUS_LABELS: Record<string, string> = { DRAFT: "Draft", REVIEW: "Awaiting approval", PUBLISHED: "Published", ARCHIVED: "Archived" };

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function ScheduleReportTable({
  rows,
  semesters,
  sections,
  faculty,
  rooms,
}: {
  rows: Row[];
  semesters: { id: string; label: string }[];
  sections: { id: string; label: string }[];
  faculty: { id: string; label: string }[];
  rooms: { id: string; label: string }[];
}) {
  const [semesterId, setSemesterId] = useState("ALL");
  const [sectionId, setSectionId] = useState("ALL");
  const [facultyId, setFacultyId] = useState("ALL");
  const [roomId, setRoomId] = useState("ALL");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (semesterId === "ALL" || r.semesterId === semesterId) &&
          (sectionId === "ALL" || r.sectionId === sectionId) &&
          (facultyId === "ALL" || r.facultyId === facultyId) &&
          (roomId === "ALL" || r.roomId === roomId)
      ),
    [rows, semesterId, sectionId, facultyId, roomId]
  );
  // Ten rows per page on screen; exports and printing still include every filtered row.
  const paging = usePagination(filtered, 10, [semesterId, sectionId, facultyId, roomId].join("|"));

  return (
    <Card className="print-area">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 print:hidden">
        <CardTitle>Class Schedule Report</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={[{ value: "ALL", label: "All Semesters" }, ...semesters.map((o) => ({ value: o.id, label: o.label }))]} value={semesterId} onValueChange={(v) => setSemesterId(v ?? "ALL")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Semester" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select items={[{ value: "ALL", label: "All Sections" }, ...sections.map((o) => ({ value: o.id, label: o.label }))]} value={sectionId} onValueChange={(v) => setSectionId(v ?? "ALL")}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select items={[{ value: "ALL", label: "All Faculty" }, ...faculty.map((o) => ({ value: o.id, label: o.label }))]} value={facultyId} onValueChange={(v) => setFacultyId(v ?? "ALL")}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Faculty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Faculty</SelectItem>
              {faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select items={[{ value: "ALL", label: "All Rooms" }, ...rooms.map((o) => ({ value: o.id, label: o.label }))]} value={roomId} onValueChange={(v) => setRoomId(v ?? "ALL")}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Room" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Rooms</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <ExportButtons
            filename="schedule-of-classes"
            rows={filtered}
            columns={[
              { header: "Subject", value: (r) => r.subjectLabel },
              { header: "Section", value: (r) => r.sectionLabel },
              { header: "Faculty", value: (r) => r.facultyLabel },
              { header: "Room", value: (r) => r.roomLabel },
              { header: "Day", value: (r) => r.dayOfWeek[0] + r.dayOfWeek.slice(1).toLowerCase() },
              { header: "Time", value: (r) => `${formatTime(r.startMin)} to ${formatTime(r.endMin)}` },
              { header: "Term", value: (r) => r.semesterLabel },
              { header: "Status", value: (r) => STATUS_LABELS[r.status] ?? r.status },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        <PrintHeader title="Schedule of Classes" subtitle="Naic, Cavite" />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Faculty</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Day / Time</TableHead>
                <TableHead className="print:hidden">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No schedule entries match the selected filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r, i) => (
                <TableRow key={r.id} className={cn(!paging.isVisible(i) && "hidden print:table-row")}>
                  <TableCell className="font-medium">{r.subjectLabel}</TableCell>
                  <TableCell>{r.sectionLabel}</TableCell>
                  <TableCell>{r.facultyLabel}</TableCell>
                  <TableCell>{r.roomLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.dayOfWeek[0] + r.dayOfWeek.slice(1).toLowerCase()} · {formatTime(r.startMin)}–{formatTime(r.endMin)}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Badge variant={r.status === "PUBLISHED" ? "default" : "secondary"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination {...paging} className="mt-3" />
      </CardContent>
    </Card>
  );
}
