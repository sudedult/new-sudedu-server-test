import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router()

router.post('/', async (req, res) => {
    try {
        const { taskId, results } = req.body;

        const studentTaskAssignment = await prisma.studentTaskAssignment.findUnique({
            where: {
                id: taskId
            }
        });

        if (!studentTaskAssignment) {
            return res.status(404).json({ error: 'Student task assignment not found' });
        }

        const updatedAssignment = await prisma.studentTaskAssignment.update({
            where: {
                id: studentTaskAssignment.id
            },
            data: {
                status: true,
                result: results,
                completionDate: new Date() // add the timestamp here
            }
        });

        res.json(updatedAssignment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the student task assignment' });
    }
});


export default router