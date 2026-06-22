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
    const wdRes = await query("SELECT SUM(amount) as total FROM transactions WHERE type = 'withdrawal' AND status = 'approved'");
    const totalWithdrawals = parseFloat(wdRes.rows[0].total || 0);

    // Total withdrawal fees (10% fees from all withdrawal requests that are pending or approved)
    const feesRes = await query("SELECT SUM(fee) as total_fees FROM transactions WHERE type = 'withdrawal' AND status != 'rejected'");
    const totalWithdrawalFees = parseFloat(feesRes.rows[0].total_fees || 0);

    // Total user balances
    const balRes = await query("SELECT SUM(balance) as total FROM users WHERE role = 'user'");
    const totalUserBalances = parseFloat(balRes.rows[0].total || 0);

    // Total count of users
    const usersCountRes = await query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
    const usersCount = parseInt(usersCountRes.rows[0].count || 0);

    const betRes = await query(
      `SELECT SUM(b.bet_amount) as total_bets, SUM(b.payout_amount) as total_payouts 
       FROM bets b
       JOIN users u ON b.user_id = u.id
       WHERE u.role = 'user'`
    );
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
      if (tx.provider === 'usdt_bep20') {
        await query(
          "UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2",
          [tx.amount, tx.user_id]
        );
        console.log(`Admin: Approved deposit of ${tx.amount} USDT for user ID ${tx.user_id}`);
        // Create user notification
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_deposit_confirmed', $2)",
          [tx.user_id, `Votre dépôt USDT de ${tx.amount} USDT a été validé.`]
        );
      } else {
        await query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [tx.amount, tx.user_id]
        );
        console.log(`Admin: Approved deposit of ${tx.amount} HTG for user ID ${tx.user_id}`);
      }

      // Check deposit bonus eligibility
      const depositAmount = parseFloat(tx.amount);
      if (depositAmount >= 500 && tx.provider !== 'usdt_bep20') {
        const countRes = await query(
          "SELECT COUNT(*) as count FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'approved'",
          [tx.user_id]
        );
        const approvedCount = parseInt(countRes.rows[0].count);

        const userStatsRes = await query(
          "SELECT xp, last_bonus_claim_at FROM users WHERE id = $1",
          [tx.user_id]
        );
        const userStats = userStatsRes.rows[0];
        const xp = parseFloat(userStats.xp || 0);
        const lastClaim = userStats.last_bonus_claim_at ? new Date(userStats.last_bonus_claim_at) : null;
        
        let eligible = false;
        let bonusType = '';
        let potentialBonus = 0;

        if (approvedCount === 1) {
          // First deposit bonus (100%, max 5000 HTG)
          eligible = true;
          bonusType = 'first_deposit';
          const eligibleAmount = Math.min(depositAmount, 5000);
          potentialBonus = eligibleAmount;
        } else {
          // Check 7-day cooldown
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const hasCooldownPassed = !lastClaim || lastClaim < sevenDaysAgo;

          if (hasCooldownPassed) {
            if (xp >= 700) {
              // VIP Recharge (50%, max 5000 HTG)
              eligible = true;
              bonusType = 'vip_recharge';
              const eligibleAmount = Math.min(depositAmount, 10000);
              potentialBonus = parseFloat((eligibleAmount * 0.50).toFixed(2));
            } else {
              // Recharge (25%, max 2500 HTG)
              eligible = true;
              bonusType = 'recharge';
              const eligibleAmount = Math.min(depositAmount, 10000);
              potentialBonus = parseFloat((eligibleAmount * 0.25).toFixed(2));
            }
          }
        }

        if (eligible && potentialBonus > 0) {
          await query(
            `INSERT INTO user_bonus_choices (user_id, transaction_id, deposit_amount, bonus_type, potential_bonus, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [tx.user_id, transactionId, depositAmount, bonusType, potentialBonus]
          );
          console.log(`Admin: User ${tx.user_id} qualified for ${bonusType} bonus of ${potentialBonus} HTG. Choice pending.`);
        }
      }

      // Check if user has a referrer
      const userRes = await query('SELECT email, referred_by FROM users WHERE id = $1', [tx.user_id]);
      if (userRes.rows.length > 0 && userRes.rows[0].referred_by && tx.provider !== 'usdt_bep20') {
        const referredBy = userRes.rows[0].referred_by;
        const depositerEmail = userRes.rows[0].email;
        const commission = parseFloat((tx.amount * 0.05).toFixed(2));

        if (commission > 0) {
          // Credit referrer's balance
          await query(
            "UPDATE users SET balance = balance + $1 WHERE id = $2",
            [commission, referredBy]
          );

          // Format email for description (masking)
          const parts = depositerEmail.split('@');
          const name = parts[0];
          const domain = parts[1];
          const maskedName = name.length > 2 ? `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}` : `${name[0]}*`;
          const maskedEmail = `${maskedName}@${domain}`;

          // Create a transaction row for the referrer
          await query(
            `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, phone_number, screenshot_url, processed_at) 
             VALUES ($1, 'deposit', 'approved', $2, 0.00, $2, 'referral', 'Commission', $3, CURRENT_TIMESTAMP)`,
            [referredBy, commission, `Commission pour le dépôt du filleul ${maskedEmail}`]
          );
          console.log(`Admin: Credited referral commission of ${commission} HTG to user ID ${referredBy}`);
        }
      }
    } else {
      if (tx.provider === 'usdt_bep20') {
        console.log(`Admin: Approved withdrawal of ${tx.amount} USDT for user ID ${tx.user_id}`);
        const feeAmount = parseFloat(tx.fee);
        if (feeAmount > 0) {
          // Get current usdt exchange rate to convert USDT fees to HTG revenue
          const rateRes = await query("SELECT value FROM global_settings WHERE key = 'usdt_exchange_rate'");
          const rate = rateRes.rows.length > 0 ? parseFloat(rateRes.rows[0].value) : 130;
          const feeInHtg = parseFloat((feeAmount * rate).toFixed(2));
          const { recordPlatformRevenue } = require('../utils/competitions');
          await recordPlatformRevenue(feeInHtg, 'HTG', 'withdrawal_fee_usdt');
        }
        // Send user notification
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_withdrawal_approved', $2)",
          [tx.user_id, `Votre retrait USDT de ${tx.amount} USDT a été envoyé avec succès.`]
        );
      } else {
        console.log(`Admin: Approved withdrawal of ${tx.amount} HTG for user ID ${tx.user_id}`);
        const feeAmount = parseFloat(tx.fee);
        if (feeAmount > 0) {
          const { recordPlatformRevenue } = require('../utils/competitions');
          await recordPlatformRevenue(feeAmount, 'HTG', 'withdrawal_fee');
        }
      }
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
      if (tx.provider === 'usdt_bep20') {
        await query(
          "UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2",
          [tx.amount, tx.user_id]
        );
        console.log(`Admin: Rejected withdrawal. Refunded ${tx.amount} USDT to user ID ${tx.user_id}`);
        // Create user notification
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_withdrawal_rejected', $2)",
          [tx.user_id, `Votre demande de retrait de ${tx.amount} USDT a été refusée.`]
        );
      } else {
        await query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [tx.amount, tx.user_id]
        );
        console.log(`Admin: Rejected withdrawal. Refunded ${tx.amount} HTG to user ID ${tx.user_id}`);
      }
    } else {
      if (tx.provider === 'usdt_bep20') {
        console.log(`Admin: Rejected deposit of ${tx.amount} USDT for user ID ${tx.user_id}`);
        // Create user notification
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_deposit_rejected', $2)",
          [tx.user_id, `Votre dépôt USDT de ${tx.amount} USDT a été refusé.`]
        );
      } else {
        console.log(`Admin: Rejected deposit of ${tx.amount} HTG for user ID ${tx.user_id}`);
      }
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

// 7. Reset Platform Profits (deletes all bets)
router.post('/reset/profits', async (req, res) => {
  try {
    await query("DELETE FROM bets");
    res.json({ message: 'Les profits de jeu ont été réinitialisés à 0.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation des profits.' });
  }
});

// 8. Reset Caisse Joueurs (sets all users' balances to 0)
router.post('/reset/balances', async (req, res) => {
  try {
    await query("UPDATE users SET balance = 0.00 WHERE role = 'user'");
    res.json({ message: 'Les soldes de tous les joueurs ont été réinitialisés à 0.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation des soldes.' });
  }
});

// 9. Reset Deposits (deletes all deposit transactions)
router.post('/reset/deposits', async (req, res) => {
  try {
    await query("DELETE FROM transactions WHERE type = 'deposit'");
    res.json({ message: 'L\'historique des dépôts a été réinitialisé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation des dépôts.' });
  }
});

// 10. Reset Withdrawals (deletes all withdrawal transactions)
router.post('/reset/withdrawals', async (req, res) => {
  try {
    await query("DELETE FROM transactions WHERE type = 'withdrawal'");
    res.json({ message: 'L\'historique des retraits a été réinitialisé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation des retraits.' });
  }
});

// 11. Search user bets by ID or Email (modified to return all activities with running balance)
router.get('/user-bets', async (req, res) => {
  const { query: searchQuery } = req.query;
  
  if (!searchQuery) {
    return res.status(400).json({ error: 'Veuillez fournir un ID ou un Email.' });
  }

  try {
    let userId = searchQuery.trim();
    let userEmail = '';
    let currentBalance = 0;

    // If query is an email, resolve it to an ID
    if (userId.includes('@')) {
      const userRes = await query('SELECT id, email, balance FROM users WHERE email = $1', [userId]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Aucun utilisateur trouvé avec cet e-mail.' });
      }
      userId = userRes.rows[0].id;
      userEmail = userRes.rows[0].email;
      currentBalance = parseFloat(userRes.rows[0].balance || 0);
    } else {
      // Validate if it's a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ error: 'ID Utilisateur invalide.' });
      }
      
      const userRes = await query('SELECT email, balance FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Aucun utilisateur trouvé avec cet ID.' });
      }
      userEmail = userRes.rows[0].email;
      currentBalance = parseFloat(userRes.rows[0].balance || 0);
    }

    // Now we fetch all user activities
    const activitiesRes = await query(
      `SELECT 
        id, 
        'bet'::varchar AS activity_type, 
        game_id::varchar, 
        bet_amount::numeric, 
        cashout_multiplier::numeric, 
        payout_amount::numeric, 
        is_won::boolean, 
        NULL::varchar AS status, 
        NULL::varchar AS tx_type, 
        NULL::varchar AS provider, 
        NULL::varchar AS action, 
        created_at 
      FROM bets 
      WHERE user_id = $1

      UNION ALL

      SELECT 
        id, 
        'mines'::varchar AS activity_type, 
        NULL::varchar AS game_id, 
        bet_amount::numeric, 
        current_multiplier::numeric AS cashout_multiplier, 
        payout_amount::numeric, 
        (status = 'cashed_out')::boolean AS is_won, 
        status::varchar AS status, 
        NULL::varchar AS tx_type, 
        NULL::varchar AS provider, 
        NULL::varchar AS action, 
        created_at 
      FROM mines_games 
      WHERE user_id = $1

      UNION ALL

      SELECT 
        id, 
        'transaction'::varchar AS activity_type, 
        NULL::varchar AS game_id, 
        amount::numeric AS bet_amount, 
        NULL::numeric AS cashout_multiplier, 
        net_amount::numeric AS payout_amount, 
        (status = 'approved')::boolean AS is_won, 
        status::varchar AS status, 
        type::varchar AS tx_type, 
        provider::varchar AS provider, 
        NULL::varchar AS action, 
        created_at 
      FROM transactions 
      WHERE user_id = $1

      UNION ALL

      SELECT 
        id, 
        'koth'::varchar AS activity_type, 
        NULL::varchar AS game_id, 
        amount::numeric AS bet_amount, 
        NULL::numeric AS cashout_multiplier, 
        NULL::numeric AS payout_amount, 
        (action = 'WIN_POT_DISTRIBUTION' OR action = 'REFUND_CANCELLED_ROOM')::boolean AS is_won, 
        NULL::varchar AS status, 
        NULL::varchar AS tx_type, 
        NULL::varchar AS provider, 
        action::varchar AS action, 
        created_at 
      FROM audit_logs 
      WHERE user_id = $1 AND game_type = 'KOTH'

      ORDER BY created_at DESC 
      LIMIT 500`,
      [userId]
    );

    // Reconstruct the balance progression walking backwards from currentBalance
    let runningBalance = currentBalance;
    const activities = activitiesRes.rows.map(r => ({
      ...r,
      bet_amount: parseFloat(r.bet_amount || 0),
      cashout_multiplier: r.cashout_multiplier ? parseFloat(r.cashout_multiplier) : null,
      payout_amount: parseFloat(r.payout_amount || 0),
    }));

    const activitiesWithBalance = [];

    for (const act of activities) {
      const balanceAfter = runningBalance;
      let delta = 0;

      if (act.activity_type === 'bet') {
        delta = (act.is_won ? act.payout_amount : 0) - act.bet_amount;
      } else if (act.activity_type === 'mines') {
        delta = (act.status === 'cashed_out' ? act.payout_amount : 0) - act.bet_amount;
      } else if (act.activity_type === 'transaction') {
        if (act.tx_type === 'deposit') {
          delta = (act.status === 'approved') ? act.bet_amount : 0;
        } else if (act.tx_type === 'withdrawal') {
          delta = (act.status === 'rejected') ? 0 : -act.bet_amount;
        }
      } else if (act.activity_type === 'koth') {
        if (act.action === 'JOIN_ESCROW_DEDUCTION') {
          delta = -act.bet_amount;
        } else if (act.action === 'WIN_POT_DISTRIBUTION' || act.action === 'REFUND_CANCELLED_ROOM') {
          delta = act.bet_amount;
        }
      }

      // runningBalance represents the balance before this activity took place
      runningBalance = parseFloat((runningBalance - delta).toFixed(2));
      
      activitiesWithBalance.push({
        ...act,
        balance_after: balanceAfter,
        balance_before: runningBalance,
        delta
      });
    }

    res.json({
      user: {
        id: userId,
        email: userEmail,
        balance: currentBalance
      },
      bets: activitiesWithBalance // Keeping variable name 'bets' to minimize frontend change issues, but it actually contains all activities
    });
  } catch (err) {
    console.error('Admin user bets search error:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche des activités.' });
  }
});

// 12. Get Competition Configurations
router.get('/competitions/config', async (req, res) => {
  try {
    const configRes = await query("SELECT * FROM comp_configs ORDER BY key ASC");
    res.json(configRes.rows);
  } catch (err) {
    console.error('Error fetching admin competition configurations:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des configurations de compétitions.' });
  }
});

// 13. Update Competition Configuration
router.post('/competitions/config', async (req, res) => {
  const { key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution, extra_settings } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'La clé de configuration est requise.' });
  }

  try {
    await query(
      `UPDATE comp_configs 
       SET percentage_revenue = $1, min_prize_pool = $2, max_prize_pool = $3, 
           winner_count = $4, payout_distribution = $5, extra_settings = $6 
       WHERE key = $7`,
      [
        parseFloat(percentage_revenue),
        parseFloat(min_prize_pool),
        parseFloat(max_prize_pool),
        parseInt(winner_count),
        JSON.stringify(payout_distribution),
        JSON.stringify(extra_settings || {}),
        key
      ]
    );
    res.json({ message: `Configuration de compétition '${key}' mise à jour.` });
  } catch (err) {
    console.error('Error updating admin competition configuration:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la configuration de compétition.' });
  }
});

// 14. Get General System Settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query("SELECT key, value, description FROM global_settings ORDER BY key ASC");
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching admin global settings:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des paramètres généraux.' });
  }
});

// 15. Update General System Setting
router.post('/settings', async (req, res) => {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'La clé et la valeur du paramètre sont requises.' });
  }

  try {
    await query(
      "UPDATE global_settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2",
      [value.toString().trim(), key]
    );
    console.log(`Admin: System setting '${key}' updated to '${value}'`);
    res.json({ message: `Le paramètre '${key}' a été mis à jour avec succès.` });
  } catch (err) {
    console.error('Error updating admin global setting:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du paramètre.' });
  }
});

module.exports = router;
