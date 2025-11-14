import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router()

// Fetch all class data
// Helper function to calculate average points from stats
function calculateAveragePoints(statsJson) {
  if (!statsJson) return 0;
  
  const stats = typeof statsJson === 'string' ? JSON.parse(statsJson) : statsJson;
  
  const statTypes = ['m', 't', 'g'];
  const weekTotals = {}; // { weekIndex: totalPoints }
  
  for (const type of statTypes) {
    if (stats[type] && Array.isArray(stats[type])) {
      stats[type].forEach((weekData, weekIndex) => {
        if (Array.isArray(weekData) && weekData.length > 0) {
          const points = weekData[0] || 0;
          weekTotals[weekIndex] = (weekTotals[weekIndex] || 0) + points;
        }
      });
    }
  }

  const weekCount = Object.keys(weekTotals).length;
  
  if (weekCount > 0) {
    const totalPoints = Object.values(weekTotals).reduce((sum, val) => sum + val, 0);
    let points = totalPoints / weekCount / statTypes.length;
    if (points > 0) {
      points = points.toFixed(1);
    }
    return points;
  } else {
    return 0;
  }
}

// ============================================
// ENDPOINT 1: Get Student Info
// ============================================
router.post('/studentInfo', async (req, res) => {
  try {
    const requesterId = req.body.studentId;

    // Get requester
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, accType: true, nickname: true, studentInfo: true }
    });
    if (!requester) return res.status(404).json({ error: 'Student not found' });

    // Determine teacher
    let teacherId;
    if (requester.accType === 'teacher') {
      teacherId = requester.id;
    } else {
      const link = await prisma.teacherStudent.findUnique({
        where: { studentId: requesterId },
        select: { teacherId: true }
      });
      if (!link) {
        if (requester.accType === 'teacher') {
          teacherId = requester.id;
        } else {
          return res.status(400).json({ error: 'Student is not associated with any teacher' });
        }
      } else {
        teacherId = link.teacherId;
      }
    }

    // Get teacher info
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, nickname: true }
    });

    // Get all students linked to teacher
    const students = await prisma.teacherStudent.findMany({
      where: { teacherId },
      select: {
        student: {
          select: {
            id: true,
            nickname: true,
            studentInfo: {
              select: {
                stats: true,
                avatar: true,
                weekChlId: true,
                weekChlScore: true,
                weekChlWinner: true
              }
            }
          }
        }
      }
    });

    const allStudents = students.map(s => [
      s.student.id,
      s.student.nickname,
      s.student.studentInfo?.avatar ?? 'w63060003'
    ]);

    // --- Get top 3 average points ---
    const studentsWithPoints = students.map(s => ({
      id: s.student.id,
      avgPoints: calculateAveragePoints(s.student.studentInfo?.stats)
    })).filter(s => s.avgPoints > 0);

    const sortedByTotal = studentsWithPoints.sort((a, b) => b.avgPoints - a.avgPoints);

    const uniqueTotalScores = [...new Set(sortedByTotal.map(s => s.avgPoints))];
    const top3Scores = uniqueTotalScores.slice(0, 3);

    const top3TotalPoints = sortedByTotal
      .filter(s => top3Scores.includes(s.avgPoints))
      .map(s => [s.id, s.avgPoints]);

    // --- Get top 3 week challenge ---
    const sortedByWeekChl = students
      .filter(s => (s.student.studentInfo?.weekChlScore ?? 0) > 0)
      .sort((a, b) => b.student.studentInfo.weekChlScore - a.student.studentInfo.weekChlScore);

    const uniqueWeekScores = [...new Set(sortedByWeekChl.map(s => s.student.studentInfo.weekChlScore))];
    const top3WeekScores = uniqueWeekScores.slice(0, 3);

    const top3WeekChl = sortedByWeekChl
      .filter(s => top3WeekScores.includes(s.student.studentInfo.weekChlScore))
      .map(s => [s.student.id, s.student.studentInfo.weekChlScore]);

    const requestingStudentAvgPoints = calculateAveragePoints(requester.studentInfo?.stats);
    const requestingStudentWeekChlScore = requester.studentInfo?.weekChlScore ?? 0;
    const weekChlId = students[0]?.student.studentInfo?.weekChlId ?? null;

    const weekChlWinnerStudents = students
      .filter(s => s.student.studentInfo?.weekChlWinner > 0)
      .map(s => ({
        id: s.student.id,
        position: s.student.studentInfo.weekChlWinner
      }));

    // Response
    res.json([
      [teacher.id, teacher.nickname],
      allStudents,
      top3TotalPoints,
      requestingStudentAvgPoints,
      top3WeekChl,
      requestingStudentWeekChlScore,
      weekChlId,
      weekChlWinnerStudents
    ]);

  } catch (err) {
    console.error('Error fetching linked students:', err);
    res.status(500).json({ error: 'Server error while fetching class data' });
  }
});

