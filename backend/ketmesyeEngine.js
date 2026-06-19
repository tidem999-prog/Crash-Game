const { query } = require('./db');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');

let io;

// Game Config
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const TICK_RATE_MS = 50; // 20 updates per second
const PATH_SPACING = 2; // Spacing of path history indices for body segments
const INVINCIBLE_TIME_MS = 2000; // 2 seconds invincibility on spawn
const GAME_DURATION_MS = 2 * 60 * 1000; // 2 minutes for a duel

// Game State (Public Sandbox partitioned by currency)
let snakes = { HTG: {}, KET: {} };
let pellets = { HTG: [], KET: [] };

// Game State (1v1 Duels)
const pendingDuels = {}; // maps duelId -> { id, betAmount, creatorEmail, playerAId, currency }
const activeDuels = {}; // maps duelId -> { id, roomId, betAmount, status, playerA_id, playerB_id, snakes: {}, pellets: [], timeLeft, startedAt, timer, currency }
const activeDuelPlayers = {}; // maps socketId -> duelId

let gameLoopInterval = null;

// Helper to generate a random color
const getRandomColor = () => {
  const colors = [
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', 
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#e2e8f0'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Spawn random normal pellets for a specific sandbox
const spawnNormalPellets = (currency, count) => {
  for (let i = 0; i < count; i++) {
    pellets[currency].push({
      id: Math.random().toString(36).substring(2, 9),
      x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
      y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
      value: currency === 'KET' ? 0.80 : 0.10, // KET pellets worth 0.80 KET, HTG pellets worth 0.10 HTG
      color: getRandomColor(),
      isCashDrop: false
    });
  }
};

// Initialize the pellets pool (150 normal pellets per sandbox)
spawnNormalPellets('HTG', 150);
spawnNormalPellets('KET', 150);

// Tick sandbox routine for a specific currency sandbox
const tickSandbox = async (currency) => {
  const sandboxSnakes = snakes[currency];
  const sandboxPellets = pellets[currency];
  const socketIds = Object.keys(sandboxSnakes);
  if (socketIds.length === 0) return;

  const now = Date.now();

  // 1. Move snakes
  socketIds.forEach(id => {
    const snake = sandboxSnakes[id];
    
    // Check invincibility timeout
    if (snake.isInvincible && now - snake.spawnTime > INVINCIBLE_TIME_MS) {
      snake.isInvincible = false;
    }

    // Energy and Boost speed logic
    if (snake.isBoosting && snake.energy > 0) {
      snake.speed = 16; // Faster speed
      snake.energy = Math.max(0, snake.energy - 2); // Drain energy
    } else {
      snake.speed = 10; // Normal speed
      snake.energy = Math.min(100, snake.energy + 1.5); // Recover energy
    }

    const head = { ...snake.segments[0] };
    
    // Update head position
    head.x += Math.cos(snake.angle) * snake.speed;
    head.y += Math.sin(snake.angle) * snake.speed;

    // Unshift head to path history
    snake.pathHistory.unshift(head);

    // Update body segments based on path history sampling
    const segmentCount = snake.segments.length;
    for (let i = 0; i < segmentCount; i++) {
      const historyIndex = i * PATH_SPACING;
      if (snake.pathHistory[historyIndex]) {
        snake.segments[i] = { ...snake.pathHistory[historyIndex] };
      } else {
        snake.segments[i] = { ...snake.pathHistory[snake.pathHistory.length - 1] };
      }
    }

    // Limit path history length in memory
    const maxHistoryNeeded = segmentCount * PATH_SPACING;
    if (snake.pathHistory.length > maxHistoryNeeded + 20) {
      snake.pathHistory.length = maxHistoryNeeded + 10;
    }
  });

  // Keep track of snakes that die this tick
  const deadSnakes = new Set();
  const collisionKills = []; // { killerId, deadId }

  // 2. Collision checking
  socketIds.forEach(idA => {
    const snakeA = sandboxSnakes[idA];
    const headA = snakeA.segments[0];

    // Out-of-bounds collision
    if (headA.x < 0 || headA.x > MAP_WIDTH || headA.y < 0 || headA.y > MAP_HEIGHT) {
      deadSnakes.add(idA);
      return;
    }

    // Snake A collisions with other snakes
    socketIds.forEach(idB => {
      if (deadSnakes.has(idA)) return; // Already flagged as dead
      const snakeB = sandboxSnakes[idB];

      // Tête-à-tête (Head-to-head) collision
      if (idA !== idB) {
        const headB = snakeB.segments[0];
        const dist = Math.hypot(headA.x - headB.x, headA.y - headB.y);
        
        // If heads overlap
        if (dist < 20) {
          if (snakeA.isInvincible || snakeB.isInvincible) return; // Skip if either is invincible
          
          if (snakeA.value > snakeB.value) {
            deadSnakes.add(idB);
            collisionKills.push({ killerId: idA, deadId: idB });
          } else if (snakeB.value > snakeA.value) {
            deadSnakes.add(idA);
            collisionKills.push({ killerId: idB, deadId: idA });
          } else {
            // Equal value: both die
            deadSnakes.add(idA);
            deadSnakes.add(idB);
          }
          return;
        }
      }

      // Tête-à-corps (Head-to-body) collision
      if (idA === idB && socketIds.length > 5) return; // Self collision is ignored if > 5 players
      const startSegmentIndex = (idA === idB) ? 3 : 0; // Prevent colliding with own neck
      for (let i = startSegmentIndex; i < snakeB.segments.length; i++) {
        if (snakeA.isInvincible || snakeB.isInvincible) continue;

        const segment = snakeB.segments[i];
        const dist = Math.hypot(headA.x - segment.x, headA.y - segment.y);

        if (dist < 18) { // Collision threshold
          deadSnakes.add(idA);
          if (idA !== idB) {
            collisionKills.push({ killerId: idB, deadId: idA });
          }
          break;
        }
      }
    });
  });

  // 3. Process dead snakes
  for (const deadId of deadSnakes) {
    const snake = sandboxSnakes[deadId];
    if (snake) {
      console.log(`Ketmesye: Snake owned by ${snake.email} died.`);
      
      // Delete from memory IMMEDIATELY
      delete sandboxSnakes[deadId];

      // Notify killer if any
      const killInfo = collisionKills.find(k => k.deadId === deadId);
      if (killInfo) {
        const killer = sandboxSnakes[killInfo.killerId];
        if (killer) {
          killer.eliminations += 1;
          const killerSocket = io.sockets.sockets.get(killInfo.killerId);
          if (killerSocket) {
            killerSocket.emit('ketmesye_kill', { killed: snake.email.split('@')[0] });
          }
        }
      }

      // Spawn cash pellets from the dead body
      const segmentCount = snake.segments.length;
      const totalValueToDrop = snake.value * 0.5;
      const valuePerDrop = parseFloat((totalValueToDrop / segmentCount).toFixed(4));

      // Drop a yellow cash pellet at every segment
      snake.segments.forEach(segment => {
        sandboxPellets.push({
          id: Math.random().toString(36).substring(2, 9),
          x: segment.x + (Math.random() * 10 - 5),
          y: segment.y + (Math.random() * 10 - 5),
          value: valuePerDrop,
          color: '#fbbf24', // Shiny yellow
          isCashDrop: true
        });
      });

      // Update bet row to lost in database
      try {
        await query(
          "UPDATE bets SET payout_amount = 0.00, is_won = false WHERE id = $1",
          [snake.betId]
        );
        // Process progression settlement (awards KET on HTG losses)
        await processBetSettlement(snake.userId, snake.wager, 0.00, snake.currency || 'HTG', 'ketmesye');
      } catch (err) {
        console.error('Error logging snake death in DB:', err);
      }

      // Notify the dead player
      const socket = io.sockets.sockets.get(deadId);
      if (socket) {
        socket.emit('ketmesye_death', {
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations,
          valueLost: snake.value,
          currency: snake.currency
        });
      }

      activePlayersStore.losePlayer(snake.userId, 'ketmesye', 'dead');
      activePlayersStore.notify(`Le serpent de ${snake.email.split('@')[0]} est mort et a perdu ${snake.value.toFixed(0)} ${currency} !`, 'danger');
    }
  }

  // 4. Food eating
  Object.keys(sandboxSnakes).forEach(id => {
    const snake = sandboxSnakes[id];
    const head = snake.segments[0];

    for (let i = sandboxPellets.length - 1; i >= 0; i--) {
      const pellet = sandboxPellets[i];
      const dist = Math.hypot(head.x - pellet.x, head.y - pellet.y);

      if (dist < 20) { // Consumption threshold
        snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
        
        snake.growthPoints = (snake.growthPoints || 0) + pellet.value;
        const growthStep = currency === 'KET' ? 80.0 : 10.0; // grow 1 segment per 80 KET or 10 HTG
        const segmentsToAdd = Math.floor(snake.growthPoints / growthStep);
        if (segmentsToAdd > 0) {
          snake.growthPoints -= segmentsToAdd * growthStep;
          for (let g = 0; g < segmentsToAdd; g++) {
            const lastSegment = snake.segments[snake.segments.length - 1];
            snake.segments.push({ ...lastSegment });
          }
        }

        // Remove pellet
        sandboxPellets.splice(i, 1);

        // Respawn normal pellet
        if (!pellet.isCashDrop) {
          spawnNormalPellets(currency, 1);
        }
      }
    }
  });

  // 5. Broadcast game state to everyone in this currency's sandbox
  const broadcastPayload = {
    snakes: Object.keys(sandboxSnakes).reduce((acc, id) => {
      const s = sandboxSnakes[id];
      acc[id] = {
        id: s.id,
        email: s.email.split('@')[0],
        value: s.value,
        segments: s.segments.map(seg => ({ x: Math.round(seg.x), y: Math.round(seg.y) })),
        angle: s.angle,
        color: s.color,
        eliminations: s.eliminations,
        isInvincible: s.isInvincible,
        energy: s.energy
      };
      return acc;
    }, {}),
    pellets: sandboxPellets.map(p => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      value: p.value,
      color: p.color,
      isCashDrop: p.isCashDrop
    })),
    leaderboard: Object.values(sandboxSnakes)
      .map(s => ({ email: s.email.split('@')[0], value: s.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  };

  io.to(`ketmesye_sandbox_${currency}`).emit('ketmesye_tick', broadcastPayload);
};

// Main Game tick interval
const handleGameTick = async () => {
  await tickSandbox('HTG');
  await tickSandbox('KET');
};

// Broadcast the list of pending duels to anyone listening
const broadcastPendingDuels = async () => {
  try {
    const list = Object.values(pendingDuels);
    io.emit('ketmesye_pending_duels', list);
  } catch (err) {
    console.error('Error broadcasting pending duels:', err);
  }
};

const sendPendingDuelsToSocket = (socket) => {
  const list = Object.values(pendingDuels);
  socket.emit('ketmesye_pending_duels', list);
};

const spawnDuelPellets = (duel, count) => {
  for (let i = 0; i < count; i++) {
    duel.pellets.push({
      id: Math.random().toString(36).substring(2, 9),
      x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
      y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
      value: 0.10,
      color: getRandomColor(),
      isCashDrop: false
    });
  }
};

const setupKetmesyeDuel = (duelId, playerA_id, playerB_id, betAmount, currency) => {
  const roomId = `ketmesye_duel_${duelId}`;
  activeDuels[duelId] = {
    id: duelId,
    roomId,
    betAmount,
    status: 'waiting',
    playerA_id,
    playerB_id,
    snakes: {},
    pellets: [],
    timeLeft: GAME_DURATION_MS,
    startedAt: null,
    timer: null,
    currency
  };

  spawnDuelPellets(activeDuels[duelId], 60);

  // Notify players to claim their spots
  io.emit('ketmesye_duel_starting', { duelId, playerA_id, playerB_id, currency });

  // Start the game loop after 5 seconds
  setTimeout(() => {
    startDuelLoop(duelId);
  }, 5000);
};

const startDuelLoop = (duelId) => {
  const duel = activeDuels[duelId];
  if (!duel) return;

  const playerKeys = Object.keys(duel.snakes);
  if (playerKeys.length < 2) {
    cancelDuel(duelId, 'Adversaire non connecté.');
    return;
  }

  duel.status = 'playing';
  duel.startedAt = Date.now();

  duel.timer = setInterval(() => {
    handleDuelTick(duelId);
  }, TICK_RATE_MS);
};

const handleDuelTick = async (duelId) => {
  const duel = activeDuels[duelId];
  if (!duel) return;

  const elapsed = Date.now() - duel.startedAt;
  duel.timeLeft = Math.max(0, GAME_DURATION_MS - elapsed);

  if (duel.timeLeft <= 0) {
    resolveDuel(duelId);
    return;
  }

  const socketIds = Object.keys(duel.snakes);
  const now = Date.now();

  // 1. Move snakes
  socketIds.forEach(id => {
    const snake = duel.snakes[id];
    if (snake.isInvincible && now - snake.spawnTime > INVINCIBLE_TIME_MS) {
      snake.isInvincible = false;
    }

    if (snake.isBoosting && snake.energy > 0) {
      snake.speed = 16;
      snake.energy = Math.max(0, snake.energy - 2);
    } else {
      snake.speed = 10;
      snake.energy = Math.min(100, snake.energy + 1.5);
    }

    const head = { ...snake.segments[0] };
    head.x += Math.cos(snake.angle) * snake.speed;
    head.y += Math.sin(snake.angle) * snake.speed;

    snake.pathHistory.unshift(head);

    const segmentCount = snake.segments.length;
    for (let i = 0; i < segmentCount; i++) {
      const historyIndex = i * PATH_SPACING;
      if (snake.pathHistory[historyIndex]) {
        snake.segments[i] = { ...snake.pathHistory[historyIndex] };
      } else {
        snake.segments[i] = { ...snake.pathHistory[snake.pathHistory.length - 1] };
      }
    }

    const maxHistoryNeeded = segmentCount * PATH_SPACING;
    if (snake.pathHistory.length > maxHistoryNeeded + 20) {
      snake.pathHistory.length = maxHistoryNeeded + 10;
    }
  });

  // 2. Collision checking
  const deadSnakes = new Set();
  const collisionKills = [];

  socketIds.forEach(idA => {
    const snakeA = duel.snakes[idA];
    const headA = snakeA.segments[0];

    // Bounds check
    if (headA.x < 0 || headA.x > MAP_WIDTH || headA.y < 0 || headA.y > MAP_HEIGHT) {
      deadSnakes.add(idA);
      return;
    }

    // Check against opponent
    socketIds.forEach(idB => {
      if (deadSnakes.has(idA)) return;
      const snakeB = duel.snakes[idB];

      if (idA !== idB) {
        const headB = snakeB.segments[0];
        const dist = Math.hypot(headA.x - headB.x, headA.y - headB.y);
        if (dist < 20) {
          if (snakeA.isInvincible || snakeB.isInvincible) return;
          if (snakeA.value > snakeB.value) {
            deadSnakes.add(idB);
            collisionKills.push({ killerId: idA, deadId: idB });
          } else if (snakeB.value > snakeA.value) {
            deadSnakes.add(idA);
            collisionKills.push({ killerId: idB, deadId: idA });
          } else {
            deadSnakes.add(idA);
            deadSnakes.add(idB);
          }
          return;
        }
      }

      // Head to body collision
      const startSegmentIndex = (idA === idB) ? 3 : 0;
      for (let i = startSegmentIndex; i < snakeB.segments.length; i++) {
        if (snakeA.isInvincible || snakeB.isInvincible) continue;
        const segment = snakeB.segments[i];
        const dist = Math.hypot(headA.x - segment.x, headA.y - segment.y);
        if (dist < 18) {
          deadSnakes.add(idA);
          if (idA !== idB) {
            collisionKills.push({ killerId: idB, deadId: idA });
          }
          break;
        }
      }
    });
  });

  // 3. Process dead snakes (Respawn logic in Duel)
  deadSnakes.forEach(deadId => {
    const snake = duel.snakes[deadId];
    if (snake) {
      snake.deaths += 1;
      
      // Increment killer eliminations
      const killInfo = collisionKills.find(k => k.deadId === deadId);
      if (killInfo) {
        const killer = duel.snakes[killInfo.killerId];
        if (killer) {
          killer.eliminations += 1;
          const killerSocket = io.sockets.sockets.get(killInfo.killerId);
          if (killerSocket) {
            killerSocket.emit('ketmesye_kill', { killed: snake.email.split('@')[0] });
          }
        }
      }

      // Drop cash pellets in the duel room
      const segmentCount = snake.segments.length;
      const totalValueToDrop = snake.value * 0.5;
      const valuePerDrop = parseFloat((totalValueToDrop / segmentCount).toFixed(4));
      
      snake.segments.forEach(seg => {
        duel.pellets.push({
          id: Math.random().toString(36).substring(2, 9),
          x: seg.x + (Math.random() * 10 - 5),
          y: seg.y + (Math.random() * 10 - 5),
          value: valuePerDrop,
          color: '#fbbf24',
          isCashDrop: true
        });
      });

      // Respawn the dead player
      const isPlayerA = snake.userId === duel.playerA_id;
      const spawnX = isPlayerA ? 400 : 1600;
      const spawnY = isPlayerA ? 400 : 1600;
      
      snake.segments = [];
      for (let i = 0; i < 5; i++) {
        snake.segments.push({ x: spawnX, y: spawnY + i * 15 });
      }
      
      snake.pathHistory = [];
      for (let i = 0; i < 50; i++) {
        snake.pathHistory.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
      }
      
      // Shrink back to start value
      snake.value = parseFloat((duel.betAmount * 0.90).toFixed(2));
      snake.isInvincible = true;
      snake.spawnTime = Date.now();
      snake.isBoosting = false;
      snake.energy = 100;
      snake.angle = isPlayerA ? -Math.PI / 2 : Math.PI / 2;
    }
  });

  // 4. Eating pellets in duel
  socketIds.forEach(id => {
    const snake = duel.snakes[id];
    const head = snake.segments[0];

    for (let i = duel.pellets.length - 1; i >= 0; i--) {
      const pellet = duel.pellets[i];
      const dist = Math.hypot(head.x - pellet.x, head.y - pellet.y);

      if (dist < 20) {
        snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
        
        snake.growthPoints = (snake.growthPoints || 0) + pellet.value;
        const growthStep = duel.currency === 'KET' ? 80.0 : 10.0;
        const segmentsToAdd = Math.floor(snake.growthPoints / growthStep);
        if (segmentsToAdd > 0) {
          snake.growthPoints -= segmentsToAdd * growthStep;
          for (let g = 0; g < segmentsToAdd; g++) {
            const lastSegment = snake.segments[snake.segments.length - 1];
            snake.segments.push({ ...lastSegment });
          }
        }

        duel.pellets.splice(i, 1);

        if (!pellet.isCashDrop) {
          // Respawn normal pellet
          duel.pellets.push({
            id: Math.random().toString(36).substring(2, 9),
            x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
            y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
            value: 0.10,
            color: getRandomColor(),
            isCashDrop: false
          });
        }
      }
    }
  });

  // 5. Broadcast duel state
  const broadcastPayload = {
    timeLeft: duel.timeLeft,
    snakes: Object.keys(duel.snakes).reduce((acc, id) => {
      const s = duel.snakes[id];
      acc[id] = {
        id: s.id,
        email: s.email.split('@')[0],
        value: s.value,
        segments: s.segments.map(seg => ({ x: Math.round(seg.x), y: Math.round(seg.y) })),
        angle: s.angle,
        color: s.color,
        eliminations: s.eliminations,
        deaths: s.deaths,
        isInvincible: s.isInvincible,
        energy: s.energy
      };
      return acc;
    }, {}),
    pellets: duel.pellets.map(p => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      value: p.value,
      color: p.color,
      isCashDrop: p.isCashDrop
    }))
  };

  io.to(duel.roomId).emit('ketmesye_duel_tick', broadcastPayload);
};

const resolveDuel = async (duelId, disconnectWinnerId = null) => {
  const duel = activeDuels[duelId];
  if (!duel) return;

  clearInterval(duel.timer);

  const socketIds = Object.keys(duel.snakes);
  let pA = null;
  let pB = null;

  socketIds.forEach(id => {
    const s = duel.snakes[id];
    if (s.userId === duel.playerA_id) pA = s;
    if (s.userId === duel.playerB_id) pB = s;
  });

  let winnerId = null;
  let loserId = null;
  let isTie = false;
  let reason = disconnectWinnerId ? 'disconnect' : 'time_up';

  if (disconnectWinnerId) {
    winnerId = disconnectWinnerId;
    loserId = (winnerId === duel.playerA_id) ? duel.playerB_id : duel.playerA_id;
  } else {
    // Compare deaths
    const deathsA = pA ? pA.deaths : 999;
    const deathsB = pB ? pB.deaths : 999;

    if (deathsA < deathsB) {
      winnerId = duel.playerA_id;
      loserId = duel.playerB_id;
    } else if (deathsB < deathsA) {
      winnerId = duel.playerB_id;
      loserId = duel.playerA_id;
    } else {
      // Compare values
      const valA = pA ? pA.value : 0;
      const valB = pB ? pB.value : 0;
      if (valA > valB) {
        winnerId = duel.playerA_id;
        loserId = duel.playerB_id;
      } else if (valB > valA) {
        winnerId = duel.playerB_id;
        loserId = duel.playerA_id;
      } else {
        isTie = true;
      }
    }
  }

  const pot = duel.betAmount * 2;
  const payout = pot * 0.90;
  const activeCurrency = duel.currency || 'HTG';

  try {
    await query('BEGIN');

    if (isTie) {
      // Refund both
      if (activeCurrency === 'KET') {
        await query('UPDATE users SET ket_balance = ket_balance + $1 WHERE id IN ($2, $3)', [duel.betAmount, duel.playerA_id, duel.playerB_id]);
      } else {
        await query('UPDATE users SET balance = balance + $1 WHERE id IN ($2, $3)', [duel.betAmount, duel.playerA_id, duel.playerB_id]);
      }
      await query(`UPDATE duels SET status = 'finished' WHERE id = $1`, [duelId]);
      
      // Log audit
      await query(
        `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_refund')`,
        [duel.playerA_id, duelId, duel.betAmount]
      );
      await query(
        `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_refund')`,
        [duel.playerB_id, duelId, duel.betAmount]
      );

      io.to(duel.roomId).emit('ketmesye_duel_over', { reason: 'tie', message: 'Égalité parfaite ! Les mises sont remboursées.', currency: activeCurrency });
      activePlayersStore.removePlayer(duel.playerA_id, 'snake_duel');
      activePlayersStore.removePlayer(duel.playerB_id, 'snake_duel');
      activePlayersStore.notify(`Le duel de serpent s'est terminé par une égalité !`, 'info');
    } else {
      // Pay winner
      if (activeCurrency === 'KET') {
        await query('UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2', [payout, winnerId]);
      } else {
        await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, winnerId]);
      }
      await query(`UPDATE duels SET status = 'finished', winner_id = $1, player_a_score = $2, player_b_score = $3 WHERE id = $4`, [
        winnerId, pA ? pA.value : 0, pB ? pB.value : 0, duelId
      ]);

      // Log payout and commission
      await query(
        `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'payout_winner')`,
        [winnerId, duelId, payout]
      );
      await query(
        `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES (null, $1, 'snake_duel', $2, 'commission_collected')`,
        [duelId, pot * 0.10]
      );

      // Insert winning bet and losing bet records
      await query(
        `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency) 
         VALUES ($1, null, $2, $3, $4, true, $5)`,
        [winnerId, duel.betAmount, 1.80, payout, activeCurrency]
      );
      await query(
        `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency) 
         VALUES ($1, null, $2, 0.00, 0.00, false, $3)`,
        [loserId, duel.betAmount, activeCurrency]
      );

      io.to(duel.roomId).emit('ketmesye_duel_over', { reason, winnerId, payoutAmount: payout, currency: activeCurrency });
      activePlayersStore.cashoutPlayer(winnerId, 'snake_duel', payout, 1.80);
      activePlayersStore.losePlayer(loserId, 'snake_duel', 'eliminated');
    }

    await query('COMMIT');

    // Process progression settlements (awards KET on HTG duel win/loss)
    await processBetSettlement(winnerId, duel.betAmount, payout, activeCurrency, 'snake_duel');
    await processBetSettlement(loserId, duel.betAmount, 0.00, activeCurrency, 'snake_duel');
  } catch (err) {
    await query('ROLLBACK');
    console.error('Ketmesye Resolve Duel Error:', err);
  }

  // Cleanup
  socketIds.forEach(id => {
    delete activeDuelPlayers[id];
  });
  delete activeDuels[duelId];
};

