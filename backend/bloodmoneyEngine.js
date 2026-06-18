const { query } = require('./db');
const crypto = require('crypto');
const activePlayersStore = require('./activePlayersStore');

let io = null;
let gameState = {
  status: 'waiting', // 'waiting', 'running', 'crashed'
  multiplier: 1.00,
  countdown: 10,
  gameId: null,
  seedHash: '',
  serverSeed: '',
  history: []
};

// Memory store for active bets in the current round
// Format: { [userId]: { userId, email, betAmount, route, autoCashout, cashedOut: boolean, socketId } }
let activeBets = {};
let targetCrashMultiplier = 1.00;
let runningInterval = null;
let countdownInterval = null;
let roundStartTime = null;

// Provably Fair generator with 20% House Edge
const generateCrashPoint = (serverSeed, clientSeed, nonce) => {
  const combined = `${serverSeed}-${clientSeed}-${nonce}`;
  const hash = crypto.createHmac('sha256', serverSeed).update(combined).digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  const e = Math.pow(2, 32);
  
  // Convert hash to a uniform random value between 0 and 1
  const random = h / e;
  
  // Apply 20% house edge: multiplier = 0.80 / (1 - random)
  const point = 0.80 / (1 - random);
  
  // Format to 2 decimal places and cap at 100.00 (similar to Crash)
  const finalPoint = Math.min(parseFloat(point.toFixed(2)), 100.00);
  return Math.max(1.00, finalPoint);
};

const getRecentHistory = async () => {
  try {
    const res = await query(
      "SELECT crash_point FROM bloodmoney_games WHERE status = 'finished' ORDER BY created_at DESC LIMIT 10"
    );
    return res.rows.map(r => parseFloat(r.crash_point));
  } catch (err) {
    console.error('BloodMoney: Error fetching game history:', err);
    return [];
  }
};

const broadcastState = () => {
  if (io) {
    io.emit('game:state_update', {
      ...gameState,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0],
        betAmount: b.betAmount,
        route: b.route,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payoutAmount: b.payoutAmount
      }))
    });
  }
};

const startWaitingPhase = async () => {
  gameState.status = 'waiting';
  gameState.multiplier = 1.00;
  gameState.countdown = 10;
  activeBets = {}; // reset
  
  // Set up provably fair seeds
  gameState.serverSeed = crypto.randomBytes(32).toString('hex');
  gameState.seedHash = crypto.createHash('sha256').update(gameState.serverSeed).digest('hex');
  
  // Fetch history
  gameState.history = await getRecentHistory();
  activePlayersStore.clearGame('bloodmoney');
  
  console.log(`BloodMoney: Starting lobby phase. Seed hash: ${gameState.seedHash}`);
  broadcastState();

  if (io) {
    io.emit('game:starting', { countdown: gameState.countdown, seedHash: gameState.seedHash });
  }

  countdownInterval = setInterval(() => {
    gameState.countdown--;
    if (io) {
      io.emit('game:starting', { countdown: gameState.countdown, seedHash: gameState.seedHash });
    }
    
    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      startRunningPhase();
    }
  }, 1000);
};