// ============================================
// ENDPOINT 2: Update Student Stats
// ============================================
router.post('/updateStudentStats', async (req, res) => {
  const userId = req.body.userId || req.userId;

  if (!userId) {
    return res.status(400).json({ success: false, error: "Missing userId" });
  }

  await manageWeeklyChallenge(userId)

  try {
    const requesterId = req.body.studentId;

    let teacherId;
    const link = await prisma.teacherStudent.findUnique({
      where: { studentId: requesterId },
      select: { teacherId: true }
    });

    // If requester is teacher, allow even without student link
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { accType: true }
    });

    if (!link) {
      if (requester?.accType === 'teacher') {
        teacherId = requesterId;
      } else {
        return res.status(400).json({ error: 'Student is not associated with any teacher' });
      }
    } else {
      teacherId = link.teacherId;
    }

    const students = await prisma.teacherStudent.findMany({
      where: { teacherId },
      select: {
        student: {
          select: {
            id: true,
            studentInfo: {
              select: {
                stats: true,
                weekChlScore: true,
                weekChlWinner: true
              }
            }
          }
        }
      }
    });

    // --- Top 3 average points ---
    const studentsWithPoints = students.map(s => ({
      id: s.student.id,
      avgPoints: calculateAveragePoints(s.student.studentInfo?.stats)
    })).filter(s => s.avgPoints > 0);

    const sortedByTotal = studentsWithPoints.sort((a, b) => b.avgPoints - a.avgPoints);

    const uniqueTotalScores = [...new Set(sortedByTotal.map(s => s.avgPoints))];
    const top3Scores = uniqueTotalScores.slice(0, 3);

    const top3TotalPoints = sortedByTotal
      .filter(s => top3Scores.includes(s.avgPoints))
      .map(s => [s.id, s.avgPoints]);

    // --- Top 3 week challenge ---
    const sortedByWeekChl = students
      .filter(s => (s.student.studentInfo?.weekChlScore ?? 0) > 0)
      .sort((a, b) => b.student.studentInfo.weekChlScore - a.student.studentInfo.weekChlScore);

    const uniqueWeekScores = [...new Set(sortedByWeekChl.map(s => s.student.studentInfo.weekChlScore))];
    const top3WeekScores = uniqueWeekScores.slice(0, 3);

    const top3WeekChl = sortedByWeekChl
      .filter(s => top3WeekScores.includes(s.student.studentInfo.weekChlScore))
      .map(s => [s.student.id, s.student.studentInfo.weekChlScore]);

    // --- Requester values ---
    const requesterStudent = students.find(s => s.student.id === requesterId);
    const requestingStudentAvgPoints = calculateAveragePoints(requesterStudent?.student.studentInfo?.stats);
    const requestingStudentWeekChlScore = requesterStudent?.student.studentInfo?.weekChlScore ?? 0;

    res.json([
      top3TotalPoints,
      top3WeekChl,
      requestingStudentAvgPoints,
      requestingStudentWeekChlScore
    ]);

  } catch (err) {
    console.error('Error updating stats:', err);
    res.status(500).json({ error: 'Server error while updating stats' });
  }
});

