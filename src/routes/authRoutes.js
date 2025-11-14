import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto';
import prisma from '../../prismaClient.js'
import { sendEmail } from '../utils/sendEmail.js';

const router = express.Router()

const CODES = {
  REG_SUCCESS: 'REG_001',
  REG_RESEND: 'REG_002',
  REG_EXISTS: 'REG_003',
  LOGIN_SUCCESS: 'LOGIN_001',
  LOGIN_UNVERIFIED_NEW: 'LOGIN_002',
  LOGIN_UNVERIFIED_OLD: 'LOGIN_003',
  LOGIN_NOT_FOUND: 'LOGIN_004',
  LOGIN_WRONG_PASS: 'LOGIN_005',
  VERIFY_SUCCESS: 'VERIFY_001',
  VERIFY_ALREADY: 'VERIFY_002',
  VERIFY_NOT_FOUND: 'VERIFY_003',
  VERIFY_EXPIRED: 'VERIFY_004',
  RESET_SENT: 'RESET_001',
  RESET_NOT_FOUND: 'RESET_002',
  RESET_SUCCESS: 'RESET_003',
  RESET_EXPIRED: 'RESET_004',
  RESET_VALID: 'RESET_005',
  ERROR_SERVER: 'ERR_001',
  ERROR_MISSING: 'ERR_002'
};

router.get('/wake-up', (req, res) => {
  try {
    // Respond immediately with minimal payload
    res.json({ code: 'OK' });
  } catch {
    // Extremely unlikely to fail, but handle just in case
    res.status(500).json({ code: 'ERROR' });
  }
});

// Token generation
function generateAccessToken(userId, tokenVersion) {
  return jwt.sign(
    { id: userId, tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

async function storeRefreshToken(userId, token) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return await prisma.refreshToken.create({
    data: { token, userId, expiresAt }
  });
}

// Helper: Get user data from database
async function getUserData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      accType: true,
      emailVerified: true,
      tokenVersion: true
    }
  });

  if (!user) return null;

  let avatarCode = 'w63060003';
  let teacherInfo = '';
  let petOnWalk = '';
  let petStats = '[]';
  let knowledgeLvl = -1; // ← ADD THIS

  if (user.accType === 'student') {
    const studentInfo = await prisma.studentInfo.findUnique({
      where: { studentId: userId },
      select: { 
        avatar: true,
        knowledgeLvl: true // ← ADD THIS
      }
    });
    if (studentInfo) {
      avatarCode = studentInfo.avatar;
      knowledgeLvl = studentInfo.knowledgeLvl; // ← ADD THIS
    }

    const teacherAssignment = await prisma.teacherStudent.findUnique({
      where: { studentId: userId },
      select: { teacherId: true }
    });
    if (teacherAssignment) {
      const teacher = await prisma.user.findUnique({
        where: { id: teacherAssignment.teacherId },
        select: { nickname: true }
      });
      if (teacher) {
        teacherInfo = `${teacher.nickname} (ID: ${teacherAssignment.teacherId})`;
      }
    }

    const petGame = await prisma.petGame.findUnique({
      where: { studentId: userId },
      select: { petOnWalk: true, petStats: true, petAssets: true }
    });

    if (petGame) {
      petOnWalk = petGame.petOnWalk;

      if (petGame.petOnWalk && petGame.petStats && petGame.petAssets) {
        try {
          const allPetStats = JSON.parse(petGame.petStats);
          const allPetAssets = JSON.parse(petGame.petAssets);
          const petsArray = allPetAssets[0]; // first element holds pets

          // find which pet owns this skin
          const matchingPet = petsArray.find(petEntry => {
            const petKey = petEntry[0]; // "cat-1"
            const skins = petEntry[1][1]; // [["cat-1-1", 0, true]]
            return skins.some(skin => skin[0] === petGame.petOnWalk);
          });

          let walkingPetStats = null;
          if (matchingPet) {
            const petKey = matchingPet[0];
            walkingPetStats = allPetStats[petKey];
          }

          petStats = walkingPetStats ? JSON.stringify(walkingPetStats) : '[]';
        } catch (e) {
          console.error('Failed to parse pet data:', e);
          petStats = '[]';
        }
      } else {
        petStats = '[]';
      }
    }
  }

  return {
    userId: user.id,
    nickname: user.nickname,
    accType: user.accType,
    teacher: teacherInfo,
    avatarCode: avatarCode,
    emailVerified: user.emailVerified,
    petOnWalk: petOnWalk,
    petStats: petStats,
    knowledgeLvl: knowledgeLvl, // ← ADD THIS
    tokenVersion: user.tokenVersion
  };
}

