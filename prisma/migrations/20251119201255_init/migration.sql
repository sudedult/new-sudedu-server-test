-- CreateTable
CREATE TABLE "TaskResultArchive" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "taskLibraryId" INTEGER NOT NULL,
    "correct" SMALLINT NOT NULL DEFAULT 0,
    "mistakes" SMALLINT NOT NULL DEFAULT 0,
    "totalAnswers" SMALLINT NOT NULL DEFAULT 0,
    "answerRate" REAL NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,

    CONSTRAINT "TaskResultArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskResultArchive_studentId_taskLibraryId_date_key" ON "TaskResultArchive"("studentId", "taskLibraryId", "date");

-- AddForeignKey
ALTER TABLE "TaskResultArchive" ADD CONSTRAINT "TaskResultArchive_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskResultArchive" ADD CONSTRAINT "TaskResultArchive_taskLibraryId_fkey" FOREIGN KEY ("taskLibraryId") REFERENCES "TaskLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
