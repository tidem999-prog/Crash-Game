const { query } = require('../db');

/**
 * Get the current calendar period boundaries for a competition type.
 */
const getCurrentPeriod = (type) => {
  const now = new Date();
  let start_time, end_time;

  if (type === 'daily') {
    start_time = new Date(now);
    start_time.setHours(0, 0, 0, 0);
    end_time = new Date(now);
    end_time.setHours(23, 59, 59, 999);
  } else if (type === 'weekly' || type === 'xp_battle') {
    // Start of the week: Monday 00:00:00
    start_time = new Date(now);
    const day = start_time.getDay();
    const diff = start_time.getDate() - day + (day === 0 ? -6 : 1);
    start_time.setDate(diff);
    start_time.setHours(0, 0, 0, 0);

    // End of the week: Sunday 23:59:59
    end_time = new Date(start_time);
    end_time.setDate(start_time.getDate() + 6);
    end_time.setHours(23, 59, 59, 999);
  } else if (type === 'monthly') {
    start_time = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end_time = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { start_time, end_time };
};

/**
 * Get the next period boundaries starting precisely from the previous end time.
 */
const getNextPeriod = (type, previousEndTime) => {
  const start_time = new Date(previousEndTime);
  let end_time = new Date(start_time);

  if (type === 'daily') {
    end_time.setDate(start_time.getDate() + 1);
  } else if (type === 'weekly' || type === 'xp_battle') {
    end_time.setDate(start_time.getDate() + 7);
  } else if (type === 'monthly') {
    end_time.setMonth(start_time.getMonth() + 1);
  }
  return { start_time, end_time };
};

/**
 * Record net platform revenue to fund prize pools.
 * Net revenue = (HTG bets - HTG payouts) or withdrawal fee.
 */
const recordPlatformRevenue = async (amount, currency, source) => {
  try {
    if (currency !== 'HTG') return; // Only HTG counts towards real revenue pools
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) return;

    await query(
      "INSERT INTO platform_revenue (amount, source) VALUES ($1, $2)",
      [numericAmount, source]
    );
  } catch (err) {
    console.error('Error in recordPlatformRevenue:', err);
  }
};

/**
 * Initialize active competitions for all types if not already running.
 */
const initCompetitions = async (ioInstance = null) => {
  try {
    const types = ['daily', 'weekly', 'monthly', 'xp_battle'];
    for (const type of types) {
      const activeRes = await query(
        "SELECT * FROM competitions WHERE type = $1 AND status = 'active'",
        [type]
      );
      if (activeRes.rows.length === 0) {
        const { start_time, end_time } = getCurrentPeriod(type);
        await query(
          "INSERT INTO competitions (type, start_time, end_time, status) VALUES ($1, $2, $3, 'active')",
          [type, start_time, end_time]
        );
        console.log(`Competitions: Initialized active competition for ${type} (${start_time.toISOString()} - ${end_time.toISOString()})`);
      }
    }
  } catch (err) {
    console.error('Error in initCompetitions:', err);
  }
};

/**
 * Resolve a specific expired competition.
 */
