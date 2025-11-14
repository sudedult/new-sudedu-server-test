/*
  Warnings:

  - You are about to drop the column `weekChlLibraryId` on the `WeekChl` table. All the data in the column will be lost.
  - You are about to drop the `WeekChlLibrary` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WeekChl" DROP CONSTRAINT "WeekChl_weekChlLibraryId_fkey";

-- DropForeignKey
ALTER TABLE "WeekChlLibrary" DROP CONSTRAINT "WeekChlLibrary_taskLibraryId_fkey";

-- AlterTable
ALTER TABLE "WeekChl" DROP COLUMN "weekChlLibraryId",
ADD COLUMN     "chlLibraryId" INTEGER;

-- DropTable
DROP TABLE "WeekChlLibrary";

-- CreateTable
CREATE TABLE "ChlLibrary" (
    "id" SERIAL NOT NULL,
    "taskInfo" TEXT NOT NULL,
    "personalChlDuration" TEXT NOT NULL,
    "weekChlDuration" TEXT NOT NULL DEFAULT '["C39","5"]',
    "class" INTEGER NOT NULL,
    "period" TEXT NOT NULL,

    CONSTRAINT "ChlLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChlLibrary_class_period_idx" ON "ChlLibrary"("class", "period");

-- AddForeignKey
ALTER TABLE "WeekChl" ADD CONSTRAINT "WeekChl_chlLibraryId_fkey" FOREIGN KEY ("chlLibraryId") REFERENCES "ChlLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
