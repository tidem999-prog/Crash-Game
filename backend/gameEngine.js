const { query } = require('./db');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');

let io;
let gameState = {
  status: 'waiting', // 'waiting', 'flying', 'crashed'
  multiplier: 1.00,
  countdown: 10,
  gameId: null,
  history: []
};

// Memory store for active bets in the current round
// Format: { [userId]: { userId, email, betAmount, autoCashout, cashedOut: boolean } }
let activeBets = {};
let targetCrashMultiplier = 1.00;
let flyingInterval = null;
let countdownInterval = null;
let roundStartTime = null;
let consecutiveCrashes = 0;
// Yon limit ki chanje chak fwa pou jwè yo pa ka konnen egzakteman ki lè l ap fòse vole a
let currentStreakLimit = Math.floor(Math.random() * 4) + 1; // Chwazi yon chif aza ant 1 ak 4

const generateGameResult = () => {
  const houseEdge = 0.20; // 20% house edge
  let random = Math.random();

  // Anpeche l pète nan 1.00x twòp fwa afile baze sou limit aza n al chwazi a
  if (consecutiveCrashes >= currentStreakLimit) {
    // Fòse yon chif ki pi gwo pase 0.20 (sa ki garanti li p ap 1.00x)
    random = 0.20 + (Math.random() * 0.79);
  }

  // Formula: multiplier = 0.80 / (1 - random)
  const multiplier = 0.80 / (1 - random);
  const finalMultiplier = Math.min(parseFloat(multiplier.toFixed(2)), 100.00);

  if (finalMultiplier <= 1.00) {
    consecutiveCrashes++;
  } else {
    consecutiveCrashes = 0;
    // Lè l kraze chèn nan, nou chwazi yon nouvo limit sekrè ant 1 ak 4
    currentStreakLimit = Math.floor(Math.random() * 4) + 1;
  }

  return finalMultiplier;
};

const getRecentHistory = async () => {
  try {
    const res = await query(
      "SELECT crash_multiplier FROM games WHERE status = 'finished' ORDER BY created_at DESC LIMIT 10"
    );
    return res.rows.map(r => parseFloat(r.crash_multiplier));
  } catch (err) {
    console.error('Error fetching game history:', err);
    return [];
  }
};

