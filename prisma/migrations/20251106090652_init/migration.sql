/*
  Warnings:

  - Added the required column `challengeType` to the `ChlLibrary` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChlLibrary" ADD COLUMN     "challengeType" TEXT NOT NULL;
