"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 print:hidden">
        <CardTitle>Class Schedule Report</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={semesterId} onValueChange={(v) => setSemesterId(v ?? "ALL")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Semester" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? "ALL")}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={facultyId} onValueChange={(v) => setFacultyId(v ?? "ALL")}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Faculty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Faculty</SelectItem>
              {faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roomId} onValueChange={(v) => setRoomId(v ?? "ALL")}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Room" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Rooms</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 hidden text-center print:block">
          <p className="font-semibold">GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY</p>
          <p className="text-sm">Naic, Cavite — Schedule of Classes</p>
        </div>
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
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.subjectLabel}</TableCell>
                  <TableCell>{r.sectionLabel}</TableCell>
                  <TableCell>{r.facultyLabel}</TableCell>
                  <TableCell>{r.roomLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.dayOfWeek[0] + r.dayOfWeek.slice(1).toLowerCase()} · {formatTime(r.startMin)}–{formatTime(r.endMin)}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Badge variant={r.status === "PUBLISHED" ? "default" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
