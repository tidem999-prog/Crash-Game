const { query } = require('./db');
const crypto = require('crypto');
const activePlayersStore = require('./activePlayersStore');
const { processWager, processBetSettlement } = require('./utils/progression');

let io;

const RAKE_PERCENT = 10;
const HOUSE_EDGE = 0.40; // 60% edge to make the progression much slower and harder

const activeTimers = {};

const clearMinesTimer = (gameId) => {
  if (activeTimers[gameId]) {
    clearTimeout(activeTimers[gameId]);
    delete activeTimers[gameId];
  }
};

const startMinesTimer = (socket, userId, gameId) => {
  clearMinesTimer(gameId);
  activeTimers[gameId] = setTimeout(async () => {
    delete activeTimers[gameId];
    try {
      const gameRes = await query(`SELECT * FROM mines_games WHERE id = $1 FOR UPDATE`, [gameId]);
      if (gameRes.rows.length > 0 && gameRes.rows[0].status === 'active') {
        const game = gameRes.rows[0];
        await query(`UPDATE mines_games SET status = 'lost' WHERE id = $1`, [gameId]);
        activePlayersStore.losePlayer(userId, 'mines', 'lost');
        
        // Process progression settlement (awards KET on HTG losses)
        await processBetSettlement(userId, parseFloat(game.bet_amount), 0.00, game.currency || 'HTG', 'mines');
        socket.emit('mines_game_over', {
          status: 'lost_timeout',
          gridMines: game.grid_mines,
          serverSeed: game.server_seed
        });
      }
    } catch (err) {
      console.error('Timeout error:', err);
    }
  }, 4000); // 4 seconds timeout
};

