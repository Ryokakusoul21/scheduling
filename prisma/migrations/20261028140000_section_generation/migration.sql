ALTER TABLE "Section" ADD COLUMN "generationBatchId" TEXT;
ALTER TABLE "EnrollmentRecord" ADD COLUMN "yearLevel" "YearLevel";

CREATE TABLE "SectionClassPlaceholder" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "component" "SubjectComponent" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectionClassPlaceholder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SectionClassPlaceholder_sectionId_subjectId_component_key" ON "SectionClassPlaceholder"("sectionId", "subjectId", "component");
CREATE INDEX "SectionClassPlaceholder_sectionId_idx" ON "SectionClassPlaceholder"("sectionId");
ALTER TABLE "SectionClassPlaceholder" ADD CONSTRAINT "SectionClassPlaceholder_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionClassPlaceholder" ADD CONSTRAINT "SectionClassPlaceholder_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