const cancelDuel = async (duelId, reason = 'Jeu annulé.') => {
  const duel = activeDuels[duelId];
  if (!duel) return;

  if (duel.timer) clearInterval(duel.timer);

  const activeCurrency = duel.currency || 'HTG';

  try {
    await query('BEGIN');
    if (activeCurrency === 'KET') {
      await query('UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2', [duel.betAmount, duel.playerA_id]);
      if (duel.playerB_id) {
        await query('UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2', [duel.betAmount, duel.playerB_id]);
      }
    } else {
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [duel.betAmount, duel.playerA_id]);
      if (duel.playerB_id) {
        await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [duel.betAmount, duel.playerB_id]);
      }
    }
    await query(`UPDATE duels SET status = 'cancelled' WHERE id = $1`, [duelId]);
    await query('COMMIT');

    io.to(duel.roomId).emit('ketmesye_duel_cancelled', { reason });
    activePlayersStore.removePlayer(duel.playerA_id, 'snake_duel');
    if (duel.playerB_id) activePlayersStore.removePlayer(duel.playerB_id, 'snake_duel');
  } catch (err) {
    await query('ROLLBACK');
    console.error('Ketmesye Cancel Duel Error:', err);
  }

  const socketIds = Object.keys(duel.snakes);
  socketIds.forEach(id => {
    delete activeDuelPlayers[id];
  });
  delete activeDuels[duelId];
};

