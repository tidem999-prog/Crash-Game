const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { getLevelInfo, checkInactivityAndClean } = require('../utils/progression');

// 1. Get Rewards Dashboard Stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    // Run inactivity check first
    await checkInactivityAndClean(userId);

    // Fetch user details
    const userRes = await query(
      "SELECT xp, ket_balance, last_activity_at, last_conversion_at, is_suspended FROM users WHERE id = $1",
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];
    const xp = parseFloat(user.xp || 0);
    const levelInfo = getLevelInfo(xp);

    // Calculate Net Loss
    const depositRes = await query(
      "SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'approved'",
      [userId]
    );
    const withdrawRes = await query(
      "SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'withdrawal' AND status = 'approved'",
      [userId]
    );
    const deposits = parseFloat(depositRes.rows[0].total || 0);
    const withdrawals = parseFloat(withdrawRes.rows[0].total || 0);
    const netLoss = deposits - withdrawals;

    // Calculate Cooldown
    let daysRemaining = 0;
    if (user.last_conversion_at) {
      const lastConversion = new Date(user.last_conversion_at);
      const now = new Date();
      const diffTime = now - lastConversion;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      daysRemaining = Math.max(0, Math.ceil(21 - diffDays));
    }

    // Fetch notifications
    const notificationsRes = await query(
      "SELECT id, type, message, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
      [userId]
    );

    // Fetch history
    const historyRes = await query(
      "SELECT id, amount, type, description, created_at FROM ket_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
      [userId]
    );

    res.json({
      xp,
      level: levelInfo.level,
      badge: levelInfo.badge,
      xpRequired: levelInfo.xpRequired,
      nextXpRequired: levelInfo.nextXpRequired,
      nextBadge: levelInfo.nextBadge,
      ketBalance: parseFloat(user.ket_balance || 0),
      netLoss,
      lastConversionAt: user.last_conversion_at,
      daysRemaining,
      notifications: notificationsRes.rows,
      history: historyRes.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }))
    });

  } catch (err) {
    console.error('Rewards dashboard error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de bord des récompenses.' });
  }
});

// 2. Convert KET to HTG
router.post('/convert', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;
  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Le montant de conversion doit être supérieur à 0 KET.' });
  }

  try {
    await query('BEGIN');

    // Fetch user details with lock
    const userRes = await query(
      "SELECT xp, ket_balance, last_conversion_at, is_suspended, balance FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (userRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];

    // Check account status
    if (user.is_suspended) {
      await query('ROLLBACK');
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    // Condition 1: Level >= 5
    const xp = parseFloat(user.xp || 0);
    const levelInfo = getLevelInfo(xp);
    if (levelInfo.level < 5) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Le niveau 5 (Badge Diamant) est obligatoire pour débloquer la conversion.' });
    }

    // Condition 2: Net Loss >= 10,000 HTG
    const depositRes = await query(
      "SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'approved'",
      [userId]
    );
    const withdrawRes = await query(
      "SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'withdrawal' AND status = 'approved'",
      [userId]
    );
    const deposits = parseFloat(depositRes.rows[0].total || 0);
    const withdrawals = parseFloat(withdrawRes.rows[0].total || 0);
    const netLoss = deposits - withdrawals;

    if (netLoss < 10000) {
      await query('ROLLBACK');
      return res.status(400).json({ error: `Une perte nette minimale de 10 000 HTG est requise pour la conversion (votre perte nette actuelle est de ${netLoss.toFixed(2)} HTG).` });
    }

    // Condition 3: Cooldown 21 days
    if (user.last_conversion_at) {
      const lastConversion = new Date(user.last_conversion_at);
      const now = new Date();
      const diffTime = now - lastConversion;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (diffDays < 21) {
        const remainingDays = Math.ceil(21 - diffDays);
        await query('ROLLBACK');
        return res.status(400).json({ error: `Veuillez attendre ${remainingDays} jours avant d'effectuer une nouvelle conversion.` });
      }
    }

    // Condition 4: Sufficient KET Balance
    const currentKet = parseFloat(user.ket_balance || 0);
    if (currentKet < parsedAmount) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Solde de KET insuffisant.' });
    }

    // Calculate conversion result (1,000 KET = 1 HTG)
    const htgCredit = parsedAmount / 1000;

    // Update User Balances
    const updateRes = await query(
      "UPDATE users SET ket_balance = ket_balance - $1, balance = balance + $2, last_conversion_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING balance, ket_balance",
      [parsedAmount, htgCredit, userId]
    );

    // Record KET History
    await query(
      "INSERT INTO ket_history (user_id, amount, type, description) VALUES ($1, $2, 'conversion', $3)",
      [userId, -parsedAmount, `Conversion KET en HTG: -${parsedAmount.toLocaleString('fr-FR')} KET -> +${htgCredit.toFixed(2)} HTG`]
    );

    // Record Audit Log
    await query(
      `INSERT INTO audit_logs (user_id, amount, action) VALUES ($1, $2, $3)`,
      [userId, htgCredit, `CONVERT_KET_TO_HTG: -${parsedAmount} KET -> +${htgCredit} HTG`]
    );

    await query('COMMIT');

    res.json({
      message: 'Conversion réussie avec succès !',
      newBalance: parseFloat(updateRes.rows[0].balance),
      newKetBalance: parseFloat(updateRes.rows[0].ket_balance)
    });

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('Error during KET conversion:', err);
    res.status(500).json({ error: 'Erreur lors de la conversion.' });
  }
});

// 3. Mark Notifications as Read
router.post('/notifications/read', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    await query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1",
      [userId]
    );
    res.json({ success: true, message: 'Notifications marquées comme lues.' });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
