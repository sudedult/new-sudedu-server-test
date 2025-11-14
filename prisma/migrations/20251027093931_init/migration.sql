/*
  Warnings:

  - You are about to drop the column `totalPoints` on the `StudentInfo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StudentInfo" DROP COLUMN "totalPoints",
ADD COLUMN     "stats" TEXT NOT NULL DEFAULT '{"c": [], "m": [], "t": [], "g": [], "d": null}';
