-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "accType" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "lastLogIn" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "teacherId" INTEGER NOT NULL,

    CONSTRAINT "TeacherTask_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudent_studentId_key" ON "TeacherStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTaskAssignment_studentId_taskId_key" ON "StudentTaskAssignment"("studentId", "taskId");

-- AddForeignKey
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherTask" ADD CONSTRAINT "TeacherTask_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTaskAssignment" ADD CONSTRAINT "StudentTaskAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTaskAssignment" ADD CONSTRAINT "StudentTaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TeacherTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
