const { query } = require('./db');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');
const crypto = require('crypto');

let io;

// Simulated match state
let currentMatch = {
  id: null,
  home_team: 'Barcelona',
  away_team: 'Real Madrid',
  score_home: 0,
  score_away: 0,
  minute: 0,
  status: 'live', // 'live', 'half_time', 'finished'
  corners: 0,
  yellow_cards: 0
};

// Current active betting round
let currentRound = {
  id: null,
  status: 'idle', // 'idle', 'waiting', 'ticking', 'ended'
  countdown: 0,
  multiplier: 1.00,
  elapsed: 0,
  crash_type: null, // 'goal', 'no_goal'
  target_duration: 0,
  seed_hash: '',
  server_seed: '',
  history: []
};

// In-memory active bets for this round
// Format: { [userId]: { userId, email, amount, bet_type, auto_cashout, cashedOut: bool, cashed_out_at: float, currency: 'HTG' | 'KET' } }
let activeBets = {};

let roundTimer = null;
let tickInterval = null;
let matchTimer = null;

const teamsList = [
  { home: 'Barcelona', away: 'Real Madrid' },
  { home: 'Chelsea', away: 'Arsenal' },
  { home: 'PSG', away: 'Marseille' },
  { home: 'Man City', away: 'Liverpool' },
  { home: 'Juventus', away: 'AC Milan' }
];

let matchIndex = 0;

// Initialize simulated match
const initMatch = async () => {
  const pairing = teamsList[matchIndex % teamsList.length];
  matchIndex++;

  currentMatch = {
    id: null,
    home_team: pairing.home,
    away_team: pairing.away,
    score_home: 0,
    score_away: 0,
    minute: 0,
    status: 'live',
    corners: 0,
    yellow_cards: 0
  };

  try {
    const res = await query(
      `INSERT INTO sport_events (home_team, away_team, score_home, score_away, minute, status, next_goal_window) 
       VALUES ($1, $2, 0, 0, 0, 'live', true) RETURNING id`,
      [currentMatch.home_team, currentMatch.away_team]
    );
    currentMatch.id = res.rows[0].id;
    console.log(`LastSecond: New Match simulated, ID: ${currentMatch.id} (${currentMatch.home_team} vs ${currentMatch.away_team})`);
  } catch (err) {
    console.error('LastSecond: Error inserting simulated match:', err);
  }
};

const getRecentHistory = async () => {
  try {
    const res = await query(
      `SELECT crash_type, multiplier_at_crash FROM ls_rounds 
       WHERE crash_type IS NOT NULL 
       ORDER BY started_at DESC LIMIT 10`
    );
    return res.rows.map(r => ({
      type: r.crash_type,
      multiplier: parseFloat(r.multiplier_at_crash)
    }));
  } catch (err) {
    console.error('LastSecond: Error fetching history:', err);
    return [];
  }
};

const broadcastMatchUpdate = () => {
  if (io) {
    io.emit('lastsecond:match:update', currentMatch);
  }
};

const broadcastRoundState = () => {
  if (io) {
    io.emit('lastsecond:round:state', {
      roundId: currentRound.id,
      status: currentRound.status,
      countdown: currentRound.countdown,
      multiplier: currentRound.multiplier,
      elapsed: currentRound.elapsed,
      seedHash: currentRound.seed_hash,
      history: currentRound.history,
      onlineUsersCount: io.engine.clientsCount,
      activeBetsCount: Object.keys(activeBets).length,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0],
        amount: b.amount,
        bet_type: b.bet_type,
        cashedOut: b.cashedOut,
        cashed_out_at: b.cashed_out_at
      }))
    });
  }
};

const calculateMultiplier = (elapsedSeconds, matchMinute) => {
  let baseRate = 0.04;
  if (matchMinute >= 85) baseRate = 0.08;
  if (matchMinute >= 91) baseRate = 0.12;
  return Math.pow(Math.E, baseRate * elapsedSeconds);
};