const startRunningPhase = async () => {
  try {
    const nonce = Date.now().toString();
    const clientSeed = crypto.randomBytes(16).toString('hex');
    targetCrashMultiplier = generateCrashPoint(gameState.serverSeed, clientSeed, nonce);
    console.log(`BloodMoney: Calculated crash point: ${targetCrashMultiplier}x`);

    // Insert game into DB
    const res = await query(
      `INSERT INTO bloodmoney_games (seed_hash, server_seed, client_seed, crash_point, status) 
       VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
      [gameState.seedHash, gameState.serverSeed, clientSeed, targetCrashMultiplier]
    );
    gameState.gameId = res.rows[0].id;
    gameState.status = 'running';
    gameState.countdown = 0;
    gameState.multiplier = 1.00;
    roundStartTime = Date.now();

    if (io) {
      io.emit('game:started', { gameId: gameState.gameId, seedHash: gameState.seedHash });
    }
    broadcastState();

    // Loop tick every 100ms
    runningInterval = setInterval(async () => {
      const elapsed = (Date.now() - roundStartTime) / 1000; // in seconds
      
      // Speed multiplier formula: e^(0.06 * elapsed)
      const currentMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));
      gameState.multiplier = currentMultiplier;

      // Check crash condition
      if (currentMultiplier >= targetCrashMultiplier) {
        clearInterval(runningInterval);
        await handleCrashPhase();
      } else {
        if (io) {
          io.emit('game:tick', { multiplier: currentMultiplier, elapsed });
        }
        // Process auto cashouts
        await checkAutoCashouts(currentMultiplier);
      }
    }, 100);

  } catch (err) {
    console.error('BloodMoney: Error starting running phase:', err);
    startWaitingPhase();
  }
};

const getRouteMultiplier = (baseMult, route) => {
  if (route === 'rooftop') return 1.0 + (baseMult - 1.0) * 1.3;
  if (route === 'tunnel') return 1.0 + (baseMult - 1.0) * 0.75;
  return baseMult;
};

const checkAutoCashouts = async (currentMultiplier) => {
  for (const userId of Object.keys(activeBets)) {
    const bet = activeBets[userId];
    if (!bet.cashedOut && (!bet.status || bet.status === 'placed')) {
      // Early bust condition for Rooftop (arrested at 85% of target crash point)
      if (bet.route === 'rooftop' && currentMultiplier >= targetCrashMultiplier * 0.85) {
        bet.cashedOut = true;
        bet.status = 'lost';
        const socket = io.sockets.sockets.get(bet.socketId);
        if (socket) {
          socket.emit('bet:result', {
            status: 'lost',
            message: 'Vous avez été arrêté sur le toit ! (Arrestation anticipée à 85% du crash)'
          });
        }
        continue;
      }

      // Check auto cashout based on route multiplier
      const personalMult = getRouteMultiplier(currentMultiplier, bet.route);
      if (bet.autoCashout && personalMult >= bet.autoCashout) {
        await processCashout(userId, currentMultiplier);
      }
    }
  }
};

const processCashout = async (userId, baseMultiplier) => {
  const bet = activeBets[userId];
  if (!bet || bet.cashedOut || bet.processingCashout || gameState.status !== 'running') return null;

  bet.processingCashout = true;

  try {
    const routeMult = getRouteMultiplier(baseMultiplier, bet.route);
    const payout = parseFloat((bet.betAmount * routeMult).toFixed(2));
    
    await query('BEGIN');
    
    // 1. Credit balance
    await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [payout, userId]);

    // 2. Log bet as won in DB
    await query(
      `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, route, cashout_multiplier, payout_amount, is_won) 
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [userId, gameState.gameId, bet.betAmount, bet.route, routeMult, payout]
    );

    await query('COMMIT');

    bet.cashedOut = true;
    bet.cashoutMultiplier = routeMult;
    bet.payoutAmount = payout;
    bet.status = 'cashed_out';

    console.log(`BloodMoney: User ${bet.email} cashed out +${payout} HTG (${routeMult}x via ${bet.route})`);

    // Notify client
    if (io) {
      const socket = io.sockets.sockets.get(bet.socketId);
      if (socket) {
        const balanceRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
        socket.emit('bet:result', {
          status: 'won',
          multiplier: routeMult,
          payout,
          newBalance: parseFloat(balanceRes.rows[0].balance)
        });
      }
      
      const displayName = bet.email.split('@')[0];
      activePlayersStore.cashoutPlayer(userId, 'bloodmoney', payout, routeMult);
      activePlayersStore.notify(`${displayName} a échappé à la police avec +${payout.toFixed(0)} HTG (${routeMult.toFixed(2)}x) !`, 'success');
      
      broadcastState();
    }

    return { payout, multiplier: routeMult };
  } catch (err) {
    await query('ROLLBACK');
    bet.processingCashout = false;
    console.error(`BloodMoney: Payout failed for user ${userId}:`, err);
    return null;
  }
};

