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

// Synchronized Match Memory State
let activeMatch = {
  status: 'DRAFT',              // DRAFT, WAITING_ROOM, COUNTDOWN, QUESTION, REVEAL_ANSWER, ENDED, EMERGENCY_STOP
  currentQuestion: null,
  usedQuestionIds: [],
  answersReceived: new Map(),   // userId -> { selectedAnswer, timeTakenMs, isCorrect }
  connectedPlayers: new Map(),  // userId -> { socketId, name, playerId, online: boolean }
  questionStartMarker: 0,
  paused: false,
  pauseTimeMarker: 0,
  timeLimitMs: 15000,
  countdownSeconds: 3
};

function calculatePoints(isCorrect, timeTakenMs) {
  if (!isCorrect) return 0;
  if (timeTakenMs < 1000) return 15;      // < 1 sec
  if (timeTakenMs < 2000) return 13;      // 1-2 sec
  if (timeTakenMs < 3000) return 11;      // 2-3 sec
  return 10;                              // > 3 sec
}

// REST APIs
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, school, teamName, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const config = await prisma.quizState.findUnique({ where: { id: 'ACTIVE_QUIZ' } });
    if (config && config.registrationLocked) {
      return res.status(403).json({ error: 'Lobby registration is currently closed.' });
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
          countdownSeconds: 3,
          showSchool: true,
          showTeamName: true
        }
      });
    }
    return res.status(200).json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve quiz configuration' });
  }
});

app.post('/api/admin/quiz-config', async (req, res) => {
  try {
    const { title, timerSeconds, countdownSeconds, showSchool, showTeamName } = req.body;
    const config = await prisma.quizState.upsert({
      where: { id: 'ACTIVE_QUIZ' },
      update: { 
        title, 
        timerSeconds: parseInt(timerSeconds), 
        countdownSeconds: parseInt(countdownSeconds), 
        showSchool, 
        showTeamName 
      },
      create: { 
        id: 'ACTIVE_QUIZ', 
        title, 
        timerSeconds: parseInt(timerSeconds), 
        countdownSeconds: parseInt(countdownSeconds), 
        showSchool, 
        showTeamName 
      }
    });

    // Update in-memory parameters
    activeMatch.timeLimitMs = config.timerSeconds * 1000;
    activeMatch.countdownSeconds = config.countdownSeconds;

    return res.status(200).json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update configurations' });
  }
});

