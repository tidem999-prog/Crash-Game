const { query } = require('./db');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');
const { deductWager, creditPayout, broadcastBalanceUpdate } = require('./utils/bonus');

let io;

// Game Config
const MAP_WIDTH = 10000;
const MAP_HEIGHT = 10000;
const TICK_RATE_MS = 50; // 20 updates per second
const PATH_SPACING = 2; // Spacing of path history indices for body segments
const INVINCIBLE_TIME_MS = 2000; // 2 seconds invincibility on spawn
const GAME_DURATION_MS = 2 * 60 * 1000; // 2 minutes for a duel

// Game State (Public Sandbox partitioned by currency)
let snakes = { HTG: {}, KET: {}, PIECES: {}, FREE: {} };
let pellets = { HTG: [], KET: [], PIECES: [], FREE: [] };

// Game State (1v1 Duels)
const pendingDuels = {}; // maps duelId -> { id, betAmount, creatorEmail, playerAId, currency }
const activeDuels = {}; // maps duelId -> { id, roomId, betAmount, status, playerA_id, playerB_id, snakes: {}, pellets: [], timeLeft, startedAt, timer, currency }
const activeDuelPlayers = {}; // maps socketId -> duelId

// Disconnect grace period storage (15 segond pou rezo mobil 4G an Ayiti rekonekte san pèdi pyès)
// maps effectiveUserId -> { timeout, socketId, currency, snake }
const disconnectTimers = new Map();

let gameLoopInterval = null;

// Helper to generate a random color
const getRandomColor = () => {
  const colors = [
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', 
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#e2e8f0'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to get any snake across all currency and championship sandboxes
const getSnakeBySocketId = (socketId) => {
  for (const c of Object.keys(snakes)) {
    if (snakes[c] && snakes[c][socketId]) {
      return snakes[c][socketId];
    }
  }
  return null;
};

// Spawn random normal pellets for a specific sandbox
const spawnNormalPellets = (currency, count) => {
  if (!pellets[currency]) pellets[currency] = [];
  for (let i = 0; i < count; i++) {
    pellets[currency].push({
      id: Math.random().toString(36).substring(2, 9),
      x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
      y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
      value: currency === 'KET' ? 0.80 : (currency === 'FREE' || currency.startsWith('CHAMP_') ? 1.0 : 0.10), // FREE & CHAMP pellets worth 1 pt
      color: getRandomColor(),
      isCashDrop: false
    });
  }
};

// Initialize the pellets pool (450 normal pellets per sandbox: smooth network, zero lag)
spawnNormalPellets('HTG', 450);
spawnNormalPellets('KET', 450);
spawnNormalPellets('PIECES', 450);
spawnNormalPellets('FREE', 450);

// --- 5-6 SMART HUNTER BOTS FOR FREE TRIAL (Esè Gratis) ---
const BOT_NAMES = ['Viper99', 'Shadow', 'Mamba', 'Kobra', 'DragonX', 'Titan'];
const BOT_COLORS = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

const spawnFreeBot = (botId, index = 0) => {
  const name = BOT_NAMES[index % BOT_NAMES.length];
  const color = BOT_COLORS[index % BOT_COLORS.length];
  const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 800)) + 400;
  const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 800)) + 400;
  const startSegments = [];
  for (let s = 0; s < 8; s++) {
    startSegments.push({ x: spawnX, y: spawnY + s * 14 });
  }
  const initialPath = [];
  for (let p = 0; p < 60; p++) {
    initialPath.push({ x: spawnX, y: spawnY + p * (14 / PATH_SPACING) });
  }

  snakes.FREE[botId] = {
    id: botId,
    userId: botId,
    email: name,
    wager: 0,
    value: 100.0,
    segments: startSegments,
    pathHistory: initialPath,
    angle: Math.random() * Math.PI * 2,
    speed: 9,
    color,
    eliminations: 0,
    isInvincible: false,
    hasStartedMoving: true,
    spawnTime: Date.now(),
    isBoosting: false,
    energy: 100,
    currency: 'FREE',
    isBot: true,
    isFreePractice: true
  };
};

const ensureFreeBots = () => {
  if (!snakes.FREE) return;
  const humanCount = Object.keys(snakes.FREE).filter(id => !snakes.FREE[id].isBot).length;
  if (humanCount === 0) {
    // If no human player is in FREE arena, clean up bots to save CPU
    Object.keys(snakes.FREE).forEach(id => {
      if (snakes.FREE[id].isBot) delete snakes.FREE[id];
    });
    return;
  }

  // Ensure exactly 5-6 bots are present in the arena
  for (let i = 0; i < 6; i++) {
    const botId = `bot_${i}`;
    if (!snakes.FREE[botId]) {
      spawnFreeBot(botId, i);
    }
  }
};

