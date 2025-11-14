/*
  Warnings:

  - The `weekChlWinner` column on the `StudentInfo` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "StudentInfo" DROP COLUMN "weekChlWinner",
ADD COLUMN     "weekChlWinner" INTEGER NOT NULL DEFAULT 0;
