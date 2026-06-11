const { query } = require('./db');

let io;

const RAKE_PERCENT = 10;
const TURN_TIMEOUT_MS = 20000;
const DISCONNECT_TIMEOUT_MS = 30000;

// All 28 dominos
const ALL_DOMINOS = [];
for (let i = 0; i <= 6; i++) {
  for (let j = i; j <= 6; j++) {
    ALL_DOMINOS.push([i, j]);
  }
}

// In-memory rooms
const rooms = {};

// Helper: Shuffle array
const shuffle = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

// Start a match
const startMatch = async (roomId) => {
  const room = rooms[roomId];
  if (!room || room.players.length !== 2) return;

  room.status = 'playing';
  room.boneyard = shuffle([...ALL_DOMINOS]);
  room.board = [];
  room.leftEnd = null;
  room.rightEnd = null;
  room.consecutivePasses = 0;
  
  // Distribute 7 dominos to each
  room.players[0].hand = room.boneyard.splice(0, 7);
  room.players[1].hand = room.boneyard.splice(0, 7);

  // Determine who goes first
  let firstIndex = 0;
  if (room.lastWinnerIndex !== undefined) {
    firstIndex = room.lastWinnerIndex;
  } else {
    // Look for double 6
    const p1Has66 = room.players[0].hand.some(d => d[0] === 6 && d[1] === 6);
    const p2Has66 = room.players[1].hand.some(d => d[0] === 6 && d[1] === 6);
    if (p2Has66) firstIndex = 1;
    // If neither has 6-6 (very rare), default to P1
  }

  room.turnIndex = firstIndex;
  
  try {
    // Debit balances & record bets
    for (let p of room.players) {
      const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [p.userId]);
      const newBalance = parseFloat(userRes.rows[0].balance) - room.buyIn;
      await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, p.userId]);
      
      const betRes = await query(
        `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won) 
         VALUES ($1, null, $2, null, 0.00, false) RETURNING id`,
        [p.userId, room.buyIn]
      );
      p.betId = betRes.rows[0].id;
      p.hasPaid = true;
    }
    room.pot = room.buyIn * 2;

    broadcastRoomState(roomId);
    startTurnTimer(roomId);
  } catch (err) {
    console.error('Erreur lors du démarrage de la partie Domino:', err);
    io.to(roomId).emit('domino_error', 'Erreur serveur lors de la création de la partie. Les mises n\'ont pas été prélevées.');
    room.status = 'finished';
    delete rooms[roomId];
  }
};

// Timer management
const startTurnTimer = (roomId) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  clearTimeout(room.timer);
  room.turnStartTime = Date.now();
  
  room.timer = setTimeout(() => {
    handleTurnTimeout(roomId);
  }, TURN_TIMEOUT_MS);
};

const handleTurnTimeout = (roomId) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;
  
  const currentPlayer = room.players[room.turnIndex];
  
  // Try to draw if boneyard has tiles
  if (room.boneyard.length > 0) {
    const success = drawDomino(roomId, currentPlayer.socketId);
    if (success) {
      startTurnTimer(roomId);
    } else {
      passTurn(roomId, currentPlayer.socketId);
    }
  } else {
    // Pass turn
    passTurn(roomId, currentPlayer.socketId);
  }
};

const drawDomino = (roomId, socketId) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return false;
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) return false;

  // Check if player has playable tile
  const hasPlayable = player.hand.some(tile => 
    room.board.length === 0 || 
    tile[0] === room.leftEnd || tile[1] === room.leftEnd ||
    tile[0] === room.rightEnd || tile[1] === room.rightEnd
  );

  if (hasPlayable) {
    io.to(socketId).emit('domino_error', 'Vous avez déjà un domino jouable !');
    return false;
  }

  if (room.boneyard.length > 0) {
    const tile = room.boneyard.pop();
    player.hand.push(tile);
    io.to(roomId).emit('domino_event', { type: 'draw', playerIndex: room.turnIndex, tilesLeft: room.boneyard.length });
    broadcastRoomState(roomId); // To update hand count
    return true;
  }
  return false;
};

const passTurn = (roomId, socketId) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) return;

  room.consecutivePasses++;
  io.to(roomId).emit('domino_event', { type: 'pass', playerIndex: room.turnIndex });

  if (room.consecutivePasses >= 2) {
    // Game blocked
    handleGameEnd(roomId, 'blocked');
  } else {
    room.turnIndex = room.turnIndex === 0 ? 1 : 0;
    broadcastRoomState(roomId);
    startTurnTimer(roomId);
  }
};