const startWaitingPhase = async () => {
  if (currentMatch.status === 'finished') {
    await initMatch();
  }

  currentRound.id = null;
  currentRound.status = 'waiting';
  currentRound.countdown = 10;
  currentRound.multiplier = 1.00;
  currentRound.elapsed = 0;
  activeBets = {};
  activePlayersStore.clearGame('lastsecond');

  // Pre-calculate seeds for Provably Fair
  currentRound.server_seed = crypto.randomBytes(32).toString('hex');
  currentRound.seed_hash = crypto.createHash('sha256').update(currentRound.server_seed).digest('hex');

  // Pre-determine result
  // 40% chance of goal, 60% chance of no_goal
  const isGoal = Math.random() < 0.40;
  if (isGoal) {
    currentRound.crash_type = 'goal';
    currentRound.target_duration = parseFloat((Math.random() * 25 + 5).toFixed(1)); // 5 to 30 seconds
  } else {
    currentRound.crash_type = 'no_goal';
    currentRound.target_duration = 30.0; // Round completes in 30 seconds of no goal
  }

  try {
    const res = await query(
      `INSERT INTO ls_rounds (event_id, seed_hash) VALUES ($1, $2) RETURNING id`,
      [currentMatch.id, currentRound.seed_hash]
    );
    currentRound.id = res.rows[0].id;
    console.log(`LastSecond: New round created: ${currentRound.id}. Goal in: ${currentRound.target_duration}s? ${isGoal}`);
  } catch (err) {
    console.error('LastSecond: Error inserting round:', err);
  }

  currentRound.history = await getRecentHistory();
  broadcastRoundState();

  if (io) {
    io.emit('lastsecond:round:opening', {
      roundId: currentRound.id,
      seedHash: currentRound.seed_hash,
      matchMinute: currentMatch.minute
    });
  }

  roundTimer = setInterval(() => {
    currentRound.countdown--;
    broadcastRoundState();

    if (currentRound.countdown <= 0) {
      clearInterval(roundTimer);
      startTickingPhase();
    }
  }, 1000);
};

const startTickingPhase = () => {
  currentRound.status = 'ticking';
  currentRound.elapsed = 0;
  currentRound.multiplier = 1.00;
  broadcastRoundState();

  const startTime = Date.now();
  tickInterval = setInterval(async () => {
    const elapsed = (Date.now() - startTime) / 1000;
    currentRound.elapsed = elapsed;

    const mult = calculateMultiplier(elapsed, currentMatch.minute);
    currentRound.multiplier = parseFloat(mult.toFixed(2));

    // Emit live ticks
    if (io) {
      io.emit('lastsecond:round:tick', {
        multiplier: currentRound.multiplier,
        elapsed: parseFloat(elapsed.toFixed(1))
      });
    }

    // Process auto cashouts for 'goal' bets
    await checkAutoCashouts(currentRound.multiplier);

    // Check crash condition
    if (elapsed >= currentRound.target_duration) {
      clearInterval(tickInterval);
      if (currentRound.crash_type === 'goal') {
        await handleGoalEnd();
      } else {
        await handleNoGoalEnd();
      }
    }
  }, 100);
};

const checkAutoCashouts = async (currentMultiplier) => {
  for (const userId of Object.keys(activeBets)) {
    const bet = activeBets[userId];
    if (bet.bet_type === 'goal' && !bet.cashedOut && bet.auto_cashout && currentMultiplier >= bet.auto_cashout) {
      bet.cashedOut = true;
      bet.cashed_out_at = bet.auto_cashout;
      console.log(`LastSecond: Auto cashout triggered for user ${bet.email} at ${bet.auto_cashout}x`);
      
      activePlayersStore.cashoutPlayer(userId, 'lastsecond', bet.amount * bet.auto_cashout, bet.auto_cashout);

      if (io) {
        io.to(bet.socketId).emit('lastsecond:bet:cashout:confirm', {
          roundId: currentRound.id,
          multiplier: bet.auto_cashout,
          potentialWin: bet.amount * bet.auto_cashout
        });
      }
    }
  }
};

