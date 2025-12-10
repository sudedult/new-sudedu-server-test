import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router();

// Helper function to check if user is admin
async function checkAdmin(userId, res) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { accType: true }
    });
    
    if (!user || user.accType !== 'admin') {
        res.status(403).json({ message: 'Admin access required' });
        return false;
    }
    return true;
}

// Add these helper functions after the imports and before the routes

// Safely parse JSON with fallback
function safeJSONParse(jsonString, fallback) {
    try {
        const parsed = JSON.parse(jsonString);
        return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}

// Safely get pet assets structure
function safePetAssets(petAssetsString) {
    const parsed = safeJSONParse(petAssetsString, [[], []]);
    
    // Ensure it's an array with 2 elements
    if (!Array.isArray(parsed) || parsed.length !== 2) {
        return [[], []];
    }
    
    // Ensure both elements are arrays
    return [
        Array.isArray(parsed[0]) ? parsed[0] : [],
        Array.isArray(parsed[1]) ? parsed[1] : []
    ];
}

// Safely get pet stats structure
function safePetStats(petStatsString) {
    const parsed = safeJSONParse(petStatsString, {});
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

// Safely get object assets structure
function safeObjectAssets(objectAssetsString) {
    const parsed = safeJSONParse(objectAssetsString, []);
    return Array.isArray(parsed) ? parsed : [];
}

// Validate pet structure
function isValidPet(pet) {
    if (!Array.isArray(pet) || pet.length !== 2) return false;
    
    const [petId, petData] = pet;
    if (typeof petId !== 'string' && typeof petId !== 'number') return false;
    if (!Array.isArray(petData) || petData.length !== 2) return false;
    
    const [petName, skins] = petData;
    if (typeof petName !== 'string') return false;
    if (!Array.isArray(skins)) return false;
    
    return true;
}

// Validate skin structure
function isValidSkin(skin) {
    if (!Array.isArray(skin) || skin.length !== 3) return false;
    
    const [skinId, skinIndex, equipped] = skin;
    if (typeof skinId !== 'string' && typeof skinId !== 'number') return false;
    if (typeof skinIndex !== 'number') return false;
    if (typeof equipped !== 'boolean') return false;
    
    return true;
}

// Safely get skins from pet
function getSafeSkinsFromPet(pet) {
    if (!isValidPet(pet)) return [];
    
    const skins = pet[1][1];
    if (!Array.isArray(skins)) return [];
    
    // Filter out invalid skins
    return skins.filter(isValidSkin);
}

// Initialize default pet stats
function getDefaultPetStats() {
    return [50, 50, 50, 0]; // [happiness, hunger, cleanliness, lastInteractionTime]
}

// This is already in your code, but let's make sure it's complete:
async function cleanupAccountTypeData(tx, userId, newAccType) {
    // Delete student task assignments first (before deleting tasks they reference)
    await tx.studentTaskAssignment.deleteMany({ 
        where: { task: { teacherId: userId } } 
    });
    await tx.studentTaskAssignment.deleteMany({ where: { studentId: userId } });
    
    // Now delete teacher tasks
    await tx.teacherTask.deleteMany({ where: { teacherId: userId } });
    
    // Delete teacher-student relationships
    await tx.teacherStudent.deleteMany({ where: { teacherId: userId } });
    await tx.teacherStudent.deleteMany({ where: { studentId: userId } });

    // Delete task result archives
    await tx.taskResultArchive.deleteMany({ where: { studentId: userId } });

    // If changing away from student, delete student-specific data
    if (newAccType !== 'student') {
        // Get PetGame ID before deleting
        const petGame = await tx.petGame.findUnique({
            where: { studentId: userId },
            select: { id: true }
        });
        
        // Disconnect MessageGifts from this PetGame
        if (petGame) {
            await tx.petGame.update({
                where: { id: petGame.id },
                data: {
                    messaged: {
                        set: []
                    }
                }
            });
        }
        
        await tx.studentInfo.deleteMany({ where: { studentId: userId } });
        await tx.petGame.deleteMany({ where: { studentId: userId } });
        
        // Clean up orphaned MessageGifts
        await tx.messageGift.deleteMany({
            where: { petGames: { none: {} } }
        });
    }
}

// Search user (by ID if number, otherwise by username/nickname - case insensitive)
router.get('/user', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { search, accType } = req.query;

    if (!search) {
        return res.status(400).json({ message: 'Search term required' });
    }

    try {
        let where;
        
        // If search is only numbers, search by ID
        if (/^\d+$/.test(search)) {
            where = { id: parseInt(search) };
        } else {
            // Otherwise search by username/nickname (case insensitive)
            where = {
                OR: [
                    { username: { equals: search, mode: 'insensitive' } },
                    { nickname: { contains: search, mode: 'insensitive' } }
                ]
            };
        }

        if (accType) {
            where = { AND: [where, { accType }] };
        }

        const user = await prisma.user.findFirst({
            where,
            include: {
                studentInfo: true,
                petGame: true,
                teacherStudentsAsTeacher: {
                    include: {
                        student: { select: { id: true, username: true, nickname: true } }
                    }
                },
                teacherStudentsAsStudent: {
                    include: {
                        teacher: { select: { id: true, username: true, nickname: true } }
                    }
                },
                assignedTasksAsTeacher: {
                    include: {
                        studentTasks: {
                            include: {
                                student: { select: { id: true, username: true, nickname: true } }
                            }
                        }
                    }
                },
                assignedTasksAsStudent: {
                    include: {
                        task: {
                            select: {
                                id: true,
                                task: true,
                                group: true,
                                duration: true
                            }
                        }
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'No user found' });
        }

        res.json({ user });

    } catch (err) {
        console.error('Error searching user:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete specific user by ID
router.delete('/user/:id', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;

    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            select: { id: true, username: true, accType: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.accType === 'admin') {
            return res.status(403).json({ message: 'Cannot delete admin users' });
        }

        await prisma.$transaction(async (tx) => {
            // Delete refresh tokens
            await tx.refreshToken.deleteMany({ where: { userId: user.id } });
            
            // Delete task result archives
            await tx.taskResultArchive.deleteMany({ where: { studentId: user.id } });
            
            // Delete task assignments where this user is the student
            await tx.studentTaskAssignment.deleteMany({ where: { studentId: user.id } });
            
            // Delete task assignments for tasks created by this user (if teacher)
            await tx.studentTaskAssignment.deleteMany({ 
                where: { task: { teacherId: user.id } } 
            });
            
            // Delete tasks created by this user (if teacher)
            await tx.teacherTask.deleteMany({ where: { teacherId: user.id } });
            
            // If this user is a student, check for orphaned teacher tasks
            if (user.accType === 'student') {
                // Find all teacher-student relationships for this student
                const teacherRelations = await tx.teacherStudent.findMany({
                    where: { studentId: user.id },
                    select: { teacherId: true }
                });
                
                // For each teacher, check their tasks
                for (const relation of teacherRelations) {
                    const teacherTasks = await tx.teacherTask.findMany({
                        where: { teacherId: relation.teacherId },
                        include: { studentTasks: true }
                    });
                    
                    // Delete tasks that have no other students
                    for (const task of teacherTasks) {
                        if (task.studentTasks.length === 0) {
                            await tx.teacherTask.delete({ where: { id: task.id } });
                        }
                    }
                }
            }
            
            // Delete teacher-student relationships (both as teacher and student)
            await tx.teacherStudent.deleteMany({ 
                where: { OR: [{ teacherId: user.id }, { studentId: user.id }] } 
            });
            
            // Delete student info
            await tx.studentInfo.deleteMany({ where: { studentId: user.id } });
            
            // Get PetGame ID before deleting
            const petGame = await tx.petGame.findUnique({
                where: { studentId: user.id },
                select: { id: true }
            });
            
            // Disconnect MessageGifts from this PetGame
            if (petGame) {
                await tx.petGame.update({
                    where: { id: petGame.id },
                    data: {
                        messaged: {
                            set: []
                        }
                    }
                });
            }
            
            // Delete pet game
            await tx.petGame.deleteMany({ where: { studentId: user.id } });
            
            // Clean up orphaned MessageGifts (those with no PetGames)
            await tx.messageGift.deleteMany({
                where: { petGames: { none: {} } }
            });
            
            // Finally delete the user
            await tx.user.delete({ where: { id: user.id } });
        });

        res.json({ 
            message: 'User deleted successfully',
            username: user.username
        });

    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete inactive users (including those who never logged in)
router.delete('/inactive', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { inactivePeriod } = req.query;

    if (!inactivePeriod || isNaN(inactivePeriod)) {
        return res.status(400).json({ message: 'Invalid inactive period' });
    }

    const periodInMonths = parseInt(inactivePeriod);
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - periodInMonths);

    try {
        const inactiveUsers = await prisma.user.findMany({
            where: {
                AND: [
                    { accType: { not: 'admin' } }, // Don't delete admins
                    {
                        OR: [
                            { lastLogIn: { lt: dateThreshold } },
                            { lastLogIn: null }
                        ]
                    }
                ]
            },
            select: { id: true, accType: true }
        });

        if (inactiveUsers.length === 0) {
            return res.status(404).json({ 
                message: 'No inactive users found',
                inactiveThresholdMonths: periodInMonths
            });
        }

        await prisma.$transaction(async (tx) => {
            for (const user of inactiveUsers) {
                // Delete refresh tokens
                await tx.refreshToken.deleteMany({ where: { userId: user.id } });
                
                // Delete task result archives
                await tx.taskResultArchive.deleteMany({ where: { studentId: user.id } });
                
                // Delete task assignments where this user is the student
                await tx.studentTaskAssignment.deleteMany({ where: { studentId: user.id } });
                
                // Delete task assignments for tasks created by this user (if teacher)
                await tx.studentTaskAssignment.deleteMany({ 
                    where: { task: { teacherId: user.id } } 
                });
                
                // Delete tasks created by this user (if teacher)
                await tx.teacherTask.deleteMany({ where: { teacherId: user.id } });
                
                // If this user is a student, check for orphaned teacher tasks
                if (user.accType === 'student') {
                    const teacherRelations = await tx.teacherStudent.findMany({
                        where: { studentId: user.id },
                        select: { teacherId: true }
                    });
                    
                    for (const relation of teacherRelations) {
                        const teacherTasks = await tx.teacherTask.findMany({
                            where: { teacherId: relation.teacherId },
                            include: { studentTasks: true }
                        });
                        
                        for (const task of teacherTasks) {
                            if (task.studentTasks.length === 0) {
                                await tx.teacherTask.delete({ where: { id: task.id } });
                            }
                        }
                    }
                }
                
                // Delete teacher-student relationships
                await tx.teacherStudent.deleteMany({ 
                    where: { OR: [{ teacherId: user.id }, { studentId: user.id }] } 
                });
                
                // Delete student info
                await tx.studentInfo.deleteMany({ where: { studentId: user.id } });
                
                // Get PetGame ID before deleting
                const petGame = await tx.petGame.findUnique({
                    where: { studentId: user.id },
                    select: { id: true }
                });
                
                // Disconnect MessageGifts from this PetGame
                if (petGame) {
                    await tx.petGame.update({
                        where: { id: petGame.id },
                        data: {
                            messaged: {
                                set: []
                            }
                        }
                    });
                }
                
                // Delete pet game
                await tx.petGame.deleteMany({ where: { studentId: user.id } });
            }
            
            // Clean up orphaned MessageGifts (those with no PetGames)
            await tx.messageGift.deleteMany({
                where: { petGames: { none: {} } }
            });
        });

        res.json({ 
            message: 'Inactive users deleted successfully',
            deletedCount: inactiveUsers.length,
            inactiveThresholdMonths: periodInMonths
        });

    } catch (err) {
        console.error('Error deleting inactive users:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update user basic data
router.patch('/user/:id', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const updates = req.body;

    try {
        const currentUser = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            select: { accType: true }
        });

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        delete updates.id;
        delete updates.password;
        delete updates.tokenVersion;

        const isAccTypeChanging = updates.accType && updates.accType !== currentUser.accType;

        await prisma.$transaction(async (tx) => {
            if (isAccTypeChanging) {
                await cleanupAccountTypeData(tx, parseInt(id), updates.accType);
                
                // Logout user by incrementing tokenVersion and deleting refresh tokens
                await tx.user.update({
                    where: { id: parseInt(id) },
                    data: { 
                        ...updates,
                        tokenVersion: { increment: 1 }
                    }
                });
                
                await tx.refreshToken.deleteMany({
                    where: { userId: parseInt(id) }
                });
            } else {
                await tx.user.update({
                    where: { id: parseInt(id) },
                    data: updates
                });
            }
        });

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            select: {
                id: true,
                username: true,
                nickname: true,
                accType: true,
                emailVerified: true,
                lastLogIn: true
            }
        });

        res.json({ 
            message: isAccTypeChanging 
                ? 'User updated successfully and logged out' 
                : 'User updated successfully', 
            user,
            loggedOut: isAccTypeChanging
        });

    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update student info
router.patch('/user/:id/student', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { knowledgeLvl } = req.body;

    if (knowledgeLvl === undefined || isNaN(knowledgeLvl)) {
        return res.status(400).json({ message: 'Invalid knowledge level' });
    }

    try {
        const studentInfo = await prisma.studentInfo.updateMany({
            where: { studentId: parseInt(id) },
            data: { knowledgeLvl: parseInt(knowledgeLvl) }
        });

        if (studentInfo.count === 0) {
            return res.status(404).json({ message: 'Student info not found' });
        }

        res.json({ message: 'Student info updated successfully' });

    } catch (err) {
        console.error('Error updating student info:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update pet game
router.patch('/user/:id/petgame', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { money } = req.body;

    if (money === undefined || isNaN(money)) {
        return res.status(400).json({ message: 'Invalid money value' });
    }

    try {
        const petGame = await prisma.petGame.updateMany({
            where: { studentId: parseInt(id) },
            data: { money: parseInt(money) }
        });

        if (petGame.count === 0) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        res.json({ message: 'Pet game updated successfully' });

    } catch (err) {
        console.error('Error updating pet game:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add asset to pet game
router.post('/user/:id/asset', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { itemId, coordinates = [] } = req.body;

    if (itemId === undefined || !Array.isArray(coordinates)) {
        return res.status(400).json({ 
            message: 'Invalid request. Provide itemId (number) and coordinates (array)' 
        });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, objectAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        let assets = [];
        try {
            assets = JSON.parse(petGame.objectAssets);
        } catch (e) {
            assets = [];
        }

        assets.push([itemId, coordinates]);

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { objectAssets: JSON.stringify(assets) }
        });

        res.json({ 
            message: 'Asset added successfully',
            asset: { itemId, coordinates }
        });

    } catch (err) {
        console.error('Error adding asset:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove asset from pet game
router.delete('/user/:id/asset/:index', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id, index } = req.params;

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, objectAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        let assets = [];
        try {
            assets = JSON.parse(petGame.objectAssets);
        } catch (e) {
            return res.status(400).json({ message: 'Invalid asset data' });
        }

        const assetIndex = parseInt(index);
        if (assetIndex < 0 || assetIndex >= assets.length) {
            return res.status(400).json({ message: 'Invalid asset index' });
        }

        assets.splice(assetIndex, 1);

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { objectAssets: JSON.stringify(assets) }
        });

        res.json({ message: 'Asset removed successfully' });

    } catch (err) {
        console.error('Error removing asset:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add pet to user
router.post('/user/:id/pet', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { petId, petName, defaultSkinId, defaultSkinIndex } = req.body;

    if (!petId || !petName) {
        return res.status(400).json({ message: 'Pet ID and name required' });
    }

    if (!defaultSkinId || defaultSkinIndex === undefined) {
        return res.status(400).json({ message: 'Default skin ID and index required' });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true, petStats: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const petStats = safePetStats(petGame.petStats);
        const pets = petAssets[0];
        
        // Check if pet already exists
        if (pets.some(pet => isValidPet(pet) && pet[0] === petId)) {
            return res.status(400).json({ message: 'Pet already exists' });
        }

        // Add pet with default skin equipped
        pets.push([petId, [petName, [[defaultSkinId, parseInt(defaultSkinIndex), true]]]]);
        petAssets[0] = pets;

        // Initialize pet stats
        petStats[petId] = getDefaultPetStats();

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { 
                petAssets: JSON.stringify(petAssets),
                petStats: JSON.stringify(petStats)
            }
        });

        res.json({ message: 'Pet added successfully with default skin and stats' });

    } catch (err) {
        console.error('Error adding pet:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove pet from user
router.delete('/user/:id/pet/:petId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id, petId } = req.params;

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true, petStats: true, petOnWalk: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const petStats = safePetStats(petGame.petStats);
        const pets = petAssets[0];
        
        const filteredPets = pets.filter(pet => !isValidPet(pet) || pet[0] !== petId);

        if (filteredPets.length === pets.length) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        petAssets[0] = filteredPets;

        // Remove pet stats
        delete petStats[petId];

        // Clear petOnWalk if this pet was on walk
        let newPetOnWalk = petGame.petOnWalk || '';
        if (newPetOnWalk === petId) {
            newPetOnWalk = '';
        }

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { 
                petAssets: JSON.stringify(petAssets),
                petStats: JSON.stringify(petStats),
                petOnWalk: newPetOnWalk
            }
        });

        res.json({ message: 'Pet removed successfully with stats cleanup' });

    } catch (err) {
        console.error('Error removing pet:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Rename pet
router.patch('/user/:id/pet-name', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { petId, newName } = req.body;

    if (!petId || !newName) {
        return res.status(400).json({ message: 'Pet ID and new name required' });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const pets = petAssets[0];
        
        const petIndex = pets.findIndex(pet => isValidPet(pet) && pet[0] === petId);

        if (petIndex === -1) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        pets[petIndex][1][0] = newName;
        petAssets[0] = pets;

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { petAssets: JSON.stringify(petAssets) }
        });

        res.json({ message: 'Pet renamed successfully' });

    } catch (err) {
        console.error('Error renaming pet:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add pet skin
router.post('/user/:id/pet-skin', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { petId, skinId, skinIndex, equipped } = req.body;

    if (!petId || !skinId || skinIndex === undefined) {
        return res.status(400).json({ message: 'Pet ID, skin ID, and skin index required' });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const pets = petAssets[0];
        
        const petIndex = pets.findIndex(pet => isValidPet(pet) && pet[0] === petId);

        if (petIndex === -1) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        const skins = getSafeSkinsFromPet(pets[petIndex]);
        
        // Check if skin already exists
        if (skins.some(skin => skin[0] === skinId)) {
            return res.status(400).json({ message: 'Skin already exists' });
        }

        skins.push([skinId, parseInt(skinIndex), equipped ? true : false]);
        pets[petIndex][1][1] = skins;
        petAssets[0] = pets;

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { petAssets: JSON.stringify(petAssets) }
        });

        res.json({ message: 'Pet skin added successfully' });

    } catch (err) {
        console.error('Error adding pet skin:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove pet skin
router.delete('/user/:id/pet-skin', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { petId, skinId } = req.body;

    if (!petId || !skinId) {
        return res.status(400).json({ message: 'Pet ID and skin ID required' });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const pets = petAssets[0];
        
        const petIndex = pets.findIndex(pet => isValidPet(pet) && pet[0] === petId);

        if (petIndex === -1) {
            return res.status(404).json({ message: 'Pet not found' });
        }

        const skins = getSafeSkinsFromPet(pets[petIndex]);
        const filteredSkins = skins.filter(skin => skin[0] !== skinId);

        if (filteredSkins.length === skins.length) {
            return res.status(404).json({ message: 'Skin not found' });
        }

        pets[petIndex][1][1] = filteredSkins;
        petAssets[0] = pets;

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { petAssets: JSON.stringify(petAssets) }
        });

        res.json({ message: 'Pet skin removed successfully' });

    } catch (err) {
        console.error('Error removing pet skin:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add consumable to user
router.post('/user/:id/consumable', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id } = req.params;
    const { itemId, quantity } = req.body;

    if (itemId === undefined || !quantity || quantity < 1) {
        return res.status(400).json({ message: 'Item ID and valid quantity required' });
    }

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const consumables = petAssets[1];
        
        // Check if item already exists
        const existingIndex = consumables.findIndex(item => 
            Array.isArray(item) && item.length >= 2 && item[0] === parseInt(itemId)
        );
        
        if (existingIndex !== -1) {
            // Add to existing quantity
            consumables[existingIndex][1] = (consumables[existingIndex][1] || 0) + parseInt(quantity);
        } else {
            // Add new consumable
            consumables.push([parseInt(itemId), parseInt(quantity)]);
        }

        petAssets[1] = consumables;

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { petAssets: JSON.stringify(petAssets) }
        });

        res.json({ message: 'Consumable added successfully' });

    } catch (err) {
        console.error('Error adding consumable:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove consumable from user
router.delete('/user/:id/consumable/:itemId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { id, itemId } = req.params;

    try {
        const petGame = await prisma.petGame.findFirst({
            where: { studentId: parseInt(id) },
            select: { id: true, petAssets: true }
        });

        if (!petGame) {
            return res.status(404).json({ message: 'Pet game not found' });
        }

        const petAssets = safePetAssets(petGame.petAssets);
        const consumables = petAssets[1];
        
        const filteredConsumables = consumables.filter(item => 
            !Array.isArray(item) || item.length < 2 || item[0] !== parseInt(itemId)
        );

        if (filteredConsumables.length === consumables.length) {
            return res.status(404).json({ message: 'Consumable not found' });
        }

        petAssets[1] = filteredConsumables;

        await prisma.petGame.update({
            where: { id: petGame.id },
            data: { petAssets: JSON.stringify(petAssets) }
        });

        res.json({ message: 'Consumable removed successfully' });

    } catch (err) {
        console.error('Error removing consumable:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add student to teacher
router.post('/teacher/:teacherId/student', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { teacherId } = req.params;
    const { studentId } = req.body;

    if (!studentId || isNaN(studentId)) {
        return res.status(400).json({ message: 'Invalid student ID' });
    }

    try {
        const teacher = await prisma.user.findUnique({
            where: { id: parseInt(teacherId) },
            select: { accType: true }
        });

        if (!teacher || teacher.accType !== 'teacher') {
            return res.status(400).json({ message: 'User is not a teacher' });
        }

        const student = await prisma.user.findUnique({
            where: { id: parseInt(studentId) },
            select: { accType: true }
        });

        if (!student || student.accType !== 'student') {
            return res.status(400).json({ message: 'Target user is not a student' });
        }

        // Check if relationship already exists
        const existing = await prisma.teacherStudent.findUnique({
            where: { studentId: parseInt(studentId) }
        });

        if (existing) {
            return res.status(400).json({ message: 'Student already has a teacher' });
        }

        await prisma.teacherStudent.create({
            data: {
                teacherId: parseInt(teacherId),
                studentId: parseInt(studentId)
            }
        });

        res.json({ message: 'Student added successfully' });

    } catch (err) {
        console.error('Error adding student to teacher:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove teacher-student relationship
router.delete('/teacher-student/:relationId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { relationId } = req.params;

    try {
        // Get the relationship before deleting
        const relationship = await prisma.teacherStudent.findUnique({
            where: { id: parseInt(relationId) },
            select: { studentId: true, teacherId: true }
        });

        if (!relationship) {
            return res.status(404).json({ message: 'Relationship not found' });
        }

        await prisma.$transaction(async (tx) => {
            // Delete all task assignments for this student from this teacher's tasks
            await tx.studentTaskAssignment.deleteMany({
                where: {
                    studentId: relationship.studentId,
                    task: { teacherId: relationship.teacherId }
                }
            });

            // Delete teacher tasks that have no more students assigned
            const teacherTasks = await tx.teacherTask.findMany({
                where: { teacherId: relationship.teacherId },
                include: {
                    studentTasks: true
                }
            });

            for (const task of teacherTasks) {
                if (task.studentTasks.length === 0) {
                    await tx.teacherTask.delete({
                        where: { id: task.id }
                    });
                }
            }

            // Delete the relationship
            await tx.teacherStudent.delete({
                where: { id: parseInt(relationId) }
            });
        });

        res.json({ message: 'Relationship removed successfully' });

    } catch (err) {
        console.error('Error removing relationship:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove teacher from student (by student ID)
router.delete('/student/:studentId/teacher', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { studentId } = req.params;

    try {
        // Get the relationship before deleting
        const relationship = await prisma.teacherStudent.findUnique({
            where: { studentId: parseInt(studentId) },
            select: { teacherId: true }
        });

        if (!relationship) {
            return res.status(404).json({ message: 'Teacher relationship not found' });
        }

        await prisma.$transaction(async (tx) => {
            // Delete all task assignments for this student from their teacher's tasks
            await tx.studentTaskAssignment.deleteMany({
                where: {
                    studentId: parseInt(studentId),
                    task: { teacherId: relationship.teacherId }
                }
            });

            // Delete teacher tasks that have no more students assigned
            const teacherTasks = await tx.teacherTask.findMany({
                where: { teacherId: relationship.teacherId },
                include: {
                    studentTasks: true
                }
            });

            for (const task of teacherTasks) {
                if (task.studentTasks.length === 0) {
                    await tx.teacherTask.delete({
                        where: { id: task.id }
                    });
                }
            }

            // Delete the relationship
            await tx.teacherStudent.delete({
                where: { studentId: parseInt(studentId) }
            });
        });

        res.json({ message: 'Teacher removed successfully' });

    } catch (err) {
        console.error('Error removing teacher:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete task assignment
router.delete('/task-assignment/:assignmentId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { assignmentId } = req.params;

    try {
        // Get the task ID before deleting
        const assignment = await prisma.studentTaskAssignment.findUnique({
            where: { id: parseInt(assignmentId) },
            select: { taskId: true }
        });

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        await prisma.$transaction(async (tx) => {
            // Delete the assignment
            await tx.studentTaskAssignment.delete({
                where: { id: parseInt(assignmentId) }
            });

            // Check if any other students have this task
            const remainingAssignments = await tx.studentTaskAssignment.count({
                where: { taskId: assignment.taskId }
            });

            // If no students left, delete the task
            if (remainingAssignments === 0) {
                await tx.teacherTask.delete({
                    where: { id: assignment.taskId }
                });
            }
        });

        res.json({ message: 'Task assignment deleted successfully' });

    } catch (err) {
        console.error('Error deleting task assignment:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete teacher task (and all associated student assignments)
router.delete('/teacher-task/:taskId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { taskId } = req.params;

    try {
        await prisma.$transaction(async (tx) => {
            await tx.studentTaskAssignment.deleteMany({
                where: { taskId: parseInt(taskId) }
            });
            await tx.teacherTask.delete({
                where: { id: parseInt(taskId) }
            });
        });

        res.json({ message: 'Task and all assignments deleted successfully' });

    } catch (err) {
        console.error('Error deleting teacher task:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add gift to all users
router.post('/gift', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { itemId, coordinates = [] } = req.body;

    if (itemId === undefined || !Array.isArray(coordinates)) {
        return res.status(400).json({ 
            message: 'Invalid request. Provide itemId (number) and coordinates (array)' 
        });
    }

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, objectAssets: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        const updates = petGames.map(petGame => {
            let assets = [];
            try {
                assets = JSON.parse(petGame.objectAssets);
            } catch (e) {
                assets = [];
            }

            assets.push([itemId, coordinates]);

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { objectAssets: JSON.stringify(assets) }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Gift added successfully to all students',
            updatedCount: petGames.length,
            gift: { itemId, coordinates }
        });

    } catch (err) {
        console.error('Error adding gift:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Modify money for all students - UPDATE
router.post('/modify-money', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { amount } = req.body;

    if (amount === undefined || isNaN(amount) || amount === 0) {
        return res.status(400).json({ 
            message: 'Invalid amount. Provide a non-zero number' 
        });
    }

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, money: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        const updates = petGames.map(petGame => {
            let newMoney = Number(petGame.money) + parseInt(amount);
            // Don't let money go below 0
            if (newMoney < 0) newMoney = 0;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { money: newMoney }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: amount > 0 ? 'Money added successfully to all students' : 'Money subtracted successfully from all students',
            updatedCount: petGames.length,
            amount: parseInt(amount)
        });

    } catch (err) {
        console.error('Error modifying money:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove item from all users - UPDATE
router.delete('/remove-item/:itemId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { itemId } = req.params;
    const { compensation } = req.body;

    if (isNaN(itemId)) {
        return res.status(400).json({ message: 'Invalid item ID' });
    }

    const targetItemId = parseInt(itemId);
    const compensationAmount = compensation ? parseInt(compensation) : 0;

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, objectAssets: true, money: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let itemsRemoved = 0;
        let totalCompensation = 0;

        const updates = petGames.map(petGame => {
            let assets = [];
            try {
                assets = JSON.parse(petGame.objectAssets);
            } catch (e) {
                assets = [];
            }

            const originalLength = assets.length;
            assets = assets.filter(asset => {
                const [assetItemId] = asset;
                return assetItemId !== targetItemId;
            });

            const removedCount = originalLength - assets.length;
            let newMoney = Number(petGame.money);
            
            if (removedCount > 0) {
                usersAffected++;
                itemsRemoved += removedCount;
                if (compensationAmount > 0) {
                    newMoney += compensationAmount * removedCount;
                    totalCompensation += compensationAmount * removedCount;
                }
            }

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { 
                    objectAssets: JSON.stringify(assets),
                    money: newMoney
                }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Item removed successfully from all students',
            usersAffected,
            itemsRemoved,
            itemId: targetItemId,
            compensationPerItem: compensationAmount,
            totalCompensation
        });

    } catch (err) {
        console.error('Error removing item:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add consumable to all users (bulk) - UPDATE
router.post('/bulk/consumable', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { itemId, quantity } = req.body;

    if (itemId === undefined || !quantity || quantity < 1) {
        return res.status(400).json({ 
            message: 'Item ID and valid quantity required' 
        });
    }

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const consumables = petAssets[1] || [];
            const existingIndex = consumables.findIndex(item => item[0] === parseInt(itemId));
            
            if (existingIndex !== -1) {
                consumables[existingIndex][1] += parseInt(quantity);
            } else {
                consumables.push([parseInt(itemId), parseInt(quantity)]);
            }

            petAssets[1] = consumables;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { petAssets: JSON.stringify(petAssets) }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Consumable added to all students successfully',
            updatedCount: petGames.length,
            consumable: { itemId: parseInt(itemId), quantity: parseInt(quantity) }
        });

    } catch (err) {
        console.error('Error adding consumable to all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove consumable from all users (bulk) - UPDATE
router.delete('/bulk/consumable/:itemId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { itemId } = req.params;
    const { compensation } = req.body;

    if (isNaN(itemId)) {
        return res.status(400).json({ message: 'Invalid item ID' });
    }

    const targetItemId = parseInt(itemId);
    const compensationAmount = compensation ? parseInt(compensation) : 0;

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true, money: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let totalItemsRemoved = 0;
        let totalCompensation = 0;

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const consumables = petAssets[1] || [];
            const targetItem = consumables.find(item => item[0] === targetItemId);
            const itemQuantity = targetItem ? targetItem[1] : 0;
            
            const filteredConsumables = consumables.filter(item => item[0] !== targetItemId);

            let newMoney = Number(petGame.money);
            
            if (filteredConsumables.length < consumables.length) {
                usersAffected++;
                totalItemsRemoved += itemQuantity;
                if (compensationAmount > 0) {
                    newMoney += compensationAmount * itemQuantity;
                    totalCompensation += compensationAmount * itemQuantity;
                }
            }

            petAssets[1] = filteredConsumables;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { 
                    petAssets: JSON.stringify(petAssets),
                    money: newMoney
                }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Consumable removed from all students successfully',
            usersAffected,
            itemId: targetItemId,
            totalItemsRemoved,
            compensationPerItem: compensationAmount,
            totalCompensation
        });

    } catch (err) {
        console.error('Error removing consumable from all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Logout all users
router.post('/logout-all', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        const [updatedUsers, deletedTokens] = await prisma.$transaction([
            prisma.user.updateMany({
                data: { tokenVersion: { increment: 1 } }
            }),
            prisma.refreshToken.deleteMany({})
        ]);

        res.json({ 
            message: 'All users logged out successfully',
            usersAffected: updatedUsers.count,
            tokensDeleted: deletedTokens.count
        });

    } catch (err) {
        console.error('Error logging out all users:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Logout specific user
router.post('/logout-user/:userId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { userId } = req.params;

    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: { id: true, username: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const [updatedUser, deletedTokens] = await prisma.$transaction([
            prisma.user.update({
                where: { id: parseInt(userId) },
                data: { tokenVersion: { increment: 1 } }
            }),
            prisma.refreshToken.deleteMany({
                where: { userId: parseInt(userId) }
            })
        ]);

        res.json({ 
            message: 'User logged out successfully',
            username: user.username,
            tokensDeleted: deletedTokens.count
        });

    } catch (err) {
        console.error('Error logging out user:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// MESSAGE GIFT ROUTES

// Get all message gifts
router.get('/messages', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        const messages = await prisma.messageGift.findMany({
            include: {
                petGames: {
                    include: {
                        student: {
                            select: {
                                id: true,
                                username: true,
                                nickname: true
                            }
                        }
                    }
                }
            },
            orderBy: { id: 'desc' }
        });

        res.json({ messages });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create message gift
router.post('/messages', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { message, giftId, quantity, expirationDate, recipients, sendToAll } = req.body;

    if (!message || !expirationDate) {
        return res.status(400).json({ message: 'Message and expiration date required' });
    }

    try {
        const expiration = new Date(expirationDate);
        
        if (isNaN(expiration.getTime())) {
            return res.status(400).json({ message: 'Invalid expiration date' });
        }

        // Determine which pet games to link to
        let petGameIds = [];
        
        if (sendToAll) {
            // Get all pet games
            const allPetGames = await prisma.petGame.findMany({
                select: { id: true }
            });
            petGameIds = allPetGames.map(pg => pg.id);
        } else if (recipients && recipients.length > 0) {
            // Get pet games for specified recipients (by user ID or username)
            const userIds = [];
            const usernames = [];
            
            recipients.forEach(recipient => {
                if (/^\d+$/.test(recipient)) {
                    userIds.push(parseInt(recipient));
                } else {
                    usernames.push(recipient);
                }
            });
            
            const users = await prisma.user.findMany({
                where: {
                    OR: [
                        { id: { in: userIds } },
                        { username: { in: usernames } }
                    ]
                },
                include: {
                    petGame: {
                        select: { id: true }
                    }
                }
            });
            
            petGameIds = users
                .filter(user => user.petGame)
                .map(user => user.petGame.id);
        }

        if (petGameIds.length === 0) {
            return res.status(400).json({ message: 'No valid recipients found' });
        }

        // Create the message gift
        const messageGift = await prisma.messageGift.create({
            data: {
                message,
                giftId: giftId ? parseInt(giftId) : null,
                quantity: quantity ? parseInt(quantity) : 1,
                giftExpiration: expiration,
                petGames: {
                    connect: petGameIds.map(id => ({ id }))
                }
            }
        });

        res.json({ 
            message: 'Message gift created successfully',
            messageGift,
            recipientCount: petGameIds.length
        });

    } catch (err) {
        console.error('Error creating message gift:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete message gift
router.delete('/messages/:messageId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { messageId } = req.params;

    try {
        // Get all pet games that have this message
        const petGamesWithMessage = await prisma.petGame.findMany({
            where: {
                messaged: {
                    some: { id: parseInt(messageId) }
                }
            },
            select: { id: true }
        });

        // Disconnect the message from each pet game individually
        for (const petGame of petGamesWithMessage) {
            await prisma.petGame.update({
                where: { id: petGame.id },
                data: {
                    messaged: {
                        disconnect: { id: parseInt(messageId) }
                    }
                }
            });
        }

        // Now delete the message
        await prisma.messageGift.delete({
            where: { id: parseInt(messageId) }
        });

        res.json({ message: 'Message gift deleted successfully' });

    } catch (err) {
        console.error('Error deleting message gift:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/cleanExpiredMessages', async (req, res) => {
    try {
        await cleanAllExpiredAndOrphanedMessageGifts();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

async function cleanAllExpiredAndOrphanedMessageGifts() {
    const now = new Date();

    // 1. Find all expired messages
    const expiredMessages = await prisma.messageGift.findMany({
        where: { giftExpiration: { lt: now } },
        select: { id: true }
    });

    // Delete expired messages and disconnect from PetGames
    for (const msg of expiredMessages) {
        await prisma.petGame.updateMany({
            where: { messaged: { some: { id: msg.id } } },
            data: { messaged: { disconnect: { id: msg.id } } }
        });
        await prisma.messageGift.delete({ where: { id: msg.id } });
    }

    // 2. Delete orphaned messages (no PetGames linked)
    const orphanedDeleted = await prisma.messageGift.deleteMany({
        where: { petGames: { none: {} } }
    });

    const totalDeleted = expiredMessages.length + (orphanedDeleted.count || 0);

    console.log(`Cleanup complete: removed ${totalDeleted} messages (${expiredMessages.length} expired, ${orphanedDeleted.count || 0} orphaned)`);
}

// Add these routes to your existing admin.js file

// Get statistics
router.get('/statistics', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        const now = new Date();
        const last1Day = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // User counts
        const totalUsers = await prisma.user.count();
        const studentCount = await prisma.user.count({ where: { accType: 'student' } });
        const teacherCount = await prisma.user.count({ where: { accType: 'teacher' } });
        const adminCount = await prisma.user.count({ where: { accType: 'admin' } });
        const verifiedUsers = await prisma.user.count({ where: { emailVerified: true } });
        
        // Activity stats
        const usersWithLogin = await prisma.user.count({ where: { lastLogIn: { not: null } } });
        const usersNeverLoggedIn = totalUsers - usersWithLogin;
        
        const activeLastDay = await prisma.user.count({ 
            where: { lastLogIn: { gte: last1Day } } 
        });
        const activeLastWeek = await prisma.user.count({ 
            where: { lastLogIn: { gte: last7Days } } 
        });
        const activeLastMonth = await prisma.user.count({ 
            where: { lastLogIn: { gte: last30Days } } 
        });
        
        // Pet Game stats
        const petGamesCount = await prisma.petGame.count();
        const avgMoney = await prisma.petGame.aggregate({
            _avg: { money: true }
        });
        
        // Pet game activity based on petStats
        const allPetGames = await prisma.petGame.findMany({
            select: { petStats: true }
        });
        
        let petActiveLastDay = 0;
        let petActiveLastWeek = 0;
        let petActiveLastMonth = 0;
        
        const nowHours = Math.floor(now.getTime() / (1000 * 60 * 60));
        const oneDayHours = 24;
        const oneWeekHours = 7 * 24;
        const oneMonthHours = 30 * 24;
        
        for (const petGame of allPetGames) {
            try {
                const petStats = JSON.parse(petGame.petStats);
                let latestActivity = 0;
                
                for (const petId in petStats) {
                    const stats = petStats[petId];
                    if (Array.isArray(stats) && stats.length >= 4) {
                        const lastActivityHours = stats[3];
                        if (lastActivityHours > latestActivity) {
                            latestActivity = lastActivityHours;
                        }
                    }
                }
                
                if (latestActivity > 0) {
                    const hoursSinceActivity = nowHours - latestActivity;
                    if (hoursSinceActivity <= oneDayHours) petActiveLastDay++;
                    if (hoursSinceActivity <= oneWeekHours) petActiveLastWeek++;
                    if (hoursSinceActivity <= oneMonthHours) petActiveLastMonth++;
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }
        
        // Task stats - Teachers with assignments
        const teachersWithTasks = await prisma.user.findMany({
            where: {
                accType: 'teacher',
                assignedTasksAsTeacher: {
                    some: {}
                }
            },
            include: {
                assignedTasksAsTeacher: true
            }
        });
        
        const totalTeachersWithTasks = teachersWithTasks.length;
        const totalTasksAssigned = teachersWithTasks.reduce((sum, teacher) => 
            sum + teacher.assignedTasksAsTeacher.length, 0
        );
        const avgTasksPerTeacher = totalTeachersWithTasks > 0 
            ? (totalTasksAssigned / totalTeachersWithTasks).toFixed(1) 
            : 0;
        
        // Students without teachers
        const studentsWithTeachers = await prisma.teacherStudent.count();
        const studentsWithoutTeachers = studentCount - studentsWithTeachers;
        
        // Week challenges - Classes participating
        const teachersWithStudents = await prisma.user.findMany({
            where: {
                accType: 'teacher',
                teacherStudentsAsTeacher: {
                    some: {}
                }
            },
            include: {
                teacherStudentsAsTeacher: {
                    include: {
                        student: {
                            include: {
                                studentInfo: true
                            }
                        }
                    }
                }
            }
        });
        
        const totalClasses = teachersWithStudents.length;
        let classesWithChallengeParticipants = 0;
        let totalStudentsInChallenges = 0;
        let totalStudentsInParticipatingClasses = 0;
        
        for (const teacher of teachersWithStudents) {
            const studentsInChallenge = teacher.teacherStudentsAsTeacher.filter(
                ts => ts.student.studentInfo && ts.student.studentInfo.weekChlId !== null
            ).length;
            
            if (studentsInChallenge > 0) {
                classesWithChallengeParticipants++;
                totalStudentsInChallenges += studentsInChallenge;
                totalStudentsInParticipatingClasses += teacher.teacherStudentsAsTeacher.length;
            }
        }
        
        const avgStudentsPerClassInChallenge = classesWithChallengeParticipants > 0
            ? (totalStudentsInChallenges / classesWithChallengeParticipants).toFixed(1)
            : 0;
        
        // Knowledge level distribution
        const knowledgeLevels = await prisma.studentInfo.groupBy({
            by: ['knowledgeLvl'],
            _count: true
        });
        
        const studentsWithInfo = await prisma.studentInfo.count();
        
        res.json({
            users: {
                total: totalUsers,
                students: studentCount,
                teachers: teacherCount,
                admins: adminCount,
                verified: verifiedUsers,
                unverified: totalUsers - verifiedUsers
            },
            activity: {
                neverLoggedIn: usersNeverLoggedIn,
                activeLastDay,
                activeLastWeek,
                activeLastMonth
            },
            petGame: {
                totalGames: petGamesCount,
                averageMoney: avgMoney._avg.money || 0,
                activeLastDay: petActiveLastDay,
                activeLastWeek: petActiveLastWeek,
                activeLastMonth: petActiveLastMonth
            },
            tasks: {
                teachersWithTasks: totalTeachersWithTasks,
                totalTeachers: teacherCount,
                avgTasksPerTeacher
            },
            relationships: {
                studentsWithoutTeachers,
                totalStudents: studentCount
            },
            challenges: {
                classesParticipating: classesWithChallengeParticipants,
                totalClasses,
                avgStudentsPerClass: avgStudentsPerClassInChallenge
            },
            knowledgeLevels: knowledgeLevels.map(kl => ({
                level: kl.knowledgeLvl,
                count: kl._count,
                total: studentsWithInfo
            }))
        });
    } catch (err) {
        console.error('Error fetching statistics:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Clean expired messages
router.post('/cleanExpiredMessages', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        const now = new Date();
        const expiredMessages = await prisma.messageGift.findMany({
            where: { giftExpiration: { lt: now } },
            select: { id: true }
        });

        for (const msg of expiredMessages) {
            const petGamesWithMessage = await prisma.petGame.findMany({
                where: { messaged: { some: { id: msg.id } } },
                select: { id: true }
            });

            for (const petGame of petGamesWithMessage) {
                await prisma.petGame.update({
                    where: { id: petGame.id },
                    data: { messaged: { disconnect: { id: msg.id } } }
                });
            }

            await prisma.messageGift.delete({ where: { id: msg.id } });
        }

        const orphanedDeleted = await prisma.messageGift.deleteMany({
            where: { petGames: { none: {} } }
        });

        res.json({ 
            success: true, 
            removed: expiredMessages.length + (orphanedDeleted.count || 0)
        });
    } catch (err) {
        console.error('Error cleaning messages:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Clean expired messages
router.post('/cleanExpiredMessages', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        const now = new Date();
        const expiredMessages = await prisma.messageGift.findMany({
            where: { giftExpiration: { lt: now } },
            select: { id: true }
        });

        for (const msg of expiredMessages) {
            const petGamesWithMessage = await prisma.petGame.findMany({
                where: { messaged: { some: { id: msg.id } } },
                select: { id: true }
            });

            for (const petGame of petGamesWithMessage) {
                await prisma.petGame.update({
                    where: { id: petGame.id },
                    data: { messaged: { disconnect: { id: msg.id } } }
                });
            }

            await prisma.messageGift.delete({ where: { id: msg.id } });
        }

        const orphanedDeleted = await prisma.messageGift.deleteMany({
            where: { petGames: { none: {} } }
        });

        res.json({ 
            success: true, 
            removed: expiredMessages.length + (orphanedDeleted.count || 0)
        });
    } catch (err) {
        console.error('Error cleaning messages:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});


// Get task archive statistics
router.get('/task-archives/stats', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        // Get total count
        const totalRecords = await prisma.taskResultArchive.count();
        
        if (totalRecords === 0) {
            return res.json({
                totalRecords: 0,
                earliestDate: null,
                sizeInBytes: 0,
                distribution: []
            });
        }
        
        // Get earliest date
        const earliest = await prisma.taskResultArchive.findFirst({
            orderBy: { date: 'asc' },
            select: { date: true }
        });
        
        // Get all records to calculate size and distribution
        const allRecords = await prisma.taskResultArchive.findMany({
            select: { 
                date: true,
                correct: true,
                mistakes: true,
                totalAnswers: true,
                answerRate: true
            }
        });
        
        // Calculate approximate size (rough estimate)
        // Each record: 4 integers (4 bytes each) + 1 float (4 bytes) + date (8 bytes) = ~28 bytes + overhead
        const estimatedSizePerRecord = 50; // bytes (including overhead)
        const totalSizeBytes = totalRecords * estimatedSizePerRecord;
        
        // Calculate distribution in 2-month intervals going back 24 months
        const now = new Date();
        const distribution = [];
        
        for (let months = 2; months <= 24; months += 2) {
            const cutoffDate = new Date(now);
            cutoffDate.setMonth(cutoffDate.getMonth() - months);
            
            const countWithinPeriod = allRecords.filter(
                record => new Date(record.date) >= cutoffDate
            ).length;
            
            const percentage = totalRecords > 0 
                ? Math.round((countWithinPeriod / totalRecords) * 100) 
                : 0;
            
            distribution.push({
                months,
                count: countWithinPeriod,
                percentage
            });
        }
        
        res.json({
            totalRecords,
            earliestDate: earliest.date,
            sizeInBytes: totalSizeBytes,
            sizeInKB: (totalSizeBytes / 1024).toFixed(2),
            sizeInMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
            distribution
        });
        
    } catch (err) {
        console.error('Error fetching task archive stats:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete old task archives
router.delete('/task-archives/cleanup', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { monthsToKeep } = req.body;
    
    if (!monthsToKeep || isNaN(monthsToKeep) || monthsToKeep < 1) {
        return res.status(400).json({ message: 'Invalid months value. Must be a positive number.' });
    }
    
    try {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(monthsToKeep));
        
        const deletedRecords = await prisma.taskResultArchive.deleteMany({
            where: {
                date: {
                    lt: cutoffDate
                }
            }
        });
        
        res.json({
            message: 'Old task archives deleted successfully',
            deletedCount: deletedRecords.count,
            cutoffDate,
            monthsKept: parseInt(monthsToKeep)
        });
        
    } catch (err) {
        console.error('Error deleting task archives:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get task library statistics
router.get('/task-library/stats', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        // Get total count of tasks in TaskLibrary
        const totalTasks = await prisma.taskLibrary.count();
        
        // Get count of tasks that are used (have TeacherTasks or TaskResultArchives)
        const usedTasks = await prisma.taskLibrary.findMany({
            where: {
                OR: [
                    { tasks: { some: {} } },
                    { taskResultArchives: { some: {} } }
                ]
            },
            select: { id: true }
        });
        
        const unusedTasks = totalTasks - usedTasks.length;
        
        res.json({
            totalTasks,
            usedTasks: usedTasks.length,
            unusedTasks
        });
        
    } catch (err) {
        console.error('Error fetching task library stats:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete unused tasks from TaskLibrary
router.delete('/task-library/cleanup', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    try {
        // Find all task library entries that have no TeacherTasks and no TaskResultArchives
        const unusedTasks = await prisma.taskLibrary.findMany({
            where: {
                AND: [
                    { tasks: { none: {} } },
                    { taskResultArchives: { none: {} } }
                ]
            },
            select: { id: true }
        });
        
        if (unusedTasks.length === 0) {
            return res.json({
                message: 'No unused tasks to delete',
                deletedCount: 0
            });
        }
        
        // Delete the unused tasks
        const deletedTasks = await prisma.taskLibrary.deleteMany({
            where: {
                id: {
                    in: unusedTasks.map(task => task.id)
                }
            }
        });
        
        res.json({
            message: 'Unused task library entries deleted successfully',
            deletedCount: deletedTasks.count
        });
        
    } catch (err) {
        console.error('Error cleaning up task library:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove pet from all users (bulk) - UPDATE
router.delete('/bulk/pet/:petId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { petId } = req.params;
    const { compensation } = req.body;

    if (!petId) {
        return res.status(400).json({ message: 'Pet ID required' });
    }

    const compensationAmount = compensation ? parseInt(compensation) : 0;

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true, money: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let petsRemoved = 0;
        let totalCompensation = 0;

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const pets = petAssets[0] || [];
            const originalLength = pets.length;
            const filteredPets = pets.filter(pet => pet[0] !== petId);

            let newMoney = Number(petGame.money);
            
            if (filteredPets.length < originalLength) {
                usersAffected++;
                petsRemoved += (originalLength - filteredPets.length);
                if (compensationAmount > 0) {
                    const removed = originalLength - filteredPets.length;
                    newMoney += compensationAmount * removed;
                    totalCompensation += compensationAmount * removed;
                }
            }

            petAssets[0] = filteredPets;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { 
                    petAssets: JSON.stringify(petAssets),
                    money: newMoney
                }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Pet removed from all students successfully',
            usersAffected,
            petsRemoved,
            petId,
            compensationPerPet: compensationAmount,
            totalCompensation
        });

    } catch (err) {
        console.error('Error removing pet from all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove skin from all users (bulk) - UPDATE
router.delete('/bulk/skin/:skinId', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { skinId } = req.params;
    const { compensation, backupSkinId, backupSkinIndex } = req.body;

    if (!skinId) {
        return res.status(400).json({ message: 'Skin ID required' });
    }

    const compensationAmount = compensation ? parseInt(compensation) : 0;
    const hasBackup = backupSkinId && backupSkinIndex !== undefined;

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true, money: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let skinsRemoved = 0;
        let totalCompensation = 0;
        let backupsAdded = 0;

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const pets = petAssets[0] || [];
            let userSkinsRemoved = 0;
            let userHadSkinRemoved = false;

            // Process each pet
            for (let i = 0; i < pets.length; i++) {
                const pet = pets[i];
                const skins = pet[1][1] || [];
                const originalSkinsLength = skins.length;
                
                // Filter out the target skin
                const filteredSkins = skins.filter(skin => skin[0] !== skinId);
                const removedCount = originalSkinsLength - filteredSkins.length;
                
                if (removedCount > 0) {
                    userSkinsRemoved += removedCount;
                    userHadSkinRemoved = true;
                    
                    // If no skins left and backup provided, add backup skin
                    if (filteredSkins.length === 0 && hasBackup) {
                        filteredSkins.push([backupSkinId, parseInt(backupSkinIndex), true]);
                        backupsAdded++;
                    }
                    
                    // Update the pet's skins
                    pets[i][1][1] = filteredSkins;
                }
            }

            let newMoney = Number(petGame.money);
            
            if (userHadSkinRemoved) {
                usersAffected++;
                skinsRemoved += userSkinsRemoved;
                if (compensationAmount > 0) {
                    newMoney += compensationAmount * userSkinsRemoved;
                    totalCompensation += compensationAmount * userSkinsRemoved;
                }
            }

            petAssets[0] = pets;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { 
                    petAssets: JSON.stringify(petAssets),
                    money: newMoney
                }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Skin removed from all students successfully',
            usersAffected,
            skinsRemoved,
            skinId,
            backupsAdded,
            compensationPerSkin: compensationAmount,
            totalCompensation,
            backupSkin: hasBackup ? { skinId: backupSkinId, skinIndex: backupSkinIndex } : null
        });

    } catch (err) {
        console.error('Error removing skin from all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add pet to all users (bulk)
router.post('/bulk/pet', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { petId, petName, defaultSkinId, defaultSkinIndex } = req.body;

    if (!petId || !petName) {
        return res.status(400).json({ 
            message: 'Pet ID and name required' 
        });
    }

    if (!defaultSkinId || defaultSkinIndex === undefined) {
        return res.status(400).json({ 
            message: 'Default skin ID and index required' 
        });
    }

    try {
        // Only get pet games for students
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let petsAdded = 0;
        let skippedDuplicates = 0;

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const pets = petAssets[0] || [];
            
            // Check if pet already exists
            if (pets.some(pet => pet[0] === petId)) {
                skippedDuplicates++;
                return prisma.petGame.update({
                    where: { id: petGame.id },
                    data: { petAssets: JSON.stringify(petAssets) }
                });
            }

            // Add new pet with default skin equipped
            pets.push([petId, [petName, [[defaultSkinId, parseInt(defaultSkinIndex), true]]]]);
            petAssets[0] = pets;
            usersAffected++;
            petsAdded++;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { petAssets: JSON.stringify(petAssets) }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Pet added to all students successfully',
            usersAffected,
            petsAdded,
            skippedDuplicates,
            pet: { petId, petName, defaultSkin: { skinId: defaultSkinId, skinIndex: defaultSkinIndex } }
        });

    } catch (err) {
        console.error('Error adding pet to all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add skin to all pets of specific type (bulk) - UPDATE
router.post('/bulk/skin', async (req, res) => {
    if (!await checkAdmin(req.userId, res)) return;
    
    const { targetPetId, skinId, skinIndex, equipped } = req.body;

    if (!targetPetId || !skinId || skinIndex === undefined) {
        return res.status(400).json({ 
            message: 'Target pet ID, skin ID, and skin index required' 
        });
    }

    try {
        const petGames = await prisma.petGame.findMany({
            where: {
                student: {
                    accType: 'student'
                }
            },
            select: { id: true, petAssets: true }
        });

        if (petGames.length === 0) {
            return res.status(404).json({ message: 'No student pet game entries found' });
        }

        let usersAffected = 0;
        let skinsAdded = 0;
        let skippedDuplicates = 0;
        let petsNotFound = 0;

        const updates = petGames.map(petGame => {
            let petAssets = [[], []];
            try {
                petAssets = JSON.parse(petGame.petAssets);
            } catch (e) {
                petAssets = [[], []];
            }

            const pets = petAssets[0] || [];
            let userHadSkinAdded = false;
            let foundTargetPet = false;

            // Process each pet
            for (let i = 0; i < pets.length; i++) {
                const pet = pets[i];
                
                // Only add skin to matching pet type
                if (pet[0] === targetPetId) {
                    foundTargetPet = true;
                    const skins = pet[1][1] || [];
                    
                    // Check if skin already exists
                    if (skins.some(skin => skin[0] === skinId)) {
                        skippedDuplicates++;
                        continue;
                    }
                    
                    // Add new skin
                    skins.push([skinId, parseInt(skinIndex), equipped ? true : false]);
                    pets[i][1][1] = skins;
                    skinsAdded++;
                    userHadSkinAdded = true;
                }
            }

            if (foundTargetPet && userHadSkinAdded) {
                usersAffected++;
            } else if (!foundTargetPet) {
                petsNotFound++;
            }

            petAssets[0] = pets;

            return prisma.petGame.update({
                where: { id: petGame.id },
                data: { petAssets: JSON.stringify(petAssets) }
            });
        });

        await prisma.$transaction(updates);

        res.json({ 
            message: 'Skin added to all matching pets successfully for students',
            usersAffected,
            skinsAdded,
            skippedDuplicates,
            petsNotFound,
            skin: { targetPetId, skinId, skinIndex, equipped }
        });

    } catch (err) {
        console.error('Error adding skin to all:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;