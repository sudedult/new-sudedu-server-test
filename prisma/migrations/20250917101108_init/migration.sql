-- CreateTable
CREATE TABLE "StudentInfo" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "weekChlId" INTEGER,
    "weekChlScore" INTEGER NOT NULL DEFAULT 0,
    "weekChlWinner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StudentInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetGame" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "money" INTEGER NOT NULL DEFAULT 0,
    "objectAssets" TEXT NOT NULL DEFAULT '[]',
    "petAssets" TEXT NOT NULL DEFAULT '[]',
    "petStats" TEXT NOT NULL DEFAULT '[]',
    "petOnWalk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PetGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekChl" (
    "id" SERIAL NOT NULL,
    "challenge" TEXT NOT NULL,

    CONSTRAINT "WeekChl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentInfo_studentId_key" ON "StudentInfo"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PetGame_studentId_key" ON "PetGame"("studentId");

-- AddForeignKey
ALTER TABLE "StudentInfo" ADD CONSTRAINT "studentinfo_user_fk" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInfo" ADD CONSTRAINT "studentinfo_weekchl_fk" FOREIGN KEY ("weekChlId") REFERENCES "WeekChl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetGame" ADD CONSTRAINT "petgame_user_fk" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
