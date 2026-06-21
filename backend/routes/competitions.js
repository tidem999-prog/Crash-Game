const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { checkAndResolveCompetitions, initCompetitions, claimChest } = require('../utils/competitions');

// Ensure token authentication for all routes
router.use(authenticateToken);

/**
 * GET /api/competitions/active
 * Returns all active competitions with leaderboards and the current user's standings.
 */
router.get('/active', async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Run lazy checks to resolve any expired competitions on the fly
    await checkAndResolveCompetitions();
    await initCompetitions();

    // 2. Load configurations
    const configsRes = await query("SELECT * FROM comp_configs");
    const configs = {};
    configsRes.rows.forEach(c => {
      configs[c.key] = {
        percentage_revenue: parseFloat(c.percentage_revenue),
        min_prize_pool: parseFloat(c.min_prize_pool),
        max_prize_pool: parseFloat(c.max_prize_pool),
        winner_count: parseInt(c.winner_count),
        payout_distribution: c.payout_distribution
      };
    });

    // 3. Load active competitions
    const activeRes = await query(
      "SELECT * FROM competitions WHERE status = 'active' ORDER BY start_time ASC"
    );

    const competitionsData = [];

    for (const comp of activeRes.rows) {
      const configKey = comp.type === 'xp_battle' ? 'xp_battle' : `${comp.type}_xp`;
      const config = configs[configKey] || {
        percentage_revenue: 5.0,
        min_prize_pool: 100.0,
        max_prize_pool: 1000.0,
        winner_count: 10,
        payout_distribution: [30, 20, 15, 10, 8, 5, 4, 3, 3, 2]
      };

      // Sum revenue so far
      const revRes = await query(
        "SELECT COALESCE(SUM(amount), 0) as total_rev FROM platform_revenue WHERE created_at >= $1 AND created_at <= $2",
        [comp.start_time, comp.end_time]
      );
      const calculatedRevenue = parseFloat(revRes.rows[0].total_rev);
      let currentPrizePool = calculatedRevenue * (config.percentage_revenue / 100);
      currentPrizePool = Math.max(config.min_prize_pool, Math.min(config.max_prize_pool, currentPrizePool));

      // Get leaderboard
      let leaderboardRes;
      if (comp.type === 'xp_battle') {
        leaderboardRes = await query(
          `SELECT ucs.user_id, u.email, u.first_name, u.last_name, ucs.wager_volume as score
           FROM user_competition_stats ucs
           JOIN users u ON ucs.user_id = u.id
           WHERE ucs.competition_id = $1 AND ucs.wager_volume > 0
           ORDER BY ucs.wager_volume DESC, ucs.user_id ASC
           LIMIT 50`,
          [comp.id]
        );
      } else {
        leaderboardRes = await query(
          `SELECT ucs.user_id, u.email, u.first_name, u.last_name, ucs.xp_gained as score
           FROM user_competition_stats ucs
           JOIN users u ON ucs.user_id = u.id
           WHERE ucs.competition_id = $1 AND ucs.xp_gained > 0
           ORDER BY ucs.xp_gained DESC, ucs.user_id ASC
           LIMIT 50`,
          [comp.id]
        );
      }

      // Map emails for display (masking)
      const leaderboard = leaderboardRes.rows.map((row, index) => {
        const parts = row.email.split('@');
        const maskedEmail = parts[0].length > 2 
          ? `${parts[0][0]}${'*'.repeat(parts[0].length - 2)}${parts[0][parts[0].length - 1]}` 
          : `${parts[0][0]}*`;
        
        return {
          user_id: row.user_id,
          username: row.first_name || maskedEmail,
          score: parseFloat(row.score),
          rank: index + 1
        };
      });

      // Get current user's performance
      const userStatsRes = await query(
        "SELECT xp_gained, wager_volume FROM user_competition_stats WHERE competition_id = $1 AND user_id = $2",
        [comp.id, userId]
      );

      let userScore = 0.0;
      let userRank = null;
      let estimatedPayout = 0.0;

      if (userStatsRes.rows.length > 0) {
        const stats = userStatsRes.rows[0];
        userScore = comp.type === 'xp_battle' ? parseFloat(stats.wager_volume || 0) : parseFloat(stats.xp_gained || 0);

        if (userScore > 0) {
          // Calculate rank
          let rankCountRes;
          if (comp.type === 'xp_battle') {
            rankCountRes = await query(
              "SELECT COUNT(*) as count FROM user_competition_stats WHERE competition_id = $1 AND wager_volume > $2",
              [comp.id, userScore]
            );
          } else {
            rankCountRes = await query(
              "SELECT COUNT(*) as count FROM user_competition_stats WHERE competition_id = $1 AND xp_gained > $2",
              [comp.id, userScore]
            );
          }
          userRank = parseInt(rankCountRes.rows[0].count) + 1;

          // Estimate payout
          if (userRank <= config.winner_count) {
            const distribution = config.payout_distribution || [30, 20, 15, 10, 8, 5, 4, 3, 3, 2];
            const pct = distribution[userRank - 1] || 0;
            estimatedPayout = parseFloat((currentPrizePool * (pct / 100)).toFixed(2));
          }
        }
      }

      competitionsData.push({
        id: comp.id,
        type: comp.type,
        start_time: comp.start_time,
        end_time: comp.end_time,
        prize_pool: currentPrizePool,
        leaderboard,
        config: {
          winner_count: config.winner_count,
          payout_distribution: config.payout_distribution
        },
        userStanding: {
          score: userScore,
          rank: userRank,
          estimatedPayout
        }
      });
    }

    res.json(competitionsData);
  } catch (err) {
    console.error('Error fetching active competitions:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des compétitions actives.' });
  }
});