// We can keep a minimal cache of active games in memory for fast access,
const generateMines = (serverSeed, clientSeed, minesCount) => {
  const allTiles = Array.from({ length: 25 }, (_, i) => i);
  let currentHash = crypto.createHash('sha256').update(serverSeed + clientSeed).digest('hex');
  
  for (let i = allTiles.length - 1; i > 0; i--) {
    const hashInt = parseInt(currentHash.substring(0, 8), 16);
    const j = hashInt % (i + 1);
    [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
    currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
  }
  
  return allTiles.slice(0, minesCount);
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

// Start Game
const handleMinesStart = async (socket, payload) => {
  const { userId, betAmount, minesCount } = payload;

  if (!userId || !betAmount || betAmount <= 0 || !minesCount || minesCount < 5 || minesCount > 24) {
    return socket.emit('mines_error', 'Paramètres invalides. Le nombre de mines doit être entre 5 et 24.');
  }

  try {
    await query('BEGIN');

    // 1. Check existing active games for this user (prevent multiple active games)
    const activeRes = await query(`SELECT id FROM mines_games WHERE user_id = $1 AND status = 'active'`, [userId]);
    if (activeRes.rows.length > 0) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Vous avez déjà une partie de Mines en cours. Veuillez la terminer ou l\'actualiser.');
    }

    // 2. Query user fields
    const userQuery = await query('SELECT balance, ket_balance, active_currency, is_suspended, email FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userQuery.rows.length === 0) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Utilisateur introuvable.');
    }

    const user = userQuery.rows[0];
    if (user.is_suspended) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Votre compte est suspendu.');
    }

    const activeCurrency = user.active_currency || 'HTG';
    let newBalance = parseFloat(user.balance);
    let newKetBalance = parseFloat(user.ket_balance || 0);

    if (activeCurrency === 'KET') {
      if (betAmount < 1000) {
        await query('ROLLBACK');
        return socket.emit('mines_error', 'La mise minimale en KET est de 1 000 KET.');
      }
      if (newKetBalance < betAmount) {
        await query('ROLLBACK');
        return socket.emit('mines_error', 'Solde de KET insuffisant.');
      }
      // Deduct KET
      await query('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [betAmount, userId]);
      newKetBalance -= betAmount;
    } else {
      // HTG currency
      if (betAmount < 10) {
        await query('ROLLBACK');
        return socket.emit('mines_error', 'La mise minimale est de 10 HTG.');
      }
      if (newBalance < betAmount) {
        await query('ROLLBACK');
        return socket.emit('mines_error', 'Solde insuffisant.');
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

    const email = user.email;

    // 4. Calculate Net Stake
    const fee = betAmount * (RAKE_PERCENT / 100);
    const netStake = betAmount - fee;

    // 5. Provably Fair Generation
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const clientSeed = crypto.randomBytes(16).toString('hex');

    const gridMines = generateMines(serverSeed, clientSeed, minesCount);

    // 6. Insert into DB
    const insertRes = await query(
      `INSERT INTO mines_games 
       (user_id, bet_amount, net_stake, currency, mines_count, server_seed, client_seed, grid_mines) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, betAmount, netStake, activeCurrency, minesCount, serverSeed, clientSeed, JSON.stringify(gridMines)]
    );

    const gameId = insertRes.rows[0].id;

    await query('COMMIT');

    // Send updated balances globally
    io.emit('balance_update', { userId, newBalance, newKetBalance });

    activePlayersStore.addPlayer(userId, email, 'mines', betAmount);

    socket.emit('mines_started', {
      gameId,
      netStake,
      minesCount,
      clientSeed,
      serverSeedHash,
      currentMultiplier: 1.00,
      currency: activeCurrency
    });

    startMinesTimer(socket, userId, gameId);

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('Error starting Mines game:', err);
    socket.emit('mines_error', 'Erreur lors de la création de la partie.');
  }
};

// Reveal Tile
const handleMinesReveal = async (socket, payload) => {
  const { userId, gameId, tileIndex } = payload;

  if (tileIndex < 0 || tileIndex > 24) return;

  try {
    await query('BEGIN');

    const gameRes = await query(`SELECT * FROM mines_games WHERE id = $1 AND user_id = $2 FOR UPDATE`, [gameId, userId]);
    if (gameRes.rows.length === 0) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Partie introuvable.');
    }

    const game = gameRes.rows[0];
    if (game.status !== 'active') {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Partie déjà terminée.');
    }

    const gridMines = game.grid_mines;
    const revealedTiles = game.revealed_tiles;

    if (revealedTiles.includes(tileIndex)) {
      await query('ROLLBACK');
      return; // Already revealed
    }

    clearMinesTimer(gameId);

    if (gridMines.includes(tileIndex)) {
      // BOOM! Lost.
      await query(`UPDATE mines_games SET status = 'lost' WHERE id = $1`, [gameId]);
      await query('COMMIT');

      // Process progression settlement (awards KET on HTG losses)
      await processBetSettlement(userId, parseFloat(game.bet_amount), 0.00, game.currency || 'HTG', 'mines');
      
      const emailRes = await query('SELECT email FROM users WHERE id = $1', [userId]);
      const email = emailRes.rows[0]?.email || 'Joueur';
      const displayName = email.split('@')[0];
      activePlayersStore.losePlayer(userId, 'mines', 'lost');
      activePlayersStore.notify(`${displayName} a heurté une mine à Mines et a perdu !`, 'danger');

      return socket.emit('mines_game_over', {
        status: 'lost',
        gridMines,
        serverSeed: game.server_seed
      });
    }

    // SAFE!
    revealedTiles.push(tileIndex);
    const k = revealedTiles.length;
    
    let prob = 1.0;
    for (let i = 0; i < k; i++) {
      prob *= (25 - game.mines_count - i) / (25 - i);
    }
    const fairMultiplier = 1 / prob;
    const currentMultiplier = fairMultiplier * HOUSE_EDGE; // Apply 1% house edge globally to final multiplier

    // Did they win all possible safe tiles?
    const maxSafeTiles = 25 - game.mines_count;
    if (k === maxSafeTiles) {
      // Auto cashout!
      const payoutAmount = parseFloat(game.net_stake) * currentMultiplier;
      
      if (game.currency === 'KET') {
        await query(
          'UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2',
          [payoutAmount, userId]
        );
      } else {
        await query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [payoutAmount, userId]
        );
      }

      const balances = await getUserBalances(userId);

      await query(
        `UPDATE mines_games SET status = 'cashed_out', current_multiplier = $1, payout_amount = $2, revealed_tiles = $3 WHERE id = $4`,
        [currentMultiplier, payoutAmount, JSON.stringify(revealedTiles), gameId]
      );

      await query('COMMIT');

      // Process progression settlement (awards KET on HTG wins)
      await processBetSettlement(userId, parseFloat(game.bet_amount), payoutAmount, game.currency || 'HTG', 'mines');

      io.emit('balance_update', { userId, newBalance: balances.balance, newKetBalance: balances.ket_balance });

      const emailRes = await query('SELECT email FROM users WHERE id = $1', [userId]);
      const email = emailRes.rows[0]?.email || 'Joueur';
      const displayName = email.split('@')[0];
      activePlayersStore.cashoutPlayer(userId, 'mines', payoutAmount, currentMultiplier);
      activePlayersStore.notify(`${displayName} a gagné +${payoutAmount.toFixed(0)} ${game.currency || 'HTG'} à Mines (${currentMultiplier.toFixed(2)}x) !`, 'success');

      return socket.emit('mines_game_over', {
        status: 'won', // special status for clearing the board
        payoutAmount,
        currentMultiplier,
        gridMines,
        serverSeed: game.server_seed,
        currency: game.currency || 'HTG'
      });
    }

    // Update game state
    await query(
      `UPDATE mines_games SET revealed_tiles = $1, current_multiplier = $2 WHERE id = $3`,
      [JSON.stringify(revealedTiles), currentMultiplier, gameId]
    );

    await query('COMMIT');

    socket.emit('mines_reveal_safe', {
      tileIndex,
      currentMultiplier,
      nextMultiplier: calculateNextMultiplier(game.mines_count, k + 1) * HOUSE_EDGE
    });

    startMinesTimer(socket, userId, gameId);

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('Error revealing Mines tile:', err);
    socket.emit('mines_error', 'Erreur lors du traitement de la case.');
  }
};

// Cashout
const handleMinesCashout = async (socket, payload) => {
  const { userId, gameId } = payload;

  try {
    await query('BEGIN');

    const gameRes = await query(`SELECT * FROM mines_games WHERE id = $1 AND user_id = $2 FOR UPDATE`, [gameId, userId]);
    if (gameRes.rows.length === 0) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Partie introuvable.');
    }
    
    const game = gameRes.rows[0];
    if (game.status !== 'active') {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Partie déjà terminée.');
    }
    if (game.revealed_tiles.length === 0) {
      await query('ROLLBACK');
      return socket.emit('mines_error', 'Vous devez révéler au moins une case.');
    }

    clearMinesTimer(gameId);

    const payoutAmount = parseFloat(game.net_stake) * parseFloat(game.current_multiplier);

    // Update User Balance atomically
    if (game.currency === 'KET') {
      await query(
        'UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2',
        [payoutAmount, userId]
      );
    } else {
      await query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [payoutAmount, userId]
      );
    }

    const balances = await getUserBalances(userId);

    // Update Game
    await query(
      `UPDATE mines_games SET status = 'cashed_out', payout_amount = $1 WHERE id = $2`,
      [payoutAmount, gameId]
    );

    await query('COMMIT');

    // Process progression settlement (awards KET on HTG wins)
    await processBetSettlement(userId, parseFloat(game.bet_amount), payoutAmount, game.currency || 'HTG', 'mines');

    io.emit('balance_update', { userId, newBalance: balances.balance, newKetBalance: balances.ket_balance });

    const emailRes = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = emailRes.rows[0]?.email || 'Joueur';
    const displayName = email.split('@')[0];
    activePlayersStore.cashoutPlayer(userId, 'mines', payoutAmount, game.current_multiplier);
    activePlayersStore.notify(`${displayName} a gagné +${payoutAmount.toFixed(0)} HTG à Mines (${parseFloat(game.current_multiplier).toFixed(2)}x) !`, 'success');

    socket.emit('mines_game_over', {
      status: 'cashed_out',
      payoutAmount,
      currentMultiplier: game.current_multiplier,
      gridMines: game.grid_mines,
      serverSeed: game.server_seed
    });

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('Error on Mines cashout:', err);
    socket.emit('mines_error', 'Erreur lors du Cash Out.');
  }
};

// Reconnect/Recovery
const handleMinesRecovery = async (socket, payload) => {
  const { userId } = payload;
  if (!userId) return;

  try {
    const activeRes = await query(`SELECT * FROM mines_games WHERE user_id = $1 AND status = 'active'`, [userId]);
    if (activeRes.rows.length > 0) {
      const game = activeRes.rows[0];
      const serverSeedHash = crypto.createHash('sha256').update(game.server_seed).digest('hex');
      
      socket.emit('mines_recovered', {
        gameId: game.id,
        netStake: game.net_stake,
        minesCount: game.mines_count,
        clientSeed: game.client_seed,
        serverSeedHash,
        currentMultiplier: game.current_multiplier,
        revealedTiles: game.revealed_tiles,
        nextMultiplier: calculateNextMultiplier(game.mines_count, game.revealed_tiles.length + 1) * HOUSE_EDGE,
        currency: game.currency || 'HTG'
      });
    } else {
      socket.emit('mines_no_active_game');
    }
  } catch (err) {
    console.error('Error recovering mines game:', err);
  }
};

// Helper function for next multiplier
const calculateNextMultiplier = (minesCount, targetK) => {
  let prob = 1.0;
  for (let i = 0; i < targetK; i++) {
    prob *= (25 - minesCount - i) / (25 - i);
  }
  return 1 / prob;
};

const initMinesEngine = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    socket.on('mines_start', (payload) => handleMinesStart(socket, payload));
    socket.on('mines_reveal', (payload) => handleMinesReveal(socket, payload));
    socket.on('mines_cashout', (payload) => handleMinesCashout(socket, payload));
    socket.on('mines_recovery', (payload) => handleMinesRecovery(socket, payload));
  });

  console.log('Mines engine initialized.');
};

module.exports = {
  initMinesEngine
};