const cancelPendingDuel = async (duelId, reason = 'Jeu annulé.') => {
  const pending = pendingDuels[duelId];
  if (!pending) return;

  const activeCurrency = pending.currency || 'HTG';

  try {
    await query('BEGIN');
    if (activeCurrency === 'KET') {
      await query('UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2', [pending.betAmount, pending.playerAId]);
    } else {
      await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [pending.betAmount, pending.playerAId]);
    }
    await query(`UPDATE duels SET status = 'cancelled' WHERE id = $1`, [duelId]);
    await query(
      `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_refund')`,
      [pending.playerAId, duelId, pending.betAmount]
    );
    await query('COMMIT');
    activePlayersStore.removePlayer(pending.playerAId, 'snake_duel');

    const creatorSocket = io.sockets.sockets.get(pending.socketId);
    if (creatorSocket) {
      creatorSocket.emit('ketmesye_duel_cancelled', { reason });
    }
  } catch (err) {
    await query('ROLLBACK');
    console.error('Ketmesye Cancel Pending Duel Error:', err);
  }

  delete pendingDuels[duelId];
  broadcastPendingDuels();
};

// Initialize the socket.io handlers
const initKetmesyeEngine = (socketIoInstance) => {
  io = socketIoInstance;

  // Start the tick loop
  if (gameLoopInterval) clearInterval(gameLoopInterval);
  gameLoopInterval = setInterval(handleGameTick, TICK_RATE_MS);
  console.log('Ketmesye: Game Loop tick initialized (50ms).');

  io.on('connection', (socket) => {
    
    // 1. Join game event
    socket.on('ketmesye_join', async (data) => {
      const { userId, email, wager } = data;

      if (snakes.HTG[socket.id] || snakes.KET[socket.id]) {
        return socket.emit('ketmesye_error', { message: 'Vous êtes déjà dans la partie.' });
      }

      try {
        await query('BEGIN');

        // Check user details
        const userRes = await query('SELECT balance, ket_balance, active_currency, is_suspended FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Utilisateur introuvable.' });
        }

        const user = userRes.rows[0];
        if (user.is_suspended) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Compte suspendu.' });
        }

        const activeCurrency = user.active_currency || 'HTG';
        const entryWager = parseFloat(wager);
        const minWager = activeCurrency === 'KET' ? 1000 : 125;

        if (isNaN(entryWager) || entryWager < minWager) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: `La mise minimale pour spawn est de ${minWager} ${activeCurrency}.` });
        }

        const balance = parseFloat(activeCurrency === 'KET' ? (user.ket_balance || 0) : user.balance);
        if (balance < entryWager) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Solde insuffisant.' });
        }

        // Deduct entry fee
        const newBalance = balance - entryWager;
        if (activeCurrency === 'KET') {
          await query('UPDATE users SET ket_balance = $1 WHERE id = $2', [newBalance, userId]);
        } else {
          await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        }

        // Insert bet row into DB (is_won = false initially)
        const betRes = await query(
          `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency) 
           VALUES ($1, null, $2, null, 0.00, false, $3) RETURNING id`,
          [userId, entryWager, activeCurrency]
        );
        const betId = betRes.rows[0].id;

        // Process progression wager (resets inactivity, adds XP if HTG)
        await processWager(userId, entryWager, activeCurrency);

        await query('COMMIT');

        // Initialize snake segments randomly on the map
        const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
        const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;
        
        // Spawn with 5 segments
        const startSegments = [];
        for (let i = 0; i < 5; i++) {
          startSegments.push({ x: spawnX, y: spawnY + i * 15 });
        }

        // Path history needs to be pre-filled so body segments render cleanly
        const initialPath = [];
        for (let i = 0; i < 50; i++) {
          initialPath.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
        }

        // Commission is 10%, so starting value is 90% of wager
        const initialValue = parseFloat((entryWager * 0.90).toFixed(2));

        // Register snake in memory under correct currency partition
        snakes[activeCurrency][socket.id] = {
          id: socket.id,
          userId,
          email,
          wager: entryWager,
          value: initialValue,
          segments: startSegments,
          pathHistory: initialPath,
          angle: -Math.PI / 2, // Upwards
          speed: 10, // Moving speed in pixels per tick
          color: getRandomColor(),
          eliminations: 0,
          isInvincible: true,
          spawnTime: Date.now(),
          betId,
          isBoosting: false,
          energy: 100,
          currency: activeCurrency
        };

        // Join room specific to this sandbox currency
        socket.join(`ketmesye_sandbox_${activeCurrency}`);

        socket.emit('ketmesye_join_success', {
          wager: entryWager,
          initialValue,
          newBalance,
          currency: activeCurrency
        });

        console.log(`Ketmesye: ${email} joined with ${entryWager} ${activeCurrency} wager.`);
        activePlayersStore.addPlayer(userId, email, 'ketmesye', entryWager);
        activePlayersStore.notify(`${email.split('@')[0]} a rejoint l'arène de KetMesye avec ${entryWager} ${activeCurrency} !`, 'info');

      } catch (err) {
        await query('ROLLBACK');
        console.error('Error joining Ketmesye:', err);
        socket.emit('ketmesye_error', { message: 'Erreur interne du serveur lors de la connexion.' });
      }
    });

    // 2. Input movement direction
    socket.on('ketmesye_input', (data) => {
      const { angle } = data;
      const duelId = activeDuelPlayers[socket.id];
      if (duelId && activeDuels[duelId]) {
        const snake = activeDuels[duelId].snakes[socket.id];
        if (snake && typeof angle === 'number') {
          snake.angle = angle;
        }
      } else {
        const snake = snakes.HTG[socket.id] || snakes.KET[socket.id];
        if (snake && typeof angle === 'number') {
          snake.angle = angle;
        }
      }
    });

    // 2.5 Input Boost
    socket.on('ketmesye_boost', (data) => {
      const duelId = activeDuelPlayers[socket.id];
      if (duelId && activeDuels[duelId]) {
        const snake = activeDuels[duelId].snakes[socket.id];
        if (snake) {
          snake.isBoosting = !!data.isBoosting;
        }
      } else {
        const snake = snakes.HTG[socket.id] || snakes.KET[socket.id];
        if (snake) {
          snake.isBoosting = !!data.isBoosting;
        }
      }
    });

    // 3. Cash out event
    socket.on('ketmesye_cashout', async () => {
      const snake = snakes.HTG[socket.id] || snakes.KET[socket.id];
      if (!snake) {
        return socket.emit('ketmesye_error', { message: 'Aucun serpent actif à encaisser.' });
      }

      const payout = snake.value;
      const currency = snake.currency || 'HTG';

      try {
        await query('BEGIN');

        // Credit user balance
        if (currency === 'KET') {
          await query(
            "UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2",
            [payout, snake.userId]
          );
        } else {
          await query(
            "UPDATE users SET balance = balance + $1 WHERE id = $2",
            [payout, snake.userId]
          );
        }

        // Update bet record as won with calculated payout multiplier
        const multiplier = parseFloat((payout / snake.wager).toFixed(2));
        await query(
          `UPDATE bets 
           SET cashout_multiplier = $1, payout_amount = $2, is_won = true 
           WHERE id = $3`,
          [multiplier, payout, snake.betId]
        );

        // Fetch new balance
        const balanceRes = await query(
          currency === 'KET' ? 'SELECT ket_balance FROM users WHERE id = $1' : 'SELECT balance FROM users WHERE id = $1',
          [snake.userId]
        );
        const newBalance = parseFloat(currency === 'KET' ? balanceRes.rows[0].ket_balance : balanceRes.rows[0].balance);

        await query('COMMIT');

        // Process progression settlement (awards KET on HTG wins)
        await processBetSettlement(snake.userId, snake.wager, payout, currency, 'ketmesye');

        socket.leave(`ketmesye_sandbox_${currency}`);

        // Notify user of cashout success
        socket.emit('ketmesye_cashout_success', {
          payout,
          multiplier,
          newBalance,
          currency,
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations
        });

        // Broadcast to others in the same currency sandbox
        io.to(`ketmesye_sandbox_${currency}`).emit('ketmesye_player_cashed_out', {
          email: snake.email.split('@')[0],
          payout,
          currency
        });

        console.log(`Ketmesye: ${snake.email} cashed out +${payout} ${currency}.`);
        activePlayersStore.cashoutPlayer(snake.userId, 'ketmesye', payout, multiplier);
        activePlayersStore.notify(`${snake.email.split('@')[0]} a encaissé +${payout.toFixed(0)} ${currency} de l'arène KetMesye !`, 'success');

        // Remove from memory
        delete snakes[currency][socket.id];

      } catch (err) {
        await query('ROLLBACK');
        console.error('Error cashing out from Ketmesye:', err);
        socket.emit('ketmesye_error', { message: 'Erreur interne de serveur lors de l\'encaissement.' });
      }
    });

    // 4. Matchmaking Events for 1v1 Duels
    socket.on('ketmesye_create_duel', async (payload) => {
      const { userId, betAmount } = payload;
      if (!userId || !betAmount || betAmount <= 0) {
        return socket.emit('ketmesye_error', { message: 'Mise invalide.' });
      }
      try {
        await query('BEGIN');
        const userRes = await query('SELECT balance, ket_balance, active_currency, email, is_suspended FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        const user = userRes.rows[0];
        if (user.is_suspended) throw new Error('Votre compte est suspendu.');
        
        const activeCurrency = user.active_currency || 'HTG';
        const minWager = activeCurrency === 'KET' ? 1000 : 150;
        if (betAmount < minWager) {
          throw new Error(`La mise minimale est de ${minWager} ${activeCurrency}.`);
        }

        const balance = parseFloat(activeCurrency === 'KET' ? (user.ket_balance || 0) : user.balance);
        if (balance < betAmount) throw new Error('Solde insuffisant.');

        // Deduct
        if (activeCurrency === 'KET') {
          await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [betAmount, userId]);
        } else {
          await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [betAmount, userId]);
        }
        
        // Insert duel row
        const duelRes = await query(
          `INSERT INTO duels (player_a_id, bet_amount, status, currency) VALUES ($1, $2, 'pending', $3) RETURNING id`,
          [userId, betAmount, activeCurrency]
        );
        const duelId = duelRes.rows[0].id;

        // Log escrow
        await query(
          `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_deposit')`,
          [userId, duelId, betAmount]
        );

        // Process progression wager (resets inactivity, adds XP if HTG)
        await processWager(userId, betAmount, activeCurrency);

        await query('COMMIT');

        pendingDuels[duelId] = {
          id: duelId,
          betAmount,
          creatorEmail: user.email,
          playerAId: userId,
          socketId: socket.id,
          currency: activeCurrency
        };

        socket.emit('ketmesye_duel_created', { duelId, betAmount });
        broadcastPendingDuels();
      } catch (err) {
        await query('ROLLBACK');
        console.error('Ketmesye Create Duel Error:', err);
        socket.emit('ketmesye_error', { message: err.message });
      }
    });

    socket.on('ketmesye_join_duel', async (payload) => {
      const { userId, duelId } = payload;
      const pending = pendingDuels[duelId];
      if (!pending) {
        return socket.emit('ketmesye_error', { message: 'Ce duel n est plus disponible.' });
      }

      try {
        await query('BEGIN');
        const userRes = await query('SELECT balance, ket_balance, active_currency, is_suspended FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
        
        const user = userRes.rows[0];
        if (user.is_suspended) throw new Error('Compte suspendu.');
        
        const activeCurrency = user.active_currency || 'HTG';
        if (pending.currency !== activeCurrency) {
          throw new Error('Devise incompatible.');
        }

        if (pending.playerAId === userId) {
          throw new Error('Vous ne pouvez pas rejoindre votre propre duel.');
        }

        const balance = parseFloat(activeCurrency === 'KET' ? (user.ket_balance || 0) : user.balance);
        if (balance < pending.betAmount) throw new Error('Solde insuffisant.');

        // Deduct
        if (activeCurrency === 'KET') {
          await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [pending.betAmount, userId]);
        } else {
          await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [pending.betAmount, userId]);
        }

        // Update duel row
        await query(`UPDATE duels SET player_b_id = $1, status = 'active' WHERE id = $2`, [userId, duelId]);

        // Log escrow
        await query(
          `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_deposit')`,
          [userId, duelId, pending.betAmount]
        );

        // Process progression wager (resets inactivity, adds XP if HTG)
        await processWager(userId, pending.betAmount, activeCurrency);

        await query('COMMIT');

        delete pendingDuels[duelId];

        // Setup activeDuel state
        setupKetmesyeDuel(duelId, pending.playerAId, userId, pending.betAmount, activeCurrency);
        broadcastPendingDuels();
      } catch (err) {
        await query('ROLLBACK');
        console.error('Ketmesye Join Duel Error:', err);
        socket.emit('ketmesye_error', { message: err.message });
      }
    });

    socket.on('ketmesye_claim_duel_spot', (payload) => {
      const { userId, duelId } = payload;
      const duel = activeDuels[duelId];
      if (!duel) return;

      const isPlayerA = userId === duel.playerA_id;
      const isPlayerB = userId === duel.playerB_id;

      if (!isPlayerA && !isPlayerB) return;

      const spawnX = isPlayerA ? 400 : 1600;
      const spawnY = isPlayerA ? 400 : 1600;
      const startSegments = [];
      for (let i = 0; i < 5; i++) {
        startSegments.push({ x: spawnX, y: spawnY + i * 15 });
      }
      const initialPath = [];
      for (let i = 0; i < 50; i++) {
        initialPath.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
      }

      const initialValue = parseFloat((duel.betAmount * 0.90).toFixed(2));

      duel.snakes[socket.id] = {
        id: socket.id,
        userId,
        email: isPlayerA ? 'Joueur A' : 'Joueur B',
        wager: duel.betAmount,
        value: initialValue,
        segments: startSegments,
        pathHistory: initialPath,
        angle: isPlayerA ? -Math.PI / 2 : Math.PI / 2,
        speed: 10,
        color: isPlayerA ? '#06b6d4' : '#a855f7',
        eliminations: 0,
        deaths: 0,
        isInvincible: true,
        spawnTime: Date.now(),
        isBoosting: false,
        energy: 100
      };

      // Set user email
      query('SELECT email FROM users WHERE id = $1', [userId]).then(res => {
        if (res.rows.length > 0 && duel.snakes[socket.id]) {
          const email = res.rows[0].email;
          duel.snakes[socket.id].email = email;
          activePlayersStore.addPlayer(userId, email, 'snake_duel', duel.betAmount);
          activePlayersStore.notify(`${email.split('@')[0]} a rejoint le duel de serpent (${duel.betAmount} ${duel.currency || 'HTG'}) !`, 'info');
        }
      }).catch(err => console.error(err));

      activeDuelPlayers[socket.id] = duelId;
      socket.join(duel.roomId);
    });

    socket.on('ketmesye_get_pending_duels', () => {
      sendPendingDuelsToSocket(socket);
    });

    socket.on('ketmesye_cancel_duel', async (payload) => {
      const { duelId, userId } = payload;
      const pending = pendingDuels[duelId];
      if (pending && pending.playerAId === userId) {
        await cancelPendingDuel(duelId, 'Défi annulé.');
      }
    });

    // 5. Handle client disconnection (automatic death/cleanup)
    socket.on('disconnect', () => {
      // Check if they had a pending duel and cancel it
      Object.keys(pendingDuels).forEach(async (dId) => {
        const pending = pendingDuels[dId];
        if (pending && pending.socketId === socket.id) {
          await cancelPendingDuel(dId, 'Créateur déconnecté.');
        }
      });

      const duelId = activeDuelPlayers[socket.id];
      if (duelId && activeDuels[duelId]) {
        // Handle forfeit during duel
        const duel = activeDuels[duelId];
        if (duel.status === 'playing') {
          const remainingPlayerSocket = Object.keys(duel.snakes).find(id => id !== socket.id);
          const remainingPlayer = duel.snakes[remainingPlayerSocket];
          if (remainingPlayer) {
            resolveDuel(duelId, remainingPlayer.userId);
          } else {
            cancelDuel(duelId, 'Both players disconnected.');
          }
        } else {
          cancelDuel(duelId, 'Adversaire déconnecté pendant l attente.');
        }
        delete activeDuelPlayers[socket.id];
      }

      const snake = snakes.HTG[socket.id] || snakes.KET[socket.id];
      if (snake) {
        const currency = snake.currency || 'HTG';
        console.log(`Ketmesye: Player ${snake.email} disconnected. Cleaning up.`);
        
        // Spawn pellets along dead body path
        const segmentCount = snake.segments.length;
        const valuePerDrop = parseFloat(((snake.value * 0.5) / segmentCount).toFixed(4));

        snake.segments.forEach(segment => {
          pellets[currency].push({
            id: Math.random().toString(36).substring(2, 9),
            x: segment.x + (Math.random() * 10 - 5),
            y: segment.y + (Math.random() * 10 - 5),
            value: valuePerDrop,
            color: '#fbbf24',
            isCashDrop: true
          });
        });

        // Update bet row to lost in database on disconnect
        try {
          await query(
            "UPDATE bets SET payout_amount = 0.00, is_won = false WHERE id = $1",
            [snake.betId]
          );
          // Process progression settlement (awards KET on HTG losses)
          await processBetSettlement(snake.userId, snake.wager, 0.00, currency, 'ketmesye');
        } catch (err) {
          console.error('Error updating bet row on disconnect:', err);
        }

        activePlayersStore.losePlayer(snake.userId, 'ketmesye', 'dead');
        activePlayersStore.notify(`Le serpent de ${snake.email.split('@')[0]} s'est déconnecté et a perdu ${snake.value.toFixed(0)} ${currency} !`, 'danger');

        delete snakes[currency][socket.id];
      }
    });
  });
};

module.exports = {
  initKetmesyeEngine
};