// Helper: Compare and return only different fields
function getDiff(clientData, serverData) {
  const diff = {};
  
  for (const key in serverData) {
    if (key === 'tokenVersion') continue; // Don't send this to client
    
    if (clientData[key] !== serverData[key]) {
      diff[key] = serverData[key];
    }
  }
  
  return diff;
}


router.post('/register', async (req, res) => {
  const { username, password, nickname, isTeacher, class: classValue } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 12); // Increased from 8 to 12
  const accType = isTeacher ? 'teacher' : 'student';

  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });

    if (existingUser) {
      if (!existingUser.emailVerified) {
        const token = jwt.sign({ userId: existingUser.id }, process.env.EMAIL_SECRET, { expiresIn: '1d' });
        const link = `http://127.0.0.1:5500/front-end-with-pet-game/LT/verify-email.html?token=${token}`;
        await sendEmail(username, 'Verify your email', `<a href="${link}">Verify your account</a>`);
        return res.json({ code: CODES.REG_RESEND });
      } else {
        return res.status(400).json({ code: CODES.REG_EXISTS });
      }
    }

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname,
        accType
      }
    });

    if (accType === 'student') {
      // Parse class value to integer (default to -1 if not provided or invalid)
      let knowledgeLvl = -1;
      if (classValue !== undefined && classValue !== null && classValue !== '') {
        const parsedClass = parseInt(classValue, 10);
        if (!isNaN(parsedClass)) {
          knowledgeLvl = parsedClass;
        }
      }

      await prisma.$transaction([
        prisma.studentInfo.create({ 
          data: { 
            studentId: user.id,
            knowledgeLvl: knowledgeLvl  // ← Set the class value here
          } 
        }),
        prisma.petGame.create({ data: { studentId: user.id } })
      ]);
    }

    const token = jwt.sign({ userId: user.id }, process.env.EMAIL_SECRET, { expiresIn: '1h' });
    const link = `http://127.0.0.1:5500/front-end-with-pet-game/LT/verify-email.html?token=${token}`;
    const emailBodyVerify = `
      <!DOCTYPE html>
      <html>

      <body style="margin:0;padding:20px;font-family:-apple-system,sans-serif;background:linear-gradient(135deg,#ffbf9c,#ffc074);text-align:center">
          <div style="max-width:420px;margin:0 auto;background:rgba(255,255,255,.95);border-radius:20px;padding:32px 24px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
              <h2 style="margin:0 0 16px;color:#2c3e50;font-size:1.4rem;font-weight:700">El. pašto patvirtinimas</h2>
              <p style="margin:0 0 24px;color:#666;font-size:1rem;line-height:1.5">Patvirtinkite savo el. pašto adresą <span style="font-weight: 800;">sudedu<span style="display:none;">&#8203;</span>.lt</span> paskyrai</p><a href="${link}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#40c9a9,#32ac93);color:#fff;text-decoration:none;border-radius:25px;font-weight:600;font-size:1.1rem;letter-spacing:.5px">PATVIRTINTI</a>
          </div>
      </body>

      </html>
    `

    await sendEmail(username, 'El. pašto adreso patvirtinimas', emailBodyVerify);

    res.json({ code: CODES.REG_SUCCESS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});


router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ code: CODES.ERROR_MISSING });

  try {
    const payload = jwt.verify(token, process.env.EMAIL_SECRET);
    const userId = Number(payload.userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ code: CODES.VERIFY_NOT_FOUND });

    if (user.emailVerified) {
      return res.json({ code: CODES.VERIFY_ALREADY });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true }
    });

    res.json({ code: CODES.VERIFY_SUCCESS });
  } catch (err) {
    console.error(err);
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ code: CODES.VERIFY_EXPIRED });
    }
    res.status(400).json({ code: CODES.VERIFY_EXPIRED });
  }
});

