const { query } = require('./db');
const crypto = require('crypto');

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

// Start Game
const handleMinesStart = async (socket, payload) => {
  const { userId, betAmount, minesCount } = payload;

  if (!userId || !betAmount || betAmount <= 0 || !minesCount || minesCount < 5 || minesCount > 24) {
    return socket.emit('mines_error', 'Paramètres invalides. Le nombre de mines doit être entre 5 et 24.');
  }

  try {
    // 1. Check existing active games for this user (prevent multiple active games)
    const activeRes = await query(`SELECT id FROM mines_games WHERE user_id = $1 AND status = 'active'`, [userId]);
    if (activeRes.rows.length > 0) {
      return socket.emit('mines_error', 'Vous avez déjà une partie de Mines en cours. Veuillez la terminer ou l\'actualiser.');
    }

    // 2. Validate balance
    const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      return socket.emit('mines_error', 'Utilisateur non trouvé.');
    }

    let balance = parseFloat(userRes.rows[0].balance);
    if (balance < betAmount) {
      return socket.emit('mines_error', 'Fonds insuffisants.');
    }

    // 3. Deduct bet amount
    const newBalance = balance - betAmount;
    await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

    // 4. Calculate Net Stake
    const fee = betAmount * (RAKE_PERCENT / 100);
    const netStake = betAmount - fee;

    // 5. Provably Fair Generation
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const clientSeed = crypto.randomBytes(16).toString('hex'); // Auto-generated for user

    const gridMines = generateMines(serverSeed, clientSeed, minesCount);

    // 6. Insert into DB
    const insertRes = await query(
      `INSERT INTO mines_games 
       (user_id, bet_amount, net_stake, mines_count, server_seed, client_seed, grid_mines) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, betAmount, netStake, minesCount, serverSeed, clientSeed, JSON.stringify(gridMines)]
    );

    const gameId = insertRes.rows[0].id;

    // Send updated balance to user globally
    io.emit('balance_update', { userId, newBalance });

    socket.emit('mines_started', {
      gameId,
      netStake,
      minesCount,
      clientSeed,
      serverSeedHash, // Client can verify later
      currentMultiplier: 1.00
    });

    startMinesTimer(socket, userId, gameId);

  } catch (err) {
    console.error('Error starting Mines game:', err);
    socket.emit('mines_error', 'Erreur lors de la création de la partie.');
  }
};

// Reveal Tile
const handleMinesReveal = async (socket, payload) => {
  const { userId, gameId, tileIndex } = payload;

  if (tileIndex < 0 || tileIndex > 24) return;

  try {
    const gameRes = await query(`SELECT * FROM mines_games WHERE id = $1 AND user_id = $2 FOR UPDATE`, [gameId, userId]);
    if (gameRes.rows.length === 0) {
      return socket.emit('mines_error', 'Partie introuvable.');
    }

    const game = gameRes.rows[0];
    if (game.status !== 'active') {
      return socket.emit('mines_error', 'Partie déjà terminée.');
    }

    const gridMines = game.grid_mines;
    const revealedTiles = game.revealed_tiles;

    if (revealedTiles.includes(tileIndex)) {
      return; // Already revealed
    }

    clearMinesTimer(gameId);

    if (gridMines.includes(tileIndex)) {
      // BOOM! Lost.
      await query(`UPDATE mines_games SET status = 'lost' WHERE id = $1`, [gameId]);
      return socket.emit('mines_game_over', {
        status: 'lost',
        gridMines,
        serverSeed: game.server_seed
      });
    }

    // SAFE!
    revealedTiles.push(tileIndex);
    const k = revealedTiles.length;
    
    // Calculate new multiplier
    // formula: Mk+1 = Mk * ((25 - k + 1) / (25 - mines_count - k + 1)) * 0.99
    // actually, simpler to compute the total probability from step 0 to k,
    // to avoid floating point compounding errors.
    // Prob to reach step k: Combinations(25-mines, k) / Combinations(25, k)
    // Fair multiplier = Combinations(25, k) / Combinations(25-mines, k)
    
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
      
      const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const newBalance = parseFloat(userRes.rows[0].balance) + payoutAmount;
      await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

      await query(
        `UPDATE mines_games SET status = 'cashed_out', current_multiplier = $1, payout_amount = $2, revealed_tiles = $3 WHERE id = $4`,
        [currentMultiplier, payoutAmount, JSON.stringify(revealedTiles), gameId]
      );

      io.emit('balance_update', { userId, newBalance });

      return socket.emit('mines_game_over', {
        status: 'won', // special status for clearing the board
        payoutAmount,
        currentMultiplier,
        gridMines,
        serverSeed: game.server_seed
      });
    }

    // Update game state
    await query(
      `UPDATE mines_games SET revealed_tiles = $1, current_multiplier = $2 WHERE id = $3`,
      [JSON.stringify(revealedTiles), currentMultiplier, gameId]
    );

    socket.emit('mines_reveal_safe', {
      tileIndex,
      currentMultiplier,
      nextMultiplier: calculateNextMultiplier(game.mines_count, k + 1) * HOUSE_EDGE
    });

    startMinesTimer(socket, userId, gameId);

  } catch (err) {
    console.error('Error revealing Mines tile:', err);
    socket.emit('mines_error', 'Erreur lors du traitement de la case.');
  }
};

// Cashout
const handleMinesCashout = async (socket, payload) => {
  const { userId, gameId } = payload;

  try {
    const gameRes = await query(`SELECT * FROM mines_games WHERE id = $1 AND user_id = $2 FOR UPDATE`, [gameId, userId]);
    if (gameRes.rows.length === 0) return socket.emit('mines_error', 'Partie introuvable.');
    
    const game = gameRes.rows[0];
    if (game.status !== 'active') return socket.emit('mines_error', 'Partie déjà terminée.');
    if (game.revealed_tiles.length === 0) return socket.emit('mines_error', 'Vous devez révéler au moins une case.');

    clearMinesTimer(gameId);

    const payoutAmount = parseFloat(game.net_stake) * parseFloat(game.current_multiplier);

    // Update User Balance
    const userRes = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const newBalance = parseFloat(userRes.rows[0].balance) + payoutAmount;
    await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

    // Update Game
    await query(
      `UPDATE mines_games SET status = 'cashed_out', payout_amount = $1 WHERE id = $2`,
      [payoutAmount, gameId]
    );

    io.emit('balance_update', { userId, newBalance });

    socket.emit('mines_game_over', {
      status: 'cashed_out',
      payoutAmount,
      currentMultiplier: game.current_multiplier,
      gridMines: game.grid_mines,
      serverSeed: game.server_seed
    });

  } catch (err) {
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
        nextMultiplier: calculateNextMultiplier(game.mines_count, game.revealed_tiles.length + 1) * HOUSE_EDGE
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