router.post('/updateNickname', async (req, res) => {
    try {
        const { userId, newNickname } = req.body;

        if (!userId || !newNickname || newNickname.trim() === '') {
            return res.status(400).json({ error: 'User ID and valid nickname are required' });
        }

        // Update user in database
        await prisma.user.update({
            where: { id: userId },
            data: { nickname: newNickname.trim() },
            select: { id: true, nickname: true }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating nickname:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});


router.post("/updateAvatar", async (req, res) => {
  const { userId, newAvatarCode } = req.body;

  if (!userId || !newAvatarCode) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    await prisma.studentInfo.update({
      where: { studentId: userId },
      data: { avatar: newAvatarCode },
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to update avatar" });
  }
});


// Get challenge text and duration by WeekChl ID
router.post("/getChallenge", async (req, res) => {
  try {
    // Get userId from request body (adjust based on your auth setup)
    const userId = req.body.userId || req.userId; // Support both body and middleware

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    const result = await manageWeeklyChallenge(userId);

    res.json(result);
  } catch (error) {
    console.error("Error managing weekly challenge:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server error" 
    });
  }
});

router.post('/updateWeekChlScore', async (req, res) => {
  try {
    const { studentId, weekChlId, weekChlScore } = req.body;

    if (!studentId || weekChlId == null || weekChlScore == null) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const studentIdNum = Number(studentId);
    const weekChlIdNum = Number(weekChlId);
    const newScore = Number(weekChlScore);

    // Find existing record
    const existingInfo = await prisma.studentInfo.findUnique({
      where: { studentId: studentIdNum },
    });

    let updatedStudentInfo;

    if (!existingInfo) {
      // No record yet → create new
      updatedStudentInfo = await prisma.studentInfo.create({
        data: {
          studentId: studentIdNum,
          weekChlId: weekChlIdNum,
          weekChlScore: newScore,
        },
      });
    } else if (newScore > existingInfo.weekChlScore) {
      // Update only if new score is higher
      updatedStudentInfo = await prisma.studentInfo.update({
        where: { studentId: studentIdNum },
        data: {
          weekChlId: weekChlIdNum,
          weekChlScore: newScore,
        },
      });
    } else {
      // Keep existing score
      updatedStudentInfo = existingInfo;
    }

    res.status(200).json({
      message:
        newScore > (existingInfo?.weekChlScore ?? -1)
          ? 'Weekly challenge score updated successfully.'
          : 'Score not higher — existing score kept.',
      studentInfo: updatedStudentInfo,
    });

  } catch (error) {
    console.error('Error updating week challenge score:', error);
    res.status(500).json({ message: 'Server error while saving week challenge score.' });
  }
});

// ============================================
// WEEKLY CHALLENGE MANAGER (THREAD-SAFE)
// Updated for ChlLibrary schema with orphaned challenge handling
// ============================================

const WEEK_CHALLENGE_WINNINGS = {
  firstPlace: 10,
  secondPlace: 5,
  thirdPlace: 3
};

/**
 * Manages weekly challenges for students (Thread-Safe)
 * - Assigns challenges if missing
 * - Processes expired challenges (awards coins, assigns new ones)
 * - Handles orphaned challenges (when ChlLibrary entry is deleted)
 * - Prevents race conditions using database-level locking
 */
async function manageWeeklyChallenge(requestingUserId) {
  const TRANSACTION_TIMEOUT = 15000;
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      return await prisma.$transaction(async (tx) => {
        
        // STEP 1: Get requesting user info
        const requestingUser = await tx.user.findUnique({
          where: { id: requestingUserId },
          include: {
            studentInfo: true,
            teacherStudentsAsStudent: true,
            teacherStudentsAsTeacher: true
          }
        });

        if (!requestingUser) {
          throw new Error(`User not found: ${requestingUserId}`);
        }

        // Determine if user is teacher or student
        const isTeacher = requestingUser.accType === 'teacher';
        let teacherId;
        let studentIds = [];

        if (isTeacher) {
          teacherId = requestingUserId;
          studentIds = requestingUser.teacherStudentsAsTeacher.map(rel => rel.studentId);
        } else {
          if (!requestingUser.teacherStudentsAsStudent) {
            // Instead of throwing, return a structured response
            return {
              success: false,
              message: 'Student is not linked to any teacher'
            };
          }

          teacherId = requestingUser.teacherStudentsAsStudent.teacherId;

          const teacherStudents = await tx.teacherStudent.findMany({
            where: { teacherId }
          });
          studentIds = teacherStudents.map(rel => rel.studentId);
        }

        if (studentIds.length === 0) {
          return { success: false, message: 'No students found for this teacher' };
        }

        // STEP 2–7: existing logic unchanged
        const allStudents = await tx.studentInfo.findMany({
          where: { studentId: { in: studentIds } }
        });

        const existingWeekChlId = allStudents.find(s => s.weekChlId)?.weekChlId;
        let currentWeekChl;

        if (existingWeekChlId) {
          currentWeekChl = await tx.weekChl.findUnique({
            where: { id: existingWeekChlId },
            include: { chlLibrary: true }
          });

          if (!currentWeekChl) {
            currentWeekChl = await findNewestChallenge(tx, studentIds) 
              ?? await createNewChallenge(tx, teacherId, studentIds, allStudents);
          } else if (!currentWeekChl.chlLibrary) {
            console.warn(`WeekChl ${currentWeekChl.id} is orphaned, recreating challenge`);
            try {
              await tx.weekChl.delete({ where: { id: currentWeekChl.id } });
            } catch (deleteError) {
              if (deleteError.code !== 'P2025') throw deleteError;
            }
            currentWeekChl = await createNewChallenge(tx, teacherId, studentIds, allStudents);
          } else {
            const isExpired = hasPassedMonday(currentWeekChl.date);
            if (isExpired) {
              try {
                currentWeekChl = await processExpiredChallenge(
                  tx, teacherId, studentIds, allStudents, currentWeekChl.id
                );
              } catch (error) {
                if (error.code === 'P2025' || error.message?.includes('not found')) {
                  currentWeekChl = await findNewestChallenge(tx, studentIds);
                  if (!currentWeekChl)
                    return { success: false, message: 'Challenge processed but new one not found' };
                } else {
                  throw error;
                }
              }
            }
          }
        } else {
          currentWeekChl = await createNewChallenge(tx, teacherId, studentIds, allStudents);
        }

        if (!isTeacher) {
          const userInfo = await tx.studentInfo.findUnique({
            where: { studentId: requestingUserId }
          });

          if (!userInfo?.weekChlId || userInfo.weekChlId !== currentWeekChl.id) {
            await tx.studentInfo.update({
              where: { studentId: requestingUserId },
              data: { weekChlId: currentWeekChl.id }
            });
          }
        }

        let taskInfo = 'Challenge details unavailable';
        let personalDuration = 'Unknown';
        let weekDuration = '["C39","5"]';

        if (currentWeekChl.chlLibrary) {
          try {
            taskInfo = currentWeekChl.chlLibrary.taskInfo;
            personalDuration = currentWeekChl.chlLibrary.personalChlDuration;
            weekDuration = currentWeekChl.chlLibrary.weekChlDuration;
          } catch (parseError) {
            console.error('Error parsing challenge data:', parseError);
          }
        }

        return {
          success: true,
          challengeId: currentWeekChl.id,
          challenge: taskInfo,
          duration: personalDuration,
          weekDuration,
          expiryDate: currentWeekChl.date
        };

      }, {
        timeout: TRANSACTION_TIMEOUT,
        isolationLevel: 'Serializable'
      });

    } catch (error) {
      attempt++;
      console.error('Error in manageWeeklyChallenge:', {
        userId: requestingUserId,
        attempt,
        error: error.message,
        code: error.code
      });

      if (
        (error.code === 'P2034' || error.message?.includes('serialization') ||
         error.message?.includes('deadlock')) &&
        attempt < MAX_RETRIES
      ) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }

      // Instead of throwing, return failure response
      return {
        success: false,
        message: `Failed to manage weekly challenge: ${error.message}`
      };
    }
  }

  return {
    success: false,
    message: 'Failed to manage weekly challenge after maximum retries'
  };
}


// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find the newest challenge assigned to students (for race condition recovery)
 */
async function findNewestChallenge(tx, studentIds) {
  try {
    const recentStudentInfo = await tx.studentInfo.findFirst({
      where: { 
        studentId: { in: studentIds },
        weekChlId: { not: null }
      },
      orderBy: { weekChlId: 'desc' },
      include: {
        weekChl: {
          include: {
            chlLibrary: true
          }
        }
      }
    });

    const challenge = recentStudentInfo?.weekChl;
    
    // Verify the challenge has a valid chlLibrary reference
    if (challenge && !challenge.chlLibrary) {
      console.warn(`Found newest challenge ${challenge.id} but it's orphaned, ignoring`);
      return null;
    }

    return challenge || null;
  } catch (error) {
    console.error('Error finding newest challenge:', error);
    return null;
  }
}

/**
 * Check if challenge date has passed the next Monday
 */
function hasPassedMonday(challengeDate) {
  if (!challengeDate) return false;

  try {
    const now = new Date();
    const challenge = new Date(challengeDate);
    
    // Find next Monday after challenge date
    const nextMonday = new Date(challenge);
    const daysUntilMonday = (8 - nextMonday.getDay()) % 7;
    nextMonday.setDate(nextMonday.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
    nextMonday.setHours(0, 0, 0, 0);

    return now >= nextMonday;
  } catch (error) {
    console.error('Error checking Monday expiry:', error);
    return false;
  }
}

/**
 * Calculate median knowledge level
 */
function calculateMedianKnowledgeLvl(students) {
  try {
    const validLevels = students
      .map(s => s.knowledgeLvl)
      .filter(lvl => lvl >= 0)
      .sort((a, b) => a - b);

    if (validLevels.length === 0) return 1;

    const mid = Math.floor(validLevels.length / 2);
    return validLevels.length % 2 === 0
      ? Math.round((validLevels[mid - 1] + validLevels[mid]) / 2)
      : validLevels[mid];
  } catch (error) {
    console.error('Error calculating median knowledge level:', error);
    return 1; // Default to level 1
  }
}

/**
 * Determine period based on current date (Lithuanian school year)
 */
function getCurrentPeriod() {
  const periods = [
    { name: "9-10", months: [9, 10] },
    { name: "11-12", months: [11, 12] },
    { name: "1-2", months: [1, 2] },
    { name: "3-8", months: [3, 4, 5, 6, 7, 8] }
  ];

  const month = new Date().getMonth() + 1;
  
  for (const period of periods) {
    if (period.months.includes(month)) {
      return period.name;
    }
  }
  
  return "9-10"; // Default fallback
}

/**
 * Create a new weekly challenge
 */
async function createNewChallenge(tx, teacherId, studentIds, allStudents) {
  try {
    const medianKnowledgeLvl = calculateMedianKnowledgeLvl(allStudents);
    const currentPeriod = getCurrentPeriod();

    const availableTasks = await tx.chlLibrary.findMany({
      where: { 
        class: medianKnowledgeLvl,
        period: currentPeriod
      }
    });

    if (availableTasks.length === 0) {
      // Try without period restriction
      const fallbackTasks = await tx.chlLibrary.findMany({
        where: { class: medianKnowledgeLvl }
      });
      
      if (fallbackTasks.length === 0) {
        throw new Error(`No challenges found for knowledge level ${medianKnowledgeLvl}`);
      }
      
      const randomTask = fallbackTasks[Math.floor(Math.random() * fallbackTasks.length)];
      console.warn(`Using fallback task for level ${medianKnowledgeLvl} (no period match)`);
      
      return await createWeekChlEntry(tx, randomTask.id, studentIds);
    }

    const randomTask = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    return await createWeekChlEntry(tx, randomTask.id, studentIds);

  } catch (error) {
    console.error('Error creating new challenge:', error);
    throw error;
  }
}

/**
 * Helper to create WeekChl entry
 */
async function createWeekChlEntry(tx, chlLibraryId, studentIds) {
  const newWeekChl = await tx.weekChl.create({
    data: {
      date: new Date(),
      chlLibraryId: chlLibraryId
    },
    include: {
      chlLibrary: true
    }
  });

  // Assign to all students and reset their scores
  await tx.studentInfo.updateMany({
    where: { studentId: { in: studentIds } },
    data: {
      weekChlId: newWeekChl.id,
      weekChlScore: 0
    }
  });

  return newWeekChl;
}

/**
 * Process expired challenge: award coins, rank students, create new challenge
 */
async function processExpiredChallenge(tx, teacherId, studentIds, allStudents, oldChallengeId) {
  try {
    // STEP 1: Get all students' scores
    const studentsWithScores = allStudents.map(s => ({
      studentId: s.studentId,
      score: s.weekChlScore || 0
    }));

    // STEP 2: Sort by score descending
    studentsWithScores.sort((a, b) => b.score - a.score);

    // STEP 3: Determine brackets (1st, 2nd, 3rd place with ties)
    const brackets = { 1: [], 2: [], 3: [], 0: [] };
    
    if (studentsWithScores.length > 0 && studentsWithScores[0].score > 0) {
      const firstScore = studentsWithScores[0].score;
      const secondScore = studentsWithScores.find(s => s.score < firstScore)?.score;
      const thirdScore = studentsWithScores.find(s => s.score < (secondScore || firstScore))?.score;

      for (const student of studentsWithScores) {
        if (student.score === firstScore) {
          brackets[1].push(student.studentId);
        } else if (secondScore && student.score === secondScore) {
          brackets[2].push(student.studentId);
        } else if (thirdScore && student.score === thirdScore) {
          brackets[3].push(student.studentId);
        } else {
          brackets[0].push(student.studentId);
        }
      }
    } else {
      brackets[0] = studentsWithScores.map(s => s.studentId);
    }

    // STEP 4: Award coins and update winner brackets
    for (const [bracket, studentIdsInBracket] of Object.entries(brackets)) {
      if (studentIdsInBracket.length === 0) continue;

      let totalCoins = 0;
      if (bracket === '1') totalCoins = WEEK_CHALLENGE_WINNINGS.firstPlace;
      else if (bracket === '2') totalCoins = WEEK_CHALLENGE_WINNINGS.secondPlace;
      else if (bracket === '3') totalCoins = WEEK_CHALLENGE_WINNINGS.thirdPlace;

      if (totalCoins > 0) {
        const coinsPerStudent = Number((totalCoins / studentIdsInBracket.length).toFixed(1));

        for (const studentId of studentIdsInBracket) {
          try {
            const petGame = await tx.petGame.findUnique({
              where: { studentId }
            });

            if (petGame) {
              await tx.petGame.update({
                where: { studentId },
                data: { money: { increment: coinsPerStudent } }
              });
            } else {
              await tx.petGame.create({
                data: { studentId, money: coinsPerStudent }
              });
            }
          } catch (petError) {
            console.error(`Error awarding coins to student ${studentId}:`, petError);
            // Continue with other students
          }
        }
      }

      // STEP 5: Update weekChlWinner bracket
      try {
        await tx.studentInfo.updateMany({
          where: { studentId: { in: studentIdsInBracket } },
          data: { weekChlWinner: parseInt(bracket) }
        });
      } catch (updateError) {
        console.error(`Error updating winner bracket ${bracket}:`, updateError);
      }
    }

    // STEP 6: Delete old WeekChl entry
    await tx.weekChl.delete({
      where: { id: oldChallengeId }
    });

    // STEP 7: Create new challenge for next week
    const newWeekChl = await createNewChallenge(tx, teacherId, studentIds, allStudents);

    return newWeekChl;

  } catch (error) {
    console.error('Error processing expired challenge:', error);
    throw error;
  }
}


export default router;
