import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router()

// Fetch or create game data
router.post('/gameData', async (req, res) => {
  const { studentId } = req.body
  if (!studentId) return res.sendStatus(400)

  try {
    let gameData = await prisma.petGame.findUnique({
      where: { studentId }
    })

    if (!gameData) {
      // Create a new PetGame entry for this student
      gameData = await prisma.petGame.create({
        data: {
          studentId,
          money: new Prisma.Decimal(0.0)
        }
      })
    }

    res.json({
      ...gameData,
      money: Number(parseFloat(gameData.money).toFixed(1))
    })
  } catch (err) {
    console.error(err)
    res.sendStatus(500)
  }
})


// Update object assets
router.post('/objectAssets', async (req, res) => {
  const { studentId, objectAssets } = req.body
  if (!studentId || !objectAssets) return res.sendStatus(400)

  try {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      include: { petGame: true }
    })
    if (!user) return res.sendStatus(404)

    if (user.petGame) {
      await prisma.petGame.update({
        where: { studentId: user.id },
        data: { objectAssets }
      })
    } else {
      await prisma.petGame.create({
        data: { studentId: user.id, objectAssets }
      })
    }

    res.sendStatus(204) // no content
  } catch (err) {
    console.error(err)
    res.sendStatus(500)
  }
})

// Update pet assets
router.post('/petAssets', async (req, res) => {
  const { studentId, petAssets } = req.body
  if (!studentId || !petAssets) return res.sendStatus(400)

  try {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      include: { petGame: true }
    })
    if (!user) return res.sendStatus(404)

    if (user.petGame) {
      await prisma.petGame.update({
        where: { studentId: user.id },
        data: { petAssets }
      })
    } else {
      await prisma.petGame.create({
        data: { studentId: user.id, petAssets }
      })
    }

    res.sendStatus(204)
  } catch (err) {
    console.error(err)
    res.sendStatus(500)
  }
})

// Update money
router.post('/money', async (req, res) => {
  const { studentId, money } = req.body
  if (!studentId || money === undefined) return res.sendStatus(400)

  try {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      include: { petGame: true }
    })
    if (!user) return res.sendStatus(404)

    // Round to 1 decimal
    const roundedMoney = Math.round(Number(money) * 10) / 10;

    if (user.petGame) {
      await prisma.petGame.update({
        where: { studentId: user.id },
        data: { money: roundedMoney }
      })
    } else {
      await prisma.petGame.create({
        data: { studentId: user.id, money: roundedMoney }
      })
    }

    res.sendStatus(204)
  } catch (err) {
    console.error(err)
    res.sendStatus(500)
  }
})

