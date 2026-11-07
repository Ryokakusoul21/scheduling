-- A class can be protected from urgent room bookings.
ALTER TABLE "Schedule" ADD COLUMN "doNotMove" BOOLEAN NOT NULL DEFAULT false;
