CREATE TYPE "SubjectCategory" AS ENUM ('MAJOR', 'MINOR');

ALTER TABLE "Subject"
  ADD COLUMN "category" "SubjectCategory" NOT NULL DEFAULT 'MAJOR',
  ADD COLUMN "semester" "SemesterType";

CREATE TABLE "_SharedSubjectPrograms" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_SharedSubjectPrograms_AB_unique" ON "_SharedSubjectPrograms"("A", "B");
CREATE INDEX "_SharedSubjectPrograms_B_index" ON "_SharedSubjectPrograms"("B");
ALTER TABLE "_SharedSubjectPrograms" ADD CONSTRAINT "_SharedSubjectPrograms_A_fkey" FOREIGN KEY ("A") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_SharedSubjectPrograms" ADD CONSTRAINT "_SharedSubjectPrograms_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SubjectChangeRequest" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "departmentId" TEXT,
  "requestedById" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubjectChangeRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SubjectChangeRequest" ADD CONSTRAINT "SubjectChangeRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectChangeRequest" ADD CONSTRAINT "SubjectChangeRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubjectChangeRequest" ADD CONSTRAINT "SubjectChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
