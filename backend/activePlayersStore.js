let io = null;
let activePlayers = {}; // key: `${userId}_${game}`

const initActivePlayersStore = (socketIo) => {
  io = socketIo;
  
  // Clean up completed or disconnected players every 5 seconds
  setInterval(cleanupOldPlayers, 5000);
};

const broadcast = () => {
  if (!io) return;
  
  const list = Object.values(activePlayers).map(p => ({
    userId: p.userId,
    email: p.email ? p.email.split('@')[0] : 'Joueur',
    game: p.game,
    betAmount: p.betAmount,
    currency: p.currency || 'HTG',
    status: p.status, // 'playing', 'cashed_out', 'lost', 'dead', 'crashed', 'eliminated'
    payoutAmount: p.payoutAmount || 0,
    cashoutMultiplier: p.cashoutMultiplier || null,
    timestamp: p.timestamp
  }));
  
  io.emit('active_players_update', list);
};

const notify = (message, type = 'info') => {
  if (io) {
    io.emit('global_notification', { message, type });
  }
};

const addPlayer = (userId, email, game, betAmount, currency = 'HTG') => {
  if (!userId) return;
  activePlayers[`${userId}_${game}`] = {
    userId,
    email: email || 'Joueur',
    game,
    betAmount: parseFloat(betAmount) || 0,
    currency: currency || 'HTG',
    status: 'playing',
    payoutAmount: 0,
    cashoutMultiplier: null,
    timestamp: Date.now()
  };
  broadcast();
};

const cashoutPlayer = (userId, game, payoutAmount, multiplier) => {
  const key = `${userId}_${game}`;
  if (activePlayers[key]) {
    activePlayers[key].status = 'cashed_out';
    activePlayers[key].payoutAmount = parseFloat(payoutAmount) || 0;
    activePlayers[key].cashoutMultiplier = parseFloat(multiplier) || null;
    activePlayers[key].timestamp = Date.now();
    broadcast();
  }
};

const losePlayer = (userId, game, statusDetail = 'lost') => {
  const key = `${userId}_${game}`;
  if (activePlayers[key]) {
    activePlayers[key].status = statusDetail;
    activePlayers[key].timestamp = Date.now();
    broadcast();
  }
};

const removePlayer = (userId, game) => {
  const key = `${userId}_${game}`;
  if (activePlayers[key]) {
    delete activePlayers[key];
    broadcast();
  }
};

const clearGame = (game) => {
  let changed = false;
  for (const key of Object.keys(activePlayers)) {
    if (activePlayers[key].game === game) {
      delete activePlayers[key];
      changed = true;
    }
  }
  if (changed) {
    broadcast();
  }
};

const cleanupOldPlayers = () => {
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(activePlayers)) {
    const p = activePlayers[key];
    // If not actively playing and older than 15 seconds, remove it
    if (p.status !== 'playing' && (now - p.timestamp > 15000)) {
      delete activePlayers[key];
      changed = true;
    }
  }
  if (changed) {
    broadcast();
  }
};

const getActivePlayersList = () => {
  return Object.values(activePlayers).map(p => ({
    userId: p.userId,
    email: p.email ? p.email.split('@')[0] : 'Joueur',
    game: p.game,
    betAmount: p.betAmount,
    currency: p.currency || 'HTG',
    status: p.status,
    payoutAmount: p.payoutAmount || 0,
    cashoutMultiplier: p.cashoutMultiplier || null,
    timestamp: p.timestamp
  }));
};

module.exports = {
  initActivePlayersStore,
  addPlayer,
  cashoutPlayer,
  losePlayer,
  removePlayer,
  clearGame,
  getActivePlayersList,
  notify
};
