CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "SubjectAssignment" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "sectionId" TEXT,
    "semesterId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubjectAssignment_semesterId_status_idx" ON "SubjectAssignment"("semesterId", "status");
CREATE INDEX "SubjectAssignment_facultyId_idx" ON "SubjectAssignment"("facultyId");
CREATE INDEX "SubjectAssignment_subjectId_idx" ON "SubjectAssignment"("subjectId");

-- One active assignment per subject, section (or all sections), and term; archived history is not constrained.
CREATE UNIQUE INDEX "SubjectAssignment_active_key" ON "SubjectAssignment"("subjectId", "sectionId", "semesterId") NULLS NOT DISTINCT WHERE "status" = 'ACTIVE';

ALTER TABLE "SubjectAssignment" ADD CONSTRAINT "SubjectAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignment" ADD CONSTRAINT "SubjectAssignment_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignment" ADD CONSTRAINT "SubjectAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignment" ADD CONSTRAINT "SubjectAssignment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
