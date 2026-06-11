const { query } = require('./db');

let io;

const RAKE_PERCENT = 10;
const GAME_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const TICK_RATE = 100; // 100ms per tick
const GRID_SIZE = 20;

// State management for active duels
// key: duelId
// value: { roomId, players: { socketId: { id, snake: [], direction, score } }, food: {x, y}, timer }
const activeGames = {};
const activePlayers = {}; // map socketId -> duelId

const initSnakeEngine = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    
    // Create a new duel
    socket.on('snake_create_duel', async (payload) => {
      const { userId, betAmount } = payload;
      if (!userId || !betAmount || betAmount <= 0) {
        return socket.emit('snake_error', 'Mise invalide.');
      }

      try {
        await query('BEGIN');
        
        // Check balance
        const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        let balance = parseFloat(userRes.rows[0].balance);
        if (balance < betAmount) {
          throw new Error('Solde insuffisant.');
        }

        // Deduct bet (including the 10% implicitly, as it goes to the pot later)
        // Wait, the user said: "chak miz platform lan pran 10% frais"
        // So we just deduct the full betAmount from the user now.
        // The escrow effectively holds it.
        await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [betAmount, userId]);

        // Insert duel
        const duelRes = await query(
          `INSERT INTO duels (player_a_id, bet_amount, status) VALUES ($1, $2, 'pending') RETURNING id`,
          [userId, betAmount]
        );
        const duelId = duelRes.rows[0].id;

        await query('COMMIT');

        socket.emit('snake_duel_created', { duelId, betAmount });
        broadcastPendingDuels(); // Notify everyone of new duel
      } catch (err) {
        await query('ROLLBACK');
        console.error('Snake Create Duel Error:', err);
        socket.emit('snake_error', err.message);
      }
    });

    // Join a duel
    socket.on('snake_join_duel', async (payload) => {
      const { userId, duelId } = payload;
      if (!userId || !duelId) return;

      try {
        await query('BEGIN');

        // Check duel
        const duelRes = await query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [duelId]);
        if (duelRes.rows.length === 0) throw new Error('Duel introuvable.');
        
        const duel = duelRes.rows[0];
        if (duel.status !== 'pending') throw new Error('Ce duel n est plus disponible.');
        if (duel.player_a_id === userId) throw new Error('Vous ne pouvez pas rejoindre votre propre duel.');

        const betAmount = parseFloat(duel.bet_amount);

        // Check balance
        const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        let balance = parseFloat(userRes.rows[0].balance);
        if (balance < betAmount) throw new Error('Solde insuffisant.');

        // Deduct bet
        await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [betAmount, userId]);

        // Update duel status
        await query(`UPDATE duels SET player_b_id = $1, status = 'active' WHERE id = $2`, [userId, duelId]);

        await query('COMMIT');

        // Initialize game state
        setupGame(duelId, duel.player_a_id, userId, betAmount);
        broadcastPendingDuels();
      } catch (err) {
        await query('ROLLBACK');
        console.error('Snake Join Duel Error:', err);
        socket.emit('snake_error', err.message);
      }
    });

    // Handle direction changes
    socket.on('snake_change_direction', (payload) => {
      const { direction } = payload;
      const duelId = activePlayers[socket.id];
      if (!duelId || !activeGames[duelId]) return;

      const game = activeGames[duelId];
      if (game.status !== 'playing') return;

      const playerState = game.players[socket.id];
      if (playerState) {
        // Prevent 180 degree turns
        const isOpposite = (
          (direction === 'UP' && playerState.direction === 'DOWN') ||
          (direction === 'DOWN' && playerState.direction === 'UP') ||
          (direction === 'LEFT' && playerState.direction === 'RIGHT') ||
          (direction === 'RIGHT' && playerState.direction === 'LEFT')
        );

        if (!isOpposite && direction !== playerState.direction) {
          playerState.nextDirection = direction;
        }
      }
    });

    // Request pending duels
    socket.on('snake_get_pending', () => {
      sendPendingDuelsToSocket(socket);
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      const duelId = activePlayers[socket.id];
      if (duelId && activeGames[duelId]) {
        // Handle disconnect: forfeit game or pause. We will forfeit.
        handleDisconnect(duelId, socket.id);
      }
      delete activePlayers[socket.id];
    });

  });
};

