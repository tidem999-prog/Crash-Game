const { query } = require('../db');

const LEVELS = [
  { level: 1, xpRequired: 0, badge: 'Bronze' },
  { level: 2, xpRequired: 50, badge: 'Argent' },
  { level: 3, xpRequired: 150, badge: 'Or' },
  { level: 4, xpRequired: 350, badge: 'Platine' },
  { level: 5, xpRequired: 700, badge: 'Diamant' }
];

const getLevelInfo = (xp) => {
  let currentLevel = LEVELS[0];
  let nextLevel = null;
  
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xpRequired) {
      currentLevel = LEVELS[i];
    } else {
      nextLevel = LEVELS[i];
      break;
    }
  }
  
  return {
    level: currentLevel.level,
    badge: currentLevel.badge,
    xpRequired: currentLevel.xpRequired,
    nextXpRequired: nextLevel ? nextLevel.xpRequired : null,
    nextBadge: nextLevel ? nextLevel.badge : null
  };
};

const processWager = async (userId, wagerAmount, currency) => {
  try {
    const numericWager = parseFloat(wagerAmount);
    if (isNaN(numericWager) || numericWager <= 0) return;

    // Update last_activity_at to reset inactivity timer
    await query(
      "UPDATE users SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1",
      [userId]
    );

    // Only HTG currency wagers earn XP
    if (currency === 'HTG') {
      const xpEarned = parseFloat((numericWager / 100).toFixed(4));
      
      // Get current XP before update
      const userRes = await query("SELECT xp FROM users WHERE id = $1", [userId]);
      if (userRes.rows.length === 0) return;
      
      const oldXp = parseFloat(userRes.rows[0].xp || 0);
      const newXp = oldXp + xpEarned;
      
      const oldLevelInfo = getLevelInfo(oldXp);
      const newLevelInfo = getLevelInfo(newXp);
      
      // Update XP in database
      await query(
        "UPDATE users SET xp = xp + $1 WHERE id = $2",
        [xpEarned, userId]
      );
      
      // Check if user leveled up
      if (newLevelInfo.level > oldLevelInfo.level) {
        // Leveled up! Add notification
        const msg = `Félicitations ! Vous avez atteint le Niveau ${newLevelInfo.level} (${newLevelInfo.badge}).`;
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'level_up', $2)",
          [userId, msg]
        );
        
        // If they reached level 5, add the level 5 conversion unlocked notification
        if (newLevelInfo.level === 5) {
          const conversionMsg = "Vous avez atteint le Niveau 5. La conversion KET est désormais disponible sous réserve des autres conditions.";
          await query(
            "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'conversion_unlocked', $2)",
            [userId, conversionMsg]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error in processWager:', err);
  }
};

const processBetSettlement = async (userId, wagerAmount, payoutAmount, currency, gameType) => {
  try {
    if (currency !== 'HTG') return; // Only HTG wagers earn KET

    const wager = parseFloat(wagerAmount);
    const payout = parseFloat(payoutAmount);
    if (isNaN(wager) || isNaN(payout) || wager <= 0) return;

    let ketEarned = 0;
    let desc = '';
    
    if (payout > wager) {
      // Win
      ketEarned = wager * 10;
      desc = `Gain de mise sur ${gameType}: +${Math.round(ketEarned).toLocaleString('fr-FR')} KET (Win rate)`;
    } else {
      // Loss (partial or total)
      const lostAmount = wager - payout;
      ketEarned = (lostAmount * 20) + (payout * 10);
      desc = `Mise sur ${gameType} (Perte: ${lostAmount.toFixed(2)} HTG, Gain/Retour: ${payout.toFixed(2)} HTG): +${Math.round(ketEarned).toLocaleString('fr-FR')} KET`;
    }

    if (ketEarned > 0) {
      // Update user ket balance
      await query(
        "UPDATE users SET ket_balance = ket_balance + $1 WHERE id = $2",
        [ketEarned, userId]
      );

      // Record in KET history
      await query(
        "INSERT INTO ket_history (user_id, amount, type, description) VALUES ($1, $2, 'earning', $3)",
        [userId, ketEarned, desc]
      );
    }
  } catch (err) {
    console.error('Error in processBetSettlement:', err);
  }
};

const checkInactivityAndClean = async (userId) => {
  try {
    const userRes = await query(
      "SELECT ket_balance, last_activity_at, email FROM users WHERE id = $1",
      [userId]
    );
    if (userRes.rows.length === 0) return;

    const user = userRes.rows[0];
    const ketBalance = parseFloat(user.ket_balance || 0);
    const lastActivity = new Date(user.last_activity_at);
    const now = new Date();
    
    // Difference in days
    const diffTime = Math.abs(now - lastActivity);
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays >= 10 && ketBalance > 0) {
      // 10 days of inactivity: Burn all KET!
      await query(
        "UPDATE users SET ket_balance = 0 WHERE id = $1",
        [userId]
      );
      
      // Record in history
      await query(
        "INSERT INTO ket_history (user_id, amount, type, description) VALUES ($1, $2, 'expiration', 'Expiration suite à 10 jours d\'inactivité')",
        [userId, -ketBalance]
      );

      // Notification
      await query(
        "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'expiration', 'Vos KET ont expiré suite à 10 jours d\'inactivité.')",
        [userId]
      );
    } else if (diffDays >= 7 && diffDays < 10 && ketBalance > 0) {
      // 7-9 days of inactivity: warning if not already sent in the last 24 hours
      const warnCheck = await query(
        "SELECT id FROM notifications WHERE user_id = $1 AND type = 'inactivity_warning' AND created_at > NOW() - INTERVAL '1 day'",
        [userId]
      );
      if (warnCheck.rows.length === 0) {
        const remainingDays = Math.ceil(10 - diffDays);
        const warnMsg = `Attention ! Vos KET expireront dans ${remainingDays} jours si aucune activité n'est détectée.`;
        await query(
          "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'inactivity_warning', $2)",
          [userId, warnMsg]
        );
      }
    }
  } catch (err) {
    console.error('Error in checkInactivityAndClean:', err);
  }
};

module.exports = {
  getLevelInfo,
  processWager,
  processBetSettlement,
  checkInactivityAndClean
};