// Tick sandbox routine for a specific currency sandbox
const tickSandbox = async (currency) => {
  if (currency === 'FREE') {
    ensureFreeBots();
  }

  const sandboxSnakes = snakes[currency];
  const sandboxPellets = pellets[currency];
  const socketIds = Object.keys(sandboxSnakes);
  if (socketIds.length === 0) return;

  const now = Date.now();

  // 1. Move snakes
  socketIds.forEach(id => {
    const snake = sandboxSnakes[id];
    if (!snake) return;

    // --- SMART HUNTER BOT AI ---
    if (snake.isBot) {
      snake.energy = snake.energy ?? 100;
      let desiredAngle = snake.angle;
      let huntingPlayer = false;

      // Find closest human player
      let closestHuman = null;
      let closestHumanDist = 999999;
      const botHead = snake.segments[0];

      socketIds.forEach(otherId => {
        const other = sandboxSnakes[otherId];
        if (!other || other.isBot || !other.segments || !other.segments[0] || !other.hasStartedMoving) return;
        const d = Math.hypot(other.segments[0].x - botHead.x, other.segments[0].y - botHead.y);
        if (d < closestHumanDist) {
          closestHumanDist = d;
          closestHuman = other;
        }
      });

      // A. Hunter instinct: If human player < 700px, predict path & try to cut them off to make them crash!
      if (closestHuman && closestHumanDist < 700) {
        huntingPlayer = true;
        const humanHead = closestHuman.segments[0];
        const leadSteps = Math.min(130, closestHumanDist * 0.45);
        const targetX = humanHead.x + Math.cos(closestHuman.angle) * leadSteps;
        const targetY = humanHead.y + Math.sin(closestHuman.angle) * leadSteps;
        desiredAngle = Math.atan2(targetY - botHead.y, targetX - botHead.x);

        // Sprint / Boost to whip body directly in front of human user
        if (closestHumanDist < 300 && snake.energy > 25) {
          snake.isBoosting = true;
          snake.speed = 16;
          snake.energy = Math.max(0, snake.energy - 2);
        } else {
          snake.isBoosting = false;
          snake.speed = 9;
          snake.energy = Math.min(100, snake.energy + 1.2);
        }
      }

      // B. If not hunting human, seek nearest pellet to grow and become larger
      if (!huntingPlayer) {
        snake.isBoosting = false;
        snake.speed = 9;
        snake.energy = Math.min(100, (snake.energy || 0) + 1.5);

        let closestP = null;
        let minDist = 400;
        for (let pi = 0; pi < sandboxPellets.length; pi += 5) {
          const p = sandboxPellets[pi];
          const d = Math.hypot(botHead.x - p.x, botHead.y - p.y);
          if (d < minDist) {
            minDist = d;
            closestP = p;
          }
        }
        if (closestP) {
          desiredAngle = Math.atan2(closestP.y - botHead.y, closestP.x - botHead.x);
        } else if (Math.random() < 0.04) {
          desiredAngle += (Math.random() - 0.5) * 1.2;
        }
      }

      // C. Obstacle avoidance (detect body 45px ahead to prevent trivial suicide)
      const lookAheadX = botHead.x + Math.cos(desiredAngle) * 45;
      const lookAheadY = botHead.y + Math.sin(desiredAngle) * 45;
      let danger = false;

      for (const otherId of socketIds) {
        if (otherId === id) continue;
        const otherSnake = sandboxSnakes[otherId];
        if (!otherSnake || !otherSnake.segments) continue;
        for (const seg of otherSnake.segments) {
          if (Math.hypot(lookAheadX - seg.x, lookAheadY - seg.y) < 22) {
            danger = true;
            break;
          }
        }
        if (danger) break;
      }

      if (danger) {
        desiredAngle += Math.PI * 0.55;
        snake.isBoosting = false;
        snake.speed = 8;
      }

      // D. Wall avoidance
      if (botHead.x < 250) desiredAngle = 0;
      else if (botHead.x > MAP_WIDTH - 250) desiredAngle = Math.PI;
      else if (botHead.y < 250) desiredAngle = Math.PI / 2;
      else if (botHead.y > MAP_HEIGHT - 250) desiredAngle = -Math.PI / 2;

      // E. Smooth angle turn
      let angleDiff = desiredAngle - snake.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      snake.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.22);
    } else {
      // --- HUMAN PLAYER MOVEMENT ---
      // Si jwè a dekonekte sou 4G, kite l an sekirite san mouvman pandan l ap rekonekte
      if (snake.isDisconnected) {
        snake.isInvincible = true;
        return;
      }

      // Pa kouri toutotan jwè a poko kòmanse jwe ak joystick la!
      if (!snake.hasStartedMoving) {
        snake.isInvincible = true;
        return;
      }

      // Check invincibility timeout
      if (snake.invincibleUntil) {
        snake.isInvincible = now < snake.invincibleUntil;
      } else if (snake.isInvincible && now - snake.spawnTime > INVINCIBLE_TIME_MS) {
        snake.isInvincible = false;
      }

      // Energy and Boost speed logic (Egzak menm jan ak vibeht.com: 9 nòmal, 16 boost)
      if (snake.isBoosting && snake.energy > 5) {
        snake.speed = 16; // Boost speed
        snake.energy = Math.max(0, snake.energy - 1.8); // Drain energy
      } else {
        snake.speed = 9; // Vitès nòmal egzakteman menm jan ak vibeht.com
        snake.energy = Math.min(100, snake.energy + 1.2); // Recover energy
      }
    }

    if (!Number.isFinite(snake.angle)) {
      snake.angle = 0.0;
    }

    const head = { ...snake.segments[0] };
    if (!head || !Number.isFinite(head.x) || !Number.isFinite(head.y)) return;
    
    // Update head position
    head.x += Math.cos(snake.angle) * snake.speed;
    head.y += Math.sin(snake.angle) * snake.speed;

    if (!Number.isFinite(head.x) || !Number.isFinite(head.y)) return;

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
    if (!snakeA || !snakeA.hasStartedMoving) return;
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
      if (!snakeB || !snakeB.hasStartedMoving) return;

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
      // Zewo self-collision: Yon jwè pa janm mouri lè l pase sou pwòp kò pa l!
      if (idA === idB) return;
      for (let i = 0; i < snakeB.segments.length; i++) {
        if (snakeA.isInvincible || snakeB.isInvincible) continue;

        const segment = snakeB.segments[i];
        const dist = Math.hypot(headA.x - segment.x, headA.y - segment.y);

        if (dist < 18) { // Collision threshold
          deadSnakes.add(idA);
          collisionKills.push({ killerId: idB, deadId: idA });
          break;
        }
      }
    });
  });

  // 3. Process dead snakes
  for (const deadId of deadSnakes) {
    const snake = sandboxSnakes[deadId];
    if (snake) {
      // --- A. BOT DEATH (FREE ARENA) ---
      if (snake.isBot) {
        console.log(`Ketmesye [FREE]: Bot ${snake.email} eliminated.`);
        delete sandboxSnakes[deadId];

        // Notify killer if human and award 0.00001 Pieces
        const killInfo = collisionKills.find(k => k.deadId === deadId);
        if (killInfo) {
          const killer = sandboxSnakes[killInfo.killerId];
          if (killer && !killer.isBot) {
            killer.eliminations += 1;
            const killerSocket = io.sockets.sockets.get(killInfo.killerId);
            if (killerSocket) {
              killerSocket.emit('ketmesye_kill', { 
                killed: snake.email,
                isBot: true,
                rewardPieces: 2.0
              });
            }
          }
        }

        // Explode dead bot body into scattered glowing pellets for the player to collect!
        if (snake.segments && snake.segments.length > 0) {
          // 2 glowing pellets per segment
          snake.segments.forEach((seg, sIdx) => {
            for (let k = 0; k < 2; k++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = Math.random() * 22;
              sandboxPellets.push({
                id: `bot_drop_${deadId}_${sIdx}_${k}_${Math.random().toString(36).substring(2, 6)}`,
                x: Math.max(25, Math.min(MAP_WIDTH - 25, seg.x + Math.cos(angle) * dist)),
                y: Math.max(25, Math.min(MAP_HEIGHT - 25, seg.y + Math.sin(angle) * dist)),
                value: 1.0,
                color: snake.color || getRandomColor(),
                isCashDrop: false,
                isBotDrop: true
              });
            }
          });

          // Extra 8 glowing pellets around head
          const head = snake.segments[0];
          for (let b = 0; b < 8; b++) {
            const angle = (b / 8) * Math.PI * 2;
            const dist = 10 + Math.random() * 24;
            sandboxPellets.push({
              id: `bot_head_drop_${deadId}_${b}_${Math.random().toString(36).substring(2, 6)}`,
              x: Math.max(25, Math.min(MAP_WIDTH - 25, head.x + Math.cos(angle) * dist)),
              y: Math.max(25, Math.min(MAP_HEIGHT - 25, head.y + Math.sin(angle) * dist)),
              value: 1.0,
              color: '#fbbf24',
              isCashDrop: false,
              isBotDrop: true
            });
          }
        }

        // Respawn this bot after 3.5 seconds to keep 5-6 bots in the arena
        setTimeout(() => {
          if (snakes.FREE) {
            const humanCount = Object.keys(snakes.FREE).filter(id => !snakes.FREE[id].isBot).length;
            if (humanCount > 0 && !snakes.FREE[deadId]) {
              const idx = parseInt(deadId.replace('bot_', ''), 10) || 0;
              spawnFreeBot(deadId, idx);
            }
          }
        }, 3500);

        continue;
      }

      // --- B. HUMAN PLAYER DEATH ---
      console.log(`Ketmesye: Snake owned by ${snake.email} died.`);
      
      // Delete from memory IMMEDIATELY
      delete sandboxSnakes[deadId];

      // Notify killer if any
      const killInfo = collisionKills.find(k => k.deadId === deadId);
      if (killInfo) {
        const killer = sandboxSnakes[killInfo.killerId];
        if (killer) {
          killer.eliminations += 1;
          const rewardPieces = (currency.startsWith('CHAMP_') || snake.isChampionship || currency === 'FREE') ? 0.0 : +(snake.value * 0.90).toFixed(2);
          if (rewardPieces > 0) {
            killer.value = +(killer.value + rewardPieces).toFixed(2);
          }
          const killerSocket = io.sockets.sockets.get(killInfo.killerId);
          if (killerSocket) {
            killerSocket.emit('ketmesye_kill', { 
              killed: snake.email.split('@')[0], 
              isBot: false, 
              rewardPieces: rewardPieces 
            });
          }
        }
      }

      // Spawn cash/points pellets from the dead body
      // NAN CHANPYONA (currency.startsWith('CHAMP_') oswa snake.isChampionship):
      // ZEWÒ PYÈS/BOUL KOULÈV MOURI! Espas la dwe rete 100% vid e pwòp san okenn kadav!
      if (!currency.startsWith('CHAMP_') && !snake.isChampionship) {
        // Drop pellets at every segment (random normal pellets if FREE; shiny yellow for GROWTH if real money)
        snake.segments.forEach(segment => {
          sandboxPellets.push({
            id: Math.random().toString(36).substring(2, 9),
            x: segment.x + (Math.random() * 10 - 5),
            y: segment.y + (Math.random() * 10 - 5),
            value: currency === 'FREE' ? 1.0 : 0.0, // 90% pyès ale dirèkteman sou sak touye l la; boul jòn sa yo se pou GRANDI kò a!
            color: currency === 'FREE' ? getRandomColor() : '#fbbf24', // Shiny yellow for growth
            isCashDrop: currency !== 'FREE'
          });
        });
      }

      // Update bet row to lost in database si se pa PIECES ni FREE ni CHANPYONA
      if (snake.betId && !currency.startsWith('CHAMP_')) {
        try {
          await query(
            "UPDATE bets SET payout_amount = 0.00, is_won = false WHERE id = $1",
            [snake.betId]
          );
          // Process progression settlement (awards KET on HTG losses)
          await processBetSettlement(snake.userId, snake.wager, 0.00, snake.currency || 'HTG', 'ketmesye');
          
          const { recordPlatformRevenue } = require('./utils/competitions');
          await recordPlatformRevenue(parseFloat(snake.wager), snake.currency || 'HTG', 'ketmesye');
        } catch (err) {
          console.error('Error logging snake death in DB:', err);
        }
      }

      // Notify the dead player
      const socket = io.sockets.sockets.get(deadId);
      if (socket) {
        socket.emit('ketmesye_death', {
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations,
          valueLost: (currency.startsWith('CHAMP_') || currency === 'FREE') ? 0 : snake.value,
          score: snake.value,
          currency: snake.currency,
          isFreePractice: !!snake.isFreePractice,
          isChampionship: currency.startsWith('CHAMP_') || !!snake.isChampionship
        });
      }

      if (currency !== 'FREE' && currency !== 'PIECES' && !currency.startsWith('CHAMP_')) {
        activePlayersStore.losePlayer(snake.userId, 'ketmesye', 'dead');
        activePlayersStore.notify(`Le serpent de ${snake.email.split('@')[0]} est mort et a perdu ${snake.value.toFixed(0)} ${currency} !`, 'danger');
      }
    }
  }

  // 4. Food Magnet Attraction & Consumption
  Object.keys(sandboxSnakes).forEach(id => {
    const snake = sandboxSnakes[id];
    if (!snake || !snake.hasStartedMoving) return;
    const head = snake.segments[0];
    const segCount = snake.segments.length;

    // Kontak Fizik Sèlman: Ti boul yo rete an plas fiks, tèt la dwe frape yo fizikman pou vale yo
    const eatThreshold = 36.0;

    for (let i = sandboxPellets.length - 1; i >= 0; i--) {
      const pellet = sandboxPellets[i];
      const dist = Math.hypot(head.x - pellet.x, head.y - pellet.y);

      if (dist < eatThreshold) { // Consumption on physical touch only
        snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
        
        // Règleman kwasans koulèv la:
        // 1. Boul jòn (Cash Drops ki soti nan lòt koulèv ki mouri oswa boul bot): bay +2 segman touswit
        // 2. Ti boul nòmal: chak 3 ti boul vale bay +1 segman
        const maxSegments = 150;
        if (pellet.isCashDrop || pellet.isBotDrop) {
          for (let k = 0; k < 2; k++) {
            if (snake.segments.length < maxSegments) {
              const lastSegment = snake.segments[snake.segments.length - 1];
              snake.segments.push({ ...lastSegment });
            }
          }
        } else {
          snake.pelletsEaten = (snake.pelletsEaten || 0) + 1;
          if (snake.pelletsEaten % 3 === 0 && snake.segments.length < maxSegments) {
            const lastSegment = snake.segments[snake.segments.length - 1];
            snake.segments.push({ ...lastSegment });
          }
        }

        // Remove pellet
        sandboxPellets.splice(i, 1);

        // Respawn normal pellet (only for natural map pellets, not dropped pellets)
        if (!pellet.isCashDrop && !pellet.isBotDrop) {
          spawnNormalPellets(currency, 1);
        }
      }
    }
  });

  // 5. Broadcast game state to everyone in this currency's sandbox
  const broadcastPayload = {
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    snakes: Object.keys(sandboxSnakes).reduce((acc, id) => {
      const s = sandboxSnakes[id];
      acc[id] = {
        id: s.id,
        userId: s.userId || s.id,
        email: s.email.split('@')[0],
        value: s.value,
        segments: s.segments.map(seg => ({ x: Math.round(seg.x), y: Math.round(seg.y) })),
        angle: s.angle,
        color: s.color,
        eliminations: s.eliminations,
        isInvincible: s.isInvincible,
        isDisconnected: !!s.isDisconnected,
        hasStartedMoving: s.hasStartedMoving !== false,
        energy: s.energy,
        isFreePractice: !!s.isFreePractice
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
  await tickSandbox('PIECES');
  await tickSandbox('FREE');
  for (const c of Object.keys(snakes)) {
    if (c.startsWith('CHAMP_')) {
      await tickSandbox(c);
    }
  }
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

const setupKetmesyeDuel = (duelId, playerA_id, playerB_id, betAmount, currency, playerAFundedByBonus, playerBFundedByBonus) => {
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
    currency,
    playerAFundedByBonus,
    playerBFundedByBonus
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
    if (!snake) return;

    if (!snake.hasStartedMoving) {
      snake.isInvincible = true;
      return;
    }

    if (snake.isInvincible && now - snake.spawnTime > INVINCIBLE_TIME_MS) {
      snake.isInvincible = false;
    }

    if (snake.isBoosting && snake.energy > 5) {
      snake.speed = 16;
      snake.energy = Math.max(0, snake.energy - 1.8);
    } else {
      snake.speed = 9;
      snake.energy = Math.min(100, snake.energy + 1.2);
    }

    if (!Number.isFinite(snake.angle)) {
      snake.angle = 0.0;
    }

    const head = { ...snake.segments[0] };
    if (!head || !Number.isFinite(head.x) || !Number.isFinite(head.y)) return;

    head.x += Math.cos(snake.angle) * snake.speed;
    head.y += Math.sin(snake.angle) * snake.speed;

    if (!Number.isFinite(head.x) || !Number.isFinite(head.y)) return;

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
    if (!snakeA || !snakeA.hasStartedMoving) return;
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
      if (!snakeB || !snakeB.hasStartedMoving) return;

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
      // Zewo self-collision: Yon jwè pa janm mouri lè l pase sou pwòp kò pa l!
      if (idA === idB) return;
      for (let i = 0; i < snakeB.segments.length; i++) {
        if (snakeA.isInvincible || snakeB.isInvincible) continue;
        const segment = snakeB.segments[i];
        const dist = Math.hypot(headA.x - segment.x, headA.y - segment.y);
        if (dist < 18) {
          deadSnakes.add(idA);
          collisionKills.push({ killerId: idB, deadId: idA });
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

  // 4. Eating pellets in duel with Magnet Attraction
  socketIds.forEach(id => {
    const snake = duel.snakes[id];
    if (!snake || !snake.hasStartedMoving) return;
    const head = snake.segments[0];
    const segCount = snake.segments.length;

    // Kontak Fizik Sèlman (Zewo Leman nan Duel): Ti boul yo rete an plas fiks
    const eatThreshold = 26.0;

    for (let i = duel.pellets.length - 1; i >= 0; i--) {
      const pellet = duel.pellets[i];
      const dist = Math.hypot(head.x - pellet.x, head.y - pellet.y);

      if (dist < eatThreshold) {
        snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
        
        // Règleman kwasans koulèv la nan duel:
        // 1. Boul jòn (Cash Drops ki soti nan lòt koulèv ki mouri): bay +2 segman touswit
        // 2. Ti boul nòmal: chak 3 ti boul vale bay +1 segman
        const maxSegments = 150;
        if (pellet.isCashDrop) {
          for (let k = 0; k < 2; k++) {
            if (snake.segments.length < maxSegments) {
              const lastSegment = snake.segments[snake.segments.length - 1];
              snake.segments.push({ ...lastSegment });
            }
          }
        } else {
          snake.pelletsEaten = (snake.pelletsEaten || 0) + 1;
          if (snake.pelletsEaten % 3 === 0 && snake.segments.length < maxSegments) {
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
        hasStartedMoving: s.hasStartedMoving !== false,
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
      await creditPayout(null, duel.playerA_id, duel.betAmount, activeCurrency, duel.playerAFundedByBonus);
      await creditPayout(null, duel.playerB_id, duel.betAmount, activeCurrency, duel.playerBFundedByBonus);
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
      const winnerFundedByBonus = (winnerId === duel.playerA_id) ? duel.playerAFundedByBonus : duel.playerBFundedByBonus;
      await creditPayout(null, winnerId, payout, activeCurrency, winnerFundedByBonus);
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
      const winnerFunded = (winnerId === duel.playerA_id) ? duel.playerAFundedByBonus : duel.playerBFundedByBonus;
      const loserFunded = (loserId === duel.playerA_id) ? duel.playerAFundedByBonus : duel.playerBFundedByBonus;
      await query(
        `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency, funded_by_bonus) 
         VALUES ($1, null, $2, $3, $4, true, $5, $6)`,
        [winnerId, duel.betAmount, 1.80, payout, activeCurrency, !!winnerFunded]
      );
      await query(
        `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency, funded_by_bonus) 
         VALUES ($1, null, $2, 0.00, 0.00, false, $3, $4)`,
        [loserId, duel.betAmount, activeCurrency, !!loserFunded]
      );

      io.to(duel.roomId).emit('ketmesye_duel_over', { reason, winnerId, payoutAmount: payout, currency: activeCurrency });
      activePlayersStore.cashoutPlayer(winnerId, 'snake_duel', payout, 1.80);
      activePlayersStore.losePlayer(loserId, 'snake_duel', 'eliminated');
    }

    await query('COMMIT');

    await broadcastBalanceUpdate(io, duel.playerA_id);
    await broadcastBalanceUpdate(io, duel.playerB_id);

    // Process progression settlements (awards KET on HTG duel win/loss)
    await processBetSettlement(winnerId, duel.betAmount, payout, activeCurrency, 'snake_duel');
    await processBetSettlement(loserId, duel.betAmount, 0.00, activeCurrency, 'snake_duel');

    if (activeCurrency === 'HTG') {
      const netRevenue = (2 * parseFloat(duel.betAmount)) - parseFloat(payout);
      if (netRevenue !== 0) {
        const { recordPlatformRevenue } = require('./utils/competitions');
        await recordPlatformRevenue(netRevenue, 'HTG', 'snake_duel');
      }
    }
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
    await creditPayout(null, duel.playerA_id, duel.betAmount, activeCurrency, duel.playerAFundedByBonus);
    if (duel.playerB_id) {
      await creditPayout(null, duel.playerB_id, duel.betAmount, activeCurrency, duel.playerBFundedByBonus);
    }
    await query(`UPDATE duels SET status = 'cancelled' WHERE id = $1`, [duelId]);
    await query('COMMIT');

    await broadcastBalanceUpdate(io, duel.playerA_id);
    if (duel.playerB_id) await broadcastBalanceUpdate(io, duel.playerB_id);

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
    await creditPayout(null, pending.playerAId, pending.betAmount, activeCurrency, pending.playerAFundedByBonus);
    await query(`UPDATE duels SET status = 'cancelled' WHERE id = $1`, [duelId]);
    await query(
      `INSERT INTO audit_logs (user_id, game_id, game_type, amount, action) VALUES ($1, $2, 'snake_duel', $3, 'escrow_refund')`,
      [pending.playerAId, duelId, pending.betAmount]
    );
    await query('COMMIT');
    await broadcastBalanceUpdate(io, pending.playerAId);
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
      const { userId, email, wager, currency } = data;
      const requestedCurrency = (currency || 'HTG').toUpperCase();
      const isFree = !!data.isFreeTrial || requestedCurrency === 'POINTS' || requestedCurrency === 'FREE';
      const effectiveUserId = userId ? String(userId) : (email ? String(email) : null);

      // --- 4G AUTO-RESUME: Rekipere koulèv la si li te dekonekte pandan 15 segond ki sot pase yo ---
      if (effectiveUserId && disconnectTimers.has(effectiveUserId)) {
        const pending = disconnectTimers.get(effectiveUserId);
        clearTimeout(pending.timeout);
        disconnectTimers.delete(effectiveUserId);

        const cur = pending.currency;
        const existingSnake = pending.snake;

        if (existingSnake && snakes[cur]) {
          console.log(`Ketmesye [4G AUTO-RESUME]: Player ${existingSnake.email} reconnected! Transferring to socket ${socket.id}`);
          delete snakes[cur][pending.socketId];

          existingSnake.id = socket.id;
          existingSnake.isDisconnected = false;
          existingSnake.isInvincible = true;
          existingSnake.invincibleUntil = Date.now() + 3500; // 3.5s envansibilite lè l tounen

          snakes[cur][socket.id] = existingSnake;
          socket.join(`ketmesye_sandbox_${cur}`);

          socket.emit('ketmesye_join_success', {
            wager: existingSnake.wager,
            initialValue: existingSnake.value,
            newBalance: null,
            currency: cur,
            resumed: true
          });
          return;
        }
      }

      if (snakes.HTG[socket.id] || snakes.KET[socket.id] || (snakes.PIECES && snakes.PIECES[socket.id]) || (snakes.FREE && snakes.FREE[socket.id])) {
        return socket.emit('ketmesye_error', { message: 'Vous êtes déjà dans la partie.' });
      }

      // Si se mòd Esè Gratis (3 fwa pa jou, sèlman ti boul, izole nèt de jwè 500+ pyès)
      if (isFree) {
        const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
        const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;

        const startSegments = [];
        for (let i = 0; i < 5; i++) {
          startSegments.push({ x: spawnX, y: spawnY + i * 15 });
        }

        const initialPath = [];
        for (let i = 0; i < 50; i++) {
          initialPath.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
        }

        // Netwaye nenpòt ansyen koulèv fantom nan FREE
        if (snakes.FREE) {
          Object.keys(snakes.FREE).forEach(sId => {
            const s = snakes.FREE[sId];
            if (s && (sId === socket.id || (email && s.email === email) || (userId && s.userId === userId))) {
              delete snakes.FREE[sId];
            }
          });
        }

        snakes.FREE[socket.id] = {
          id: socket.id,
          userId: userId || socket.id,
          email: email || `Player_${socket.id.substring(0, 5)}`,
          wager: 0,
          value: 0,
          segments: startSegments,
          pathHistory: initialPath,
          angle: -Math.PI / 2,
          speed: 6.5,
          color: getRandomColor(),
          eliminations: 0,
          isInvincible: true,
          hasStartedMoving: false,
          spawnTime: Date.now(),
          betId: null,
          isBoosting: false,
          energy: 100,
          currency: 'FREE',
          isFreePractice: true,
          fundedByBonus: false
        };

        socket.join('ketmesye_sandbox_FREE');

        socket.emit('ketmesye_join_success', {
          wager: 0,
          initialValue: 0,
          newBalance: null,
          currency: 'FREE',
          isFreeTrial: true
        });

        console.log(`Snake Arena [FREE PRACTICE]: ${email || socket.id} joined free practice.`);
        return;
      }

      // Si se yon Chanpyona (Flash oswa Wikenn), nou kreye yon sal izole CHAMP_<id>
      // ZEWÒ DEBRI, ZEWÒ BOUL KACH, ZEWÒ KOULÈV MOURI! Espas la dwe rete 100% vid e pwòp!
      const isChampionship = !!data.isChampionship || !!data.tournamentId;
      if (isChampionship) {
        const champCode = 'CHAMP_' + (data.tournamentId || 'FLASH').toString().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!snakes[champCode]) snakes[champCode] = {};
        if (!pellets[champCode] || pellets[champCode].length === 0 || Object.keys(snakes[champCode]).length === 0) {
          pellets[champCode] = [];
          spawnNormalPellets(champCode, 450);
        }

        // Netwaye nenpòt boul kach oswa boul lò ki ta ka egziste nan espas la
        pellets[champCode] = pellets[champCode].filter(p => !p.isCashDrop && !p.id.includes('gold'));

        // Netwaye nenpòt ansyen koulèv fantom pou menm jwè a
        Object.keys(snakes[champCode]).forEach(sId => {
          const s = snakes[champCode][sId];
          if (s && (sId === socket.id || (email && s.email === email) || (userId && s.userId === userId))) {
            delete snakes[champCode][sId];
          }
        });

        const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
        const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;

        const startSegments = [];
        for (let i = 0; i < 5; i++) {
          startSegments.push({ x: spawnX, y: spawnY + i * 15 });
        }

        const initialPath = [];
        for (let i = 0; i < 50; i++) {
          initialPath.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
        }

        snakes[champCode][socket.id] = {
          id: socket.id,
          userId: userId || socket.id,
          email: email || `Player_${socket.id.substring(0, 5)}`,
          wager: 0,
          value: 0, // Kòmanse a 0 pwen
          segments: startSegments,
          pathHistory: initialPath,
          angle: -Math.PI / 2,
          speed: 6.5,
          color: getRandomColor(),
          eliminations: 0,
          isInvincible: true,
          hasStartedMoving: false,
          spawnTime: Date.now(),
          betId: null,
          isBoosting: false,
          energy: 100,
          currency: champCode,
          isChampionship: true,
          fundedByBonus: false
        };

        socket.join(`ketmesye_sandbox_${champCode}`);

        socket.emit('ketmesye_join_success', {
          wager: 0,
          initialValue: 0,
          newBalance: null,
          currency: 'POINTS',
          isChampionship: true
        });

        console.log(`Snake Arena [CHAMPIONSHIP]: ${email || socket.id} joined ${champCode} (ZERO DEAD SNAKE DEBRIS).`);
        return;
      }

      // Si se PIECES (App Flutter / Standalone), nou kite jwè a antre dirèkteman san obligasyon baz SQL
      if (requestedCurrency === 'PIECES') {
        const entryWager = parseFloat(wager) || 50;
        const initialValue = parseFloat((entryWager * 0.90).toFixed(2));
        const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
        const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;

        const startSegments = [];
        for (let i = 0; i < 5; i++) {
          startSegments.push({ x: spawnX, y: spawnY + i * 15 });
        }

        const initialPath = [];
        for (let i = 0; i < 50; i++) {
          initialPath.push({ x: spawnX, y: spawnY + i * (15 / PATH_SPACING) });
        }

        // Tcheke si jwè a te deja gen yon koulèv vivan nan PIECES (anpeche pèdi 500 pyès sou mikwo-rekoneksyon)
        if (snakes.PIECES) {
          let aliveExisting = null;
          for (const sId of Object.keys(snakes.PIECES)) {
            const s = snakes.PIECES[sId];
            if (s && (sId === socket.id || (effectiveUserId && String(s.userId) === effectiveUserId) || (email && s.email === email))) {
              aliveExisting = s;
              delete snakes.PIECES[sId];
              break;
            }
          }

          if (aliveExisting) {
            console.log(`Snake Arena [PIECES]: Re-binding alive snake for ${email || socket.id}`);
            aliveExisting.id = socket.id;
            aliveExisting.isDisconnected = false;
            aliveExisting.isInvincible = true;
            aliveExisting.invincibleUntil = Date.now() + 3500;

            snakes.PIECES[socket.id] = aliveExisting;
            socket.join('ketmesye_sandbox_PIECES');

            socket.emit('ketmesye_join_success', {
              wager: aliveExisting.wager,
              initialValue: aliveExisting.value,
              newBalance: null,
              currency: 'PIECES',
              resumed: true
            });
            return;
          }
        }

        snakes.PIECES[socket.id] = {
          id: socket.id,
          userId: userId || socket.id,
          email: email || `Player_${socket.id.substring(0, 5)}`,
          wager: entryWager,
          value: initialValue,
          segments: startSegments,
          pathHistory: initialPath,
          angle: -Math.PI / 2,
          speed: 6.5,
          color: getRandomColor(),
          eliminations: 0,
          isInvincible: true,
          hasStartedMoving: false,
          spawnTime: Date.now(),
          betId: null,
          isBoosting: false,
          energy: 100,
          currency: 'PIECES',
          fundedByBonus: false
        };

        socket.join('ketmesye_sandbox_PIECES');

        socket.emit('ketmesye_join_success', {
          wager: entryWager,
          initialValue,
          newBalance: null,
          currency: 'PIECES'
        });

        console.log(`Snake Arena [PIECES]: ${email || socket.id} joined with ${entryWager} PIECES.`);
        return;
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
        const minWager = activeCurrency === 'KET' ? 100 : 125;

        if (isNaN(entryWager) || entryWager < minWager) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: `La mise minimale pour spawn est de ${minWager} ${activeCurrency}.` });
        }

        let fundedByBonus = false;
        try {
          const deductRes = await deductWager(null, userId, entryWager, activeCurrency);
          fundedByBonus = deductRes.fundedByBonus;
        } catch (deductErr) {
          await query('ROLLBACK');
          return socket.emit('ketmesye_error', { message: deductErr.message });
        }

        // Insert bet row into DB (is_won = false initially)
        const betRes = await query(
          `INSERT INTO bets (user_id, game_id, bet_amount, cashout_multiplier, payout_amount, is_won, currency, funded_by_bonus) 
           VALUES ($1, null, $2, null, 0.00, false, $3, $4) RETURNING id`,
          [userId, entryWager, activeCurrency, fundedByBonus]
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
          hasStartedMoving: false,
          spawnTime: Date.now(),
          betId,
          isBoosting: false,
          energy: 100,
          currency: activeCurrency,
          fundedByBonus
        };

        // Join room specific to this sandbox currency
        socket.join(`ketmesye_sandbox_${activeCurrency}`);

        const userBalancesRes = await query('SELECT balance, ket_balance FROM users WHERE id = $1', [userId]);
        const finalNewBalance = activeCurrency === 'KET' ? parseFloat(userBalancesRes.rows[0]?.ket_balance || 0) : parseFloat(userBalancesRes.rows[0]?.balance || 0);

        socket.emit('ketmesye_join_success', {
          wager: entryWager,
          initialValue,
          newBalance: finalNewBalance,
          currency: activeCurrency
        });

        console.log(`Ketmesye: ${email} joined with ${entryWager} ${activeCurrency} wager.`);
        activePlayersStore.addPlayer(userId, email, 'ketmesye', entryWager, activeCurrency);
        activePlayersStore.notify(`${email.split('@')[0]} a rejoint l'arène de KetMesye avec ${entryWager} ${activeCurrency} !`, 'info');

        await broadcastBalanceUpdate(io, userId);

      } catch (err) {
        await query('ROLLBACK');
        console.error('Error joining Ketmesye:', err);
        socket.emit('ketmesye_error', { message: 'Erreur interne du serveur lors de la connexion.' });
      }
    });

    // 2. Input movement direction & client position sync
    socket.on('ketmesye_input', (data) => {
      const { angle, x, y } = data || {};
      const duelId = activeDuelPlayers[socket.id];
      const snake = (duelId && activeDuels[duelId])
        ? activeDuels[duelId].snakes[socket.id]
        : getSnakeBySocketId(socket.id);

      if (snake) {
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          snake.angle = angle;
          if (!snake.hasStartedMoving) {
            snake.hasStartedMoving = true;
            snake.spawnTime = Date.now();
            snake.isInvincible = true;
          }
        }
        // Senkronize pozisyon tèt la dirèkteman ak kliyan an pou zewo lag ak zewo drift
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
          const clampedX = Math.max(15, Math.min(MAP_WIDTH - 15, x));
          const clampedY = Math.max(15, Math.min(MAP_HEIGHT - 15, y));
          const curHead = snake.segments && snake.segments[0];
          if (curHead) {
            const dist = Math.hypot(clampedX - curHead.x, clampedY - curHead.y);
            if (dist < 250) {
              curHead.x = clampedX;
              curHead.y = clampedY;
              if (snake.pathHistory && snake.pathHistory.length > 0) {
                snake.pathHistory[0] = { x: clampedX, y: clampedY };
              }
            }
          }
        }
      }
    });

    // 2.5 Input Boost
    socket.on('ketmesye_boost', (data) => {
      const duelId = activeDuelPlayers[socket.id];
      const snake = (duelId && activeDuels[duelId])
        ? activeDuels[duelId].snakes[socket.id]
        : getSnakeBySocketId(socket.id);

      if (snake) {
        snake.isBoosting = !!data.isBoosting;
        if (data.isBoosting && !snake.hasStartedMoving) {
          snake.hasStartedMoving = true;
          snake.spawnTime = Date.now();
          snake.isInvincible = true;
        }
      }
    });

    // 2.7 Manje ti boul imedyatman lè kliyan touche yo (Instant Zero-Latency Eat)
    socket.on('ketmesye_eat', (data) => {
      const { pelletId } = data || {};
      if (!pelletId) return;

      const duelId = activeDuelPlayers[socket.id];
      if (duelId && activeDuels[duelId]) {
        const duel = activeDuels[duelId];
        const snake = duel.snakes[socket.id];
        if (!snake) return;
        const idx = duel.pellets.findIndex(p => p.id === pelletId);
        if (idx !== -1) {
          const pellet = duel.pellets[idx];
          snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
          if (pellet.isCashDrop) {
            for (let k = 0; k < 2; k++) {
              if (snake.segments.length < 150) {
                const last = snake.segments[snake.segments.length - 1];
                snake.segments.push({ ...last });
              }
            }
          } else {
            snake.pelletsEaten = (snake.pelletsEaten || 0) + 1;
            if (snake.pelletsEaten % 3 === 0 && snake.segments.length < 150) {
              const last = snake.segments[snake.segments.length - 1];
              snake.segments.push({ ...last });
            }
          }
          duel.pellets.splice(idx, 1);
          if (!pellet.isCashDrop) {
            duel.pellets.push({
              id: Math.random().toString(36).substring(2, 9),
              x: Math.floor(Math.random() * (MAP_WIDTH - 40)) + 20,
              y: Math.floor(Math.random() * (MAP_HEIGHT - 40)) + 20,
              value: 0.10,
              color: getRandomColor(),
            });
          }
        }
      } else {
        const snake = getSnakeBySocketId(socket.id);
        if (!snake) return;
        const currency = snake.currency || 'PIECES';
        const curPellets = pellets[currency] || pellets.PIECES;
        if (!curPellets) return;
        const idx = curPellets.findIndex(p => p.id === pelletId);
        if (idx !== -1) {
          const pellet = curPellets[idx];
          snake.value = parseFloat((snake.value + pellet.value).toFixed(2));
          if (pellet.isCashDrop || pellet.isBotDrop) {
            for (let k = 0; k < 2; k++) {
              if (snake.segments.length < 150) {
                const last = snake.segments[snake.segments.length - 1];
                snake.segments.push({ ...last });
              }
            }
          } else {
            snake.pelletsEaten = (snake.pelletsEaten || 0) + 1;
            if (snake.pelletsEaten % 3 === 0 && snake.segments.length < 150) {
              const last = snake.segments[snake.segments.length - 1];
              snake.segments.push({ ...last });
            }
          }
          curPellets.splice(idx, 1);
          if (!pellet.isCashDrop && !pellet.isBotDrop) {
            spawnNormalPellets(currency, 1);
          }
        }
      }
    });

    // 3. Cash out event
    socket.on('ketmesye_cashout', async () => {
      const snake = getSnakeBySocketId(socket.id);
      if (!snake) {
        return socket.emit('ketmesye_error', { message: 'Aucun serpent actif à encaisser.' });
      }

      const payout = snake.value;
      const currency = snake.currency || 'HTG';

      // Esè gratis ak Chanpyona pa gen cashout dirèk
      if (currency === 'FREE' || currency.startsWith('CHAMP_')) {
        return socket.emit('ketmesye_error', { message: 'Mòd sa a pa gen opsyon retire kòb (cashout).' });
      }

      // Si se PIECES, pa bezwen pase nan ansyen SQL la
      if (currency === 'PIECES') {
        const effectiveUserId = snake.userId ? String(snake.userId) : (snake.email || socket.id);
        if (disconnectTimers.has(effectiveUserId)) {
          clearTimeout(disconnectTimers.get(effectiveUserId).timeout);
          disconnectTimers.delete(effectiveUserId);
        }

        const multiplier = parseFloat((payout / snake.wager).toFixed(2));
        socket.leave('ketmesye_sandbox_PIECES');
        delete snakes.PIECES[socket.id];

        socket.emit('ketmesye_cashout_success', {
          payout,
          multiplier,
          newBalance: null,
          currency: 'PIECES',
          timeSurvived: Math.floor((Date.now() - snake.spawnTime) / 1000),
          eliminations: snake.eliminations
        });

        console.log(`Snake Arena [PIECES]: Cashout success for ${snake.email} (+${payout} PIECES).`);
        return;
      }

      try {
        await query('BEGIN');

        // Credit user balance
        await creditPayout(null, snake.userId, payout, currency, snake.fundedByBonus);

        // Update bet record as won with calculated payout multiplier
        const multiplier = parseFloat((payout / snake.wager).toFixed(2));
        await query(
          `UPDATE bets 
           SET cashout_multiplier = $1, payout_amount = $2, is_won = true 
           WHERE id = $3`,
          [multiplier, payout, snake.betId]
        );

        await query('COMMIT');

        // Process progression settlement (awards KET on HTG wins)
        await processBetSettlement(snake.userId, snake.wager, payout, currency, 'ketmesye');

        const { recordPlatformRevenue } = require('./utils/competitions');
        await recordPlatformRevenue(parseFloat(snake.wager) - payout, currency, 'ketmesye');

        socket.leave(`ketmesye_sandbox_${currency}`);

        // Fetch new balance
        const balanceRes = await query(
          currency === 'KET' ? 'SELECT ket_balance FROM users WHERE id = $1' : 'SELECT balance FROM users WHERE id = $1',
          [snake.userId]
        );
        const finalNewBalance = parseFloat(currency === 'KET' ? balanceRes.rows[0].ket_balance : balanceRes.rows[0].balance);

        // Notify user of cashout success
        socket.emit('ketmesye_cashout_success', {
          payout,
          multiplier,
          newBalance: finalNewBalance,
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

        await broadcastBalanceUpdate(io, snake.userId);

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
        const minWager = activeCurrency === 'KET' ? 100 : 150;
        if (betAmount < minWager) {
          throw new Error(`La mise minimale est de ${minWager} ${activeCurrency}.`);
        }

        let fundedByBonus = false;
        try {
          const deductRes = await deductWager(null, userId, betAmount, activeCurrency);
          fundedByBonus = deductRes.fundedByBonus;
        } catch (deductErr) {
          throw new Error(deductErr.message);
        }
        
        // Insert duel row
        const duelRes = await query(
          `INSERT INTO duels (player_a_id, bet_amount, status, currency, player_a_funded_by_bonus) VALUES ($1, $2, 'pending', $3, $4) RETURNING id`,
          [userId, betAmount, activeCurrency, fundedByBonus]
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
          currency: activeCurrency,
          playerAFundedByBonus: fundedByBonus
        };

        socket.emit('ketmesye_duel_created', { duelId, betAmount });
        await broadcastBalanceUpdate(io, userId);
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

        let fundedByBonus = false;
        try {
          const deductRes = await deductWager(null, userId, pending.betAmount, activeCurrency);
          fundedByBonus = deductRes.fundedByBonus;
        } catch (deductErr) {
          throw new Error(deductErr.message);
        }

        // Update duel row
        await query(`UPDATE duels SET player_b_id = $1, status = 'active', player_b_funded_by_bonus = $3 WHERE id = $2`, [userId, duelId, fundedByBonus]);

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
        setupKetmesyeDuel(duelId, pending.playerAId, userId, pending.betAmount, activeCurrency, pending.playerAFundedByBonus, fundedByBonus);
        await broadcastBalanceUpdate(io, userId);
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

      const fundedByBonus = isPlayerA ? duel.playerAFundedByBonus : duel.playerBFundedByBonus;
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
        hasStartedMoving: false,
        spawnTime: Date.now(),
        isBoosting: false,
        energy: 100,
        fundedByBonus
      };

      // Set user email
      query('SELECT email FROM users WHERE id = $1', [userId]).then(res => {
        if (res.rows.length > 0 && duel.snakes[socket.id]) {
          const email = res.rows[0].email;
          duel.snakes[socket.id].email = email;
          activePlayersStore.addPlayer(userId, email, 'snake_duel', duel.betAmount, duel.currency);
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
    socket.on('disconnect', async () => {
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

      const snake = getSnakeBySocketId(socket.id);
      if (snake) {
        const currency = snake.currency || 'HTG';
        console.log(`Ketmesye: Player ${snake.email} disconnected from ${currency}. Cleaning up.`);
        
        if (currency === 'FREE') {
          delete snakes.FREE[socket.id];
          return;
        }

        // NAN CHANPYONA: ZEWÒ DEBRI, ZEWÒ PYÈS KOULÈV MOURI NAN ESPAS LA!
        if (currency.startsWith('CHAMP_')) {
          if (snakes[currency]) delete snakes[currency][socket.id];
          console.log(`Ketmesye [CHAMPIONSHIP]: Player ${snake.email} disconnected from ${currency}. Zero loot dropped.`);
          return;
        }

        // --- 15 SECONDS DISCONNECT GRACE PERIOD POU TOUT JWÈ K AP PEYE (PIECES / HTG / KET) ---
        // Anpeche jwè ki sou 4G mobil pèdi pyès yo lè rezo a fè yon ti koupe tou kout
        const effectiveUserId = snake.userId ? String(snake.userId) : (snake.email || socket.id);
        if (effectiveUserId) {
          snake.isDisconnected = true;
          snake.isInvincible = true;
          snake.invincibleUntil = Date.now() + 15000; // 15 segond envansibilite

          if (disconnectTimers.has(effectiveUserId)) {
            clearTimeout(disconnectTimers.get(effectiveUserId).timeout);
          }

          const timeout = setTimeout(async () => {
            disconnectTimers.delete(effectiveUserId);

            // Tcheke si koulèv la toujou dekonekte apre 15 segond
            const curSnake = snakes[currency] && snakes[currency][socket.id];
            if (curSnake && curSnake.isDisconnected) {
              console.log(`Ketmesye [GRACE PERIOD EXPIRED]: Eliminating ${curSnake.email} from ${currency}`);

              // Spawn pellets along dead body path
              const segmentCount = curSnake.segments.length;
              const valuePerDrop = parseFloat(((curSnake.value * 0.5) / segmentCount).toFixed(4));

              if (pellets[currency]) {
                curSnake.segments.forEach(segment => {
                  pellets[currency].push({
                    id: Math.random().toString(36).substring(2, 9),
                    x: segment.x + (Math.random() * 10 - 5),
                    y: segment.y + (Math.random() * 10 - 5),
                    value: valuePerDrop,
                    color: '#fbbf24',
                    isCashDrop: true
                  });
                });
              }

              // Update bet row to lost in database si se pa PIECES
              if (curSnake.betId) {
                try {
                  await query(
                    "UPDATE bets SET payout_amount = 0.00, is_won = false WHERE id = $1",
                    [curSnake.betId]
                  );
                  // Process progression settlement (awards KET on HTG losses)
                  await processBetSettlement(curSnake.userId, curSnake.wager, 0.00, currency, 'ketmesye');
                  
                  const { recordPlatformRevenue } = require('./utils/competitions');
                  await recordPlatformRevenue(parseFloat(curSnake.wager), currency, 'ketmesye');
                } catch (err) {
                  console.error('Error updating bet row on grace expiration:', err);
                }
              }

              if (currency !== 'PIECES') {
                activePlayersStore.losePlayer(curSnake.userId, 'ketmesye', 'dead');
                activePlayersStore.notify(`Le serpent de ${curSnake.email.split('@')[0]} s'est déconnecté et a perdu ${curSnake.value.toFixed(0)} ${currency} !`, 'danger');
              }

              delete snakes[currency][socket.id];
            }
          }, 15000);

          disconnectTimers.set(effectiveUserId, { timeout, socketId: socket.id, currency, snake });
          console.log(`Ketmesye: Started 15s disconnect grace period for ${snake.email} (${currency})`);
          return;
        }

        delete snakes[currency][socket.id];
      }
    });
  });
};

module.exports = {
  initKetmesyeEngine
};
