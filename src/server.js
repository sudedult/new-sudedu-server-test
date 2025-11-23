import express from 'express'
import authMiddleware from './middleware/authMiddleware.js';
import authRoutes from './routes/authRoutes.js'
import studentRoutes from './routes/studentRoutes.js'
import tasksRoutes from './routes/tasksRoutes.js'
import resultsRoutes from './routes/resultsRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import petGameRoutes from './routes/petGameRoutes.js'
import classRoutes from './routes/classRoutes.js'
import cors from 'cors'

const app = express();
const PORT = process.env.PORT || 5003;

app.use(cors())
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/students', authMiddleware, studentRoutes);
app.use('/tasks', authMiddleware, tasksRoutes);
app.use('/results', authMiddleware, resultsRoutes);
app.use('/admin', authMiddleware, adminRoutes);
app.use('/petGame', authMiddleware, petGameRoutes);
app.use('/class', authMiddleware, classRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});