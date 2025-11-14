/*
  Warnings:

  - Added the required column `class` to the `WeekChl` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WeekChl" ADD COLUMN     "class" INTEGER NOT NULL;