router.post('/petStats', async (req, res) => {
    const { studentId, petStats } = req.body;
    if (!studentId || !petStats) return res.sendStatus(400);

    try {
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { petGame: true }
        });
        if (!user) return res.sendStatus(404);

        // Convert incoming array into a map
        const incomingMap = {};
        for (const [petId, stats] of petStats) {
            incomingMap[petId] = stats; // stats = [food, water, love, date]
        }

        // Load existing stats if available
        let savedMap = {};
        if (user.petGame?.petStats) {
            const parsed = JSON.parse(user.petGame.petStats);
            if (Array.isArray(parsed)) {
                for (const [pid, stats] of parsed) {
                    savedMap[pid] = stats; // keep as array [food, water, love, date]
                }
            } else {
                savedMap = parsed;
            }
        }

        // Replace or add pets from incomingMap
        for (const pid in incomingMap) {
            savedMap[pid] = incomingMap[pid]; // replace the entire array for that pet
        }

        // Save updated stats
        const savedString = JSON.stringify(savedMap);
        if (user.petGame) {
            await prisma.petGame.update({
                where: { studentId: user.id },
                data: { petStats: savedString }
            });
        } else {
            await prisma.petGame.create({
                data: { studentId: user.id, petStats: savedString }
            });
        }

        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

router.post('/deletePetStats', async (req, res) => {
    const { studentId, petId } = req.body;
    if (!studentId || !petId) return res.sendStatus(400);

    try {
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { petGame: true }
        });
        if (!user) return res.sendStatus(404);

        // Load existing stats
        let savedMap = {};
        if (user.petGame?.petStats) {
            const parsed = JSON.parse(user.petGame.petStats);
            if (Array.isArray(parsed)) {
                for (const [pid, stats] of parsed) {
                    savedMap[pid] = stats;
                }
            } else {
                savedMap = parsed;
            }
        }

        // Delete the specific petId if it exists
        if (savedMap.hasOwnProperty(petId)) {
            delete savedMap[petId];
        } else {
            return res.status(404).json({ error: "Pet not found" });
        }

        // Save updated stats
        const savedString = JSON.stringify(savedMap);
        if (user.petGame) {
            await prisma.petGame.update({
                where: { studentId: user.id },
                data: { petStats: savedString }
            });
        } else {
            // unlikely, but handle case where petGame doesn't exist yet
            await prisma.petGame.create({
                data: { studentId: user.id, petStats: savedString }
            });
        }

        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

router.post('/taxes', async (req, res) => {
    const { studentId, taxes } = req.body; // removed taxType
    
    if (!studentId || !Array.isArray(taxes) || taxes.length !== 2) {
        return res.sendStatus(400);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { petGame: true }
        });
        
        if (!user) return res.sendStatus(404);

        const taxesString = JSON.stringify(taxes);

        if (user.petGame) {
            await prisma.petGame.update({
                where: { studentId: user.id },
                data: { taxes: taxesString }
            });
        } else {
            await prisma.petGame.create({
                data: { 
                    studentId: user.id, 
                    taxes: taxesString 
                }
            });
        }

        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});


router.post('/petOnWalk', async (req, res) => {
    const { studentId, petOnWalk } = req.body;

    // Validate request
    if (!studentId || typeof petOnWalk !== 'string') {
        return res.sendStatus(400);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { petGame: true }
        });

        if (!user) return res.sendStatus(404);

        if (user.petGame) {
            await prisma.petGame.update({
                where: { studentId: user.id },
                data: { petOnWalk }
            });
        } else {
            await prisma.petGame.create({
                data: { 
                    studentId: user.id, 
                    petOnWalk 
                }
            });
        }

        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});


router.post('/deliverMessages', async (req, res) => {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

    try {
        // Ensure the user has a PetGame record
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { petGame: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.petGame) {
            // Create empty PetGame if it doesn't exist
            await prisma.petGame.create({ data: { studentId } });
        }

        const result = await deliverMessageGifts(studentId);
        res.json(result); // returns { success: true, gifts: [...] }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});


async function deliverMessageGifts(userId) {
  const now = new Date();

  const petGame = await prisma.petGame.findUnique({
    where: { studentId: userId },
    include: { messaged: true },
  });

  if (!petGame || petGame.messaged.length === 0) {
    return { success: true, gifts: [] };
  }

  const validGifts = [];
  const messageIdsToDisconnect = [];

  for (const message of petGame.messaged) {
    const expired = message.giftExpiration < now;

    if (expired) {
      // 1️⃣ FIXED — find all PetGames referencing this message
      const referencingGames = await prisma.petGame.findMany({
        where: { messaged: { some: { id: message.id } } },
        select: { id: true }
      });

      // 2️⃣ FIXED — disconnect one by one (allowed)
      for (const pg of referencingGames) {
        await prisma.petGame.update({
          where: { id: pg.id },
          data: {
            messaged: { disconnect: { id: message.id } },
          },
        });
      }

      // delete expired message
      await prisma.messageGift.delete({ where: { id: message.id } });
      continue;
    }

    // Count references
    const referenceCount = await prisma.petGame.count({
      where: { messaged: { some: { id: message.id } } },
    });

    if (referenceCount === 0) {
      await prisma.messageGift.delete({ where: { id: message.id } });
      continue;
    }

    // Valid gift
    validGifts.push({
      id: message.id,
      message: message.message,
      giftId: message.giftId,
      quantity: message.quantity || 1,
    });

    messageIdsToDisconnect.push(message.id);
  }

  // Disconnect delivered (non-expired) messages from this user
  if (messageIdsToDisconnect.length > 0) {
    await prisma.petGame.update({
      where: { id: petGame.id },
      data: {
        messaged: {
          disconnect: messageIdsToDisconnect.map((id) => ({ id })),
        },
      },
    });
  }

  // Cleanup: delete MessageGifts that no PetGame references
  await prisma.messageGift.deleteMany({
    where: { petGames: { none: {} } },
  });

  return { success: true, gifts: validGifts };
}


export default router
