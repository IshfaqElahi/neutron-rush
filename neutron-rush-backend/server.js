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

// Real-Time Memory State for Synchronous Multiplayer
let activeMatch = {
  status: 'DRAFT',              // DRAFT, WAITING_ROOM, COUNTDOWN, QUESTION, REVEAL_ANSWER, ENDED
  currentQuestion: null,
  usedQuestionIds: [],
  answersReceived: new Map(),   // userId -> { option, timeTakenMs, isCorrect }
  connectedPlayers: new Map(),  // userId -> { socketId, name, playerId, online: boolean }
  questionStartMarker: 0
};

// Speed-Proportional Point Allocation Table
function calculatePoints(isCorrect, timeTakenMs) {
  if (!isCorrect) return 0;
  if (timeTakenMs < 1000) return 15;      // < 1 sec
  if (timeTakenMs < 2000) return 13;      // 1-2 sec
  if (timeTakenMs < 3000) return 11;      // 2-3 sec
  return 10;                              // > 3 sec (standard correct score)
}

// REST API endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, school, teamName, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const config = await prisma.quizState.findUnique({ where: { id: 'ACTIVE_QUIZ' } });
    if (config && config.registrationLocked) {
      return res.status(403).json({ error: 'Registration is closed for this active session.' });
    }

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

    await prisma.leaderboard.create({
      data: { userId: user.id, score: 0, accuracy: 0.0, totalTimeMs: 0 }
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal system error' });
  }
});

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

app.post('/api/admin/quiz-config', async (req, res) => {
  try {
    const { title, timerSeconds, showSchool, showTeamName } = req.body;
    const config = await prisma.quizState.upsert({
      where: { id: 'ACTIVE_QUIZ' },
      update: { title, timerSeconds: parseInt(timerSeconds), showSchool, showTeamName },
      create: { id: 'ACTIVE_QUIZ', title, timerSeconds: parseInt(timerSeconds), showSchool, showTeamName }
    });
    return res.status(200).json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/api/admin/questions-import', async (req, res) => {
  try {
    const { questions } = req.body;
    await prisma.question.createMany({ data: questions });
    return res.status(201).json({ message: 'Import completed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed importing data' });
  }
});

// Socket.io Middlewares & Handlers
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Missing token'));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token signature'));
    socket.userId = decoded.userId;
    socket.role = decoded.role;
    next();
  });
});

