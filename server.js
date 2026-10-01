const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load default questions
let defaultQuestions = [];
try {
  const qData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  defaultQuestions = JSON.parse(qData);
} catch (e) {
  console.error("Error loading questions.json:", e);
}

// In-memory active rooms
const rooms = {};

function generatePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[pin]);
  return pin;
}

// REST endpoints for question management
app.get('/api/questions', (req, res) => {
  res.json(defaultQuestions);
});

app.post('/api/questions', (req, res) => {
  if (Array.isArray(req.body)) {
    defaultQuestions = req.body;
    fs.writeFileSync(path.join(__dirname, 'questions.json'), JSON.stringify(defaultQuestions, null, 2));
    res.json({ success: true, count: defaultQuestions.length });
  } else {
    res.status(400).json({ error: "Invalid questions payload" });
  }
});

// Socket.io handlers
io.on('connection', (socket) => {
  // HOST: Create Room
  socket.on('host:create_room', async (customQuestions) => {
    const pin = generatePin();
    const questionsToUse = (customQuestions && customQuestions.length > 0) ? customQuestions : defaultQuestions;

    rooms[pin] = {
      pin,
      hostId: socket.id,
      state: 'LOBBY', // LOBBY, QUESTION_ACTIVE, QUESTION_RESULT, LEADERBOARD, PODIUM_REVEAL, GAME_OVER
      podiumStep: 0, // 0: initial, 1: 3rd place, 2: 2nd place, 3: 1st place / champion
      currentQuestionIndex: -1,
      questions: questionsToUse,
      players: {}, // socketId -> { id, nickname, avatar, score, streak, lastAnswerCorrect, lastPointsGained, rank }
      answers: {}, // socketId -> { optionIndex, timeTakenMs, pointsEarned, isCorrect }
      timer: null,
      timeLeft: 0,
      questionStartTime: 0
    };

    socket.join(`room:${pin}`);
    socket.emit('host:room_created', { pin, questionsCount: questionsToUse.length });
    console.log(`[Room ${pin}] Created by host ${socket.id}`);
  });

  // PLAYER: Join Room
  socket.on('player:join', ({ pin, nickname, avatar }) => {
    const cleanPin = (pin || '').trim();
    const room = rooms[cleanPin];

    if (!room) {
      socket.emit('player:error', { message: 'Spiel-PIN nicht gefunden. Bitte überprüfe die Nummer auf dem Whiteboard!' });
      return;
    }

    if (room.state !== 'LOBBY') {
      socket.emit('player:error', { message: 'Das Spiel hat leider schon begonnen!' });
      return;
    }

    const trimmedNick = (nickname || 'Spieler').trim().slice(0, 16);
    let finalNick = trimmedNick;
    const existingNicks = Object.values(room.players).map(p => p.nickname.toLowerCase());
    let counter = 2;
    while (existingNicks.includes(finalNick.toLowerCase())) {
      finalNick = `${trimmedNick} (${counter++})`;
    }

    const playerObj = {
      id: socket.id,
      nickname: finalNick,
      avatar: avatar || '🤖',
      score: 0,
      streak: 0,
      lastAnswerCorrect: false,
      lastPointsGained: 0,
      rank: 1
    };

    room.players[socket.id] = playerObj;
    socket.join(`room:${cleanPin}`);
    socket.roomPin = cleanPin;

    socket.emit('player:joined', {
      pin: cleanPin,
      player: playerObj,
      roomState: room.state
    });

    // Notify host & players of updated roster
    io.to(`room:${cleanPin}`).emit('room:players_update', {
      players: Object.values(room.players),
      count: Object.keys(room.players).length
    });

    console.log(`[Room ${cleanPin}] Player joined: ${finalNick} (${avatar})`);
  });

  // PLAYER: Live Reaction Emojis (float on host screen!)
  socket.on('player:reaction', ({ emoji }) => {
    const pin = socket.roomPin;
    const room = rooms[pin];
    if (!room) return;

    const player = room.players[socket.id];
    const senderName = player ? player.nickname : '';
    const senderAvatar = player ? player.avatar : '✨';

    io.to(room.hostId).emit('room:live_reaction', {
      emoji: emoji || '❤️',
      senderName,
      senderAvatar,
      id: Math.random().toString(36).substring(2, 9)
    });
  });

  // HOST: Start Game
  socket.on('host:start_game', () => {
    const pin = getPinFromSocket(socket);
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;

    if (Object.keys(room.players).length === 0) {
      socket.emit('host:error', { message: 'Es muss mindestens ein Spieler beigetreten sein!' });
      return;
    }

    room.currentQuestionIndex = 0;
    startQuestion(room);
  });

  // HOST: Next Step (Leaderboard / Next Question / Start Podium)
  socket.on('host:next_step', () => {
    const pin = getPinFromSocket(socket);
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;

    if (room.state === 'QUESTION_RESULT') {
      // Show Leaderboard
      room.state = 'LEADERBOARD';
      const sortedLeaderboard = getSortedPlayers(room);
      io.to(`room:${pin}`).emit('game:leaderboard', {
        leaderboard: sortedLeaderboard,
        isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1,
        questionIndex: room.currentQuestionIndex + 1,
        totalQuestions: room.questions.length
      });
    } else if (room.state === 'LEADERBOARD') {
      if (room.currentQuestionIndex < room.questions.length - 1) {
        // Next Question
        room.currentQuestionIndex++;
        startQuestion(room);
      } else {
        // Start Cinematic Podium
        room.state = 'PODIUM_REVEAL';
        room.podiumStep = 1;
        const sorted = getSortedPlayers(room);
        io.to(`room:${pin}`).emit('game:podium_start', {
          podium: sorted.slice(0, 3),
          allPlayers: sorted,
          step: room.podiumStep
        });
      }
    }
  });

  // HOST: Podium Step Advancement (Step 1 -> 3rd place, Step 2 -> 2nd place, Step 3 -> 1st place champion)
  socket.on('host:podium_next', () => {
    const pin = getPinFromSocket(socket);
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;

    if (room.state === 'PODIUM_REVEAL') {
      room.podiumStep++;
      const sorted = getSortedPlayers(room);
      if (room.podiumStep > 3) {
        room.state = 'GAME_OVER';
        io.to(`room:${pin}`).emit('game:game_over', {
          podium: sorted.slice(0, 3),
          allPlayers: sorted
        });
      } else {
        io.to(`room:${pin}`).emit('game:podium_step', {
          step: room.podiumStep,
          podium: sorted.slice(0, 3)
        });
      }
    }
  });

  // PLAYER: Submit Answer
  socket.on('player:submit_answer', ({ optionIndex }) => {
    const pin = socket.roomPin;
    const room = rooms[pin];
    if (!room || room.state !== 'QUESTION_ACTIVE') return;

    const player = room.players[socket.id];
    if (!player) return;

    if (room.answers[socket.id] !== undefined) return; // Prevent double answer

    const currentQ = room.questions[room.currentQuestionIndex];
    const isCorrect = optionIndex === currentQ.correct;
    const durationTotal = (currentQ.time || 20) * 1000;
    const timeTakenMs = Math.max(0, Date.now() - room.questionStartTime);
    const timeRatio = Math.max(0, Math.min(1, 1 - (timeTakenMs / durationTotal)));

    let pointsEarned = 0;
    const multiplier = currentQ.isDoublePoints ? 2 : 1;

    if (isCorrect) {
      const basePoints = 1000 * multiplier;
      const speedBonus = Math.round((500 * timeRatio) * multiplier);
      const streakBonus = Math.min(300 * multiplier, player.streak * 50 * multiplier);
      pointsEarned = basePoints + speedBonus + streakBonus;

      player.score += pointsEarned;
      player.streak += 1;
      player.lastAnswerCorrect = true;
      player.lastPointsGained = pointsEarned;
    } else {
      player.streak = 0;
      player.lastAnswerCorrect = false;
      player.lastPointsGained = 0;
    }

    room.answers[socket.id] = {
      optionIndex,
      timeTakenMs,
      pointsEarned,
      isCorrect
    };

    // Confirm to player
    socket.emit('player:answer_confirmed', {
      optionIndex,
      isCorrect,
      pointsEarned,
      streak: player.streak
    });

    // Notify host
    const totalPlayers = Object.keys(room.players).length;
    const answeredCount = Object.keys(room.answers).length;

    io.to(room.hostId).emit('host:answer_received', {
      answeredCount,
      totalPlayers
    });

    // End question immediately if all answered
    if (answeredCount >= totalPlayers) {
      if (room.timer) clearInterval(room.timer);
      endQuestion(room);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const pin = socket.roomPin || getPinFromSocket(socket);
    const room = rooms[pin];
    if (!room) return;

    if (socket.id === room.hostId) {
      io.to(`room:${pin}`).emit('room:closed', { message: 'Der Moderator hat das Spiel beendet.' });
      if (room.timer) clearInterval(room.timer);
      delete rooms[pin];
      console.log(`[Room ${pin}] Closed due to host disconnect`);
    } else if (room.players[socket.id]) {
      const pName = room.players[socket.id].nickname;
      delete room.players[socket.id];
      delete room.answers[socket.id];
      io.to(`room:${pin}`).emit('room:players_update', {
        players: Object.values(room.players),
        count: Object.keys(room.players).length
      });
      console.log(`[Room ${pin}] Player left: ${pName}`);
    }
  });
});

function getPinFromSocket(socket) {
  for (const [pin, room] of Object.entries(rooms)) {
    if (room.hostId === socket.id) return pin;
  }
  return null;
}

function startQuestion(room) {
  room.state = 'QUESTION_ACTIVE';
  room.answers = {};
  const currentQ = room.questions[room.currentQuestionIndex];
  const qTime = currentQ.time || 20;
  room.timeLeft = qTime;
  room.questionStartTime = Date.now();

  const payload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    category: currentQ.category || 'KI & Web',
    question: currentQ.question,
    options: currentQ.options,
    time: qTime,
    isDoublePoints: !!currentQ.isDoublePoints
  };

  io.to(room.hostId).emit('game:question_host', payload);
  io.to(`room:${room.pin}`).emit('game:question_player', payload);

  if (room.timer) clearInterval(room.timer);

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(`room:${room.pin}`).emit('game:timer_tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endQuestion(room);
    }
  }, 1000);
}