// Broadcast to all sockets
const broadcastPendingDuels = async () => {
  try {
    const res = await query(`
      SELECT d.id, d.bet_amount, u.email as creator_email 
      FROM duels d 
      JOIN users u ON d.player_a_id = u.id 
      WHERE d.status = 'pending'
    `);
    io.emit('snake_pending_duels', res.rows);
  } catch (err) {
    console.error('Error fetching pending duels:', err);
  }
};

const sendPendingDuelsToSocket = async (socket) => {
  try {
    const res = await query(`
      SELECT d.id, d.bet_amount, u.email as creator_email 
      FROM duels d 
      JOIN users u ON d.player_a_id = u.id 
      WHERE d.status = 'pending'
    `);
    socket.emit('snake_pending_duels', res.rows);
  } catch (err) {
    console.error('Error fetching pending duels:', err);
  }
};

const spawnFood = (playerA, playerB) => {
  let food;
  let collision = true;
  while (collision) {
    food = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
    collision = false;
    // Check if food spawns on a snake
    if (playerA && playerA.snake.some(segment => segment.x === food.x && segment.y === food.y)) collision = true;
    if (playerB && playerB.snake.some(segment => segment.x === food.x && segment.y === food.y)) collision = true;
  }
  return food;
};

const setupGame = (duelId, playerA_userId, playerB_userId, betAmount) => {
  // Find socket IDs for these users
  let playerA_socketId = null;
  let playerB_socketId = null;

  for (let [id, socket] of io.sockets.sockets.entries()) {
    // We don't have direct userId mappings in pure socket unless we stored it.
    // Wait! We need a mapping. If we don't have it, we can broadcast to a room.
  }

  // To properly map, let's use a room approach.
  const roomId = `snake_duel_${duelId}`;
  
  // Since we don't track socket -> userId globally easily, we emit an event telling both users to JOIN this room.
  io.emit('snake_duel_starting', { duelId, playerA_id: playerA_userId, playerB_id: playerB_userId });

  // Initialize game state with null sockets, they will claim their spots when they join the room
  activeGames[duelId] = {
    roomId,
    duelId,
    betAmount,
    status: 'waiting',
    playerA_id: playerA_userId,
    playerB_id: playerB_userId,
    players: {},
    food: { x: 10, y: 10 },
    timeLeft: GAME_DURATION_MS,
    timer: null,
    startedAt: null
  };

  // Give them 5 seconds to join the room and claim their spot
  setTimeout(() => {
    startGameLoop(duelId);
  }, 5000);
};

// This needs to be hooked up in the io.on('connection') to allow claiming
const claimSpot = (socket, userId, duelId) => {
  const game = activeGames[duelId];
  if (!game) return;

  if (userId === game.playerA_id) {
    game.players[socket.id] = {
      id: userId,
      isPlayerA: true,
      snake: [{x: 2, y: 2}, {x: 2, y: 3}, {x: 2, y: 4}], // Starts top-left going down
      direction: 'DOWN',
      nextDirection: 'DOWN',
      score: 0,
      deaths: 0
    };
    activePlayers[socket.id] = duelId;
    socket.join(game.roomId);
  } else if (userId === game.playerB_id) {
    game.players[socket.id] = {
      id: userId,
      isPlayerA: false,
      snake: [{x: 17, y: 17}, {x: 17, y: 16}, {x: 17, y: 15}], // Starts bottom-right going up
      direction: 'UP',
      nextDirection: 'UP',
      score: 0,
      deaths: 0
    };
    activePlayers[socket.id] = duelId;
    socket.join(game.roomId);
  }
};

