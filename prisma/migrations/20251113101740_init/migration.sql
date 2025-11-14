/*
  Warnings:

  - You are about to drop the column `gift` on the `MessageGift` table. All the data in the column will be lost.
  - You are about to drop the column `giftType` on the `MessageGift` table. All the data in the column will be lost.
  - Added the required column `giftId` to the `MessageGift` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MessageGift" DROP COLUMN "gift",
DROP COLUMN "giftType",
ADD COLUMN     "giftId" INTEGER NOT NULL;
