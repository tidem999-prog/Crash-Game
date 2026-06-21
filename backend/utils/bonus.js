const { query } = require('../db');

/**
 * Deduct a wager from the user's appropriate balances.
 * HTG wagers are deducted in order: Cash, then Bonus, then Locked Winnings.
 * KET wagers are deducted purely from ket_balance.
 */
const deductWager = async (clientOrPool, userId, amount, currency) => {
  const q = clientOrPool ? clientOrPool.query.bind(clientOrPool) : query;
  const numericAmount = parseFloat(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Montant de mise invalide.');
  }

  if (currency === 'KET') {
    const userRes = await q('SELECT ket_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
    const ketBalance = parseFloat(userRes.rows[0].ket_balance || 0);

    if (ketBalance < numericAmount) {
      throw new Error('Solde KET insuffisant.');
    }

    await q('UPDATE users SET ket_balance = ket_balance - $1 WHERE id = $2', [numericAmount, userId]);
    return { fundedByBonus: false };
  } else {
    // HTG Currency
    const userRes = await q('SELECT balance, bonus_balance, locked_winnings FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) throw new Error('Utilisateur introuvable.');
    
    const cash = parseFloat(userRes.rows[0].balance || 0);
    const bonus = parseFloat(userRes.rows[0].bonus_balance || 0);
    const locked = parseFloat(userRes.rows[0].locked_winnings || 0);
    const totalPlayable = cash + bonus + locked;

    if (totalPlayable < numericAmount) {
      throw new Error('Solde insuffisant.');
    }

    let remaining = numericAmount;
    let fundedByBonus = false;

    // 1. Deduct from Cash
    const cashDeduct = Math.min(cash, remaining);
    remaining -= cashDeduct;

    // 2. Deduct from Bonus
    let bonusDeduct = 0;
    if (remaining > 0) {
      bonusDeduct = Math.min(bonus, remaining);
      remaining -= bonusDeduct;
      fundedByBonus = true; // touched bonus
    }

    // 3. Deduct from Locked Winnings
    let lockedDeduct = 0;
    if (remaining > 0) {
      lockedDeduct = Math.min(locked, remaining);
      remaining -= lockedDeduct;
      fundedByBonus = true; // touched locked winnings
    }

    const newCash = parseFloat((cash - cashDeduct).toFixed(2));
    const newBonus = parseFloat((bonus - bonusDeduct).toFixed(2));
    const newLocked = parseFloat((locked - lockedDeduct).toFixed(2));

    await q(
      'UPDATE users SET balance = $1, bonus_balance = $2, locked_winnings = $3 WHERE id = $4',
      [newCash, newBonus, newLocked, userId]
    );

    return { fundedByBonus };
  }
};

/**
 * Credit a payout to the user's balances.
 * HTG wagers funded by bonus/locked winnings route payouts to Locked Winnings.
 */
const creditPayout = async (clientOrPool, userId, amount, currency, fundedByBonus) => {
  const q = clientOrPool ? clientOrPool.query.bind(clientOrPool) : query;
  const numericAmount = parseFloat(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) return;

  if (currency === 'KET') {
    await q('UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2', [numericAmount, userId]);
  } else {
    // HTG Currency
    if (fundedByBonus) {
      await q('UPDATE users SET locked_winnings = locked_winnings + $1 WHERE id = $2', [numericAmount, userId]);
    } else {
      await q('UPDATE users SET balance = balance + $1 WHERE id = $2', [numericAmount, userId]);
    }
  }
};

/**
 * Lazy check to see if user has an active bonus that has expired.
 * Clears balance and returns true if expired/cleared.
 */
const checkAndResolveBonus = async (clientOrPool, userId) => {
  const q = clientOrPool ? clientOrPool.query.bind(clientOrPool) : query;
  const userRes = await q('SELECT bonus_expires_at FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return false;

  const bonusExpiresAt = userRes.rows[0].bonus_expires_at;
  if (bonusExpiresAt && new Date(bonusExpiresAt) < new Date()) {
    // Bonus has expired! Clear bonus parameters.
    await q(
      `UPDATE users 
       SET bonus_balance = 0.00, 
           locked_winnings = 0.00, 
           wager_requirement_required = 0.00, 
           wager_requirement_progress = 0.00, 
           bonus_expires_at = NULL 
       WHERE id = $1`,
      [userId]
    );

    // Insert notification
    await q(
      `INSERT INTO notifications (user_id, type, message) 
       VALUES ($1, 'bonus_expired', 'Votre bonus a expiré.')`,
      [userId]
    );

    console.log(`Bonus: Expired bonus for user ID ${userId} cleared lazily.`);
    return true;
  }
  return false;
};

/**
 * Fetch latest balances and broadcast balance update via WebSocket to the user's sessions.
 */
const broadcastBalanceUpdate = async (io, userId) => {
  try {
    const userRes = await query(
      'SELECT balance, ket_balance, bonus_balance, locked_winnings FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length > 0 && io) {
      const user = userRes.rows[0];
      io.emit('balance_update', {
        userId,
        newBalance: parseFloat(user.balance),
        newKetBalance: parseFloat(user.ket_balance || 0),
        bonusBalance: parseFloat(user.bonus_balance || 0),
        lockedWinnings: parseFloat(user.locked_winnings || 0)
      });
    }
  } catch (err) {
    console.error('Bonus broadcastBalanceUpdate error:', err);
  }
};

module.exports = {
  deductWager,
  creditPayout,
  checkAndResolveBonus,
  broadcastBalanceUpdate
};
