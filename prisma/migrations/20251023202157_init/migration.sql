/*
  Warnings:

  - You are about to drop the column `challenge` on the `WeekChl` table. All the data in the column will be lost.
  - Added the required column `duration` to the `WeekChl` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taskLibraryId` to the `WeekChl` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WeekChl" DROP COLUMN "challenge",
ADD COLUMN     "duration" TEXT NOT NULL,
ADD COLUMN     "taskLibraryId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "WeekChl" ADD CONSTRAINT "WeekChl_taskLibraryId_fkey" FOREIGN KEY ("taskLibraryId") REFERENCES "TaskLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