const playDomino = (roomId, socketId, tileIndex, side) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) return;

  const tile = player.hand[tileIndex];
  if (!tile) return;

  let played = false;
  let flipped = false;

  // First move
  if (room.board.length === 0) {
    room.board.push({ tile, isFlipped: false });
    room.leftEnd = tile[0];
    room.rightEnd = tile[1];
    played = true;
  } else {
    if (side === 'left') {
      if (tile[1] === room.leftEnd) {
        room.board.unshift({ tile, isFlipped: false });
        room.leftEnd = tile[0];
        played = true;
      } else if (tile[0] === room.leftEnd) {
        room.board.unshift({ tile, isFlipped: true });
        room.leftEnd = tile[1];
        played = true;
      }
    } else if (side === 'right') {
      if (tile[0] === room.rightEnd) {
        room.board.push({ tile, isFlipped: false });
        room.rightEnd = tile[1];
        played = true;
      } else if (tile[1] === room.rightEnd) {
        room.board.push({ tile, isFlipped: true });
        room.rightEnd = tile[0];
        played = true;
      }
    }
  }

  if (played) {
    player.hand.splice(tileIndex, 1);
    room.consecutivePasses = 0; // reset passes
    
    io.to(roomId).emit('domino_event', { type: 'play', playerIndex: room.turnIndex });

    if (player.hand.length === 0) {
      handleGameEnd(roomId, 'win', room.turnIndex);
    } else {
      room.turnIndex = room.turnIndex === 0 ? 1 : 0;
      broadcastRoomState(roomId);
      startTurnTimer(roomId);
    }
  } else {
    // Invalid move
    io.to(socketId).emit('domino_error', 'Mouvement invalide');
  }
};

const handleGameEnd = async (roomId, reason, winnerIndex = -1) => {
  const room = rooms[roomId];
  if (!room) return;
  clearTimeout(room.timer);
  room.status = 'finished';

  let p1Points = room.players[0].hand.reduce((sum, t) => sum + t[0] + t[1], 0);
  let p2Points = room.players[1].hand.reduce((sum, t) => sum + t[0] + t[1], 0);

  if (reason === 'blocked') {
    if (p1Points < p2Points) winnerIndex = 0;
    else if (p2Points < p1Points) winnerIndex = 1;
    else winnerIndex = -1; // Draw!
  } else if (reason === 'disconnect') {
    // winnerIndex is passed
  }

  // Calculate payouts
  if (winnerIndex !== -1) {
    const winner = room.players[winnerIndex];
    const rake = Math.floor(room.pot * (RAKE_PERCENT / 100));
    const winAmount = room.pot - rake;
    
    // Credit winner
    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [winAmount, winner.userId]);
    
    // Update bet record as won
    const multiplier = parseFloat((winAmount / room.buyIn).toFixed(2));
    await query(
      `UPDATE bets SET cashout_multiplier = $1, payout_amount = $2, is_won = true WHERE id = $3`,
      [multiplier, winAmount, winner.betId]
    );
    
    // Store winner for next game first turn
    room.lastWinnerIndex = winnerIndex;
    
    io.to(roomId).emit('domino_game_over', { 
      winnerId: winner.userId,
      winnerEmail: winner.email,
      reason,
      p1Points,
      p2Points,
      winAmount
    });
  } else {
    // Draw: refund buy-ins
    for (let p of room.players) {
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [room.buyIn, p.userId]);
      // Update bet to show refunded
      await query(
        `UPDATE bets SET cashout_multiplier = 1.00, payout_amount = $1, is_won = false WHERE id = $2`,
        [room.buyIn, p.betId]
      );
    }
    io.to(roomId).emit('domino_game_over', { reason: 'draw', p1Points, p2Points });
  }

  // Reset room for rematch
  setTimeout(() => {
    if (rooms[roomId]) {
      rooms[roomId].status = 'waiting';
      rooms[roomId].board = [];
      rooms[roomId].players.forEach(p => p.hand = []);
      broadcastRoomState(roomId);
    }
  }, 5000);
};

const broadcastRoomState = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  // Sanitize state so players don't see each other's hands or boneyard
  const sanitizedPlayers = room.players.map(p => ({
    userId: p.userId,
    email: p.email,
    handCount: p.hand.length,
    connected: p.connected
  }));

  const publicState = {
    id: room.id,
    status: room.status,
    players: sanitizedPlayers,
    board: room.board,
    boneyardCount: room.boneyard ? room.boneyard.length : 0,
    turnIndex: room.turnIndex,
    timeRemaining: room.status === 'playing' ? Math.max(0, TURN_TIMEOUT_MS - (Date.now() - room.turnStartTime)) : 0
  };

  // Send state to each player with their own hand included
  room.players.forEach(p => {
    if (p.socketId) {
      io.to(p.socketId).emit('domino_state', { ...publicState, myHand: p.hand });
    }
  });
};

