/*
  Warnings:

  - Added the required column `duration` to the `TeacherTask` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taskLibraryId` to the `TeacherTask` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TeacherTask" ADD COLUMN     "duration" TEXT NOT NULL,
ADD COLUMN     "taskLibraryId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "TaskLibrary" (
    "id" SERIAL NOT NULL,
    "taskInfo" TEXT NOT NULL,

    CONSTRAINT "TaskLibrary_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TeacherTask" ADD CONSTRAINT "TeacherTask_taskLibraryId_fkey" FOREIGN KEY ("taskLibraryId") REFERENCES "TaskLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
