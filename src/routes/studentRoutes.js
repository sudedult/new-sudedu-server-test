import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    // Fetch teacher-student relationships with details
    const students = await prisma.teacherStudent.findMany({
      where: { teacherId: req.userId },
      include: {
        student: {
          include: {
            studentInfo: true,
            assignedTasksAsStudent: {
              include: {
                task: {
                  select: {
                    group: true,
                    duration: true,
                    taskLibrary: { select: { taskInfo: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

  const updatedInfos = await Promise.all(
      students.map(studentRel => updateStudentStats(studentRel.student.id, null, 'c', null))
  );

  // Log errors but continue
  updatedInfos.forEach(info => {
      if (info?.error) {
          console.error(`Error updating student ${info.userId}: ${info.error}`);
      }
  });

  const studentDetails = students.map((studentRel, index) => {
    const student = studentRel.student;  // ← ADD THIS LINE
    const updatedInfo = updatedInfos[index];

    return {
      id: student.id,
      username: student.username,
      nickname: student.nickname,
      stats: updatedInfo.stats ? JSON.parse(updatedInfo.stats) : {},
      knowledgeLvl: updatedInfo.knowledgeLvl ?? -1,
      tasks: student.assignedTasksAsStudent.map((assignment) => ({
        assignmentId: assignment.id,
        status: assignment.status,
        result: assignment.result,
        completionDate: assignment.completionDate,
        group: assignment.task.group,
        duration: assignment.task.duration,
        taskDescription: assignment.task.taskLibrary.taskInfo
      }))
    };
  });

    res.json(studentDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching students and tasks.' });
  }
});


router.post('/', async (req, res) => {
    try {
        const teacherId = parseInt(req.body.teacherId, 10);
        const studentId = req.userId;

        // Check if the teacher exists and has the correct accType
        const teacher = await prisma.user.findUnique({
            where: { id: teacherId }
        });

        if (!teacher || teacher.accType !== 'teacher') {
            return res.status(400).json({ error: 'Invalid teacher ID' });
        }

        // Check if the student already has a teacher (using studentId which is unique)
        const existingRelation = await prisma.teacherStudent.findUnique({
            where: { studentId }
        });

        if (existingRelation) {
            return res.status(400).json({ error: 'Student already has a teacher. Use PUT to update instead.' });
        }

        // Create the teacher-student relationship
        const newRelation = await prisma.teacherStudent.create({
            data: { teacherId, studentId }
        });

        // Fetch the teacher's nickname and ID
        let teacherInfo = '';
        const teacherDetails = await prisma.user.findUnique({
            where: { id: teacherId },
            select: { nickname: true }
        });

        if (teacherDetails) {
            teacherInfo = `${teacherDetails.nickname} (ID: ${teacherId})`;
        }

        res.status(201).json({
            message: "Teacher added successfully",
            teacherInfo: teacherInfo  // Include the teacher's nickname and ID
        });
    } catch (error) {
        console.error('Error adding teacher-student relationship:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.put('/', async (req, res) => {
    try {
        const newTeacherId = parseInt(req.body.teacherId, 10);
        const studentId = req.userId;

        // Check if the new teacher exists and has the correct accType
        const newTeacher = await prisma.user.findUnique({
            where: { id: newTeacherId }
        });

        if (!newTeacher || newTeacher.accType !== 'teacher') {
            return res.status(400).json({ error: 'Invalid teacher ID' });
        }

        // Find the student's current teacher relationship
        const currentRelation = await prisma.teacherStudent.findUnique({
            where: { studentId }
        });

        // If no existing relationship, suggest using POST instead
        if (!currentRelation) {
            return res.status(404).json({ 
                error: 'No existing teacher relationship found. Use POST to create one.' 
            });
        }

        // Check if the student is trying to update to the same teacher
        if (currentRelation.teacherId === newTeacherId) {
            return res.status(400).json({ error: 'Student already has this teacher' });
        }

        // Update the teacher-student relationship
        const updatedRelation = await prisma.teacherStudent.update({
            where: { studentId },
            data: { teacherId: newTeacherId }
        });

         // Fetch the teacher's nickname and ID
         let teacherInfo = '';
         const teacherDetails = await prisma.user.findUnique({
             where: { id: newTeacherId },
             select: { nickname: true }
         });
 
         if (teacherDetails) {
             teacherInfo = `${teacherDetails.nickname} (ID: ${newTeacherId})`;
         }
 
         res.status(201).json({
             message: "Teacher added successfully",
             teacherInfo: teacherInfo  // Include the teacher's nickname and ID
         });
    } catch (error) {
        console.error('Error updating teacher-student relationship:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.delete('/', async (req, res) => {
    try {
        // Get the list of student IDs from the request body
        const studentIds = req.body.studentIds;

        // Convert string IDs to integers
        const studentIdsAsNumbers = studentIds.map(id => parseInt(id, 10));

        // Delete all TeacherStudent entries with these studentIds
        const deleteResult = await prisma.teacherStudent.deleteMany({
            where: {
                studentId: {
                    in: studentIdsAsNumbers
                }
            }
        });

        res.status(200).json({
            message: 'Student removal successful.',
            count: deleteResult.count
        });
        
    } catch (error) {
        console.error('Error deleting teacher-student relationships:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.patch('/knowledge-level', async (req, res) => {
    let { studentId, knowledgeLvl } = req.body;

    studentId = Number(studentId);
    knowledgeLvl = Number(knowledgeLvl);

    if (isNaN(studentId) || isNaN(knowledgeLvl)) {
        return res.status(400).json({ error: "Invalid input" });
    }

    try {
        const updated = await prisma.studentInfo.upsert({
            where: { studentId },
            update: { knowledgeLvl },
            create: {
                studentId,
                knowledgeLvl,
                stats: "{\"c\": [], \"m\": [], \"t\": [], \"g\": [], \"d\": null}",
                avatar: "w63060003",
                weekChlScore: 0,
                weekChlWinner: 0
            }
        });

        res.json({ success: true, knowledgeLvl: updated.knowledgeLvl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not update knowledge level" });
    }
});

router.post('/updateStudentStats', async (req, res) => {
  try {
    const studentId = req.userId; // from auth middleware
    const { coins, points, statType, correctAnswers, mistakes, totalAnswers, testDate } = req.body;

    // Validate statType
    const validStatTypes = ['c', 'm', 't', 'g'];
    if (!validStatTypes.includes(statType)) {
      return res.status(400).json({ error: 'Invalid stat type. Must be one of: c, m, t, g' });
    }

    // Prepare data object for stats
    let data = null;
    if (points !== undefined) {
      data = {
        points: points || 0,
        correctAnswers: correctAnswers || 0,
        mistakes: mistakes || 0,
        totalAnswers: totalAnswers || 0
      };
    }

    const result = await updateStudentStats(studentId, data, statType, testDate);

    if (result?.error) {
        console.error(`Error updating student ${result.userId}: ${result.error}`);
        return res.status(404).json({ error: 'Student info not found' });
    }

    // Update coins in PetGame
    if (coins && coins > 0) {
      const petGame = await prisma.petGame.findUnique({ where: { studentId } });
      if (petGame) {
        await prisma.petGame.update({
          where: { studentId },
          data: { money: { increment: coins } }
        });
      } else {
        await prisma.petGame.create({
          data: { studentId, money: coins }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});


async function updateStudentStats(userId, data = null, statType = 'c', testDate = null) {
  // ========== CONFIGURATION VARIABLES ==========
  const MAX_WEEKS = 8; // Maximum number of weeks to track
  const WEEK_STARTS_ON = 1; // 1 = Monday (day 1), 7 = Sunday (day 7)
  const TRANSACTION_TIMEOUT = 10000; // 10 seconds
  // ============================================

  // Helper function to calculate weeks between two dates
  function weeksBetween(d1, d2, weekStartsOn = WEEK_STARTS_ON) {
    const date1 = new Date(d1 * 1000 * 60 * 60 * 24);
    const date2 = new Date(d2 * 1000 * 60 * 60 * 24);

    const startOfWeek = date => {
      const d = new Date(date);
      // Convert JS day (0=Sun, 6=Sat) to our format (1=Mon, 7=Sun)
      let day = d.getDay();
      day = day === 0 ? 7 : day; // Convert Sunday from 0 to 7
      
      // Calculate days to subtract to get to week start
      const daysToSubtract = (day - weekStartsOn + 7) % 7;
      d.setDate(d.getDate() - daysToSubtract);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const w1 = startOfWeek(date1);
    const w2 = startOfWeek(date2);
    return Math.floor((w2 - w1) / (7 * 24 * 60 * 60 * 1000));
  }

  // Helper function to get day of week (1-7: Mon-Sun)
  function getDayOfWeek(dateInDays, weekStartsOn = WEEK_STARTS_ON) {
    const date = new Date(dateInDays * 1000 * 60 * 60 * 24);
    let day = date.getDay();
    // Convert JS day (0=Sun, 6=Sat) to our format (1=Mon, 7=Sun)
    day = day === 0 ? 7 : day;
    return day;
  }

  // ========== START TRANSACTION ==========
  return await prisma.$transaction(async (tx) => {
    
    // STEP 1: Fetch the student info from database (with row lock)
    const studentInfo = await tx.studentInfo.findUnique({
      where: { studentId: userId }
    });

    if (!studentInfo) {
        return { error: 'STUDENT_INFO_NOT_FOUND', userId };
    }

    // STEP 2: Parse the stats JSON from database
    const stats = typeof studentInfo.stats === 'string' 
      ? JSON.parse(studentInfo.stats) 
      : studentInfo.stats;

    // Initialize stats structure if it doesn't exist
    if (!stats.c) stats.c = [];
    if (!stats.m) stats.m = [];
    if (!stats.t) stats.t = [];
    if (!stats.g) stats.g = [];
    if (!stats.d) stats.d = null;

    // Auto-initialize new stat types if they don't exist
    if (statType !== 'c' && !stats[statType]) {
      stats[statType] = [];
    }

    // STEP 3: Get current date
    const currentDate = testDate || Math.floor(Date.now() / (1000 * 60 * 60 * 24));

    // Determine the effective date to process
    // If data is null (teacher fetching), process up to yesterday only
    const processDate = data === null ? currentDate - 1 : currentDate;

    // STEP 4: Find the maximum current length across all stat arrays
    const statTypes = ['c', 'm', 't', 'g'];
    const maxCurrentLength = Math.max(
      ...statTypes.map(type => stats[type]?.length || 0)
    );

    // STEP 5: Handle first time recording
    if (stats.d === null) {
      stats.c.push(data !== null ? 1 : 0);
      stats.m.push(data && statType === 'm' 
        ? [data.points || 0, data.correctAnswers || 0, data.mistakes || 0, data.totalAnswers || 0] 
        : [0, 0, 0, 0]);
      stats.t.push(data && statType === 't' 
        ? [data.points || 0, data.correctAnswers || 0, data.mistakes || 0, data.totalAnswers || 0] 
        : [0, 0, 0, 0]);
      stats.g.push(data && statType === 'g' 
        ? [data.points || 0, data.correctAnswers || 0, data.mistakes || 0, data.totalAnswers || 0] 
        : [0, 0, 0, 0]);
      stats.d = processDate;

      const updatedStudentInfo = await tx.studentInfo.update({
        where: { studentId: userId },
        data: { stats: JSON.stringify(stats) }
      });

      return updatedStudentInfo;
    }

    // STEP 6: Calculate days and weeks passed
    const daysSinceLastActivity = processDate - stats.d;

    // If no time has passed, and it's a student update on the same day
    if (daysSinceLastActivity === 0 && data !== null) {
      // Same day - just update stats, no consistency penalty
      if (statType !== 'c') {
        const targetArray = stats[statType];
        if (targetArray.length > 0) {
          const lastEntry = targetArray[targetArray.length - 1];
          lastEntry[0] += data.points || 0;
          lastEntry[1] += data.correctAnswers || 0;
          lastEntry[2] += data.mistakes || 0;
          lastEntry[3] += data.totalAnswers || 0;
        }
      }

      const updatedStudentInfo = await tx.studentInfo.update({
        where: { studentId: userId },
        data: { stats: JSON.stringify(stats) }
      });

      return updatedStudentInfo;
    }

    // If teacher is fetching but no days have passed yet
    if (daysSinceLastActivity <= 0 && data === null) {
      // Nothing to process, return current stats
      return studentInfo;
    }

    // STEP 7: Process missed days and weeks
    const weeksPassed = weeksBetween(stats.d, processDate);

    if (weeksPassed === 0) {
      // Still in the same week - apply penalty to current week
      const missedDays = daysSinceLastActivity - (data !== null ? 1 : 0);

      if (stats.c.length > 0 && missedDays > 0) {
        stats.c[stats.c.length - 1] -= (missedDays / 7);
        stats.c[stats.c.length - 1] = Math.max(0, stats.c[stats.c.length - 1]);
      }

      // If student is adding data, update the stats for current week
      if (data !== null && statType !== 'c') {
        const targetArray = stats[statType];
        if (targetArray.length > 0) {
          const lastEntry = targetArray[targetArray.length - 1];
          lastEntry[0] += data.points || 0;
          lastEntry[1] += data.correctAnswers || 0;
          lastEntry[2] += data.mistakes || 0;
          lastEntry[3] += data.totalAnswers || 0;
        }
      }
    } else {
      // One or more weeks have passed

      // STEP 7.1: Complete the old week with remaining missed days
      if (stats.c.length > 0) {
        const lastDayOfWeek = getDayOfWeek(stats.d, WEEK_STARTS_ON);
        const daysLeftInOldWeek = 7 - lastDayOfWeek;
        stats.c[stats.c.length - 1] -= (daysLeftInOldWeek / 7);
        stats.c[stats.c.length - 1] = Math.max(0, stats.c[stats.c.length - 1]);
      }

      // STEP 7.2: Handle rolling window if at capacity
      if (maxCurrentLength >= MAX_WEEKS && weeksPassed > 0) {
        const weeksToRemove = Math.min(weeksPassed, maxCurrentLength);
        for (const type of statTypes) {
          if (stats[type]) {
            stats[type] = stats[type].slice(weeksToRemove);
          }
        }
      }

      // STEP 7.3: Add fully missed weeks (all days missed = consistency 0)
      if (weeksPassed > 1) {
        const emptyWeeksToAdd = Math.min(weeksPassed - 1, MAX_WEEKS - stats.c.length);
        const missedWeekStatTypes = ['m', 't', 'g'];

        for (let i = 0; i < emptyWeeksToAdd; i++) {
          if (stats.c.length >= MAX_WEEKS) {
            stats.c.shift();
            for (const type of missedWeekStatTypes) {
              if (stats[type]) stats[type].shift();
            }
          }
          stats.c.push(0);
          for (const type of missedWeekStatTypes) {
            if (stats[type]) stats[type].push([0, 0, 0, 0]);
          }
        }
      }

      // STEP 7.4: Start new week
      if (stats.c.length >= MAX_WEEKS) {
        for (const type of statTypes) {
          if (stats[type]) stats[type].shift();
        }
      }

      // Calculate consistency for new week
      const dayOfWeek = getDayOfWeek(processDate, WEEK_STARTS_ON);
      // If data is null (teacher), processDate is a missed day, so include it
      // If data is not null (student), today is being recorded, so exclude it
      const daysMissedThisWeek = data !== null ? (dayOfWeek - 1) : dayOfWeek;
      const newWeekConsistency = 1 - (daysMissedThisWeek / 7);
      stats.c.push(Math.max(0, newWeekConsistency));

      // Add new stat entries
      const newWeekStatTypes = ['m', 't', 'g'];
      for (const type of newWeekStatTypes) {
        if (!stats[type]) stats[type] = [];
        if (data !== null && statType === type) {
          stats[type].push([
            data.points || 0,
            data.correctAnswers || 0,
            data.mistakes || 0,
            data.totalAnswers || 0
          ]);
        } else {
          stats[type].push([0, 0, 0, 0]);
        }
      }
    }

    // STEP 8: Update the last recorded date
    stats.d = processDate;

    // STEP 9: Save updated stats back to database
    const updatedStudentInfo = await tx.studentInfo.update({
      where: { studentId: userId },
      data: { stats: JSON.stringify(stats) }
    });

    return updatedStudentInfo;

  }, {
    timeout: TRANSACTION_TIMEOUT
  });
  // ========== END TRANSACTION ==========
}



export default router