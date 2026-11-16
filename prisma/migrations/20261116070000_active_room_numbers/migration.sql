-- Keep archived rooms and their historical links, reserving numbers only for active rooms.
BEGIN;

CREATE UNIQUE INDEX "Room_active_roomNumber_key" ON "Room"("roomNumber")
WHERE "archivedAt" IS NULL;

DROP INDEX "Room_roomNumber_key";

COMMIT;
