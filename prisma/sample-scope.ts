/**
 * Sample data for program-scoped Heads of Department, examination approval, and examination windows.
 * Runs after the main seed; looks records up by code or email so it stays independent of seed internals.
 */
import type { PrismaClient } from "@prisma/client";

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

export async function addScopeAndExamSamples(db: PrismaClient) {
  const [programs, users, faculty] = await Promise.all([
    db.program.findMany({ select: { id: true, code: true } }),
    db.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT" }, select: { id: true, email: true } }),
    db.faculty.findMany({ select: { id: true, employeeId: true } }),
  ]);
  const program = Object.fromEntries(programs.map((p) => [p.code, p.id]));
  const user = Object.fromEntries(users.map((u) => [u.email, u.id]));
  const fac = Object.fromEntries(faculty.map((f) => [f.employeeId, f.id]));

  // Basic Education head handles only STEM and ICT; the business head handles BSBA and BSTM (an old BSA row has ended).
  await db.headProgramAssignment.createMany({
    data: [
      { userId: user["head.basiceducation@granby.edu.ph"], programId: program.STEM, startDate: day(-60) },
      { userId: user["head.basiceducation@granby.edu.ph"], programId: program.ICT, startDate: day(-60) },
      { userId: user["head.business@granby.edu.ph"], programId: program.BSBA, startDate: day(-60) },
      { userId: user["head.business@granby.edu.ph"], programId: program.BSTM, startDate: day(-60), isActing: true, endDate: day(120) },
      { userId: user["head.business@granby.edu.ph"], programId: program.BSA, startDate: day(-200), endDate: day(-30) },
    ],
  });

  // Classes moved back to Unscheduled keep their faculty and room; one subject only has a preferred faculty (room vacant).
  const section = await db.section.findFirst({ where: { name: "Information Technology 1-A" }, select: { id: true } });
  const rooms = await db.room.findMany({ where: { roomName: { in: ["101"] } }, select: { id: true } });
  const subjects = await db.subject.findMany({ where: { code: { in: ["IT102", "GE103"] } }, select: { id: true, code: true } });
  const sub = Object.fromEntries(subjects.map((s) => [s.code, s.id]));
  if (section && sub.IT102) {
    await db.sectionClassPlaceholder.updateMany({
      where: { sectionId: section.id, subjectId: sub.IT102 },
      data: { rememberedFacultyId: fac["F-001"], rememberedRoomId: rooms[0]?.id },
    });
  }
  if (section && sub.GE103) {
    await db.sectionClassPlaceholder.updateMany({ where: { sectionId: section.id, subjectId: sub.GE103 }, data: { preferredFacultyId: fac["F-010"] } });
  }

  // Approved examination windows: the midterm window around the seeded Saturday examinations and a later final window.
  const exam = await db.examination.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const saturday = exam?.date ?? day(10);
  const shift = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  await db.activity.createMany({
    data: [
      { type: "EXAMINATION_WEEK", title: "Midterm Examination Week", examinationType: "MIDTERM", startDate: shift(saturday, -5), endDate: saturday, status: "APPROVED", sectionIds: [] },
      { type: "EXAMINATION_WEEK", title: "Final Examination Week", examinationType: "FINAL", startDate: shift(saturday, 70), endDate: shift(saturday, 75), status: "APPROVED", sectionIds: [] },
      { type: "SCHOOL_EVENT", title: "Intramurals Opening", startDate: shift(saturday, -4), endDate: shift(saturday, -4), status: "APPROVED", sectionIds: [] },
      { type: "CLASS_SUSPENSION", title: "Class Suspension: Typhoon Advisory", startDate: shift(saturday, -2), endDate: shift(saturday, -2), status: "APPROVED", sectionIds: [] },
    ],
  });

  // Seeded examinations count as approved; one stays submitted so the Administrator Review Center has an examination to review.
  await db.examination.updateMany({ data: { status: "PUBLISHED" } });
  const review = await db.examination.findFirst({ where: { section: { name: "Information Technology 2-B" } }, select: { id: true } });
  if (review) await db.examination.update({ where: { id: review.id }, data: { status: "REVIEW", submittedAt: new Date() } });
}
