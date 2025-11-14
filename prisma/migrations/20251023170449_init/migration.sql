/*
  Warnings:

  - A unique constraint covering the columns `[taskInfo]` on the table `TaskLibrary` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TaskLibrary_taskInfo_key" ON "TaskLibrary"("taskInfo");
