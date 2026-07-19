const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'NEUTRON_SECRET_CORE_2025';
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Cache map of client-session trackers for latency verification
// Format: { [userId]: { questionId, sentTime } }
const activeUserTimerCache = new Map();

// Helper: Custom Tie-Breaker Calculation
function calculateCompoundScore(score, accuracy, totalTimeMs) {
  const MAX_TIME_CEILING = 99999999; // ~27 hours
  const safeTime = Math.max(0, MAX_TIME_CEILING - totalTimeMs);
  return (score * 1e11) + (accuracy * 1e6) + safeTime;
}

// 1. HTTP Endpoint: Participant Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, school, teamName, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Ensure Unique Short Player ID
    let playerId = '';
    let duplicate = true;
    while (duplicate) {
      playerId = `NR-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await prisma.user.findUnique({ where: { playerId } });
      if (!existing) duplicate = false;
    }

    const user = await prisma.user.create({
      data: { name, email, school, teamName, phone, playerId, role: 'PLAYER' }
    });

    // Create placeholder entry on leaderboard
    await prisma.leaderboard.create({
      data: { userId: user.id, score: 0, accuracy: 0.0, totalTimeMs: 0 }
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal system error during registration' });
  }
});

// 2. HTTP Endpoint: Get Current Active Quiz Settings (including dynamic field toggles)
app.get('/api/quiz-config', async (req, res) => {
  try {
    let config = await prisma.quizState.findUnique({ where: { id: 'ACTIVE_QUIZ' } });
    if (!config) {
      config = await prisma.quizState.create({
        data: { 
          id: 'ACTIVE_QUIZ', 
          title: 'Neutron Rush Championship', 
          status: 'DRAFT', 
          timerSeconds: 15,
          rulesText: "Total questions: 10\nTime per question: 15 seconds\nPositive marking: +10\nNegative marking: 0\nNo backtracking\nAuto submission on timeout",
          showSchool: true,
          showTeamName: true
        }
      });
    }
    return res.status(200).json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve quiz configurations' });
  }
});

// 3. HTTP Endpoint: Update Quiz Config & Rules (Admin Only)
app.post('/api/admin/quiz-config', async (req, res) => {
  try {
    const { 
      title, 
      timerSeconds, 
      rulesText, 
      totalQuestions, 
      positiveMarks, 
      negativeMarks, 
      allowBacktracking, 
      autoSubmit,
      showSchool,
      showTeamName
    } = req.body;
    
    const config = await prisma.quizState.upsert({
      where: { id: 'ACTIVE_QUIZ' },
      update: { 
        title, 
        timerSeconds: parseInt(timerSeconds), 
        rulesText,
        totalQuestions: parseInt(totalQuestions),
        positiveMarks: parseInt(positiveMarks),
        negativeMarks: parseInt(negativeMarks),
        allowBacktracking: !!allowBacktracking,
        autoSubmit: !!autoSubmit,
        showSchool: showSchool !== undefined ? !!showSchool : true,
        showTeamName: showTeamName !== undefined ? !!showTeamName : true
      },
      create: { 
        id: 'ACTIVE_QUIZ',
        title, 
        timerSeconds: parseInt(timerSeconds), 
        rulesText,
        totalQuestions: parseInt(totalQuestions),
        positiveMarks: parseInt(positiveMarks),
        negativeMarks: parseInt(negativeMarks),
        allowBacktracking: !!allowBacktracking,
        autoSubmit: !!autoSubmit,
        showSchool: showSchool !== undefined ? !!showSchool : true,
        showTeamName: showTeamName !== undefined ? !!showTeamName : true
      }
    });

    return res.status(200).json(config);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save configuration settings' });
  }
});

// 4. HTTP Endpoint: Retrieve Questions Pool (Admin/Standard)
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await prisma.question.findMany({
      select: {
        id: true,
        question: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        category: true,
        difficulty: true
      }
    });
    return res.status(200).json(questions);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to pool questions' });
  }
});

// 5. HTTP Endpoint: Admin Questions Seed Upload (JSON Array)
app.post('/api/admin/questions-import', async (req, res) => {
  try {
    const { questions } = req.body; // Array of question objects
    if (!Array.isArray(questions)) return res.status(400).json({ error: 'Requires array input' });

    await prisma.question.createMany({ data: questions });
    return res.status(201).json({ message: `Successfully imported ${questions.length} questions` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed importing data' });
  }
});

// 6. Socket.io Logic: Real-time Orchestration
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication failed: Missing token'));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication failed: Invalid signature'));
    socket.userId = decoded.userId;
    socket.role = decoded.role;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`Socket Client active: ${socket.userId}`);

  // Room placement based on profile
  socket.join('quiz-arena');
  if (socket.role === 'ADMIN') {
    socket.join('admin-control');
  }

  // Admin Broadcast: Start State Change
  socket.on('admin:update-status', async (newStatus) => {
    if (socket.role !== 'ADMIN') return;
    const updated = await prisma.quizState.upsert({
      where: { id: 'ACTIVE_QUIZ' },
      update: { status: newStatus },
      create: { id: 'ACTIVE_QUIZ', status: newStatus }
    });
    io.to('quiz-arena').emit('quiz:status-changed', updated.status);
  });

  // Quiz Interaction: Client Requests Question / Logs Server Start Marker
  socket.on('quiz:request-question', ({ questionId }) => {
    activeUserTimerCache.set(socket.userId, {
      questionId,
      sentTime: Date.now()
    });
  });

  // Quiz Submission: Scoring, Real-time Latency Validation, & Tie-break Calculation
  socket.on('quiz:submit-answer', async (payload) => {
    const { questionId, selectedAnswer } = payload;
    const timeNow = Date.now();
    const cache = activeUserTimerCache.get(socket.userId);

    let serverTimeTaken = 15000; // Default limit fallback
    if (cache && cache.questionId === questionId) {
      serverTimeTaken = timeNow - cache.sentTime;
      activeUserTimerCache.delete(socket.userId);
    }

    try {
      const question = await prisma.question.findUnique({ where: { id: questionId } });
      const config = await prisma.quizState.findUnique({ where: { id: 'ACTIVE_QUIZ' } });
      const limitMs = (config ? config.timerSeconds : 15) * 1000;

      // Real-Time Anti-Cheat Latency Filter (2s grace limit)
      if (serverTimeTaken > limitMs + 2000) {
        socket.emit('quiz:security-alert', { error: 'Submission rejected: Time limit exceeded.' });
        return;
      }

      // Read values dynamically from the configuration
      const plusMarks = question ? question.marks : (config ? config.positiveMarks : 10);
      const minusMarks = question ? question.negativeMarks : (config ? config.negativeMarks : 0);

      const isCorrect = question ? question.correct === selectedAnswer : false;
      const scoreAdded = isCorrect ? plusMarks : -minusMarks;

      // Record Response inside DB transactionally
      await prisma.response.upsert({
        where: { userId_questionId: { userId: socket.userId, questionId } },
        update: { selectedAnswer, isCorrect, timeTakenMs: serverTimeTaken },
        create: { userId: socket.userId, questionId, selectedAnswer, isCorrect, timeTakenMs: serverTimeTaken }
      });

      // Calculate New Metrics
      const allResponses = await prisma.response.findMany({ where: { userId: socket.userId } });
      const correctAnswers = allResponses.filter(r => r.isCorrect);
      
      const newScore = Math.max(0, allResponses.reduce((acc, curr) => {
        const points = curr.isCorrect ? plusMarks : 0;
        return acc + points;
      }, 0));

      const newAccuracy = allResponses.length > 0 ? (correctAnswers.length / allResponses.length) * 100 : 0;
      const newTotalTime = allResponses.reduce((acc, curr) => acc + curr.timeTakenMs, 0);

      await prisma.leaderboard.upsert({
        where: { userId: socket.userId },
        update: { score: newScore, accuracy: newAccuracy, totalTimeMs: newTotalTime },
        create: { userId: socket.userId, score: newScore, accuracy: newAccuracy, totalTimeMs: newTotalTime }
      });

      socket.emit('quiz:ack', { score: newScore, isCorrect });

      // Live leaderboard calculation & sorting broadcast
      if (config && config.status !== 'FROZEN') {
        const fullLeaderboard = await prisma.leaderboard.findMany({
          include: { user: { select: { name: true, playerId: true } } }
        });

        const sortedLeaderboard = fullLeaderboard
          .map(entry => ({
            userId: entry.userId,
            name: entry.user.name,
            playerId: entry.user.playerId,
            score: entry.score,
            accuracy: entry.accuracy,
            totalTimeMs: entry.totalTimeMs,
            compound: calculateCompoundScore(entry.score, entry.accuracy, entry.totalTimeMs)
          }))
          .sort((a, b) => b.compound - a.compound);

        io.to('quiz-arena').emit('leaderboard:update', sortedLeaderboard.slice(0, 10));
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    activeUserTimerCache.delete(socket.userId);
    console.log(`Socket connection closed: ${socket.userId}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server executing at port: ${PORT}`);
});