const broadcastState = () => {
  if (io) {
    io.emit('game_state', {
      ...gameState,
      onlineUsersCount: io.engine.clientsCount,
      activeBetsCount: Object.keys(activeBets).length,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0], // mask email for privacy
        betAmount: b.betAmount,
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
  activeBets = {}; // Reset bets for the new round
  activePlayersStore.clearGame('crash');
  
  // Fetch history
  gameState.history = await getRecentHistory();
  
  console.log(`Game: Starting waiting phase for a new round.`);
  broadcastState();

  countdownInterval = setInterval(() => {
    gameState.countdown--;
    broadcastState();
    
    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      startFlyingPhase();
    }
  }, 1000);
};

const startFlyingPhase = async () => {
  try {
    // Generate crash target
    targetCrashMultiplier = generateGameResult();
    console.log(`Game: Pre-calculated crash multiplier: ${targetCrashMultiplier}x`);

    // Insert game into DB
    const res = await query(
      "INSERT INTO games (crash_multiplier, status) VALUES ($1, 'flying') RETURNING id",
      [targetCrashMultiplier]
    );
    gameState.gameId = res.rows[0].id;
    gameState.status = 'flying';
    gameState.countdown = 0;
    gameState.multiplier = 1.00;
    roundStartTime = Date.now();
    
    console.log(`Game: Round started, ID: ${gameState.gameId}`);
    broadcastState();

    // Loop tick every 100ms
    flyingInterval = setInterval(async () => {
      const elapsed = (Date.now() - roundStartTime) / 1000; // in seconds
      
      // Curve: exponential growth M(t) = 1.07^elapsed
      const currentMultiplier = parseFloat(Math.pow(1.07, elapsed).toFixed(2));
      gameState.multiplier = currentMultiplier;

      // Check crash condition
      if (currentMultiplier >= targetCrashMultiplier) {
        clearInterval(flyingInterval);
        await handleCrashPhase();
      } else {
        // Broadcast current tick
        if (io) {
          io.emit('game_tick', { multiplier: currentMultiplier });
        }

        // Process auto cash outs
        await checkAutoCashouts(currentMultiplier);
      }
    }, 100);

  } catch (err) {
    console.error('Error starting flying phase:', err);
    // Recover by going back to waiting phase
    startWaitingPhase();
  }
};

const checkAutoCashouts = async (currentMultiplier) => {
  for (const userId of Object.keys(activeBets)) {
    const bet = activeBets[userId];
    if (!bet.cashedOut && bet.autoCashout && currentMultiplier >= bet.autoCashout) {
      console.log(`Game: Auto cashout triggered for user ${bet.email} at ${bet.autoCashout}x`);
      await processCashout(userId, bet.autoCashout);
    }
  }
};

const processCashout = async (userId, multiplier) => {
  const bet = activeBets[userId];
  if (!bet || bet.cashedOut || bet.processingCashout || gameState.status !== 'flying') return null;

  // Lock the bet immediately to prevent concurrent ticks or clicks from processing it again
  bet.processingCashout = true;

  try {
    const payout = parseFloat((bet.betAmount * multiplier).toFixed(2));
    
    // Begin Transaction to update user balance and bet record
    await query('BEGIN');
    
    // 1. Credit the user's balance
    if (bet.currency === 'KET') {
      await query(
        "UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2",
        [payout, userId]
      );
    } else {
      await query(
        "UPDATE users SET balance = balance + $1 WHERE id = $2",
        [payout, userId]
      );
    }

    // 2. Insert or update the bet row in DB
    await query(
      `INSERT INTO bets (user_id, game_id, bet_amount, currency, cashout_multiplier, payout_amount, is_won) 
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG', multiplier, payout]
    );

    await query('COMMIT');

    // Process progression settlement (awards KET on HTG wins)
    await processBetSettlement(userId, bet.betAmount, payout, bet.currency || 'HTG', 'crash');

    // Update in-memory state
    bet.cashedOut = true;
    bet.cashoutMultiplier = multiplier;
    bet.payoutAmount = payout;
    
    activePlayersStore.cashoutPlayer(userId, 'crash', payout, multiplier);

    console.log(`Game: User ${bet.email} cashed out successfully: +${payout} ${bet.currency || 'HTG'}`);

    // Fetch updated balances
    const balances = await getUserBalances(userId);

    // Notify user of cashout success
    if (io) {
      const userSocketId = bet.socketId;
      if (userSocketId) {
        io.to(userSocketId).emit('cashout_success', {
          payout,
          multiplier,
          newBalance: bet.currency === 'KET' ? balances.ket_balance : balances.balance,
          newKetBalance: balances.ket_balance,
          currency: bet.currency || 'HTG'
        });
      }
      io.emit('player_cashed_out', {
        email: bet.email.split('@')[0],
        multiplier,
        payout,
        currency: bet.currency || 'HTG'
      });
      
      // Emit global balance update
      io.emit('balance_update', {
        userId,
        newBalance: balances.balance,
        newKetBalance: balances.ket_balance
      });

      // Update global active bets list
      broadcastState();
    }
    
    return { payout, multiplier };
  } catch (err) {
    await query('ROLLBACK');
    if (bet) bet.processingCashout = false; // Unlock if it fails so it can be retried
    console.error(`Game: Failed cashout transaction for user ${userId}:`, err);
    return null;
  }
};

const handleCrashPhase = async () => {
  gameState.status = 'crashed';
  console.log(`Game: Round CRASHED at ${targetCrashMultiplier}x`);

  try {
    // Update game status in DB
    await query(
      "UPDATE games SET status = 'finished', crash_multiplier = $1 WHERE id = $2",
      [targetCrashMultiplier, gameState.gameId]
    );

    // Process losers: any bet in memory that hasn't cashed out is a loss
    for (const userId of Object.keys(activeBets)) {
      const bet = activeBets[userId];
      if (!bet.cashedOut) {
        // Save lost bet to DB
        await query(
          `INSERT INTO bets (user_id, game_id, bet_amount, currency, cashout_multiplier, payout_amount, is_won) 
           VALUES ($1, $2, $3, $4, null, 0.00, false)`,
          [userId, gameState.gameId, bet.betAmount, bet.currency || 'HTG']
        );
        activePlayersStore.losePlayer(userId, 'crash', 'crashed');

        // Process progression settlement (awards KET on HTG losses)
        await processBetSettlement(userId, bet.betAmount, 0.00, bet.currency || 'HTG', 'crash');
      }
    }

    if (io) {
      io.emit('game_crash', { crashMultiplier: targetCrashMultiplier });
    }

    // Refresh history
    gameState.history = await getRecentHistory();
    broadcastState();

    // 3 seconds delay in crashed phase
    setTimeout(() => {
      startWaitingPhase();
    }, 3000);

  } catch (err) {
    console.error('Error handling crash phase:', err);
    setTimeout(() => {
      startWaitingPhase();
    }, 3000);
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

// Initialize Socket.io listeners
const initGameEngine = (socketIoInstance) => {
  io = socketIoInstance;
  
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Send initial state on connection
    socket.emit('game_state', {
      ...gameState,
      onlineUsersCount: io.engine.clientsCount,
      activeBetsCount: Object.keys(activeBets).length,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0],
        betAmount: b.betAmount,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payoutAmount: b.payoutAmount
      }))
    });

    // 1. Place Bet Event
    socket.on('place_bet', async (data) => {
      const { userId, email, betAmount, autoCashout } = data;
      
      if (gameState.status !== 'waiting') {
        return socket.emit('bet_error', { message: 'Les paris ne sont ouverts que pendant la phase de préparation.' });
      }

      if (!userId || !betAmount || betAmount <= 0) {
        return socket.emit('bet_error', { message: 'Mise invalide.' });
      }

      if (activeBets[userId]) {
        return socket.emit('bet_error', { message: 'Vous avez déjà placé un pari pour cette manche.' });
      }

      try {
        // Double-check balance, active currency, and KET balance on DB
        const userRes = await query('SELECT balance, ket_balance, active_currency, is_suspended FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
          return socket.emit('bet_error', { message: 'Utilisateur introuvable.' });
        }

        const user = userRes.rows[0];
        if (user.is_suspended) {
          return socket.emit('bet_error', { message: 'Votre compte est suspendu. Vous ne pouvez pas jouer.' });
        }

        const activeCurrency = user.active_currency || 'HTG';
        let newBalance = parseFloat(user.balance);
        let newKetBalance = parseFloat(user.ket_balance || 0);

        if (activeCurrency === 'KET') {
          if (betAmount < 1000) {
            return socket.emit('bet_error', { message: 'La mise minimale en KET est de 1 000 KET.' });
          }
          if (newKetBalance < betAmount) {
            return socket.emit('bet_error', { message: 'Solde de KET insuffisant pour placer ce pari.' });
          }
          // Deduct KET balance
          await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [betAmount, userId]);
          newKetBalance -= betAmount;
        } else {
          // HTG currency
          if (betAmount < 10) {
            return socket.emit('bet_error', { message: 'La mise minimale est de 10 HTG.' });
          }
          if (newBalance < betAmount) {
            return socket.emit('bet_error', { message: 'Solde insuffisant pour placer ce pari.' });
          }
          // Deduct HTG only (no starting KET credit)
          await query(
            'UPDATE users SET balance = balance - $1 WHERE id = $2',
            [betAmount, userId]
          );
          newBalance -= betAmount;
        }

        // Process wager (resets inactivity, adds XP if HTG)
        await processWager(userId, betAmount, activeCurrency);

        // Register in memory
        activeBets[userId] = {
          userId,
          email,
          betAmount: parseFloat(betAmount),
          currency: activeCurrency,
          autoCashout: autoCashout ? parseFloat(autoCashout) : null,
          cashedOut: false,
          processingCashout: false,
          cashoutMultiplier: null,
          payoutAmount: null,
          socketId: socket.id
        };

        console.log(`Game: Bet placed by ${email}: ${betAmount} ${activeCurrency} (AutoCashOut: ${autoCashout || 'None'})`);
        
        activePlayersStore.addPlayer(userId, email, 'crash', betAmount);

        socket.emit('bet_success', {
          betAmount,
          autoCashout,
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

        // Broadcast updated bets list
        broadcastState();

      } catch (err) {
        console.error('Error placing bet:', err);
        socket.emit('bet_error', { message: 'Erreur interne du serveur lors du placement du pari.' });
      }
    });

    // 2. Cash Out Event
    socket.on('cash_out', async (data) => {
      const { userId } = data;
      if (gameState.status !== 'flying') {
        return socket.emit('cashout_error', { message: 'Vous ne pouvez encaisser que lorsque l\'avion vole.' });
      }

      const bet = activeBets[userId];
      if (!bet) {
        return socket.emit('cashout_error', { message: 'Aucun pari actif trouvé pour cette manche.' });
      }

      if (bet.cashedOut) {
        return socket.emit('cashout_error', { message: 'Vous avez déjà encaissé.' });
      }

      // Encaisser à la valeur actuelle
      const currentMultiplier = gameState.multiplier;
      const result = await processCashout(userId, currentMultiplier);
      if (!result) {
        socket.emit('cashout_error', { message: 'Échec de l\'encaissement. Veuillez réessayer.' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Note: We don't remove bets on disconnect, so if they disconnect they can still win (auto-cashout) or lose, preventing abuse.
    });
  });

  // Start the loop
  startWaitingPhase();
};

module.exports = {
  initGameEngine,
  generateGameResult // export for simulations
};