router.post('/resend-verification', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ code: CODES.VERIFY_NOT_FOUND });

    const token = jwt.sign({ userId: user.id }, process.env.EMAIL_SECRET, { expiresIn: '1d' });
    const link = `http://127.0.0.1:5500/front-end-with-pet-game/LT/verify-email.html?token=${token}`;
    const emailBodyVerify = `
      <!DOCTYPE html>
      <html>

      <body style="margin:0;padding:20px;font-family:-apple-system,sans-serif;background:linear-gradient(135deg,#ffbf9c,#ffc074);text-align:center">
          <div style="max-width:420px;margin:0 auto;background:rgba(255,255,255,.95);border-radius:20px;padding:32px 24px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
              <h2 style="margin:0 0 16px;color:#2c3e50;font-size:1.4rem;font-weight:700">El. pašto patvirtinimas</h2>
              <p style="margin:0 0 24px;color:#666;font-size:1rem;line-height:1.5">Patvirtinkite savo el. pašto adresą <span style="font-weight: 800;">sudedu<span style="display:none;">&#8203;</span>.lt</span> paskyrai</p><a href="${link}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#40c9a9,#32ac93);color:#fff;text-decoration:none;border-radius:25px;font-weight:600;font-size:1.1rem;letter-spacing:.5px">PATVIRTINTI</a>
          </div>
      </body>

      </html>
    `
    await sendEmail(username, 'El. pašto adreso patvirtinimas', emailBodyVerify);

    res.json({ code: CODES.REG_RESEND });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.post('/auth/continue-unverified', async (req, res) => {
  const { userId } = req.body;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLogIn: new Date() }
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ code: CODES.RESET_NOT_FOUND });

    const token = jwt.sign({ userId: user.id }, process.env.RESET_SECRET, { expiresIn: '15m' });
    const link = `http://127.0.0.1:5500/front-end-with-pet-game/LT/reset-password.html?token=${token}`;

    const emailBodyForgotPassword = `
      <!DOCTYPE html>
      <html>

      <body style="margin:0;padding:20px;font-family:-apple-system,sans-serif;background:linear-gradient(135deg,#ffbf9c,#ffc074);text-align:center">
          <div style="max-width:420px;margin:0 auto;background:rgba(255,255,255,.95);border-radius:20px;padding:32px 24px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
              <h2 style="margin:0 0 16px;color:#2c3e50;font-size:1.4rem;font-weight:700">Slaptažodžio keitimas</h2>
              <p style="margin:0 0 24px;color:#666;font-size:1rem;line-height:1.5">Pakeiskite savo <span style="font-weight: 800;">sudedu<span style="display:none;">&#8203;</span>.lt</span> paskyros slaptažodį</p><a href="${link}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#40c9a9,#32ac93);color:#fff;text-decoration:none;border-radius:25px;font-weight:600;font-size:1.1rem;letter-spacing:.5px">KEISTI SLAPTAŽODĮ</a>
          </div>
      </body>

      </html>
    `

    await sendEmail(username, 'Paskyros slaptažodžio keitimas', emailBodyForgotPassword);
    res.json({ code: CODES.RESET_SENT });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ code: CODES.ERROR_MISSING });

  try {
    const { userId } = jwt.verify(token, process.env.RESET_SECRET);
    const hash = bcrypt.hashSync(newPassword, 8);
    await prisma.user.update({ where: { id: userId }, data: { password: hash } });
    res.json({ code: CODES.RESET_SUCCESS });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(400).json({ code: CODES.RESET_EXPIRED });
    }
    res.status(400).json({ code: CODES.RESET_EXPIRED });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ code: CODES.LOGIN_NOT_FOUND });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ code: CODES.LOGIN_WRONG_PASS });

    const isNewAccount = !user.lastLogIn;

    if (user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogIn: new Date() }
      });
    }

    if (user.accType === 'student') {
      await prisma.$transaction(async (tx) => {
        const studentInfo = await tx.studentInfo.findUnique({ where: { studentId: user.id } });
        if (!studentInfo) await tx.studentInfo.create({ data: { studentId: user.id } });

        const petGame = await tx.petGame.findUnique({ where: { studentId: user.id } });
        if (!petGame) await tx.petGame.create({ data: { studentId: user.id } });
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.tokenVersion);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    // Get all user data
    const userData = await getUserData(user.id);

    res.json({
      code: CODES.LOGIN_SUCCESS,
      token: accessToken,
      refreshToken: refreshToken,
      ...userData, // Spread all user data
      isNewAccount,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken, userData: clientUserData } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ code: 'REFRESH_MISSING' });
  }

  try {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { 
        user: {
          select: {
            id: true,
            tokenVersion: true
          }
        }
      }
    });

    if (!storedToken || new Date() > storedToken.expiresAt) {
      return res.status(403).json({ code: 'REFRESH_EXPIRED' });
    }

    // Update lastLogIn here
    await prisma.user.update({
      where: { id: storedToken.userId },
      data: { lastLogIn: new Date() }
    });

    // Get fresh user data from database
    const serverUserData = await getUserData(storedToken.userId);

    if (!serverUserData) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(storedToken.userId, serverUserData.tokenVersion);

    // Calculate diff between client and server data
    const diff = clientUserData ? getDiff(clientUserData, serverUserData) : serverUserData;

    // Always send token, only send other fields if they changed
    const response = {
      code: 'REFRESH_SUCCESS',
      token: newAccessToken
    };

    Object.assign(response, diff);

    res.json(response);

  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});