const startGameLoop = (duelId) => {
  const game = activeGames[duelId];
  if (!game) return;

  const playerKeys = Object.keys(game.players);
  if (playerKeys.length < 2) {
    // Someone didn't connect, cancel game and refund
    cancelGame(duelId);
    return;
  }

  game.status = 'playing';
  game.food = spawnFood(game.players[playerKeys[0]], game.players[playerKeys[1]]);
  game.startedAt = Date.now();

  game.timer = setInterval(() => {
    gameLoopTick(duelId);
  }, TICK_RATE);
};

const resetPlayer = (playerState) => {
  if (playerState.isPlayerA) {
    playerState.snake = [{x: 2, y: 2}, {x: 2, y: 3}, {x: 2, y: 4}];
    playerState.direction = 'DOWN';
    playerState.nextDirection = 'DOWN';
  } else {
    playerState.snake = [{x: 17, y: 17}, {x: 17, y: 16}, {x: 17, y: 15}];
    playerState.direction = 'UP';
    playerState.nextDirection = 'UP';
  }
};

const gameLoopTick = (duelId) => {
  const game = activeGames[duelId];
  if (!game) return;

  // Decrease time
  const now = Date.now();
  const elapsed = now - game.startedAt;
  game.timeLeft = Math.max(0, GAME_DURATION_MS - elapsed);

  if (game.timeLeft <= 0) {
    endGame(duelId);
    return;
  }

  const socketIds = Object.keys(game.players);
  const p1 = game.players[socketIds[0]];
  const p2 = game.players[socketIds[1]];

  // Update directions
  p1.direction = p1.nextDirection;
  p2.direction = p2.nextDirection;

  // Move snakes
  const moveSnake = (p) => {
    const head = { ...p.snake[0] };
    if (p.direction === 'UP') head.y -= 1;
    if (p.direction === 'DOWN') head.y += 1;
    if (p.direction === 'LEFT') head.x -= 1;
    if (p.direction === 'RIGHT') head.x += 1;
    
    // Wrap around borders
    if (head.x < 0) head.x = GRID_SIZE - 1;
    if (head.x >= GRID_SIZE) head.x = 0;
    if (head.y < 0) head.y = GRID_SIZE - 1;
    if (head.y >= GRID_SIZE) head.y = 0;

    p.snake.unshift(head);
    return head;
  };

  const p1Head = moveSnake(p1);
  const p2Head = moveSnake(p2);

  let p1Ate = false;
  let p2Ate = false;

  // Check food collisions
  if (p1Head.x === game.food.x && p1Head.y === game.food.y) {
    p1.score += 10;
    p1Ate = true;
  } else {
    p1.snake.pop();
  }

  if (p2Head.x === game.food.x && p2Head.y === game.food.y) {
    p2.score += 10;
    p2Ate = true;
  } else {
    p2.snake.pop();
  }

  if (p1Ate || p2Ate) {
    game.food = spawnFood(p1, p2);
  }

  // Check snake collisions
  const checkCollision = (head, body) => {
    for (let i = 1; i < body.length; i++) { // start at 1 to ignore own head against itself if overlapping initially
      if (head.x === body[i].x && head.y === body[i].y) return true;
    }
    return false;
  };

  let p1Died = false;
  let p2Died = false;

  // Head to Head collision
  if (p1Head.x === p2Head.x && p1Head.y === p2Head.y) {
    p1Died = true;
    p2Died = true;
  } else {
    // P1 hits self or P2
    if (checkCollision(p1Head, p1.snake) || checkCollision(p1Head, p2.snake)) {
      p1Died = true;
    }
    // P2 hits self or P1
    if (checkCollision(p2Head, p2.snake) || checkCollision(p2Head, p1.snake)) {
      p2Died = true;
    }
  }

  if (p1Died) {
    p1.deaths += 1;
    resetPlayer(p1);
  }
  if (p2Died) {
    p2.deaths += 1;
    resetPlayer(p2);
  }

  // Broadcast state
  io.to(game.roomId).emit('snake_state_update', {
    timeLeft: game.timeLeft,
    food: game.food,
    p1: { id: p1.id, snake: p1.snake, score: p1.score, deaths: p1.deaths },
    p2: { id: p2.id, snake: p2.snake, score: p2.score, deaths: p2.deaths }
  });
};

