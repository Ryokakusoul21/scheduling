ALTER TYPE "ConstraintKind" ADD VALUE IF NOT EXISTS 'CLASS_DURATION';
ALTER TYPE "ConstraintKind" ADD VALUE IF NOT EXISTS 'DELIVERY_MODE';
ALTER TABLE "Schedule" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Schedule" ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'IN_PERSON';
ALTER TABLE "Schedule" ADD COLUMN "meetingLink" TEXT;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_deliveryMode_check"
  CHECK ("deliveryMode" IN ('IN_PERSON', 'ONLINE_LIVE'));
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_delivery_room_check"
  CHECK (("deliveryMode" = 'IN_PERSON' AND "roomId" IS NOT NULL)
    OR ("deliveryMode" = 'ONLINE_LIVE' AND "roomId" IS NULL));