const handleCrashPhase = async () => {
  gameState.status = 'crashed';
  console.log(`BloodMoney: Round CRASHED at ${targetCrashMultiplier}x`);

  try {
    // Update game status
    await query(
      "UPDATE bloodmoney_games SET status = 'finished' WHERE id = $1",
      [gameState.gameId]
    );

    // Save lost bets
    for (const userId of Object.keys(activeBets)) {
      const bet = activeBets[userId];
      if (!bet.cashedOut) {
        if (bet.route === 'tunnel') {
          // Refund 30% of the bet amount for Tunnel route
          const refundAmount = parseFloat((bet.betAmount * 0.3).toFixed(2));
          await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [refundAmount, userId]);
          await query(
            `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, route, cashout_multiplier, payout_amount, is_won) 
             VALUES ($1, $2, $3, $4, 0.3, $5, false)`,
            [userId, gameState.gameId, bet.betAmount, bet.route, refundAmount]
          );
          
          bet.cashedOut = true;
          bet.status = 'refunded';
          bet.payoutAmount = refundAmount;

          const socket = io.sockets.sockets.get(bet.socketId);
          if (socket) {
            const balanceRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            socket.emit('bet:result', {
              status: 'refunded',
              refundAmount,
              newBalance: parseFloat(balanceRes.rows[0].balance)
            });
          }
          activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');
        } else {
          // Normal loss (Alley, Rooftop)
          await query(
            `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, route, cashout_multiplier, payout_amount, is_won) 
             VALUES ($1, $2, $3, $4, null, 0.00, false)`,
            [userId, gameState.gameId, bet.betAmount, bet.route]
          );
          activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');
        }
      } else if (bet.status === 'lost') {
        // If they were already busted early (e.g. rooftop at 85%)
        await query(
          `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, route, cashout_multiplier, payout_amount, is_won) 
           VALUES ($1, $2, $3, $4, null, 0.00, false)`,
          [userId, gameState.gameId, bet.betAmount, bet.route]
        );
        activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');
      }
    }

    if (io) {
      io.emit('game:crashed', { crashPoint: targetCrashMultiplier, serverSeed: gameState.serverSeed });
    }

    gameState.history = await getRecentHistory();
    broadcastState();

    setTimeout(() => {
      startWaitingPhase();
    }, 5000); // 5 seconds in crashed phase

  } catch (err) {
    console.error('BloodMoney: Error in crash handler:', err);
    setTimeout(() => {
      startWaitingPhase();
    }, 5000);
  }
};

const initBloodmoneyEngine = (socketIoInstance) => {
  io = socketIoInstance;

  io.on('connection', (socket) => {
    // Send current game state
    socket.emit('game:state_update', {
      ...gameState,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0],
        betAmount: b.betAmount,
        route: b.route,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payoutAmount: b.payoutAmount
      }))
    });

    // Place bet
    socket.on('bet:place', async (payload) => {
      const { userId, email, amount, route, autoCashout } = payload;

      if (gameState.status !== 'waiting') {
        return socket.emit('bet:error', 'La course a déjà commencé ! Attendez le prochain round.');
      }

      if (!userId || !amount || amount < 10) {
        return socket.emit('bet:error', 'Mise invalide (min 10 HTG).');
      }

      if (activeBets[userId]) {
        return socket.emit('bet:error', 'Vous avez déjà misé pour ce round.');
      }

      try {
        await query('BEGIN');

        // Check balance
        const userRes = await query('SELECT balance, is_suspended FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');

        const user = userRes.rows[0];
        if (user.is_suspended) throw new Error('Votre compte est suspendu.');

        const balance = parseFloat(user.balance);
        if (balance < amount) throw new Error('Solde insuffisant.');

        // Deduct balance
        await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
        const newBalance = balance - amount;

        await query('COMMIT');

        // Register in active bets
        activeBets[userId] = {
          userId,
          email,
          betAmount: parseFloat(amount),
          route: route || 'alley',
          autoCashout: autoCashout ? parseFloat(autoCashout) : null,
          cashedOut: false,
          processingCashout: false,
          cashoutMultiplier: null,
          payoutAmount: null,
          socketId: socket.id
        };

        socket.emit('bet:success', {
          betAmount: amount,
          newBalance
        });

        activePlayersStore.addPlayer(userId, email, 'bloodmoney', amount);
        broadcastState();

        console.log(`BloodMoney: ${email} placed ${amount} HTG on route ${route}`);

      } catch (err) {
        await query('ROLLBACK');
        console.error('BloodMoney: Error placing bet:', err);
        socket.emit('bet:error', err.message || 'Erreur lors du placement de mise.');
      }
    });

    // Cash out
    socket.on('bet:cashout', async (payload) => {
      const { userId } = payload;
      if (gameState.status !== 'running') {
        return socket.emit('bet:error', 'Vous ne pouvez encaisser que lorsque la course est en cours.');
      }

      const bet = activeBets[userId];
      if (!bet) {
        return socket.emit('bet:error', 'Aucune mise active trouvée.');
      }

      if (bet.cashedOut) {
        return socket.emit('bet:error', 'Déjà encaissé.');
      }

      const res = await processCashout(userId, gameState.multiplier);
      if (!res) {
        socket.emit('bet:error', 'Échec de l encaissement.');
      }
    });
  });

  startWaitingPhase();
  console.log('BloodMoney engine initialized.');
};

module.exports = {
  initBloodmoneyEngine
};