const handleGoalEnd = async () => {
  currentRound.status = 'ended';
  const finalMultiplier = currentRound.multiplier;
  console.log(`LastSecond: Round ended with a GOAL at ${finalMultiplier}x`);

  // Choose team who scored and update match score
  const homeScoreIncrement = Math.random() < 0.5 ? 1 : 0;
  const awayScoreIncrement = homeScoreIncrement === 0 ? 1 : 0;
  currentMatch.score_home += homeScoreIncrement;
  currentMatch.score_away += awayScoreIncrement;
  
  const scorer = homeScoreIncrement > 0 ? currentMatch.home_team : currentMatch.away_team;

  try {
    await query('BEGIN');

    // Update match score in DB
    await query(
      `UPDATE sport_events SET score_home = $1, score_away = $2 WHERE id = $3`,
      [currentMatch.score_home, currentMatch.score_away, currentMatch.id]
    );

    // Update round status
    await query(
      `UPDATE ls_rounds SET ended_at = CURRENT_TIMESTAMP, crash_type = 'goal', multiplier_at_crash = $1 WHERE id = $2`,
      [finalMultiplier, currentRound.id]
    );

    // Process bets
    for (const userId of Object.keys(activeBets)) {
      const bet = activeBets[userId];
      const isKet = bet.currency === 'KET';

      if (bet.bet_type === 'goal' && bet.cashedOut) {
        // Goal bet AND cashed out -> WON
        const payout = parseFloat((bet.amount * bet.cashed_out_at).toFixed(2));
        const profit = payout - bet.amount;

        // Credit user balance
        if (isKet) {
          await query("UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2", [payout, userId]);
        } else {
          await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [payout, userId]);
        }

        // Insert bet record
        await query(
          `INSERT INTO ls_bets (round_id, user_id, amount, bet_type, auto_cashout, cashed_out_at, profit, status, currency) 
           VALUES ($1, $2, $3, 'goal', $4, $5, $6, 'won', $7)`,
          [currentRound.id, userId, bet.amount, bet.auto_cashout, bet.cashed_out_at, profit, bet.currency]
        );

        // Process progression
        await processBetSettlement(userId, bet.amount, payout, bet.currency, 'lastsecond');

        const balances = await getUserBalances(userId);
        if (io) {
          io.to(bet.socketId).emit('lastsecond:bet:result', {
            roundId: currentRound.id,
            status: 'won',
            multiplier: bet.cashed_out_at,
            profit,
            newBalance: isKet ? balances.ket_balance : balances.balance,
            currency: bet.currency
          });
          io.emit('balance_update', {
            userId,
            newBalance: balances.balance,
            newKetBalance: balances.ket_balance
          });
        }
      } else {
        // Goal bet but NOT cashed out, OR No Goal bet -> LOST
        await query(
          `INSERT INTO ls_bets (round_id, user_id, amount, bet_type, auto_cashout, cashed_out_at, profit, status, currency) 
           VALUES ($1, $2, $3, $4, $5, null, $6, 'lost', $7)`,
          [currentRound.id, userId, bet.amount, bet.bet_type, bet.auto_cashout, -bet.amount, bet.currency]
        );

        activePlayersStore.losePlayer(userId, 'lastsecond', 'eliminated');

        // Process progression
        await processBetSettlement(userId, bet.amount, 0.00, bet.currency, 'lastsecond');

        if (io) {
          io.to(bet.socketId).emit('lastsecond:bet:result', {
            roundId: currentRound.id,
            status: 'lost',
            multiplier: finalMultiplier,
            profit: -bet.amount,
            currency: bet.currency
          });
        }
      }
    }

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    console.error('LastSecond: Error processing goal resolution:', err);
  }

  if (io) {
    io.emit('lastsecond:round:closed:goal', {
      multiplier: finalMultiplier,
      scorer,
      score_home: currentMatch.score_home,
      score_away: currentMatch.score_away
    });
  }

  broadcastMatchUpdate();
  currentRound.history = await getRecentHistory();
  broadcastRoundState();

  setTimeout(startWaitingPhase, 5000);
};

const handleNoGoalEnd = async () => {
  currentRound.status = 'ended';
  const finalMultiplier = currentRound.multiplier;
  console.log(`LastSecond: Round ended with NO GOAL at ${finalMultiplier}x`);

  try {
    await query('BEGIN');

    // Update round status
    await query(
      `UPDATE ls_rounds SET ended_at = CURRENT_TIMESTAMP, crash_type = 'no_goal', multiplier_at_crash = $1 WHERE id = $2`,
      [finalMultiplier, currentRound.id]
    );

    // Process bets
    for (const userId of Object.keys(activeBets)) {
      const bet = activeBets[userId];
      const isKet = bet.currency === 'KET';

      if (bet.bet_type === 'no_goal') {
        // No Goal bet holds until the end -> WON at the final multiplier
        const payout = parseFloat((bet.amount * finalMultiplier).toFixed(2));
        const profit = payout - bet.amount;

        // Credit user balance
        if (isKet) {
          await query("UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2", [payout, userId]);
        } else {
          await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [payout, userId]);
        }

        // Insert bet record
        await query(
          `INSERT INTO ls_bets (round_id, user_id, amount, bet_type, auto_cashout, cashed_out_at, profit, status, currency) 
           VALUES ($1, $2, $3, 'no_goal', null, $4, $5, 'won', $6)`,
          [currentRound.id, userId, bet.amount, finalMultiplier, profit, bet.currency]
        );

        activePlayersStore.cashoutPlayer(userId, 'lastsecond', payout, finalMultiplier);

        // Process progression
        await processBetSettlement(userId, bet.amount, payout, bet.currency, 'lastsecond');

        const balances = await getUserBalances(userId);
        if (io) {
          io.to(bet.socketId).emit('lastsecond:bet:result', {
            roundId: currentRound.id,
            status: 'won',
            multiplier: finalMultiplier,
            profit,
            newBalance: isKet ? balances.ket_balance : balances.balance,
            currency: bet.currency
          });
          io.emit('balance_update', {
            userId,
            newBalance: balances.balance,
            newKetBalance: balances.ket_balance
          });
        }
      } else {
        // Goal bet (even if cashed out!) -> LOST because match ended without goal
        await query(
          `INSERT INTO ls_bets (round_id, user_id, amount, bet_type, auto_cashout, cashed_out_at, profit, status, currency) 
           VALUES ($1, $2, $3, 'goal', $4, null, $5, 'lost', $6)`,
          [currentRound.id, userId, bet.amount, bet.auto_cashout, -bet.amount, bet.currency]
        );

        activePlayersStore.losePlayer(userId, 'lastsecond', 'crashed');

        // Process progression
        await processBetSettlement(userId, bet.amount, 0.00, bet.currency, 'lastsecond');

        if (io) {
          io.to(bet.socketId).emit('lastsecond:bet:result', {
            roundId: currentRound.id,
            status: 'lost',
            multiplier: finalMultiplier,
            profit: -bet.amount,
            currency: bet.currency
          });
        }
      }
    }

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    console.error('LastSecond: Error processing no-goal resolution:', err);
  }

  if (io) {
    io.emit('lastsecond:round:closed:nogoal', {
      serverSeed: currentRound.server_seed,
      multiplier: finalMultiplier
    });
  }

  currentRound.history = await getRecentHistory();
  broadcastRoundState();

  setTimeout(startWaitingPhase, 5000);
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

