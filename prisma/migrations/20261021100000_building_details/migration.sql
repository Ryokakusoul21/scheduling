-- CreateEnum
CREATE TYPE "BuildingPurpose" AS ENUM ('ACADEMIC', 'SCIENCE_TECHNOLOGY', 'LIBRARY', 'ARTS', 'SPORTS', 'ADMINISTRATION', 'MIXED_USE');

-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "closingMin" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "openingMin" INTEGER,
ADD COLUMN     "photo" BYTEA,
ADD COLUMN     "photoType" TEXT,
ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "purpose" "BuildingPurpose" NOT NULL DEFAULT 'ACADEMIC';