function endQuestion(room) {
  room.state = 'QUESTION_RESULT';
  const currentQ = room.questions[room.currentQuestionIndex];

  const optionStats = [0, 0, 0, 0];
  for (const ans of Object.values(room.answers)) {
    if (ans.optionIndex >= 0 && ans.optionIndex < 4) {
      optionStats[ans.optionIndex]++;
    }
  }

  const sorted = getSortedPlayers(room);
  sorted.forEach((p, idx) => {
    if (room.players[p.id]) {
      room.players[p.id].rank = idx + 1;
    }
  });

  // Host payload
  io.to(room.hostId).emit('game:question_result_host', {
    correctIndex: currentQ.correct,
    explanation: currentQ.explanation,
    stats: optionStats,
    answeredCount: Object.keys(room.answers).length,
    totalPlayers: Object.keys(room.players).length
  });

  // Player payloads
  for (const [socketId, player] of Object.entries(room.players)) {
    const answer = room.answers[socketId];
    io.to(socketId).emit('game:question_result_player', {
      correctIndex: currentQ.correct,
      answered: !!answer,
      selectedOption: answer ? answer.optionIndex : null,
      isCorrect: answer ? answer.isCorrect : false,
      pointsEarned: answer ? answer.pointsEarned : 0,
      totalScore: player.score,
      streak: player.streak,
      rank: player.rank
    });
  }
}

function getSortedPlayers(room) {
  return Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({ ...p, rank: idx + 1 }));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Ölchen AI Quiz Game Server listening on http://0.0.0.0:${PORT}`);
});