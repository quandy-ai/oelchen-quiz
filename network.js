// Unified Network Layer: Supports both Socket.io (Node.js) and PeerJS (Zero-Server WebRTC Cloud)
class QuizNetwork {
  constructor(isHost = false) {
    this.isHost = isHost;
    this.mode = 'socketio'; // 'socketio' or 'peerjs'
    this.socket = null;
    this.peer = null;
    this.connections = {}; // for peerjs host: connId -> conn
    this.hostConn = null;  // for peerjs player
    this.eventListeners = {};
    this.pin = null;
    this.questions = [];
    this.players = {}; // peerjs host state
    this.answers = {}; // peerjs host state
    this.currentQIndex = -1;
    this.timer = null;
    this.timeLeft = 0;
    this.qStartTime = 0;
    this.podiumStep = 0;
  }

  on(event, callback) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(callback);
  }

  emitLocal(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(cb => cb(data));
    }
  }

  init() {
    // Check if Socket.io is available and connects
    if (typeof io !== 'undefined' && window.location.protocol.startsWith('http')) {
      try {
        this.socket = io({ timeout: 2500 });
        this.mode = 'socketio';

        // Forward all socket events to local listeners
        const events = [
          'host:room_created', 'host:error', 'player:error', 'player:joined',
          'room:players_update', 'room:live_reaction', 'game:question_host',
          'game:question_player', 'game:timer_tick', 'host:answer_received',
          'player:answer_confirmed', 'game:question_result_host',
          'game:question_result_player', 'game:leaderboard', 'game:podium_start',
          'game:podium_step', 'game:game_over', 'room:closed'
        ];

        events.forEach(evt => {
          this.socket.on(evt, data => this.emitLocal(evt, data));
        });

        this.socket.on('connect_error', () => {
          if (!this.socket.connected) {
            console.log('Socket.io server unreachable, switching to PeerJS Cloud mode...');
            this.mode = 'peerjs';
          }
        });
      } catch (e) {
        this.mode = 'peerjs';
      }
    } else {
      this.mode = 'peerjs';
    }
  }

  // ==========================================
  // HOST ACTIONS
  // ==========================================
  createRoom(questions) {
    this.questions = questions;

    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('host:create_room', questions);
      return;
    }

    // Fallback: PeerJS Cloud mode
    this.mode = 'peerjs';
    this.pin = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = `oelchen-pin-${this.pin}`;

    if (typeof Peer === 'undefined') {
      console.error('PeerJS library not loaded');
      return;
    }

    this.peer = new Peer(peerId);

    this.peer.on('open', (id) => {
      console.log(`[PeerJS Host] Room created with PIN: ${this.pin} (ID: ${id})`);
      this.emitLocal('host:room_created', { pin: this.pin, questionsCount: this.questions.length });
    });

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections[conn.peer] = conn;
      });

      conn.on('data', (data) => {
        this.handlePeerHostData(conn, data);
      });

      conn.on('close', () => {
        const p = this.players[conn.peer];
        delete this.connections[conn.peer];
        delete this.players[conn.peer];
        delete this.answers[conn.peer];
        this.broadcastPlayersUpdate();
      });
    });

    this.peer.on('error', (err) => {
      console.error('[PeerJS Host Error]:', err);
    });
  }

  startGame() {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('host:start_game');
      return;
    }

    // PeerJS host start
    if (Object.keys(this.players).length === 0) {
      alert('Es muss mindestens 1 Spieler beigetreten sein!');
      return;
    }

    this.currentQIndex = 0;
    this.peerStartQuestion();
  }

  nextStep() {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('host:next_step');
      return;
    }

    // PeerJS next step
    if (this.state === 'QUESTION_RESULT') {
      this.state = 'LEADERBOARD';
      const sorted = this.getPeerSortedPlayers();
      const payload = {
        leaderboard: sorted,
        isLastQuestion: this.currentQIndex >= this.questions.length - 1,
        questionIndex: this.currentQIndex + 1,
        totalQuestions: this.questions.length
      };
      this.emitLocal('game:leaderboard', payload);
      this.broadcastToPlayers('game:leaderboard', payload);
    } else if (this.state === 'LEADERBOARD') {
      if (this.currentQIndex < this.questions.length - 1) {
        this.currentQIndex++;
        this.peerStartQuestion();
      } else {
        // Start Podium
        this.state = 'PODIUM_REVEAL';
        this.podiumStep = 1;
        const sorted = this.getPeerSortedPlayers();
        const payload = {
          podium: sorted.slice(0, 3),
          allPlayers: sorted,
          step: 1
        };
        this.emitLocal('game:podium_start', payload);
        this.broadcastToPlayers('game:podium_start', payload);
      }
    }
  }

  podiumNext() {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('host:podium_next');
      return;
    }

    this.podiumStep++;
    const sorted = this.getPeerSortedPlayers();
    if (this.podiumStep > 3) {
      this.state = 'GAME_OVER';
      const payload = { podium: sorted.slice(0, 3), allPlayers: sorted };
      this.emitLocal('game:game_over', payload);
      this.broadcastToPlayers('game:game_over', payload);
    } else {
      const payload = { step: this.podiumStep, podium: sorted.slice(0, 3) };
      this.emitLocal('game:podium_step', payload);
      this.broadcastToPlayers('game:podium_step', payload);
    }
  }

  // ==========================================
  // PLAYER ACTIONS
  // ==========================================
  joinRoom(pin, nickname, avatar) {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('player:join', { pin, nickname, avatar });
      return;
    }

    // PeerJS Player join
    this.mode = 'peerjs';
    this.peer = new Peer();

    this.peer.on('open', (myPeerId) => {
      const hostPeerId = `oelchen-pin-${pin}`;
      this.hostConn = this.peer.connect(hostPeerId);

      this.hostConn.on('open', () => {
        this.hostConn.send({
          type: 'player:join',
          payload: { nickname, avatar }
        });
      });

      this.hostConn.on('data', (data) => {
        this.emitLocal(data.type, data.payload);
      });

      this.hostConn.on('close', () => {
        this.emitLocal('room:closed', { message: 'Verbindung zum Whiteboard beendet.' });
      });
    });

    this.peer.on('error', (err) => {
      this.emitLocal('player:error', { message: 'Spiel-PIN nicht gefunden oder Whiteboard offline!' });
    });
  }

  submitAnswer(optionIndex) {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('player:submit_answer', { optionIndex });
      return;
    }

    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'player:submit_answer',
        payload: { optionIndex }
      });
    }
  }

  sendReaction(emoji) {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit('player:reaction', { emoji });
      return;
    }

    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'player:reaction',
        payload: { emoji }
      });
    }
  }

  // ==========================================
  // PEERJS HOST HELPERS
  // ==========================================
  handlePeerHostData(conn, msg) {
    const type = msg.type;
    const payload = msg.payload;

    if (type === 'player:join') {
      const playerObj = {
        id: conn.peer,
        nickname: (payload.nickname || 'Spieler').slice(0, 15),
        avatar: payload.avatar || '🤖',
        score: 0,
        streak: 0,
        rank: 1
      };
      this.players[conn.peer] = playerObj;

      conn.send({
        type: 'player:joined',
        payload: { pin: this.pin, player: playerObj }
      });

      this.broadcastPlayersUpdate();
    } else if (type === 'player:submit_answer') {
      if (this.answers[conn.peer] !== undefined) return;
      const q = this.questions[this.currentQIndex];
      const isCorrect = payload.optionIndex === q.correct;
      const durationTotal = (q.time || 20) * 1000;
      const timeTakenMs = Math.max(0, Date.now() - this.qStartTime);
      const timeRatio = Math.max(0, Math.min(1, 1 - (timeTakenMs / durationTotal)));

      const mult = q.isDoublePoints ? 2 : 1;
      let pointsEarned = 0;
      const player = this.players[conn.peer];

      if (isCorrect) {
        pointsEarned = Math.round((1000 + (500 * timeRatio) + Math.min(300, (player ? player.streak : 0) * 50)) * mult);
        if (player) {
          player.score += pointsEarned;
          player.streak += 1;
        }
      } else {
        if (player) player.streak = 0;
      }

      this.answers[conn.peer] = { optionIndex: payload.optionIndex, pointsEarned, isCorrect };

      conn.send({
        type: 'player:answer_confirmed',
        payload: { optionIndex: payload.optionIndex, isCorrect, pointsEarned, streak: player ? player.streak : 0 }
      });

      const answeredCount = Object.keys(this.answers).length;
      const totalPlayers = Object.keys(this.players).length;

      this.emitLocal('host:answer_received', { answeredCount, totalPlayers });

      if (answeredCount >= totalPlayers) {
        if (this.timer) clearInterval(this.timer);
        this.peerEndQuestion();
      }
    } else if (type === 'player:reaction') {
      const player = this.players[conn.peer];
      this.emitLocal('room:live_reaction', {
        emoji: payload.emoji,
        senderName: player ? player.nickname : '',
        senderAvatar: player ? player.avatar : '✨'
      });
    }
  }

  broadcastPlayersUpdate() {
    const list = Object.values(this.players);
    const count = list.length;
    this.emitLocal('room:players_update', { players: list, count });
    this.broadcastToPlayers('room:players_update', { players: list, count });
  }

  broadcastToPlayers(type, payload) {
    Object.values(this.connections).forEach(conn => {
      if (conn && conn.open) {
        conn.send({ type, payload });
      }
    });
  }

  peerStartQuestion() {
    this.state = 'QUESTION_ACTIVE';
    this.answers = {};
    const q = this.questions[this.currentQIndex];
    const qTime = q.time || 20;
    this.timeLeft = qTime;
    this.qStartTime = Date.now();

    const payload = {
      questionIndex: this.currentQIndex,
      totalQuestions: this.questions.length,
      category: q.category || 'KI & Web',
      question: q.question,
      options: q.options,
      time: qTime,
      isDoublePoints: !!q.isDoublePoints
    };

    this.emitLocal('game:question_host', payload);
    this.broadcastToPlayers('game:question_player', payload);

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.emitLocal('game:timer_tick', { timeLeft: this.timeLeft });
      this.broadcastToPlayers('game:timer_tick', { timeLeft: this.timeLeft });

      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.peerEndQuestion();
      }
    }, 1000);
  }

  peerEndQuestion() {
    this.state = 'QUESTION_RESULT';
    const q = this.questions[this.currentQIndex];

    const stats = [0, 0, 0, 0];
    for (const ans of Object.values(this.answers)) {
      if (ans.optionIndex >= 0 && ans.optionIndex < 4) stats[ans.optionIndex]++;
    }

    const sorted = this.getPeerSortedPlayers();
    sorted.forEach((p, idx) => {
      if (this.players[p.id]) this.players[p.id].rank = idx + 1;
    });

    this.emitLocal('game:question_result_host', {
      correctIndex: q.correct,
      explanation: q.explanation,
      stats,
      answeredCount: Object.keys(this.answers).length,
      totalPlayers: Object.keys(this.players).length
    });

    for (const [peerId, player] of Object.entries(this.players)) {
      const conn = this.connections[peerId];
      const ans = this.answers[peerId];
      if (conn && conn.open) {
        conn.send({
          type: 'game:question_result_player',
          payload: {
            correctIndex: q.correct,
            answered: !!ans,
            selectedOption: ans ? ans.optionIndex : null,
            isCorrect: ans ? ans.isCorrect : false,
            pointsEarned: ans ? ans.pointsEarned : 0,
            totalScore: player.score,
            streak: player.streak,
            rank: player.rank
          }
        });
      }
    }
  }

  getPeerSortedPlayers() {
    return Object.values(this.players)
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
  }
}

window.QuizNetwork = QuizNetwork;
