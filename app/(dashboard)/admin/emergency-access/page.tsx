import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { formatRange } from "@/lib/scheduler/timetable";
import { CorrectionForm } from "./correction-form";

export const metadata = { title: "Emergency Schedule Access" };

export default async function EmergencyAccessPage({ searchParams }: { searchParams: Promise<{ scheduleId?: string }> }) {
  await requireRole("SUPER_ADMINISTRATOR");
  const { scheduleId } = await searchParams;
  const recent = await prisma.schedule.findMany({
    where: { status: "PUBLISHED" }, take: 100, orderBy: { updatedAt: "desc" },
    select: { id: true, dayOfWeek: true, startMin: true, endMin: true, section: { select: { name: true } }, subject: { select: { code: true } }, semester: { select: { name: true, academicYear: { select: { name: true } } } } },
  });
  const schedule = scheduleId ? await prisma.schedule.findUnique({
    where: { id: scheduleId, status: "PUBLISHED" },
    include: { section: { select: { name: true } }, subject: { select: { code: true } }, faculty: { select: { fullName: true } } },
  }) : null;
  const rooms = schedule ? await prisma.room.findMany({ where: { OR: [{ archivedAt: null }, { id: schedule.roomId }] }, select: { id: true, roomName: true }, orderBy: { roomName: "asc" } }) : [];
  return <div className="max-w-2xl space-y-5">
    <div><h1 className="text-2xl font-semibold">Emergency Schedule Access</h1><p className="text-sm text-muted-foreground">Administrator access is for system maintenance. Academic scheduling decisions belong to the department and Registrar.</p></div>
    <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">Use this only for an emergency placement correction to a published class. A reason is required, scheduling checks still apply, and every saved correction is recorded with its previous and new values.</p>
    <form className="flex items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-sm">Recently updated published classes (up to 100)<NativeSelect name="scheduleId" required defaultValue={recent.some((row) => row.id === scheduleId) ? scheduleId : ""} placeholder="Choose a class" options={recent.map((row) => ({ value: row.id, label: `${row.subject.code} · ${row.section.name} · ${row.semester.academicYear.name} ${row.semester.name} · ${row.dayOfWeek} ${formatRange(row.startMin, row.endMin)}` }))} /></label>
      <Button type="submit" variant="outline">Load class</Button>
    </form>
    <form className="flex items-end gap-2">
      <label className="grid flex-1 gap-1 text-sm">Published class schedule ID<Input name="scheduleId" defaultValue={scheduleId} required /></label>
      <Button type="submit" variant="outline">Load class</Button>
    </form>
    {scheduleId && !schedule && <p role="status">No published class found with that ID.</p>}
    {schedule && <section className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">{schedule.subject.code} · {schedule.section.name} · {schedule.faculty.fullName}</h2>
      <CorrectionForm key={`${schedule.id}-${schedule.updatedAt.toISOString()}`} schedule={{ id: schedule.id, updatedAt: schedule.updatedAt.toISOString(), roomId: schedule.roomId, dayOfWeek: schedule.dayOfWeek, startMin: schedule.startMin, endMin: schedule.endMin }} rooms={rooms} />
    </section>}
  </div>;
}
