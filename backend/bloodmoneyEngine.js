const { query } = require('./db');
const crypto = require('crypto');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');

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

const getUserBalances = async (userId) => {
  const res = await query('SELECT balance, ket_balance, active_currency FROM users WHERE id = $1', [userId]);
  if (res.rows.length > 0) {
    return {
      balance: parseFloat(res.rows[0].balance),
      ket_balance: parseFloat(res.rows[0].ket_balance || 0),
      activeCurrency: res.rows[0].active_currency || 'HTG'
    };
  }
  return { balance: 0, ket_balance: 0, activeCurrency: 'HTG' };
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
    if (bet.currency === 'KET') {
      await query("UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2", [payout, userId]);
    } else {
      await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [payout, userId]);
    }

    // 2. Log bet as won in DB
    await query(
      `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, currency, route, cashout_multiplier, payout_amount, is_won) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG', bet.route, routeMult, payout]
    );

    await query('COMMIT');

    // Process progression settlement (awards KET on HTG wins)
    await processBetSettlement(userId, bet.betAmount, payout, bet.currency || 'HTG', 'bloodmoney');

    bet.cashedOut = true;
    bet.cashoutMultiplier = routeMult;
    bet.payoutAmount = payout;
    bet.status = 'cashed_out';

    console.log(`BloodMoney: User ${bet.email} cashed out +${payout} ${bet.currency || 'HTG'} (${routeMult}x via ${bet.route})`);

    // Notify client
    if (io) {
      const socket = io.sockets.sockets.get(bet.socketId);
      if (socket) {
        const balances = await getUserBalances(userId);
        socket.emit('bet:result', {
          status: 'won',
          multiplier: routeMult,
          payout,
          newBalance: bet.currency === 'KET' ? balances.ket_balance : balances.balance,
          newKetBalance: balances.ket_balance,
          currency: bet.currency || 'HTG'
        });
        
        // Emit global balance update
        io.emit('balance_update', {
          userId,
          newBalance: balances.balance,
          newKetBalance: balances.ket_balance
        });
      }
      
      const displayName = bet.email.split('@')[0];
      activePlayersStore.cashoutPlayer(userId, 'bloodmoney', payout, routeMult);
      activePlayersStore.notify(`${displayName} a échappé à la police avec +${payout.toFixed(0)} ${bet.currency || 'HTG'} (${routeMult.toFixed(2)}x) !`, 'success');
      
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
          if (bet.currency === 'KET') {
            await query("UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2", [refundAmount, userId]);
          } else {
            await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [refundAmount, userId]);
          }
          await query(
            `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, currency, route, cashout_multiplier, payout_amount, is_won) 
             VALUES ($1, $2, $3, $4, $5, 0.3, $6, false)`,
            [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG', bet.route, refundAmount]
          );
          
          bet.cashedOut = true;
          bet.status = 'refunded';
          bet.payoutAmount = refundAmount;

          const socket = io.sockets.sockets.get(bet.socketId);
          if (socket) {
            const balances = await getUserBalances(userId);
            socket.emit('bet:result', {
              status: 'refunded',
              refundAmount,
              newBalance: bet.currency === 'KET' ? balances.ket_balance : balances.balance,
              newKetBalance: balances.ket_balance,
              currency: bet.currency || 'HTG'
            });
            // Emit global balance update
            io.emit('balance_update', {
              userId,
              newBalance: balances.balance,
              newKetBalance: balances.ket_balance
            });
          }
          activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');

          // Process progression settlement (awards KET on HTG tunnel-refunds)
          await processBetSettlement(userId, bet.betAmount, refundAmount, bet.currency || 'HTG', 'bloodmoney');
        } else {
          // Normal loss (Alley, Rooftop)
          await query(
            `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, currency, route, cashout_multiplier, payout_amount, is_won) 
             VALUES ($1, $2, $3, $4, $5, null, 0.00, false)`,
            [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG', bet.route]
          );
          activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');

          // Process progression settlement (awards KET on HTG normal losses)
          await processBetSettlement(userId, bet.betAmount, 0.00, bet.currency || 'HTG', 'bloodmoney');
        }
      } else if (bet.status === 'lost') {
        // If they were already busted early (e.g. rooftop at 85%)
        await query(
          `INSERT INTO bloodmoney_bets (user_id, game_id, bet_amount, currency, route, cashout_multiplier, payout_amount, is_won) 
           VALUES ($1, $2, $3, $4, $5, null, 0.00, false)`,
          [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG', bet.route]
        );
        activePlayersStore.losePlayer(userId, 'bloodmoney', 'lost');

        // Process progression settlement (awards KET on HTG rooftop early bust losses)
        await processBetSettlement(userId, bet.betAmount, 0.00, bet.currency || 'HTG', 'bloodmoney');
      }
    }

    // Record net platform revenue for Blood Money game
    let roundNetRevenue = 0;
    for (const userId of Object.keys(activeBets)) {
      const bet = activeBets[userId];
      if (bet.currency === 'HTG' || !bet.currency) {
        const payout = (bet.cashedOut || bet.status === 'refunded') ? parseFloat(bet.payoutAmount || 0) : 0.00;
        roundNetRevenue += (parseFloat(bet.betAmount) - payout);
      }
    }
    if (roundNetRevenue !== 0) {
      const { recordPlatformRevenue } = require('./utils/competitions');
      await recordPlatformRevenue(roundNetRevenue, 'HTG', 'bloodmoney');
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

      if (!userId || !amount || amount <= 0) {
        return socket.emit('bet:error', 'Mise invalide.');
      }

      if (activeBets[userId]) {
        return socket.emit('bet:error', 'Vous avez déjà misé pour ce round.');
      }

      try {
        await query('BEGIN');

        // Check balance, KET balance, active currency, and is_suspended
        const userRes = await query(
          'SELECT balance, ket_balance, active_currency, is_suspended FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');

        const user = userRes.rows[0];
        if (user.is_suspended) throw new Error('Votre compte est suspendu.');

        const activeCurrency = user.active_currency || 'HTG';
        let newBalance = parseFloat(user.balance);
        let newKetBalance = parseFloat(user.ket_balance || 0);

        if (activeCurrency === 'KET') {
          if (amount < 100) {
            throw new Error('La mise minimale en KET est de 100 KET.');
          }
          if (newKetBalance < amount) {
            throw new Error('Solde de KET insuffisant.');
          }
          // Deduct KET
          await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [amount, userId]);
          newKetBalance -= amount;
        } else {
          // HTG currency
          if (amount < 10) {
            throw new Error('La mise minimale est de 10 HTG.');
          }
          if (newBalance < amount) {
            throw new Error('Solde insuffisant.');
          }
          // Deduct HTG only (no starting KET credit)
          await query(
            'UPDATE users SET balance = balance - $1 WHERE id = $2',
            [amount, userId]
          );
          newBalance -= amount;
        }

        // Process wager (resets inactivity, adds XP if HTG)
        await processWager(userId, amount, activeCurrency);

        await query('COMMIT');

        // Register in active bets
        activeBets[userId] = {
          userId,
          email,
          betAmount: parseFloat(amount),
          currency: activeCurrency,
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
          newBalance: activeCurrency === 'KET' ? newKetBalance : newBalance,
          newKetBalance,
          currency: activeCurrency
        });

        // Emit global balance update
        io.emit('balance_update', {
          userId,
          newBalance,
          newKetBalance
        });

        activePlayersStore.addPlayer(userId, email, 'bloodmoney', amount, activeCurrency);
        broadcastState();

        console.log(`BloodMoney: ${email} placed ${amount} ${activeCurrency} on route ${route}`);

      } catch (err) {
        await query('ROLLBACK').catch(() => {});
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