/**
 * GET /api/competitions/chests
 * Returns all Lucky XP Chests unlocked by the user.
 */
router.get('/chests', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await query(
      "SELECT id, xp_milestone, reward_type, reward_value, opened_at, created_at FROM user_chests WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    const chests = result.rows.map(r => ({
      id: r.id,
      xp_milestone: parseInt(r.xp_milestone),
      reward_type: r.reward_type,
      reward_value: r.reward_type === 'rare' ? JSON.parse(r.reward_value) : r.reward_value,
      opened_at: r.opened_at,
      created_at: r.created_at
    }));

    res.json(chests);
  } catch (err) {
    console.error('Error loading user chests:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des coffres.' });
  }
});

/**
 * POST /api/competitions/chests/:id/open
 * Claims a specific chest and draws a reward.
 */
router.post('/chests/:id/open', async (req, res) => {
  const userId = req.user.id;
  const chestId = req.params.id;

  try {
    const result = await claimChest(userId, chestId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('Error opening chest:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'ouverture du coffre.' });
  }
});

/**
 * GET /api/competitions/history
 * Returns the history of completed competitions and the user's historical winnings.
 */
router.get('/history', async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Fetch recent completed competitions
    const completedComps = await query(
      "SELECT id, type, start_time, end_time, calculated_revenue, prize_pool, winners_data FROM competitions WHERE status = 'completed' ORDER BY end_time DESC LIMIT 30"
    );

    const history = completedComps.rows.map(comp => {
      // Decode winners
      const winners = comp.winners_data || [];
      const userWin = winners.find(w => w.user_id === userId);

      return {
        id: comp.id,
        type: comp.type,
        start_time: comp.start_time,
        end_time: comp.end_time,
        prize_pool: parseFloat(comp.prize_pool),
        winners: winners.map(w => ({
          username: w.first_name || w.email.split('@')[0],
          rank: w.rank,
          score: w.score,
          prize: w.prize
        })),
        userWin: userWin ? {
          rank: userWin.rank,
          score: userWin.score,
          prize: userWin.prize
        } : null
      };
    });

    // 2. Fetch user's direct winnings transactions
    const transactionsRes = await query(
      `SELECT amount, net_amount, provider, processed_at 
       FROM transactions 
       WHERE user_id = $1 AND (provider = 'competition' OR provider = 'lucky_chest')
       ORDER BY processed_at DESC`,
      [userId]
    );

    const winnings = transactionsRes.rows.map(t => ({
      amount: parseFloat(t.amount),
      provider: t.provider,
      date: t.processed_at
    }));

    res.json({ history, winnings });
  } catch (err) {
    console.error('Error fetching competitions history:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique.' });
  }
});

