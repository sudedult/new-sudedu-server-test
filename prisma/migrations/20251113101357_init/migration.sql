-- DropForeignKey
ALTER TABLE "WeekChl" DROP CONSTRAINT "WeekChl_chlLibraryId_fkey";

-- CreateTable
CREATE TABLE "MessageGift" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "gift" TEXT NOT NULL,
    "giftType" TEXT NOT NULL,
    "giftExpiration" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PetGameMessageGifts" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PetGameMessageGifts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PetGameMessageGifts_B_index" ON "_PetGameMessageGifts"("B");

-- AddForeignKey
ALTER TABLE "WeekChl" ADD CONSTRAINT "WeekChl_chlLibraryId_fkey" FOREIGN KEY ("chlLibraryId") REFERENCES "ChlLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PetGameMessageGifts" ADD CONSTRAINT "_PetGameMessageGifts_A_fkey" FOREIGN KEY ("A") REFERENCES "MessageGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PetGameMessageGifts" ADD CONSTRAINT "_PetGameMessageGifts_B_fkey" FOREIGN KEY ("B") REFERENCES "PetGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
