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
import dns from 'dns';
import net from 'net';

// === DIAGNOSTIC LOGGING ===
console.log('=== DATABASE CONNECTION DIAGNOSTICS ===');
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL host:', process.env.DATABASE_URL?.match(/@([^:\/]+)/)?.[1]);

// Check DNS resolution
dns.resolve4('pg-377d6e2a-sudedultauth-69f4.c.aivencloud.com', (err, addresses) => {
  console.log('DNS Resolution:', err ? `ERROR: ${err.message}` : `SUCCESS: ${addresses}`);
});

// Check raw TCP connection
const socket = net.createConnection({
  host: 'pg-377d6e2a-sudedultauth-69f4.c.aivencloud.com',
  port: 25113,
  timeout: 10000
});

socket.on('connect', () => {
  console.log('✓ TCP connection to Aiven: SUCCESS');
  socket.end();
});

socket.on('timeout', () => {
  console.log('✗ TCP connection to Aiven: TIMEOUT');
  socket.destroy();
});

socket.on('error', (err) => {
  console.log('✗ TCP connection to Aiven ERROR:', err.message);
});

console.log('=== END DIAGNOSTICS ===\n');
// === END DIAGNOSTIC LOGGING ===

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