// NEW: LOGOUT (SINGLE DEVICE)
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.json({ code: 'LOGOUT_SUCCESS' });
  }

  try {
    await prisma.refreshToken.delete({
      where: { token: refreshToken }
    });

    res.json({ code: 'LOGOUT_SUCCESS' });
  } catch (err) {
    res.json({ code: 'LOGOUT_SUCCESS' });
  }
});

// NEW: LOGOUT ALL DEVICES
router.post('/logout-all-users', async (req, res) => {
  const { adminSecret } = req.body;

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ code: 'FORBIDDEN' });
  }

  try {
    await prisma.user.updateMany({
      data: {
        tokenVersion: { increment: 1 }
      }
    });

    await prisma.refreshToken.deleteMany({});

    res.json({ 
      code: 'LOGOUT_ALL_SUCCESS',
      message: 'All users logged out'
    });

  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});


router.get('/', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ code: CODES.ERROR_MISSING });

  try {
    const userWithTaskAssignments = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        assignedTasksAsStudent: {
          select: { id: true }
        }
      }
    });

    if (!userWithTaskAssignments) {
      return res.status(404).json({ code: CODES.LOGIN_NOT_FOUND });
    }

    res.json({
      id: userWithTaskAssignments.id,
      assignmentIds: userWithTaskAssignments.assignedTasksAsStudent.map(task => task.id)
    });
  } catch (error) {
    console.error('Error retrieving user assignments:', error);
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.delete('/:id', async (req, res) => {
  const userId = Number(req.params.id);
  const requesterToken = req.headers.authorization?.split(' ')[1];

  try {
    const requester = await prisma.user.findFirst({
      where: {
        token: requesterToken,
        accType: 'admin'
      }
    });

    if (!requester) {
      return res.status(403).json({ code: CODES.ERROR_SERVER });
    }

    if (requester.id === userId) {
      return res.status(400).json({ code: CODES.ERROR_SERVER });
    }

    await prisma.$transaction([
      prisma.studentTaskAssignment.deleteMany({
        where: { studentId: userId }
      }),
      prisma.studentTaskAssignment.deleteMany({
        where: { task: { teacherId: userId } }
      }),
      prisma.teacherTask.deleteMany({
        where: { teacherId: userId }
      }),
      prisma.teacherStudent.deleteMany({
        where: { OR: [{ teacherId: userId }, { studentId: userId }] }
      }),
      prisma.user.delete({
        where: { id: userId }
      })
    ]);

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ code: CODES.ERROR_SERVER });
  }
});

router.get('/validate-reset', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ code: CODES.ERROR_MISSING });

  try {
    jwt.verify(token, process.env.RESET_SECRET);
    res.json({ code: CODES.RESET_VALID });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(400).json({ code: CODES.RESET_EXPIRED });
    }
    res.status(400).json({ code: CODES.RESET_EXPIRED });
  }
});


export default router