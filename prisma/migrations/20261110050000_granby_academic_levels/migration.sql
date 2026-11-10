-- Keep legacy enum values so historical records remain readable.
ALTER TYPE "AcademicLevel" ADD VALUE IF NOT EXISTS 'PRE_ELEMENTARY';
ALTER TYPE "GradeLevel" ADD VALUE IF NOT EXISTS 'NURSERY';
ALTER TYPE "GradeLevel" ADD VALUE IF NOT EXISTS 'PREPARATORY';
