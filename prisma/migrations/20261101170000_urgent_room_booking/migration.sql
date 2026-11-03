ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';
ALTER TYPE "AdjustmentKind" ADD VALUE 'ONLINE';

CREATE TYPE "BookingPriority" AS ENUM ('REGULAR', 'HIGH', 'URGENT', 'CRITICAL');
CREATE TYPE "UrgentReason" AS ENUM ('ACCREDITATION', 'EMERGENCY_MEETING', 'ADMINISTRATIVE_DIRECTIVE', 'EXAMINATION', 'EVENT', 'OTHER');
CREATE TYPE "AcknowledgementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'ALTERNATIVE_REQUESTED');

ALTER TABLE "RoomBooking" ADD COLUMN "priority" "BookingPriority" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN "urgentReason" "UrgentReason",
ADD COLUMN "reasonDetail" TEXT,
ADD COLUMN "approvalDepartmentId" TEXT,
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "displacedById" TEXT,
ADD COLUMN "previousRoomId" TEXT;

CREATE INDEX "RoomBooking_priority_createdAt_idx" ON "RoomBooking"("priority", "createdAt");
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_displacedById_fkey" FOREIGN KEY ("displacedById") REFERENCES "RoomBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BookingAcknowledgement" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "status" "AcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingAcknowledgement_bookingId_facultyId_key" ON "BookingAcknowledgement"("bookingId", "facultyId");
CREATE INDEX "BookingAcknowledgement_facultyId_status_idx" ON "BookingAcknowledgement"("facultyId", "status");
ALTER TABLE "BookingAcknowledgement" ADD CONSTRAINT "BookingAcknowledgement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RoomBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
