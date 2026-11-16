-- CreateTable
CREATE TABLE "FacultyRoomPreference" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "FacultyRoomPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacultyRoomPreference_facultyId_rank_idx" ON "FacultyRoomPreference"("facultyId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyRoomPreference_facultyId_roomId_key" ON "FacultyRoomPreference"("facultyId", "roomId");

-- AddForeignKey
ALTER TABLE "FacultyRoomPreference" ADD CONSTRAINT "FacultyRoomPreference_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyRoomPreference" ADD CONSTRAINT "FacultyRoomPreference_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