const resolveCompetition = async (comp, ioInstance = null) => {
  try {
    const configKey = comp.type === 'xp_battle' ? 'xp_battle' : `${comp.type}_xp`;
    const configRes = await query("SELECT * FROM comp_configs WHERE key = $1", [configKey]);
    if (configRes.rows.length === 0) {
      console.error(`Config not found for competition type: ${comp.type}`);
      return;
    }
    const config = configRes.rows[0];
    const percentageRevenue = parseFloat(config.percentage_revenue);
    const minPrizePool = parseFloat(config.min_prize_pool);
    const maxPrizePool = parseFloat(config.max_prize_pool);
    const winnerCount = parseInt(config.winner_count);
    let payoutDistribution = config.payout_distribution;

    if (!Array.isArray(payoutDistribution) || payoutDistribution.length === 0) {
      // Fallback top 10 distribution percentages (total: 100%)
      payoutDistribution = [30, 20, 15, 10, 8, 5, 4, 3, 3, 2];
    }

    // Sum net platform revenue during this competition
    const revRes = await query(
      "SELECT COALESCE(SUM(amount), 0) as total_rev FROM platform_revenue WHERE created_at >= $1 AND created_at <= $2",
      [comp.start_time, comp.end_time]
    );
    const calculatedRevenue = parseFloat(revRes.rows[0].total_rev);
    let prizePool = calculatedRevenue * (percentageRevenue / 100);

    // Clamp between min and max safety caps
    prizePool = Math.max(minPrizePool, Math.min(maxPrizePool, prizePool));

    // Get top players with non-zero activity
    let statsRes;
    if (comp.type === 'xp_battle') {
      statsRes = await query(
        `SELECT ucs.*, u.email, u.first_name, u.last_name 
         FROM user_competition_stats ucs
         JOIN users u ON ucs.user_id = u.id
         WHERE ucs.competition_id = $1 AND ucs.wager_volume > 0
         ORDER BY ucs.wager_volume DESC, ucs.user_id ASC
         LIMIT $2`,
        [comp.id, winnerCount]
      );
    } else {
      statsRes = await query(
        `SELECT ucs.*, u.email, u.first_name, u.last_name 
         FROM user_competition_stats ucs
         JOIN users u ON ucs.user_id = u.id
         WHERE ucs.competition_id = $1 AND ucs.xp_gained > 0
         ORDER BY ucs.xp_gained DESC, ucs.user_id ASC
         LIMIT $2`,
        [comp.id, winnerCount]
      );
    }

    const winners = [];
    for (let i = 0; i < statsRes.rows.length; i++) {
      const row = statsRes.rows[i];
      const pct = payoutDistribution[i] || 0;
      const prize = parseFloat((prizePool * (pct / 100)).toFixed(2));

      if (prize > 0) {
        // Credit user balance
        await query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [prize, row.user_id]
        );

        // Log transaction
        await query(
          `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, processed_at) 
           VALUES ($1, 'deposit', 'approved', $2, 0.00, $2, 'competition', CURRENT_TIMESTAMP)`,
          [row.user_id, prize]
        );

        // Add Notification
        const compName = comp.type === 'xp_battle' ? 'XP Battle' : `Leaderboard ${comp.type === 'daily' ? 'Journalier' : comp.type === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}`;
        const msg = `Félicitations ! Vous avez terminé à la position ${i + 1} de la compétition ${compName} et remporté ${prize} HTG.`;
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'competition_reward', $2)",
          [row.user_id, msg]
        );

        winners.push({
          user_id: row.user_id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          rank: i + 1,
          score: comp.type === 'xp_battle' ? parseFloat(row.wager_volume) : parseFloat(row.xp_gained),
          prize: prize
        });
      }
    }

    // Update old competition status
    await query(
      `UPDATE competitions 
       SET status = 'completed', calculated_revenue = $1, prize_pool = $2, winners_data = $3 
       WHERE id = $4`,
      [calculatedRevenue, prizePool, JSON.stringify(winners), comp.id]
    );

    console.log(`Competitions: Resolved ${comp.type} competition (ID: ${comp.id}) with prize pool of ${prizePool} HTG`);

    // Start the next competition
    const nextPeriod = getNextPeriod(comp.type, comp.end_time);
    await query(
      "INSERT INTO competitions (type, start_time, end_time, status) VALUES ($1, $2, $3, 'active')",
      [comp.type, nextPeriod.start_time, nextPeriod.end_time]
    );

    if (ioInstance) {
      ioInstance.emit('competitions_updated', { type: comp.type });
    }
  } catch (err) {
    console.error('Error resolving competition:', err);
  }
};

/**
 * Check and resolve any active competitions that have reached their end_time.
 */
let isResolving = false;
const checkAndResolveCompetitions = async (ioInstance = null) => {
  if (isResolving) return;
  isResolving = true;
  try {
    const expiredRes = await query(
      "SELECT * FROM competitions WHERE status = 'active' AND end_time <= CURRENT_TIMESTAMP ORDER BY end_time ASC"
    );
    for (const comp of expiredRes.rows) {
      await resolveCompetition(comp, ioInstance);
    }
  } catch (err) {
    console.error('Error checking and resolving competitions:', err);
  } finally {
    isResolving = false;
  }
};