const handleDisconnect = (duelId, socketId) => {
  // If a player disconnects, they forfeit the match
  const game = activeGames[duelId];
  if (!game || game.status !== 'playing') return;

  clearInterval(game.timer);
  
  const remainingPlayerSocket = Object.keys(game.players).find(id => id !== socketId);
  const remainingPlayer = game.players[remainingPlayerSocket];
  const disconnectedPlayer = game.players[socketId];

  if (remainingPlayer) {
    resolveGame(duelId, remainingPlayer.id, disconnectedPlayer.id, 'disconnect');
  } else {
    cancelGame(duelId); // Both left?
  }
};

const endGame = (duelId) => {
  const game = activeGames[duelId];
  if (!game) return;

  clearInterval(game.timer);

  const socketIds = Object.keys(game.players);
  const p1 = game.players[socketIds[0]];
  const p2 = game.players[socketIds[1]];

  let winnerId = null;
  let loserId = null;

  // The one who loses LESS (fewer deaths) wins. If tied, highest score wins.
  if (p1.deaths < p2.deaths) {
    winnerId = p1.id;
    loserId = p2.id;
  } else if (p2.deaths < p1.deaths) {
    winnerId = p2.id;
    loserId = p1.id;
  } else {
    // Tie on deaths, check score
    if (p1.score > p2.score) {
      winnerId = p1.id;
      loserId = p2.id;
    } else if (p2.score > p1.score) {
      winnerId = p2.id;
      loserId = p1.id;
    } else {
      // Complete tie. For simplicity, player A wins (or return bets? Let's refund both on pure tie).
      winnerId = 'tie';
    }
  }

  resolveGame(duelId, winnerId, loserId, 'time_up', p1, p2);
};

const resolveGame = async (duelId, winnerId, loserId, reason, p1, p2) => {
  const game = activeGames[duelId];
  if (!game) return;

  const totalPot = game.betAmount * 2;
  const payoutAmount = totalPot * 0.90; // 90% goes to winner, 10% kept by platform

  try {
    await query('BEGIN');

    if (winnerId === 'tie') {
      // Refund both their original bets
      await query('UPDATE users SET balance = balance + $1 WHERE id IN ($2, $3)', [game.betAmount, game.playerA_id, game.playerB_id]);
      await query(`UPDATE duels SET status = 'finished' WHERE id = $1`, [duelId]);
      io.to(game.roomId).emit('snake_game_over', { reason: 'tie', message: 'Égalité parfaite ! Les mises sont remboursées.' });
    } else {
      // Pay winner
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payoutAmount, winnerId]);
      await query(`UPDATE duels SET status = 'finished', winner_id = $1, player_a_score = $2, player_b_score = $3 WHERE id = $4`, [
        winnerId, p1 ? p1.score : 0, p2 ? p2.score : 0, duelId
      ]);
      io.to(game.roomId).emit('snake_game_over', { reason, winnerId, payoutAmount });
    }

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    console.error('Snake Resolution Error:', err);
  }

  // Cleanup
  const socketIds = Object.keys(game.players);
  socketIds.forEach(id => delete activePlayers[id]);
  delete activeGames[duelId];
};

const cancelGame = async (duelId) => {
  const game = activeGames[duelId];
  if (!game) return;

  try {
    await query('BEGIN');
    // Refund Player A and Player B if they exist
    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [game.betAmount, game.playerA_id]);
    if (game.playerB_id) {
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [game.betAmount, game.playerB_id]);
    }
    await query(`UPDATE duels SET status = 'cancelled' WHERE id = $1`, [duelId]);
    await query('COMMIT');
    io.to(game.roomId).emit('snake_game_cancelled', 'Jeu annulé, mises remboursées.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('Snake Cancel Error:', err);
  }

  const socketIds = Object.keys(game.players);
  socketIds.forEach(id => delete activePlayers[id]);
  delete activeGames[duelId];
};

module.exports = {
  initSnakeEngine,
  claimSpot // Export to let index.js call it when user explicitly joins socket
};