/**
 * POST /api/competitions/bonus-choices/:id/claim
 * Process user choice between Bonus Balance (Option A) or XP Booster x2 (Option B).
 */
router.post('/bonus-choices/:id/claim', async (req, res) => {
  const userId = req.user.id;
  const choiceId = req.params.id;
  const { choice } = req.body;

  if (choice !== 'bonus' && choice !== 'booster') {
    return res.status(400).json({ error: 'Choix invalide (bonus ou booster requis).' });
  }

  try {
    await query('BEGIN');

    const choiceRes = await query(
      "SELECT * FROM user_bonus_choices WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [choiceId, userId]
    );

    if (choiceRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Choix de récompense introuvable.' });
    }

    const bonusChoice = choiceRes.rows[0];
    if (bonusChoice.status !== 'pending') {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Cette récompense a déjà été réclamée.' });
    }

    const potentialBonus = parseFloat(bonusChoice.potential_bonus);

    if (choice === 'bonus') {
      // Option A: Claim Deposit Bonus
      const wrRequired = potentialBonus * 10;
      await query(
        `UPDATE users 
         SET bonus_balance = bonus_balance + $1, 
             wager_requirement_required = wager_requirement_required + $2, 
             bonus_expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days', 
             last_bonus_claim_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [potentialBonus, wrRequired, userId]
      );

      await query(
        "UPDATE user_bonus_choices SET status = 'claimed_bonus' WHERE id = $1",
        [choiceId]
      );

      await query(
        `INSERT INTO notifications (user_id, type, message) 
         VALUES ($1, 'bonus_activated', 'Votre bonus a été activé avec succès.')`,
        [userId]
      );

    } else {
      // Option B: Claim XP Booster x2 for 7 days
      await query(
        `UPDATE users 
         SET xp_booster_expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days', 
             last_bonus_claim_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [userId]
      );

      await query(
        "UPDATE user_bonus_choices SET status = 'claimed_booster' WHERE id = $1",
        [choiceId]
      );

      await query(
        `INSERT INTO notifications (user_id, type, message) 
         VALUES ($1, 'xp_booster_activated', 'Votre XP Booster x2 est maintenant actif pendant 7 jours.')`,
        [userId]
      );
    }

    await query('COMMIT');

    // Retrieve updated user profile
    const profileRes = await query(
      `SELECT id, email, role, balance, ket_balance, active_currency, first_name, last_name, is_suspended, referral_code,
              bonus_balance, locked_winnings, wager_requirement_required, wager_requirement_progress, bonus_expires_at, xp_booster_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = profileRes.rows[0];

    const pendingChoicesRes = await query(
      "SELECT id, deposit_amount, bonus_type, potential_bonus FROM user_bonus_choices WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );

    res.json({
      message: choice === 'bonus' ? 'Votre bonus a été activé avec succès.' : 'Votre XP Booster x2 est maintenant actif pendant 7 jours.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance),
        ket_balance: parseFloat(user.ket_balance || 0),
        active_currency: user.active_currency || 'HTG',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        referral_code: user.referral_code,
        bonus_balance: parseFloat(user.bonus_balance || 0),
        locked_winnings: parseFloat(user.locked_winnings || 0),
        wager_requirement_required: parseFloat(user.wager_requirement_required || 0),
        wager_requirement_progress: parseFloat(user.wager_requirement_progress || 0),
        bonus_expires_at: user.bonus_expires_at,
        xp_booster_expires_at: user.xp_booster_expires_at,
        pendingBonusChoices: pendingChoicesRes.rows.map(r => ({
          id: r.id,
          depositAmount: parseFloat(r.deposit_amount),
          bonusType: r.bonus_type,
          potentialBonus: parseFloat(r.potential_bonus)
        }))
      }
    });

  } catch (err) {
    await query('ROLLBACK');
    console.error('Error claiming reward:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la réclamation de votre récompense.' });
  }
});

module.exports = router;
