/*
  Warnings:

  - You are about to alter the column `money` on the `PetGame` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(8,1)`.

*/
-- AlterTable
ALTER TABLE "PetGame" ALTER COLUMN "money" SET DATA TYPE DECIMAL(8,1);
