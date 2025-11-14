import express from 'express'
import prisma from '../../prismaClient.js'

const router = express.Router()

router.post('/', async (req, res) => {
    try {
        const { students, group_name, task, taskDuration } = req.body;
        const MAX_TASKS_PER_STUDENT = 6;

        // 1️⃣ Check how many tasks each student already has
        const studentTaskCounts = await prisma.studentTaskAssignment.groupBy({
            by: ["studentId"],
            where: {
                studentId: { in: students.map(Number) }
            },
            _count: {
                studentId: true
            }
        });

        const studentsOverLimit = studentTaskCounts
            .filter(student => student._count.studentId >= MAX_TASKS_PER_STUDENT)
            .map(student => student.studentId);

        if (studentsOverLimit.length > 0) {
            return res.status(400).json({
                message: "Some students already have the maximum allowed tasks per student."
            });
        }

        // 2️⃣ Check if task already exists in TaskLibrary
        let taskLibraryEntry = await prisma.taskLibrary.findUnique({
            where: { taskInfo: task }
        });

        // 3️⃣ If not found, create it
        if (!taskLibraryEntry) {
            taskLibraryEntry = await prisma.taskLibrary.create({
                data: { taskInfo: task }
            });
        }

        // 4️⃣ Create new TeacherTask linked to TaskLibrary
        const teacherTask = await prisma.teacherTask.create({
            data: {
                teacherId: req.userId,
                group: group_name,
                task: task, // you can remove this if you only want to store in TaskLibrary
                duration: taskDuration,
                taskLibraryId: taskLibraryEntry.id
            }
        });

        // 5️⃣ Create assignments for each student
        const studentAssignments = students.map(studentId =>
            prisma.studentTaskAssignment.create({
                data: {
                    studentId: parseInt(studentId),
                    taskId: teacherTask.id,
                    status: false,
                    result: ''
                }
            })
        );

        await Promise.all(studentAssignments);

        res.status(200).json({ message: "Task set successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while setting the task.' });
    }
});


router.get('/', async (req, res) => {
    try {
        // Fetch all tasks assigned to the student
        const studentTasks = await prisma.studentTaskAssignment.findMany({
            where: {
                studentId: req.userId
            },
            include: {
                task: {
                    select: {
                        group: true,
                        duration: true,
                        taskLibrary: {   // 👈 Include the TaskLibrary relation
                            select: {
                                taskInfo: true
                            }
                        }
                    }
                }
            }
        });

        // Map tasks to return details
        const taskDetails = studentTasks.map(assignment => ({
            assignmentId: assignment.id,
            status: assignment.status,
            result: assignment.result,
            completionDate: assignment.completionDate,
            group: assignment.task.group,
            duration: assignment.task.duration,
            taskInstructions: assignment.task.taskLibrary.taskInfo  // 👈 Return from TaskLibrary
        }));

        res.json(taskDetails);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while fetching tasks.' });
    }
});



router.delete('/', async (req, res) => {
    try {
        // Get the list of task IDs to delete from the request body
        const tasksToDelete = req.body.tasks; // Expecting an array of task IDs

        // Convert items to integers
        const taskIdsToDelete = tasksToDelete.map(id => parseInt(id));

        // 1. Get the assignments that are going to be deleted (before actually deleting them)
        const assignmentsToDelete = await prisma.studentTaskAssignment.findMany({
            where: {
                id: { in: taskIdsToDelete }  // Get assignments with matching IDs
            }
        });

        // 2. Delete the assignments
        const deletedAssignments = await prisma.studentTaskAssignment.deleteMany({
            where: {
                id: { in: taskIdsToDelete }  // Delete assignments with matching IDs
            }
        });

        // 3. Gather unique taskIds from the deleted assignments
        const uniqueTaskIds = [...new Set(assignmentsToDelete.map(assignment => assignment.taskId))];

        // 4. Check for remaining assignments for the unique taskIds from the deleted entries
        const tasksWithRemainingAssignments = await prisma.studentTaskAssignment.findMany({
            where: {
                taskId: { in: uniqueTaskIds }
            },
            select: {
                taskId: true
            },
            distinct: ['taskId']  // Ensure we get unique taskIds with remaining assignments
        });

        // 5. Determine which taskIds have no remaining assignments
        const remainingTaskIds = tasksWithRemainingAssignments.map(task => task.taskId);
        const taskIdsWithNoAssignments = uniqueTaskIds.filter(taskId => !remainingTaskIds.includes(taskId));

        // 6. Delete TeacherTask entries for taskIds with no remaining assignments
        const deletedTasks = await prisma.teacherTask.deleteMany({
            where: {
                id: { in: taskIdsWithNoAssignments }
            }
        });

        // Respond with a success message
        res.json({
            message: 'Tasks and their associated assignments deleted successfully.',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting tasks.' });
    }
});



export default router