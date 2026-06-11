const { query } = require('./db');

let io;

// Game Config
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const TICK_RATE_MS = 50; // 20 updates per second
const PATH_SPACING = 2; // Spacing of path history indices for body segments
const INVINCIBLE_TIME_MS = 2000; // 2 seconds invincibility on spawn

// Game State
let snakes = {}; // { [socketId]: { id, userId, email, wager, value, segments, pathHistory, angle, speed, color, eliminations, isInvincible, spawnTime, betId } }
let pellets = []; // Array of { id, x, y, value, color, isCashDrop }

let gameLoopInterval = null;

// Helper to generate a random color
const getRandomColor = () => {
  const colors = [
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', 
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#e2e8f0'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Spawn random normal pellets
const spawnNormalPellets = (count) => {
  for (let i = 0; i < count; i++) {
    pellets.push({
      id: Math.random().toString(36).substring(2, 9),
      x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
      y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
      value: 0.10, // Each normal pellet is worth 0.10 HTG
      color: getRandomColor(),
      isCashDrop: false
    });
  }
};

// Initialize the pellets pool (150 normal pellets)
spawnNormalPellets(150);

// Tick loop running on the server
const handleGameTick = async () => {
  const socketIds = Object.keys(snakes);
  if (socketIds.length === 0) return;

  const now = Date.now();

  // 1. Move snakes
  socketIds.forEach(id => {
    const snake = snakes[id];
    
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
      // Fallback to last known position if history isn't long enough yet
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
    const snakeA = snakes[idA];
    const headA = snakeA.segments[0];

    // Out-of-bounds collision
    if (headA.x < 0 || headA.x > MAP_WIDTH || headA.y < 0 || headA.y > MAP_HEIGHT) {
      deadSnakes.add(idA);
      return;
    }

    // Snake A collisions with other snakes
    socketIds.forEach(idB => {
      if (deadSnakes.has(idA)) return; // Already flagged as dead
      const snakeB = snakes[idB];

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
        // Skip check if target is invincible or self is invincible
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
    const snake = snakes[deadId];
    if (snake) {
      console.log(`Ketmesye: Snake owned by ${snake.email} died.`);
      
      // Delete from memory IMMEDIATELY to prevent concurrent ticks from processing this snake again
      delete snakes[deadId];

      // Notify killer if any
      const killInfo = collisionKills.find(k => k.deadId === deadId);
      if (killInfo) {
        const killer = snakes[killInfo.killerId];
        if (killer) {
          killer.eliminations += 1;
          const killerSocket = io.sockets.sockets.get(killInfo.killerId);
          if (killerSocket) {
            killerSocket.emit('ketmesye_kill', { killed: snake.email.split('@')[0] });
          }
        }
      }

      // Spawn cash pellets from the dead body
      // We distribute 50% of the snake's accumulated value along its segments (platform keeps 50%)
      const segmentCount = snake.segments.length;
      const totalValueToDrop = snake.value * 0.5;
      const valuePerDrop = parseFloat((totalValueToDrop / segmentCount).toFixed(4));

      // Drop a yellow cash pellet at every segment
      snake.segments.forEach(segment => {
        pellets.push({
          id: Math.random().toString(36).substring(2, 9),
          x: segment.x + (Math.random() * 10 - 5),
          y: segment.y + (Math.random() * 10 - 5),
          value: valuePerDrop,
          color: '#fbbf24', // Shiny yellow
          isCashDrop: true
        });
      });

      // Update bet row to lost in database (it was inserted as is_won = false, so this completes the round)
      try {
        await query(
          "UPDATE bets SET payout_amount = 0.00, is_won = false WHERE id = $1",
          [snake.betId]
        );
      } catch (err) {
        console.error('Error logging snake death in DB:', err);
      }

      // Notify the dead player
      const socket = io.sockets.sockets.get(deadId);
      if (socket) {
        socket.emit('ketmesye_death', {
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations,
          valueLost: snake.value
        });
      }
    }
  }

  // 4. Food eating
  Object.keys(snakes).forEach(id => {
    const snake = snakes[id];
    const head = snake.segments[0];

    for (let i = pellets.length - 1; i >= 0; i--) {
      const pellet = pellets[i];
      const dist = Math.hypot(head.x - pellet.x, head.y - pellet.y);

      if (dist < 20) { // Consumption threshold
        // Eat pellet
        snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
        
        // Consumption logic: grow 1 segment per 10.0 HTG value gained (normal pellet worth 0.10 HTG adds 0.01 segment)
        snake.growthPoints = (snake.growthPoints || 0) + pellet.value;
        const segmentsToAdd = Math.floor(snake.growthPoints / 10.0);
        if (segmentsToAdd > 0) {
          snake.growthPoints -= segmentsToAdd * 10.0;
          for (let g = 0; g < segmentsToAdd; g++) {
            const lastSegment = snake.segments[snake.segments.length - 1];
            snake.segments.push({ ...lastSegment });
          }
        }

        // Remove pellet
        pellets.splice(i, 1);

        // Respawn a new normal pellet if a normal one was eaten
        if (!pellet.isCashDrop) {
          spawnNormalPellets(1);
        }
      }
    }
  });

  // 5. Broadcast game state to everyone in lobby
  // Build clean broadcast payload
  const broadcastPayload = {
    snakes: Object.keys(snakes).reduce((acc, id) => {
      const s = snakes[id];
      acc[id] = {
        id: s.id,
        email: s.email.split('@')[0], // mask email
        value: s.value,
        segments: s.segments.map(seg => ({ x: Math.round(seg.x), y: Math.round(seg.y) })), // compress coordinates
        angle: s.angle,
        color: s.color,
        eliminations: s.eliminations,
        isInvincible: s.isInvincible,
        energy: s.energy
      };
      return acc;
    }, {}),
    pellets: pellets.map(p => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      value: p.value,
      color: p.color,
      isCashDrop: p.isCashDrop
    })),
    leaderboard: Object.values(snakes)
      .map(s => ({ email: s.email.split('@')[0], value: s.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  };

  io.emit('ketmesye_tick', broadcastPayload);
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

      if (snakes[socket.id]) {
        return socket.emit('ketmesye_error', { message: 'Vous êtes déjà dans la partie.' });
      }

      const entryWager = parseFloat(wager);
      if (isNaN(entryWager) || entryWager < 125) {
        return socket.emit('ketmesye_error', { message: 'La mise minimale pour spawn est de 125 HTG.' });
      }

      try {
        await query('BEGIN');

        // Check user details
        const userRes = await query('SELECT balance, is_suspended FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Utilisateur introuvable.' });
        }

        const user = userRes.rows[0];
        if (user.is_suspended) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Compte suspendu.' });
        }

        const balance = parseFloat(user.balance);
        if (balance < entryWager) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: 'Solde insuffisant.' });
        }

        // Deduct entry fee
        const newBalance = balance - entryWager;
        await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

        // Insert bet row into DB (is_won = false initially)
        const betRes = await query(
          `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won) 
           VALUES ($1, null, $2, null, 0.00, false) RETURNING id`,
          [userId, entryWager]
        );
        const betId = betRes.rows[0].id;

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

        // Register snake in memory
        snakes[socket.id] = {
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
          energy: 100
        };

        socket.emit('ketmesye_join_success', {
          wager: entryWager,
          initialValue,
          newBalance
        });

        console.log(`Ketmesye: ${email} joined with ${entryWager} HTG wager.`);

      } catch (err) {
        await query('ROLLBACK');
        console.error('Error joining Ketmesye:', err);
        socket.emit('ketmesye_error', { message: 'Erreur interne du serveur lors de la connexion.' });
      }
    });

    // 2. Input movement direction
    socket.on('ketmesye_input', (data) => {
      const { angle } = data;
      const snake = snakes[socket.id];
      if (snake && typeof angle === 'number') {
        snake.angle = angle;
      }
    });

    // 2.5 Input Boost
    socket.on('ketmesye_boost', (data) => {
      const snake = snakes[socket.id];
      if (snake) {
        snake.isBoosting = !!data.isBoosting;
      }
    });

    // 3. Cash out event
    socket.on('ketmesye_cashout', async () => {
      const snake = snakes[socket.id];
      if (!snake) {
        return socket.emit('ketmesye_error', { message: 'Aucun serpent actif à encaisser.' });
      }

      const payout = snake.value;

      try {
        await query('BEGIN');

        // Credit user balance
        await query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [payout, snake.userId]
        );

        // Update bet record as won with calculated payout multiplier
        const multiplier = parseFloat((payout / snake.wager).toFixed(2));
        await query(
          `UPDATE bets 
           SET cashout_multiplier = $1, payout_amount = $2, is_won = true 
           WHERE id = $3`,
          [multiplier, payout, snake.betId]
        );

        // Fetch new balance
        const balanceRes = await query('SELECT balance FROM users WHERE id = $1', [snake.userId]);
        const newBalance = parseFloat(balanceRes.rows[0].balance);

        await query('COMMIT');

        // Notify user of cashout success
        socket.emit('ketmesye_cashout_success', {
          payout,
          multiplier,
          newBalance,
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations
        });

        // Broadcast to others
        io.emit('ketmesye_player_cashed_out', {
          email: snake.email.split('@')[0],
          payout
        });

        console.log(`Ketmesye: ${snake.email} cashed out +${payout} HTG.`);

        // Remove from memory
        delete snakes[socket.id];

      } catch (err) {
        await query('ROLLBACK');
        console.error('Error cashing out from Ketmesye:', err);
        socket.emit('ketmesye_error', { message: 'Erreur interne de serveur lors de l\'encaissement.' });
      }
    });

    // 4. Handle client disconnection (automatic death/cleanup)
    socket.on('disconnect', () => {
      const snake = snakes[socket.id];
      if (snake) {
        console.log(`Ketmesye: Player ${snake.email} disconnected. Cleaning up.`);
        
        // Spawn pellets along dead body path
        const segmentCount = snake.segments.length;
        const valuePerDrop = parseFloat(((snake.value * 0.5) / segmentCount).toFixed(4));

        snake.segments.forEach(segment => {
          pellets.push({
            id: Math.random().toString(36).substring(2, 9),
            x: segment.x + (Math.random() * 10 - 5),
            y: segment.y + (Math.random() * 10 - 5),
            value: valuePerDrop,
            color: '#fbbf24',
            isCashDrop: true
          });
        });

        delete snakes[socket.id];
      }
    });
  });
};

module.exports = {
  initKetmesyeEngine
};