// Simulation of match clock ticking
const runMatchSimulation = () => {
  matchTimer = setInterval(async () => {
    if (currentMatch.status === 'live') {
      currentMatch.minute++;
      
      // Dynamic corner kicks or yellow cards sometimes
      if (Math.random() < 0.15) currentMatch.corners++;
      if (Math.random() < 0.08) currentMatch.yellow_cards++;

      // Match phases
      if (currentMatch.minute === 45) {
        currentMatch.status = 'half_time';
        console.log(`LastSecond: Half Time!`);
      } else if (currentMatch.minute >= 90) {
        currentMatch.status = 'finished';
        console.log(`LastSecond: Full Time!`);
      }
      
      broadcastMatchUpdate();
    } else if (currentMatch.status === 'half_time') {
      // 30 seconds pause at half time, then resume
      setTimeout(() => {
        currentMatch.status = 'live';
        currentMatch.minute = 46;
        broadcastMatchUpdate();
      }, 30000);
    }
  }, 10000); // 1 minute of match time is 10 seconds of real time
};

const initLastsecondEngine = (socketIoInstance) => {
  io = socketIoInstance;

  (async () => {
    await initMatch();
    runMatchSimulation();
    startWaitingPhase();
  })();

  io.on('connection', (socket) => {
    socket.emit('lastsecond:match:update', currentMatch);
    
    socket.emit('lastsecond:round:state', {
      roundId: currentRound.id,
      status: currentRound.status,
      countdown: currentRound.countdown,
      multiplier: currentRound.multiplier,
      elapsed: currentRound.elapsed,
      seedHash: currentRound.seed_hash,
      history: currentRound.history,
      onlineUsersCount: io.engine.clientsCount,
      activeBetsCount: Object.keys(activeBets).length,
      activeBetsList: Object.values(activeBets).map(b => ({
        email: b.email.split('@')[0],
        amount: b.amount,
        bet_type: b.bet_type,
        cashedOut: b.cashedOut,
        cashed_out_at: b.cashed_out_at
      }))
    });

    // 1. Place Bet Event
    socket.on('lastsecond:bet:place', async (data) => {
      const { userId, email, amount, type, autoCashout } = data;

      if (currentRound.status !== 'waiting') {
        return socket.emit('lastsecond:bet:error', { message: 'Les paris sont fermés pour cette manche.' });
      }

      if (!userId || !amount || amount <= 0) {
        return socket.emit('lastsecond:bet:error', { message: 'Montant de pari invalide.' });
      }

      if (type !== 'goal' && type !== 'no_goal') {
        return socket.emit('lastsecond:bet:error', { message: 'Type de pari invalide.' });
      }

      if (activeBets[userId]) {
        return socket.emit('lastsecond:bet:error', { message: 'Vous avez déjà placé un pari pour cette manche.' });
      }

      try {
        const userRes = await query('SELECT balance, ket_balance, active_currency, is_suspended FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
          return socket.emit('lastsecond:bet:error', { message: 'Utilisateur introuvable.' });
        }

        const user = userRes.rows[0];
        if (user.is_suspended) {
          return socket.emit('lastsecond:bet:error', { message: 'Votre compte est suspendu.' });
        }

        const activeCurrency = user.active_currency || 'HTG';
        let newBalance = parseFloat(user.balance);
        let newKetBalance = parseFloat(user.ket_balance || 0);

        if (activeCurrency === 'KET') {
          if (amount < 1000) {
            return socket.emit('lastsecond:bet:error', { message: 'La mise minimale en KET est de 1 000 KET.' });
          }
          if (newKetBalance < amount) {
            return socket.emit('lastsecond:bet:error', { message: 'Solde de KET insuffisant.' });
          }
          await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [amount, userId]);
          newKetBalance -= amount;
        } else {
          if (amount < 10) {
            return socket.emit('lastsecond:bet:error', { message: 'La mise minimale est de 10 HTG.' });
          }
          if (newBalance < amount) {
            return socket.emit('lastsecond:bet:error', { message: 'Solde insuffisant.' });
          }
          await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
          newBalance -= amount;
        }

        // Process progression
        await processWager(userId, amount, activeCurrency);

        activeBets[userId] = {
          userId,
          email,
          amount: parseFloat(amount),
          bet_type: type,
          auto_cashout: autoCashout ? parseFloat(autoCashout) : null,
          cashedOut: false,
          cashed_out_at: null,
          currency: activeCurrency,
          socketId: socket.id
        };

        activePlayersStore.addPlayer(userId, email, 'lastsecond', amount);

        socket.emit('lastsecond:bet:confirmed', {
          betId: currentRound.id,
          potentialWin: type === 'goal' ? (autoCashout ? amount * autoCashout : null) : null
        });

        socket.emit('lastsecond:bet_success', {
          betAmount: amount,
          autoCashout: autoCashout || null,
          newBalance: activeCurrency === 'KET' ? newKetBalance : newBalance,
          newKetBalance,
          currency: activeCurrency
        });

        io.emit('balance_update', {
          userId,
          newBalance,
          newKetBalance
        });

        io.emit('lastsecond:player_placed_bet', {
          email: email.split('@')[0],
          amount: parseFloat(amount),
          bet_type: type,
          currency: activeCurrency
        });

        broadcastRoundState();
        console.log(`LastSecond: Bet confirmed for ${email} : ${amount} ${activeCurrency} [${type}]`);
      } catch (err) {
        console.error('LastSecond: Error placing bet:', err);
        socket.emit('lastsecond:bet:error', { message: 'Erreur interne du serveur.' });
      }
    });

    // 2. Cashout Event
    socket.on('lastsecond:bet:cashout', async (data) => {
      const { roundId } = data;
      const userId = socket.userId || Object.keys(activeBets).find(uid => activeBets[uid].socketId === socket.id);

      if (currentRound.status !== 'ticking') {
        return socket.emit('lastsecond:bet:error', { message: 'La manche n\'est pas en cours.' });
      }

      if (!userId || !activeBets[userId]) {
        return socket.emit('lastsecond:bet:error', { message: 'Aucun pari actif trouvé.' });
      }

      const bet = activeBets[userId];
      if (bet.bet_type !== 'goal') {
        return socket.emit('lastsecond:bet:error', { message: 'Seuls les paris sur BUT ("goal") peuvent être encaissés en cours.' });
      }

      if (bet.cashedOut) {
        return socket.emit('lastsecond:bet:error', { message: 'Vous avez déjà encaissé.' });
      }

      const currentMultiplier = currentRound.multiplier;
      bet.cashedOut = true;
      bet.cashed_out_at = currentMultiplier;

      activePlayersStore.cashoutPlayer(userId, 'lastsecond', bet.amount * currentMultiplier, currentMultiplier);

      socket.emit('lastsecond:bet:cashout:confirm', {
        roundId: currentRound.id,
        multiplier: currentMultiplier,
        potentialWin: bet.amount * currentMultiplier
      });

      io.emit('lastsecond:player_cashed_out', {
        email: bet.email.split('@')[0],
        multiplier: currentMultiplier,
        payout: bet.amount * currentMultiplier,
        currency: bet.currency
      });

      broadcastRoundState();
      console.log(`LastSecond: User ${bet.email} cashed out manually at ${currentMultiplier}x`);
    });

    socket.on('disconnect', () => {
      console.log(`LastSecond: Socket disconnected ${socket.id}`);
    });
  });
};

module.exports = {
  initLastsecondEngine
};
