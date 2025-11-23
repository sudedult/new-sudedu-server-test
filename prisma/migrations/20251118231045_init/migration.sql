-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "accType" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "lastLogIn" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherStudent" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,

    CONSTRAINT "TeacherStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherTask" (
    "id" SERIAL NOT NULL,
    "group" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "taskLibraryId" INTEGER NOT NULL,

    CONSTRAINT "TeacherTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLibrary" (
    "id" SERIAL NOT NULL,
    "taskInfo" TEXT NOT NULL,

    CONSTRAINT "TaskLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTaskAssignment" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "result" TEXT NOT NULL,
    "completionDate" TIMESTAMP(3),

    CONSTRAINT "StudentTaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInfo" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "stats" TEXT NOT NULL DEFAULT '{"c": [], "m": [], "t": [], "g": [], "d": null}',
    "avatar" TEXT NOT NULL DEFAULT 'w63060003',
    "weekChlId" INTEGER,
    "knowledgeLvl" INTEGER NOT NULL DEFAULT -1,
    "weekChlScore" INTEGER NOT NULL DEFAULT 0,
    "weekChlWinner" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StudentInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetGame" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "money" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "roomLayout" INTEGER NOT NULL DEFAULT 1,
    "objectAssets" TEXT NOT NULL DEFAULT '[]',
    "petAssets" TEXT NOT NULL DEFAULT '[[], []]',
    "petStats" TEXT NOT NULL DEFAULT '{}',
    "taxes" TEXT NOT NULL DEFAULT '[]',
    "petOnWalk" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PetGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChlLibrary" (
    "id" SERIAL NOT NULL,
    "taskInfo" TEXT NOT NULL,
    "personalChlDuration" TEXT NOT NULL,
    "weekChlDuration" TEXT NOT NULL DEFAULT '["C39","5"]',
    "challengeType" TEXT NOT NULL,
    "class" INTEGER NOT NULL,
    "period" TEXT NOT NULL,

    CONSTRAINT "ChlLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekChl" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "chlLibraryId" INTEGER,

    CONSTRAINT "WeekChl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageGift" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "giftId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
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
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudent_studentId_key" ON "TeacherStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLibrary_taskInfo_key" ON "TaskLibrary"("taskInfo");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTaskAssignment_studentId_taskId_key" ON "StudentTaskAssignment"("studentId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInfo_studentId_key" ON "StudentInfo"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PetGame_studentId_key" ON "PetGame"("studentId");

-- CreateIndex
CREATE INDEX "ChlLibrary_class_period_idx" ON "ChlLibrary"("class", "period");

-- CreateIndex
CREATE INDEX "_PetGameMessageGifts_B_index" ON "_PetGameMessageGifts"("B");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherTask" ADD CONSTRAINT "TeacherTask_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherTask" ADD CONSTRAINT "TeacherTask_taskLibraryId_fkey" FOREIGN KEY ("taskLibraryId") REFERENCES "TaskLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTaskAssignment" ADD CONSTRAINT "StudentTaskAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTaskAssignment" ADD CONSTRAINT "StudentTaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TeacherTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInfo" ADD CONSTRAINT "studentinfo_user_fk" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInfo" ADD CONSTRAINT "studentinfo_weekchl_fk" FOREIGN KEY ("weekChlId") REFERENCES "WeekChl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetGame" ADD CONSTRAINT "petgame_user_fk" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekChl" ADD CONSTRAINT "WeekChl_chlLibraryId_fkey" FOREIGN KEY ("chlLibraryId") REFERENCES "ChlLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PetGameMessageGifts" ADD CONSTRAINT "_PetGameMessageGifts_A_fkey" FOREIGN KEY ("A") REFERENCES "MessageGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PetGameMessageGifts" ADD CONSTRAINT "_PetGameMessageGifts_B_fkey" FOREIGN KEY ("B") REFERENCES "PetGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
