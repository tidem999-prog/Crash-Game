const { query } = require('./db');

let io;

const KOTH_ENTRY_FEE = 150.00;
const PLATFORM_FEE_PCT = 0.10; // 10%
const ROUND_WAIT_MS = 10000; // 10 seconds to pick a door
const LOBBY_WAIT_MS = 20000; // 20 seconds waiting before starting a pending room

// state structure
// activeRooms: { 
//   roomId: {
//     id: roomId,
//     status: 'lobby' | 'playing' | 'finished',
//     potTotal: 0,
//     round: 0,
//     players: { socketId: { id: userId, email: string, alive: true, currentChoice: null } },
//     doors: [], // Array of safe/trap indicators
//     timer: null,
//     timeLeft: 0
//   }
// }
const activeRooms = {};
const activePlayers = {}; // map socketId -> roomId

const logAudit = async (userId, gameId, amount, action) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'KOTH', $3, $4)`,
      [userId, gameId, amount, action]
    );
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

const initKothEngine = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    
    // Create new KOTH Room
    socket.on('koth_create_room', async (payload) => {
      const { userId, email } = payload;
      if (!userId) return socket.emit('koth_error', 'Utilisateur non valide.');

      try {
        await query('BEGIN');
        
        // Check balance
        const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        let balance = parseFloat(userRes.rows[0].balance);
        if (balance < KOTH_ENTRY_FEE) throw new Error('Solde insuffisant (150 HTG requis).');

        // Escrow deduction
        await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [KOTH_ENTRY_FEE, userId]);
        
        const potContribution = KOTH_ENTRY_FEE * (1 - PLATFORM_FEE_PCT); // 135 HTG
        
        // Insert Room
        const roomRes = await query(
          `INSERT INTO koth_rooms (status, entry_fee, pot_total) VALUES ('pending', $1, $2) RETURNING id`,
          [KOTH_ENTRY_FEE, potContribution]
        );
        const roomId = roomRes.rows[0].id;
        
        await logAudit(userId, roomId, KOTH_ENTRY_FEE, 'JOIN_ESCROW_DEDUCTION');
        
        await query('COMMIT');

        // Setup room state in memory
        activeRooms[roomId] = {
          id: roomId,
          status: 'lobby',
          potTotal: potContribution,
          round: 0,
          players: {
            [socket.id]: { id: userId, email, alive: true, currentChoice: null }
          },
          doors: [],
          timer: null,
          timeLeft: LOBBY_WAIT_MS / 1000
        };
        activePlayers[socket.id] = roomId;
        socket.join(`koth_${roomId}`);

        socket.emit('koth_room_joined', { roomId, potTotal: potContribution });
        broadcastLobbies();

        // Start Lobby Timer
        startLobbyCountdown(roomId);

      } catch (err) {
        await query('ROLLBACK');
        console.error('KOTH Create Error:', err);
        socket.emit('koth_error', err.message);
      }
    });

    // Join KOTH Room
    socket.on('koth_join_room', async (payload) => {
      const { userId, email, roomId } = payload;
      if (!userId || !roomId) return;

      const room = activeRooms[roomId];
      if (!room || room.status !== 'lobby') {
        return socket.emit('koth_error', 'Ce tournoi a déjà commencé ou n existe plus.');
      }

      // Check if already in
      const existing = Object.values(room.players).find(p => p.id === userId);
      if (existing) {
        return socket.emit('koth_error', 'Vous êtes déjà inscrit à ce tournoi.');
      }

      try {
        await query('BEGIN');
        
        const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        let balance = parseFloat(userRes.rows[0].balance);
        if (balance < KOTH_ENTRY_FEE) throw new Error('Solde insuffisant (150 HTG requis).');

        await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [KOTH_ENTRY_FEE, userId]);
        
        const potContribution = KOTH_ENTRY_FEE * (1 - PLATFORM_FEE_PCT); // 135 HTG
        
        await query(`UPDATE koth_rooms SET pot_total = pot_total + $1 WHERE id = $2`, [potContribution, roomId]);
        
        await logAudit(userId, roomId, KOTH_ENTRY_FEE, 'JOIN_ESCROW_DEDUCTION');
        
        await query('COMMIT');

        // Update in-memory
        room.potTotal += potContribution;
        room.players[socket.id] = { id: userId, email, alive: true, currentChoice: null };
        activePlayers[socket.id] = roomId;
        
        socket.join(`koth_${roomId}`);
        socket.emit('koth_room_joined', { roomId, potTotal: room.potTotal });
        
        io.to(`koth_${roomId}`).emit('koth_lobby_update', getLobbyUpdate(room));
        broadcastLobbies();

      } catch (err) {
        await query('ROLLBACK');
        console.error('KOTH Join Error:', err);
        socket.emit('koth_error', err.message);
      }
    });

    // Request Lobby list
    socket.on('koth_get_lobbies', () => {
      sendLobbiesToSocket(socket);
    });

    // Make a choice during a round
    socket.on('koth_make_choice', (payload) => {
      const { doorIndex } = payload;
      const roomId = activePlayers[socket.id];
      if (!roomId || !activeRooms[roomId]) return;
      
      const room = activeRooms[roomId];
      if (room.status !== 'playing') return;

      const player = room.players[socket.id];
      if (player && player.alive) {
        player.currentChoice = doorIndex;
        // Broadcast that this player made a choice (without revealing what)
        io.to(`koth_${roomId}`).emit('koth_player_choice_made', { socketId: socket.id });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const roomId = activePlayers[socket.id];
      if (roomId && activeRooms[roomId]) {
        handleDisconnect(roomId, socket.id);
      }
      delete activePlayers[socket.id];
    });

  });
};

const getLobbyUpdate = (room) => {
  return {
    playersCount: Object.keys(room.players).length,
    potTotal: room.potTotal,
    timeLeft: room.timeLeft
  };
};

const broadcastLobbies = () => {
  const lobbies = Object.values(activeRooms)
    .filter(r => r.status === 'lobby')
    .map(r => ({ id: r.id, playersCount: Object.keys(r.players).length, potTotal: r.potTotal }));
  io.emit('koth_lobbies', lobbies);
};

const sendLobbiesToSocket = (socket) => {
  const lobbies = Object.values(activeRooms)
    .filter(r => r.status === 'lobby')
    .map(r => ({ id: r.id, playersCount: Object.keys(r.players).length, potTotal: r.potTotal }));
  socket.emit('koth_lobbies', lobbies);
};

const startLobbyCountdown = (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(`koth_${roomId}`).emit('koth_lobby_update', getLobbyUpdate(room));

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startGame(roomId);
    }
  }, 1000);
};

const startGame = async (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  const playersKeys = Object.keys(room.players);
  if (playersKeys.length < 2) {
    // Cancel if not enough players
    await cancelRoom(roomId, 'Pas assez de joueurs pour démarrer.');
    return;
  }

  room.status = 'playing';
  try {
    await query(`UPDATE koth_rooms SET status = 'active' WHERE id = $1`, [roomId]);
  } catch (e) {
    console.error(e);
  }

  broadcastLobbies(); // Refresh lobby list (this room will disappear)

  io.to(`koth_${roomId}`).emit('koth_game_started', {
    potTotal: room.potTotal,
    totalPlayers: playersKeys.length
  });

  startNextRound(roomId);
};

const startNextRound = async (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  room.round++;
  
  // Sudden death mechanics: door logic
  // Round 1: 4 doors, 1 trap
  // Round 2: 4 doors, 2 traps
  // Round 3: 4 doors, 3 traps (Sudden Death)
  // Beyond: keep 4 doors, 3 traps
  
  let trapCount = Math.min(room.round, 3);
  const totalDoors = 4;
  
  room.doors = Array(totalDoors).fill('safe');
  let trapsPlaced = 0;
  while(trapsPlaced < trapCount) {
    const idx = Math.floor(Math.random() * totalDoors);
    if (room.doors[idx] === 'safe') {
      room.doors[idx] = 'trap';
      trapsPlaced++;
    }
  }

  // Reset player choices
  Object.values(room.players).forEach(p => {
    if (p.alive) p.currentChoice = null;
  });

  room.timeLeft = ROUND_WAIT_MS / 1000;

  try {
    await query(`UPDATE koth_rooms SET round_number = $1 WHERE id = $2`, [room.round, roomId]);
  } catch(e) {}

  io.to(`koth_${roomId}`).emit('koth_round_start', {
    round: room.round,
    totalDoors,
    timeLeft: room.timeLeft,
    alivePlayers: Object.values(room.players).filter(p => p.alive).length
  });

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(`koth_${roomId}`).emit('koth_round_tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      resolveRound(roomId);
    }
  }, 1000);
};

const resolveRound = async (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  let alivePlayers = Object.values(room.players).filter(p => p.alive);
  const eliminatedThisRound = [];

  alivePlayers.forEach(p => {
    if (p.currentChoice === null) {
      // Didn't choose in time -> Eliminated
      p.alive = false;
      eliminatedThisRound.push({ id: p.id, email: p.email, reason: 'timeout' });
    } else if (room.doors[p.currentChoice] === 'trap') {
      // Chose a trap door -> Eliminated
      p.alive = false;
      eliminatedThisRound.push({ id: p.id, email: p.email, reason: 'trap' });
    }
  });

  alivePlayers = Object.values(room.players).filter(p => p.alive);

  io.to(`koth_${roomId}`).emit('koth_round_result', {
    doors: room.doors,
    eliminated: eliminatedThisRound,
    aliveCount: alivePlayers.length
  });

  if (alivePlayers.length === 1) {
    // We have a winner!
    setTimeout(() => {
      endGameWinner(roomId, alivePlayers[0]);
    }, 3000);
  } else if (alivePlayers.length === 0) {
    // Everyone died! Nobody wins.
    // Platform keeps the pot, or we refund? Let's say House wins.
    setTimeout(() => {
      endGameNoWinner(roomId);
    }, 3000);
  } else {
    // Multiple survivors, next round
    setTimeout(() => {
      startNextRound(roomId);
    }, 4000);
  }
};

const endGameWinner = async (roomId, winnerPlayer) => {
  const room = activeRooms[roomId];
  if (!room) return;

  try {
    await query('BEGIN');
    
    // Pay winner atomically
    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [room.potTotal, winnerPlayer.id]);
    await query(`UPDATE koth_rooms SET status = 'finished', winner_id = $1 WHERE id = $2`, [winnerPlayer.id, roomId]);
    
    await logAudit(winnerPlayer.id, roomId, room.potTotal, 'WIN_POT_DISTRIBUTION');
    
    await query('COMMIT');
    
    io.to(`koth_${roomId}`).emit('koth_game_over', {
      winner: winnerPlayer,
      potTotal: room.potTotal
    });
  } catch (err) {
    await query('ROLLBACK');
    console.error('KOTH Final Payout Error:', err);
  }

  cleanupRoom(roomId);
};

const endGameNoWinner = async (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  try {
    await query(`UPDATE koth_rooms SET status = 'finished' WHERE id = $1`, [roomId]);
    io.to(`koth_${roomId}`).emit('koth_game_over', {
      winner: null,
      message: 'Tout le monde est éliminé ! La plateforme remporte la mise.'
    });
  } catch (err) {
    console.error(err);
  }

  cleanupRoom(roomId);
};

const handleDisconnect = async (roomId, socketId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  const player = room.players[socketId];
  if (!player) return;

  if (room.status === 'lobby') {
    // Optional: could refund and remove from lobby. For simplicity we'll keep their bet and they forfeit.
    player.alive = false;
    io.to(`koth_${roomId}`).emit('koth_player_left', { email: player.email });
  } else if (room.status === 'playing') {
    // Forfeit
    player.alive = false;
    io.to(`koth_${roomId}`).emit('koth_player_left', { email: player.email });
    
    // If it makes it 1 player left, they win
    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    if (alivePlayers.length === 1) {
      clearInterval(room.timer);
      endGameWinner(roomId, alivePlayers[0]);
    } else if (alivePlayers.length === 0) {
      clearInterval(room.timer);
      endGameNoWinner(roomId);
    }
  }
};

const cancelRoom = async (roomId, reason) => {
  const room = activeRooms[roomId];
  if (!room) return;

  try {
    await query('BEGIN');
    
    // Refund everyone
    const players = Object.values(room.players);
    for (const p of players) {
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [KOTH_ENTRY_FEE, p.id]);
      await logAudit(p.id, roomId, KOTH_ENTRY_FEE, 'REFUND_CANCELLED_ROOM');
    }

    await query(`UPDATE koth_rooms SET status = 'cancelled' WHERE id = $1`, [roomId]);
    await query('COMMIT');

    io.to(`koth_${roomId}`).emit('koth_game_cancelled', reason);
  } catch (err) {
    await query('ROLLBACK');
    console.error('KOTH Cancel Error:', err);
  }

  cleanupRoom(roomId);
};

const cleanupRoom = (roomId) => {
  const room = activeRooms[roomId];
  if (!room) return;

  const socketIds = Object.keys(room.players);
  socketIds.forEach(id => {
    delete activePlayers[id];
    const s = io.sockets.sockets.get(id);
    if (s) s.leave(`koth_${roomId}`);
  });

  delete activeRooms[roomId];
  broadcastLobbies();
};

module.exports = {
  initKothEngine
};
