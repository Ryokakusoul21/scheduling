-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalStudents" INTEGER NOT NULL,
    "totalFaculty" INTEGER NOT NULL,
    "totalSubjects" INTEGER NOT NULL,
    "totalRooms" INTEGER NOT NULL,
    "openConflicts" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_key" ON "DailyStat"("date");