/**
 * Claim/open a Lucky XP Chest and draw a reward based on configured probabilities.
 */
const claimChest = async (userId, chestId) => {
  try {
    const chestRes = await query(
      "SELECT * FROM user_chests WHERE id = $1 AND user_id = $2 AND opened_at IS NULL",
      [chestId, userId]
    );
    if (chestRes.rows.length === 0) {
      return { error: "Coffre introuvable, déjà ouvert ou n'appartenant pas à cet utilisateur." };
    }
    const chest = chestRes.rows[0];

    const configRes = await query("SELECT * FROM comp_configs WHERE key = 'lucky_chest'");
    if (configRes.rows.length === 0) {
      return { error: "Configuration du coffre introuvable." };
    }
    const config = configRes.rows[0];
    const settings = config.extra_settings || {};
    const probs = settings.probabilities || { ket: 0.70, htg: 0.25, rare: 0.05 };
    const ketRewards = settings.ket_rewards || [500, 1000, 2500, 5000, 10000];
    const htgRewards = settings.htg_rewards || [10, 25, 50];
    const rareRewards = settings.rare_rewards || [
      { type: "ticket", name: "Ticket XP Battle" },
      { type: "badge", name: "Badge Temporaire Exclusif" },
      { type: "frame", name: "Cadre de Profil Exclusif" },
      { type: "title", name: "Titre Spécial Temporaire" }
    ];

    const rand = Math.random();
    let rewardType = 'ket';
    let rewardValue = '500';
    let displayMessage = '';

    if (rand < probs.ket) {
      // Draw KET
      rewardType = 'ket';
      const index = Math.floor(Math.random() * ketRewards.length);
      rewardValue = String(ketRewards[index]);

      await query(
        "UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2",
        [parseFloat(rewardValue), userId]
      );
      await query(
        `INSERT INTO ket_history (user_id, amount, type, description) 
         VALUES ($1, $2, 'earning', 'Gain Lucky XP Chest (Palier ' || $3 || ' XP)')`,
        [userId, parseFloat(rewardValue), chest.xp_milestone]
      );
      displayMessage = `Félicitations ! Vous avez ouvert le coffre et gagné ${parseFloat(rewardValue).toLocaleString('fr-FR')} KET !`;
    } else if (rand < probs.ket + probs.htg) {
      // Draw HTG
      rewardType = 'htg';
      const index = Math.floor(Math.random() * htgRewards.length);
      rewardValue = String(htgRewards[index]);

      await query(
        "UPDATE users SET balance = balance + $1 WHERE id = $2",
        [parseFloat(rewardValue), userId]
      );
      await query(
        `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, processed_at) 
         VALUES ($1, 'deposit', 'approved', $2, 0.00, $2, 'lucky_chest', CURRENT_TIMESTAMP)`,
        [userId, parseFloat(rewardValue)]
      );
      displayMessage = `Félicitations ! Vous avez ouvert le coffre et gagné ${rewardValue} HTG réels !`;
    } else {
      // Draw Rare Reward
      rewardType = 'rare';
      const index = Math.floor(Math.random() * rareRewards.length);
      const rare = rareRewards[index];
      rewardValue = JSON.stringify(rare);
      displayMessage = `Félicitations ! Vous avez remporté un lot rare : ${rare.name} !`;
    }

    // Update chest in DB
    await query(
      "UPDATE user_chests SET opened_at = CURRENT_TIMESTAMP, reward_type = $1, reward_value = $2 WHERE id = $3",
      [rewardType, rewardValue, chestId]
    );

    // Record notification
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'lucky_chest', $2)",
      [userId, displayMessage]
    );

    return {
      success: true,
      reward_type: rewardType,
      reward_value: rewardType === 'rare' ? JSON.parse(rewardValue) : rewardValue,
      message: displayMessage
    };
  } catch (err) {
    console.error('Error in claimChest:', err);
    return { error: "Erreur serveur lors de l'ouverture du coffre." };
  }
};

module.exports = {
  recordPlatformRevenue,
  initCompetitions,
  checkAndResolveCompetitions,
  claimChest
};
