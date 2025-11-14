/*
  Warnings:

  - You are about to drop the column `class` on the `WeekChl` table. All the data in the column will be lost.
  - You are about to drop the column `duration` on the `WeekChl` table. All the data in the column will be lost.
  - You are about to drop the column `taskLibraryId` on the `WeekChl` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WeekChl" DROP CONSTRAINT "WeekChl_taskLibraryId_fkey";

-- AlterTable
ALTER TABLE "WeekChl" DROP COLUMN "class",
DROP COLUMN "duration",
DROP COLUMN "taskLibraryId",
ADD COLUMN     "weekChlLibraryId" INTEGER;

-- CreateTable
CREATE TABLE "WeekChlLibrary" (
    "id" SERIAL NOT NULL,
    "taskLibraryId" INTEGER NOT NULL,
    "duration" TEXT NOT NULL,
    "class" INTEGER NOT NULL,

    CONSTRAINT "WeekChlLibrary_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WeekChlLibrary" ADD CONSTRAINT "WeekChlLibrary_taskLibraryId_fkey" FOREIGN KEY ("taskLibraryId") REFERENCES "TaskLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekChl" ADD CONSTRAINT "WeekChl_weekChlLibraryId_fkey" FOREIGN KEY ("weekChlLibraryId") REFERENCES "WeekChlLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