io.on('connection', async (socket) => {
  // Determine Profile Details and Add to Match Tracking
  const user = await prisma.user.findUnique({ where: { id: socket.userId } });
  if (user && user.role !== 'ADMIN') {
    activeMatch.connectedPlayers.set(socket.userId, {
      socketId: socket.id,
      name: user.name,
      playerId: user.playerId,
      online: true
    });
  }

  socket.join('quiz-arena');
  if (socket.role === 'ADMIN') {
    socket.join('admin-control');
  }

  // Push immediate state synchronization on connection
  socket.emit('match:sync-state', {
    status: activeMatch.status,
    currentQuestion: activeMatch.currentQuestion ? {
      id: activeMatch.currentQuestion.id,
      question: activeMatch.currentQuestion.question,
      optionA: activeMatch.currentQuestion.optionA,
      optionB: activeMatch.currentQuestion.optionB,
      optionC: activeMatch.currentQuestion.optionC,
      optionD: activeMatch.currentQuestion.optionD,
      category: activeMatch.currentQuestion.category
    } : null,
    totalRegistered: activeMatch.connectedPlayers.size,
    players: Array.from(activeMatch.connectedPlayers.values())
  });

  io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));

  // Admin: Toggle Registration Lock
  socket.on('admin:lock-registration', async (isLocked) => {
    if (socket.role !== 'ADMIN') return;
    await prisma.quizState.update({ where: { id: 'ACTIVE_QUIZ' }, data: { registrationLocked: isLocked } });
    io.to('quiz-arena').emit('registration:status-changed', isLocked);
    addLog(`Registration lock state adjusted to: ${isLocked}`);
  });

  // Admin: Remove/Kick Player
  socket.on('admin:kick-player', ({ userId }) => {
    if (socket.role !== 'ADMIN') return;
    const player = activeMatch.connectedPlayers.get(userId);
    if (player) {
      io.to(player.socketId).emit('player:kicked');
      activeMatch.connectedPlayers.delete(userId);
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    }
  });

  // Admin: WAITING_ROOM state initiator
  socket.on('admin:open-lobby', async () => {
    if (socket.role !== 'ADMIN') return;
    activeMatch.status = 'WAITING_ROOM';
    io.to('quiz-arena').emit('match:sync-state', { status: 'WAITING_ROOM', players: Array.from(activeMatch.connectedPlayers.values()) });
  });

  // Admin: Initiate Countdown Sequence
  socket.on('admin:start-quiz', async () => {
    if (socket.role !== 'ADMIN') return;
    
    // Automatically close registration on launch
    await prisma.quizState.update({ where: { id: 'ACTIVE_QUIZ' }, data: { registrationLocked: true } });
    
    activeMatch.status = 'COUNTDOWN';
    io.to('quiz-arena').emit('match:sync-state', { status: 'COUNTDOWN' });
  });

  // Admin: Pull next random question
  socket.on('admin:next-question', async () => {
    if (socket.role !== 'ADMIN') return;

    try {
      const unusedQuestions = await prisma.question.findMany({
        where: { id: { notIn: activeMatch.usedQuestionIds } }
      });

      if (unusedQuestions.length === 0) {
        activeMatch.status = 'ENDED';
        io.to('quiz-arena').emit('match:sync-state', { status: 'ENDED' });
        return;
      }

      const randomIndex = Math.floor(Math.random() * unusedQuestions.length);
      const question = unusedQuestions[randomIndex];

      activeMatch.currentQuestion = question;
      activeMatch.usedQuestionIds.push(question.id);
      activeMatch.status = 'QUESTION';
      activeMatch.answersReceived.clear();
      activeMatch.questionStartMarker = Date.now();

      io.to('quiz-arena').emit('match:sync-state', {
        status: 'QUESTION',
        currentQuestion: {
          id: question.id,
          question: question.question,
          optionA: question.optionA,
          optionB: question.optionB,
          optionC: question.optionC,
          optionD: question.optionD,
          category: question.category
        }
      });
    } catch (err) {
      console.error(err);
    }
  });

  // Player: Answer Submission
  socket.on('quiz:submit-answer', async ({ questionId, selectedAnswer }) => {
    if (activeMatch.status !== 'QUESTION' || !activeMatch.currentQuestion) return;
    if (activeMatch.currentQuestion.id !== questionId) return;
    if (activeMatch.answersReceived.has(socket.userId)) return; // No duplicate submissions

    const timeTakenMs = Date.now() - activeMatch.questionStartMarker;
    const isCorrect = activeMatch.currentQuestion.correct === selectedAnswer;

    activeMatch.answersReceived.set(socket.userId, {
      selectedAnswer,
      timeTakenMs,
      isCorrect
    });

    // Compute live option distribution metrics for Admin
    const distribution = { A: 0, B: 0, C: 0, D: 0, total: activeMatch.answersReceived.size };
    const fastestList = [];

    activeMatch.answersReceived.forEach((ans, uid) => {
      if (ans.selectedAnswer) {
        distribution[ans.selectedAnswer]++;
      }
      const p = activeMatch.connectedPlayers.get(uid);
      if (p && ans.isCorrect) {
        fastestList.push({ name: p.name, time: (ans.timeTakenMs / 1000).toFixed(2) });
      }
    });

    // Sort fastest correct answers
    fastestList.sort((a, b) => a.time - b.time);

    io.to('admin-control').emit('admin:live-stats', {
      distribution,
      fastest: fastestList.slice(0, 3)
    });
  });

  // Admin: Terminate current question timer & calculate scoring
  socket.on('admin:end-question', async () => {
    if (socket.role !== 'ADMIN' || activeMatch.status !== 'QUESTION') return;
    activeMatch.status = 'REVEAL_ANSWER';

    const currentQuestion = activeMatch.currentQuestion;

    // Process database submissions transactionally for all registered players
    const players = Array.from(activeMatch.connectedPlayers.keys());
    for (const userId of players) {
      const submission = activeMatch.answersReceived.get(userId) || { selectedAnswer: null, timeTakenMs: 15000, isCorrect: false };
      const points = calculatePoints(submission.isCorrect, submission.timeTakenMs);

      await prisma.response.upsert({
        where: { userId_questionId: { userId, questionId: currentQuestion.id } },
        update: { selectedAnswer: submission.selectedAnswer, isCorrect: submission.isCorrect, timeTakenMs: submission.timeTakenMs, scoreEarned: points },
        create: { userId, questionId: currentQuestion.id, selectedAnswer: submission.selectedAnswer, isCorrect: submission.isCorrect, timeTakenMs: submission.timeTakenMs, scoreEarned: points }
      });
    }

    // Refresh, Rank, and calculate relative positioning shift index
    const leaderboards = await prisma.leaderboard.findMany({ orderBy: [{ score: 'desc' }, { totalTimeMs: 'asc' }] });
    
    // Store old ranks
    const oldRanks = new Map();
    leaderboards.forEach((entry, idx) => {
      oldRanks.set(entry.userId, entry.currentRank || idx + 1);
    });

    // Update with newly integrated points
    for (const userId of players) {
      const allResponses = await prisma.response.findMany({ where: { userId } });
      const correctAnswers = allResponses.filter(r => r.isCorrect);
      
      const newScore = allResponses.reduce((acc, curr) => acc + curr.scoreEarned, 0);
      const newAccuracy = allResponses.length > 0 ? (correctAnswers.length / allResponses.length) * 100 : 0;
      const newTotalTime = allResponses.reduce((acc, curr) => acc + curr.timeTakenMs, 0);

      await prisma.leaderboard.upsert({
        where: { userId },
        update: { score: newScore, accuracy: newAccuracy, totalTimeMs: newTotalTime },
        create: { userId, score: newScore, accuracy: newAccuracy, totalTimeMs: newTotalTime }
      });
    }

    // Re-index sorted positions to calculate rank offsets (Movement indicator)
    const freshLeaderboards = await prisma.leaderboard.findMany({
      include: { user: { select: { name: true, playerId: true } } },
      orderBy: [{ score: 'desc' }, { totalTimeMs: 'asc' }]
    });

    for (let i = 0; i < freshLeaderboards.length; i++) {
      const entry = freshLeaderboards[i];
      const prevRank = oldRanks.get(entry.userId) || i + 1;
      const currentRank = i + 1;

      await prisma.leaderboard.update({
        where: { userId: entry.userId },
        data: { previousRank: prevRank, currentRank }
      });
    }

    // Broadcast Reveal event
    io.to('quiz-arena').emit('quiz:reveal-answer', {
      correctAnswer: currentQuestion.correct,
      explanation: currentQuestion.explanation,
      answers: Array.from(activeMatch.answersReceived.entries()).reduce((acc, [uid, val]) => {
        acc[uid] = val;
        return acc;
      }, {})
    });

    // Broadcast updated ranking shifts
    const broadcastList = freshLeaderboards.map(entry => ({
      userId: entry.userId,
      name: entry.user.name,
      playerId: entry.user.playerId,
      score: entry.score,
      accuracy: entry.accuracy,
      totalTimeMs: entry.totalTimeMs,
      movement: (entry.previousRank - entry.currentRank) // positive means up
    }));

    io.to('quiz-arena').emit('leaderboard:update', broadcastList);
  });

  // Admin: Complete Quiz and compile final metrics
  socket.on('admin:end-quiz', async () => {
    if (socket.role !== 'ADMIN') return;
    activeMatch.status = 'ENDED';

    // Compile analytics metrics
    const responses = await prisma.response.findMany({ include: { user: { select: { name: true } } } });
    const correctResponses = responses.filter(r => r.isCorrect);

    let fastestResponse = null;
    if (correctResponses.length > 0) {
      const fastest = correctResponses.reduce((min, r) => r.timeTakenMs < min.timeTakenMs ? r : min, correctResponses[0]);
      fastestResponse = { name: fastest.user.name, time: (fastest.timeTakenMs / 1000).toFixed(2) };
    }

    const averageTime = responses.length > 0 ? (responses.reduce((sum, r) => sum + r.timeTakenMs, 0) / responses.length / 1000).toFixed(2) : 0;

    io.to('quiz-arena').emit('match:sync-state', {
      status: 'ENDED',
      analytics: {
        totalCorrect: correctResponses.length,
        fastestAnswer: fastestResponse,
        averageResponseTime: averageTime
      }
    });
  });

  socket.on('disconnect', () => {
    const player = activeMatch.connectedPlayers.get(socket.userId);
    if (player) {
      player.online = false;
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    }
  });
});

function addLog(msg) {
  console.log(`[LOG] ${msg}`);
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server executing at port: ${PORT}`);
});