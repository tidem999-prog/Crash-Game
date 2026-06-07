const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Apply admin protection to all routes in this router
router.use(authenticateToken);
router.use(requireAdmin);

// 1. Get Platform Statistics
router.use(express.json());

router.get('/stats', async (req, res) => {
  try {
    // Total approved deposits
    const depRes = await query("SELECT SUM(amount) as total FROM transactions WHERE type = 'deposit' AND status = 'approved'");
    const totalDeposits = parseFloat(depRes.rows[0].total || 0);

    // Total approved withdrawals
    const wdRes = await query("SELECT SUM(amount) as total, SUM(fee) as total_fees FROM transactions WHERE type = 'withdrawal' AND status = 'approved'");
    const totalWithdrawals = parseFloat(wdRes.rows[0].total || 0);
    const totalWithdrawalFees = parseFloat(wdRes.rows[0].total_fees || 0);

    // Total user balances
    const balRes = await query("SELECT SUM(balance) as total FROM users WHERE role = 'user'");
    const totalUserBalances = parseFloat(balRes.rows[0].total || 0);

    // Total count of users
    const usersCountRes = await query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
    const usersCount = parseInt(usersCountRes.rows[0].count || 0);

    // Game stats (House profit)
    // House Profit = Total Bets - Total Payouts + Withdrawal Fees
    const betRes = await query("SELECT SUM(bet_amount) as total_bets, SUM(payout_amount) as total_payouts FROM bets");
    const totalBets = parseFloat(betRes.rows[0].total_bets || 0);
    const totalPayouts = parseFloat(betRes.rows[0].total_payouts || 0);
    const houseGameProfit = totalBets - totalPayouts;
    const totalPlatformProfit = houseGameProfit + totalWithdrawalFees;

    res.json({
      totalDeposits,
      totalWithdrawals,
      totalWithdrawalFees,
      totalUserBalances,
      usersCount,
      totalBets,
      totalPayouts,
      houseGameProfit,
      totalPlatformProfit
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques.' });
  }
});

// 2. List Pending Transactions (Deposits and Withdrawals)
router.get('/transactions', async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.type, t.status, t.amount, t.fee, t.net_amount, t.provider, t.phone_number, t.screenshot_url, t.created_at, u.email
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      fee: parseFloat(r.fee),
      net_amount: parseFloat(r.net_amount)
    })));
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des transactions.' });
  }
});

// 3. Approve Transaction
router.post('/transactions/:id/approve', async (req, res) => {
  const transactionId = req.params.id;

  try {
    await query('BEGIN');

    // Fetch transaction details
    const txRes = await query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
    if (txRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRes.rows[0];
    if (tx.status !== 'pending') {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Cette transaction a déjà été traitée.' });
    }

    // Update transaction status
    await query(
      "UPDATE transactions SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = $1",
      [transactionId]
    );

    // If it is a deposit, we credit the user's balance now
    if (tx.type === 'deposit') {
      await query(
        "UPDATE users SET balance = balance + $1 WHERE id = $2",
        [tx.amount, tx.user_id]
      );
      console.log(`Admin: Approved deposit of ${tx.amount} HTG for user ID ${tx.user_id}`);
    } else {
      console.log(`Admin: Approved withdrawal of ${tx.amount} HTG for user ID ${tx.user_id}`);
    }

    await query('COMMIT');
    res.json({ message: 'Transaction approuvée avec succès.' });

  } catch (err) {
    await query('ROLLBACK');
    console.error('Approve transaction error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'approbation.' });
  }
});

// 4. Reject Transaction
router.post('/transactions/:id/reject', async (req, res) => {
  const transactionId = req.params.id;

  try {
    await query('BEGIN');

    const txRes = await query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
    if (txRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRes.rows[0];
    if (tx.status !== 'pending') {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Cette transaction a déjà été traitée.' });
    }

    // Update status to rejected
    await query(
      "UPDATE transactions SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = $1",
      [transactionId]
    );

    // If it was a withdrawal, we MUST refund the balance back to the user
    if (tx.type === 'withdrawal') {
      await query(
        "UPDATE users SET balance = balance + $1 WHERE id = $2",
        [tx.amount, tx.user_id]
      );
      console.log(`Admin: Rejected withdrawal. Refunded ${tx.amount} HTG to user ID ${tx.user_id}`);
    } else {
      console.log(`Admin: Rejected deposit of ${tx.amount} HTG for user ID ${tx.user_id}`);
    }

    await query('COMMIT');
    res.json({ message: 'Transaction refusée avec succès. Les fonds ont été restitués s\'il s\'agissait d\'un retrait.' });

  } catch (err) {
    await query('ROLLBACK');
    console.error('Reject transaction error:', err);
    res.status(500).json({ error: 'Erreur serveur lors du rejet.' });
  }
});

// 5. List all users
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, balance, role, is_suspended, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(result.rows.map(r => ({
      ...r,
      balance: parseFloat(r.balance)
    })));
  } catch (err) {
    console.error('Admin users list error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de la liste des utilisateurs.' });
  }
});

// 6. Suspend or Unsuspend a user
router.post('/users/:id/toggle-suspend', async (req, res) => {
  const userId = req.params.id;

  try {
    const userRes = await query('SELECT is_suspended, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Impossible de suspendre un compte administrateur.' });
    }

    const newSuspendedState = !user.is_suspended;
    await query('UPDATE users SET is_suspended = $1 WHERE id = $2', [newSuspendedState, userId]);

    console.log(`Admin: Account ${userId} suspension state set to ${newSuspendedState}`);
    res.json({
      message: `Statut de suspension mis à jour avec succès : ${newSuspendedState ? 'Suspendu' : 'Actif'}.`,
      is_suspended: newSuspendedState
    });

  } catch (err) {
    console.error('Toggle suspend error:', err);
    res.status(500).json({ error: 'Erreur serveur lors du changement de statut.' });
  }
});

module.exports = router;