const initDominoEngine = (ioInstance) => {
  io = ioInstance;

  io.on('connection', (socket) => {

    socket.on('domino_join', async (data) => {
      try {
        const { token } = data;
        const { userId, email, wager } = data; 
        
        if (!userId) {
          return socket.emit('domino_error', 'Informations utilisateur manquantes.');
        }

        const requestedWager = parseFloat(wager) || 150;
        if (isNaN(requestedWager) || requestedWager < 150) {
          return socket.emit('domino_error', 'Mise invalide (min 150 HTG).');
        }

        // Check balance
        const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user || parseFloat(user.balance) < requestedWager) {
          return socket.emit('domino_error', `Solde insuffisant pour jouer (${requestedWager} HTG requis).`);
        }

        // Reconnection logic: Check if user is already in a room (ghost socket or deliberate reconnect)
        let existingRoomId = null;
        for (const id in rooms) {
          const pIdx = rooms[id].players.findIndex(p => p.userId === userId);
          if (pIdx !== -1) {
            existingRoomId = id;
            break;
          }
        }

        if (existingRoomId) {
          const room = rooms[existingRoomId];
          const p = room.players.find(p => p.userId === userId);
          
          if (room.status === 'playing' || room.status === 'waiting') {
            // Reconnect to the room
            if (p.disconnectTimer) {
              clearTimeout(p.disconnectTimer);
              p.disconnectTimer = null;
            }
            p.socketId = socket.id;
            p.connected = true;
            socket.join(existingRoomId);
            socket.dominoRoom = existingRoomId;
            broadcastRoomState(existingRoomId);
            return; // Successfully reconnected
          }
        }

        // Find waiting room or create new
        let roomId = null;
        for (const id in rooms) {
          if (rooms[id].status === 'waiting' && rooms[id].buyIn === requestedWager && rooms[id].players.length < 2) {
            roomId = id;
            break;
          }
        }

        if (!roomId) {
          roomId = `domino_${Math.random().toString(36).substr(2, 6)}`;
          rooms[roomId] = {
            id: roomId,
            status: 'waiting',
            buyIn: requestedWager,
            players: [],
          };
        }

        socket.join(roomId);
        rooms[roomId].players.push({
          userId,
          email,
          socketId: socket.id,
          connected: true,
          hand: []
        });

        socket.dominoRoom = roomId;
        broadcastRoomState(roomId);

        if (rooms[roomId].players.length === 2) {
          startMatch(roomId);
        }
      } catch (err) {
        console.error('Erreur domino_join:', err);
        socket.emit('domino_error', 'Erreur interne lors de la connexion à la table.');
      }
    });

    socket.on('domino_play', ({ tileIndex, side }) => {
      if (socket.dominoRoom) playDomino(socket.dominoRoom, socket.id, tileIndex, side);
    });

    socket.on('domino_draw', () => {
      if (socket.dominoRoom) {
        const success = drawDomino(socket.dominoRoom, socket.id);
        if (success) startTurnTimer(socket.dominoRoom);
      }
    });

    socket.on('domino_pass', () => {
      if (socket.dominoRoom) passTurn(socket.dominoRoom, socket.id);
    });

    socket.on('domino_leave', () => {
      const roomId = socket.dominoRoom;
      const room = rooms[roomId];
      if (room) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          if (room.status === 'playing') {
            const winnerIndex = playerIndex === 0 ? 1 : 0;
            handleGameEnd(roomId, 'disconnect', winnerIndex);
          } else if (room.status === 'waiting') {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) delete rooms[roomId];
            else broadcastRoomState(roomId);
          }
        }
      }
      socket.dominoRoom = null;
    });

    socket.on('disconnect', () => {
      const roomId = socket.dominoRoom;
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
          player.connected = false;
          broadcastRoomState(roomId);
          
          if (room.status === 'playing') {
            // Start 30s disconnect timeout
            player.disconnectTimer = setTimeout(() => {
              if (rooms[roomId] && !player.connected) {
                // Forfeit
                const winnerIndex = room.players[0].socketId === socket.id ? 1 : 0;
                handleGameEnd(roomId, 'disconnect', winnerIndex);
              }
            }, DISCONNECT_TIMEOUT_MS);
          } else if (room.status === 'waiting') {
            room.players = room.players.filter(p => p.socketId !== socket.id);
            if (room.players.length === 0) delete rooms[roomId];
            else broadcastRoomState(roomId);
          }
        }
      }
    });
  });
};

module.exports = { initDominoEngine };