app.post('/api/admin/questions-import', async (req, res) => {
  try {
    const { questions } = req.body;
    await prisma.question.createMany({ data: questions });
    return res.status(201).json({ message: 'Questions imported' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed importing questions' });
  }
});

app.get('/api/admin/questions-list', async (req, res) => {
  try {
    const questions = await prisma.question.findMany();
    return res.status(200).json(questions);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get questions list' });
  }
});

// Socket.io Real-Time Handler
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
  const user = await prisma.user.findUnique({ where: { id: socket.userId } });
  if (user && user.role !== 'ADMIN') {
    activeMatch.connectedPlayers.set(socket.userId, {
      socketId: socket.id,
      name: user.name,
      playerId: user.playerId,
      online: true,
      status: 'Answering'
    });
  }

  socket.join('quiz-arena');
  if (socket.role === 'ADMIN') {
    socket.join('admin-control');
  }

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
    timerSeconds: activeMatch.timeLimitMs / 1000,
    countdownSeconds: activeMatch.countdownSeconds,
    paused: activeMatch.paused,
    totalRegistered: activeMatch.connectedPlayers.size,
    players: Array.from(activeMatch.connectedPlayers.values())
  });

  io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));

  socket.on('admin:lock-registration', async (isLocked) => {
    if (socket.role !== 'ADMIN') return;
    await prisma.quizState.update({ where: { id: 'ACTIVE_QUIZ' }, data: { registrationLocked: isLocked } });
    io.to('quiz-arena').emit('registration:status-changed', isLocked);
  });

  socket.on('admin:kick-player', ({ userId }) => {
    if (socket.role !== 'ADMIN') return;
    const player = activeMatch.connectedPlayers.get(userId);
    if (player) {
      io.to(player.socketId).emit('player:kicked');
      activeMatch.connectedPlayers.delete(userId);
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    }
  });

  socket.on('admin:open-lobby', () => {
    if (socket.role !== 'ADMIN') return;
    activeMatch.status = 'WAITING_ROOM';
    io.to('quiz-arena').emit('match:sync-state', { status: 'WAITING_ROOM', players: Array.from(activeMatch.connectedPlayers.values()) });
  });

  socket.on('admin:start-quiz', async () => {
    if (socket.role !== 'ADMIN') return;
    await prisma.quizState.update({ where: { id: 'ACTIVE_QUIZ' }, data: { registrationLocked: true } });
    activeMatch.status = 'COUNTDOWN';
    io.to('quiz-arena').emit('match:sync-state', { status: 'COUNTDOWN', countdownSeconds: activeMatch.countdownSeconds });
  });

  // Admin Manual / Random Question Launcher
  socket.on('admin:next-question', async (manualQuestionId) => {
    if (socket.role !== 'ADMIN') return;

    try {
      let question = null;
      if (manualQuestionId) {
        question = await prisma.question.findUnique({ where: { id: manualQuestionId } });
      } else {
        const unused = await prisma.question.findMany({ where: { id: { notIn: activeMatch.usedQuestionIds } } });
        if (unused.length === 0) {
          activeMatch.status = 'ENDED';
          io.to('quiz-arena').emit('match:sync-state', { status: 'ENDED' });
          return;
        }
        question = unused[Math.floor(Math.random() * unused.length)];
      }

      if (!question) return;

      activeMatch.currentQuestion = question;
      if (!activeMatch.usedQuestionIds.includes(question.id)) {
        activeMatch.usedQuestionIds.push(question.id);
      }
      activeMatch.status = 'QUESTION';
      activeMatch.paused = false;
      activeMatch.answersReceived.clear();
      activeMatch.questionStartMarker = Date.now();

      // Reset players state back to "Answering"
      activeMatch.connectedPlayers.forEach((p) => {
        p.status = 'Answering';
      });

      io.to('quiz-arena').emit('match:sync-state', {
        status: 'QUESTION',
        timerSeconds: activeMatch.timeLimitMs / 1000,
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
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    } catch (err) {
      console.error(err);
    }
  });

  // Pause / Resume Logic
  socket.on('admin:pause-quiz', () => {
    if (socket.role !== 'ADMIN' || activeMatch.status !== 'QUESTION' || activeMatch.paused) return;
    activeMatch.paused = true;
    activeMatch.pauseTimeMarker = Date.now() - activeMatch.questionStartMarker;
    io.to('quiz-arena').emit('match:paused');
  });

  socket.on('admin:resume-quiz', () => {
    if (socket.role !== 'ADMIN' || activeMatch.status !== 'QUESTION' || !activeMatch.paused) return;
    activeMatch.paused = false;
    activeMatch.questionStartMarker = Date.now() - activeMatch.pauseTimeMarker;
    const remainingSeconds = Math.max(0, (activeMatch.timeLimitMs - activeMatch.pauseTimeMarker) / 1000);
    io.to('quiz-arena').emit('match:resumed', { remainingSeconds });
  });

  // Emergency Stop / Freeze Frame
  socket.on('admin:stop-match', () => {
    if (socket.role !== 'ADMIN') return;
    activeMatch.status = 'EMERGENCY_STOP';
    io.to('quiz-arena').emit('match:sync-state', { status: 'EMERGENCY_STOP' });
  });

  // Answer Submission
  socket.on('quiz:submit-answer', async ({ questionId, selectedAnswer }) => {
    if (activeMatch.status !== 'QUESTION' || !activeMatch.currentQuestion || activeMatch.paused) return;
    if (activeMatch.currentQuestion.id !== questionId) return;
    if (activeMatch.answersReceived.has(socket.userId)) return;

    const timeTakenMs = Date.now() - activeMatch.questionStartMarker;
    const isCorrect = activeMatch.currentQuestion.correct === selectedAnswer;

    activeMatch.answersReceived.set(socket.userId, { selectedAnswer, timeTakenMs, isCorrect });

    // Update Player connection state to "Submitted"
    const p = activeMatch.connectedPlayers.get(socket.userId);
    if (p) {
      p.status = 'Submitted';
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    }

    // Process real-time stats distribution
    const distribution = { A: 0, B: 0, C: 0, D: 0, total: activeMatch.answersReceived.size };
    const fastestList = [];

    activeMatch.answersReceived.forEach((ans, uid) => {
      if (ans.selectedAnswer) distribution[ans.selectedAnswer]++;
      const pl = activeMatch.connectedPlayers.get(uid);
      if (pl && ans.isCorrect) {
        fastestList.push({ name: pl.name, time: (ans.timeTakenMs / 1000).toFixed(2) });
      }
    });

    fastestList.sort((a, b) => a.time - b.time);

    io.to('admin-control').emit('admin:live-stats', {
      distribution,
      fastest: fastestList.slice(0, 3)
    });
  });

  // End Question early / Reveal Correct Option
  socket.on('admin:end-question', async () => {
    if (socket.role !== 'ADMIN' || activeMatch.status !== 'QUESTION') return;
    activeMatch.status = 'REVEAL_ANSWER';

    const currentQuestion = activeMatch.currentQuestion;
    const players = Array.from(activeMatch.connectedPlayers.keys());

    for (const userId of players) {
      const submission = activeMatch.answersReceived.get(userId) || { selectedAnswer: null, timeTakenMs: activeMatch.timeLimitMs, isCorrect: false };
      const points = calculatePoints(submission.isCorrect, submission.timeTakenMs);

      await prisma.response.upsert({
        where: { userId_questionId: { userId, questionId: currentQuestion.id } },
        update: { selectedAnswer: submission.selectedAnswer, isCorrect: submission.isCorrect, timeTakenMs: submission.timeTakenMs, scoreEarned: points },
        create: { userId, questionId: currentQuestion.id, selectedAnswer: submission.selectedAnswer, isCorrect: submission.isCorrect, timeTakenMs: submission.timeTakenMs, scoreEarned: points }
      });
    }

    const leaderboards = await prisma.leaderboard.findMany({ orderBy: [{ score: 'desc' }, { totalTimeMs: 'asc' }] });
    const oldRanks = new Map();
    leaderboards.forEach((entry, idx) => {
      oldRanks.set(entry.userId, entry.currentRank || idx + 1);
    });

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

    io.to('quiz-arena').emit('quiz:reveal-answer', {
      correctAnswer: currentQuestion.correct,
      answers: Array.from(activeMatch.answersReceived.entries()).reduce((acc, [uid, val]) => {
        acc[uid] = val;
        return acc;
      }, {})
    });

    const broadcastList = freshLeaderboards.map(entry => ({
      userId: entry.userId,
      name: entry.user.name,
      playerId: entry.user.playerId,
      score: entry.score,
      accuracy: entry.accuracy,
      totalTimeMs: entry.totalTimeMs,
      movement: (entry.previousRank - entry.currentRank)
    }));

    io.to('quiz-arena').emit('leaderboard:update', broadcastList);
  });

  socket.on('admin:end-quiz', async () => {
    if (socket.role !== 'ADMIN') return;
    activeMatch.status = 'ENDED';

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
      player.status = 'Disconnected';
      io.to('admin-control').emit('admin:player-update', Array.from(activeMatch.connectedPlayers.values()));
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server executing at port: ${PORT}`);
});