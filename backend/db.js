const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const hasSSL = isProduction || (process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('supabase') || process.env.DATABASE_URL.includes('neon')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: hasSSL ? { rejectUnauthorized: false } : false
});

// Helper for running queries
const query = (text, params) => pool.query(text, params);

const initializeDatabase = async () => {
  try {
    // 1. Create Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        balance DECIMAL(12, 2) DEFAULT 0.00,
        role VARCHAR(20) DEFAULT 'user',
        is_suspended BOOLEAN DEFAULT false,
        is_verified BOOLEAN DEFAULT false,
        referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
        referral_code VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Ensure is_verified column exists for existing tables
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
    `);
    // Ensure referred_by column exists
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `);
    // Ensure referral_code column exists
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(100) UNIQUE;
    `);
    
    // Ensure first_name, last_name, ket_balance, active_currency columns exist
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ket_balance DECIMAL(15, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active_currency VARCHAR(10) DEFAULT 'HTG';
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS xp DECIMAL(12, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_conversion_at TIMESTAMP DEFAULT NULL;
    `);

    // Bonus system columns
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_balance DECIMAL(12, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_winnings DECIMAL(12, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wager_requirement_required DECIMAL(12, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wager_requirement_progress DECIMAL(12, 2) DEFAULT 0.00;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMP DEFAULT NULL;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_booster_expires_at TIMESTAMP DEFAULT NULL;
    `);
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bonus_claim_at TIMESTAMP DEFAULT NULL;
    `);

    // Ensure currency column exists for bets, bloodmoney_bets, mines_games, duels, koth_rooms
    await query(`
      ALTER TABLE bets ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'HTG';
    `);
    await query(`
      ALTER TABLE bloodmoney_bets ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'HTG';
    `);
    await query(`
      ALTER TABLE mines_games ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'HTG';
    `);
    await query(`
      ALTER TABLE duels ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'HTG';
    `);
    await query(`
      ALTER TABLE koth_rooms ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'HTG';
    `);

    // Add funded_by_bonus columns to bets and games
    await query(`
      ALTER TABLE bets ADD COLUMN IF NOT EXISTS funded_by_bonus BOOLEAN DEFAULT false;
    `);
    await query(`
      ALTER TABLE bloodmoney_bets ADD COLUMN IF NOT EXISTS funded_by_bonus BOOLEAN DEFAULT false;
    `);
    await query(`
      ALTER TABLE mines_games ADD COLUMN IF NOT EXISTS funded_by_bonus BOOLEAN DEFAULT false;
    `);
    await query(`
      ALTER TABLE ls_bets ADD COLUMN IF NOT EXISTS funded_by_bonus BOOLEAN DEFAULT false;
    `);
    await query(`
      ALTER TABLE duels ADD COLUMN IF NOT EXISTS player_a_funded_by_bonus BOOLEAN DEFAULT false;
    `);
    await query(`
      ALTER TABLE duels ADD COLUMN IF NOT EXISTS player_b_funded_by_bonus BOOLEAN DEFAULT false;
    `);

    // Create user_bonus_choices table
    await query(`
      CREATE TABLE IF NOT EXISTS user_bonus_choices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        deposit_amount DECIMAL(12, 2) NOT NULL,
        bonus_type VARCHAR(50) NOT NULL,
        potential_bonus DECIMAL(12, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'claimed_bonus', 'claimed_booster', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "user_bonus_choices" checked/created.');
    
    // Backfill referral codes for existing users
    const usersWithoutCode = await query("SELECT id FROM users WHERE referral_code IS NULL");
    for (const row of usersWithoutCode.rows) {
      let code = '';
      let isUnique = false;
      while (!isUnique) {
        code = Math.random().toString(36).substring(2, 10).toUpperCase();
        if (code.length === 8) {
          const check = await query("SELECT id FROM users WHERE referral_code = $1", [code]);
          if (check.rows.length === 0) {
            isUnique = true;
          }
        }
      }
      await query("UPDATE users SET referral_code = $1 WHERE id = $2", [code, row.id]);
    }
    console.log('Database: Table "users" checked/created and referral codes backfilled.');

    // 2. Create Transactions Table
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        amount DECIMAL(12, 2) NOT NULL,
        fee DECIMAL(12, 2) DEFAULT 0.00,
        net_amount DECIMAL(12, 2) NOT NULL,
        provider VARCHAR(50),
        phone_number VARCHAR(50),
        screenshot_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );
    `);
    console.log('Database: Table "transactions" checked/created.');

    // 3. Create Games Table
    await query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        crash_multiplier DECIMAL(5, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'finished' CHECK (status IN ('waiting', 'flying', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "games" checked/created.');

    // 4. Create Bets Table
    await query(`
      CREATE TABLE IF NOT EXISTS bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        game_id UUID REFERENCES games(id) ON DELETE CASCADE,
        bet_amount DECIMAL(12, 2) NOT NULL,
        cashout_multiplier DECIMAL(5, 2),
        payout_amount DECIMAL(12, 2),
        is_won BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "bets" checked/created.');

    // 5. Create Mines Games Table
    await query(`
      CREATE TABLE IF NOT EXISTS mines_games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        bet_amount DECIMAL(12, 2) NOT NULL,
        net_stake DECIMAL(12, 2) NOT NULL,
        mines_count INT NOT NULL,
        server_seed VARCHAR(255) NOT NULL,
        client_seed VARCHAR(255) NOT NULL,
        grid_mines JSON NOT NULL,
        revealed_tiles JSON DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cashed_out', 'lost')),
        current_multiplier DECIMAL(12, 4) DEFAULT 1.0000,
        payout_amount DECIMAL(12, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "mines_games" checked/created.');
    // 6. Create Duels Table (Snake 1v1)
    await query(`
      CREATE TABLE IF NOT EXISTS duels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_a_id UUID REFERENCES users(id) ON DELETE SET NULL,
        player_b_id UUID REFERENCES users(id) ON DELETE SET NULL,
        bet_amount DECIMAL(12, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
        winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        player_a_score INT DEFAULT 0,
        player_b_score INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "duels" checked/created.');

    // 7. Create KOTH Rooms Table
    await query(`
      CREATE TABLE IF NOT EXISTS koth_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
        entry_fee DECIMAL(12, 2) NOT NULL DEFAULT 150.00,
        pot_total DECIMAL(12, 2) DEFAULT 0.00,
        round_number INT DEFAULT 0,
        winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "koth_rooms" checked/created.');

    // 8. Create Audit Logs Table for Escrow Transactions
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        game_id UUID,
        game_type VARCHAR(50),
        amount DECIMAL(12, 2),
        action VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "audit_logs" checked/created.');

    // 8.5 Create Blood Money Games Table
    await query(`
      CREATE TABLE IF NOT EXISTS bloodmoney_games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seed_hash VARCHAR(64) NOT NULL,
        server_seed VARCHAR(255),
        client_seed VARCHAR(255),
        crash_point DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'finished',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "bloodmoney_games" checked/created.');

    // 8.6 Create Blood Money Bets Table
    await query(`
      CREATE TABLE IF NOT EXISTS bloodmoney_bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        game_id UUID REFERENCES bloodmoney_games(id) ON DELETE CASCADE,
        bet_amount DECIMAL(12,2) NOT NULL,
        route VARCHAR(20),
        cashout_multiplier DECIMAL(5,2),
        payout_amount DECIMAL(12,2),
        is_won BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "bloodmoney_bets" checked/created.');

    // 8.7 Create KET History Table
    await query(`
      CREATE TABLE IF NOT EXISTS ket_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(15, 2) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('earning', 'conversion', 'expiration')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "ket_history" checked/created.');

    // 8.8 Create Notifications Table
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "notifications" checked/created.');

    // 8.9 Create Sport Events Table (Last Second)
    await query(`
      CREATE TABLE IF NOT EXISTS sport_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_match_id VARCHAR(32),
        home_team VARCHAR(64) NOT NULL,
        away_team VARCHAR(64) NOT NULL,
        score_home INT DEFAULT 0,
        score_away INT DEFAULT 0,
        minute INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'live',
        next_goal_window BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "sport_events" checked/created.');

    // 8.10 Create Last Second Rounds Table
    await query(`
      CREATE TABLE IF NOT EXISTS ls_rounds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES sport_events(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        crash_type VARCHAR(20) CHECK (crash_type IN ('goal', 'no_goal', 'timeout')),
        multiplier_at_crash DECIMAL(8,2),
        seed_hash VARCHAR(64)
      );
    `);
    console.log('Database: Table "ls_rounds" checked/created.');

    // 8.11 Create Last Second Bets Table
    await query(`
      CREATE TABLE IF NOT EXISTS ls_bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        round_id UUID REFERENCES ls_rounds(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        bet_type VARCHAR(20) CHECK (bet_type IN ('goal', 'no_goal')),
        auto_cashout DECIMAL(5,2),
        cashed_out_at DECIMAL(5,2),
        profit DECIMAL(10,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
        currency VARCHAR(10) DEFAULT 'HTG',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "ls_bets" checked/created.');

    // 8.12 Create Competition Configs Table
    await query(`
      CREATE TABLE IF NOT EXISTS comp_configs (
        key VARCHAR(50) PRIMARY KEY,
        percentage_revenue DECIMAL(5, 2) NOT NULL,
        min_prize_pool DECIMAL(12, 2) NOT NULL,
        max_prize_pool DECIMAL(12, 2) NOT NULL,
        winner_count INT NOT NULL,
        payout_distribution JSONB NOT NULL,
        extra_settings JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('Database: Table "comp_configs" checked/created.');

    // 8.13 Create Competitions Table
    await query(`
      CREATE TABLE IF NOT EXISTS competitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly', 'xp_battle')),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
        calculated_revenue DECIMAL(12, 2) DEFAULT 0.00,
        prize_pool DECIMAL(12, 2) DEFAULT 0.00,
        winners_data JSONB DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "competitions" checked/created.');

    // 8.14 Create User Competition Stats Table
    await query(`
      CREATE TABLE IF NOT EXISTS user_competition_stats (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
        xp_gained DECIMAL(12, 4) DEFAULT 0.0000,
        wager_volume DECIMAL(12, 2) DEFAULT 0.00,
        PRIMARY KEY (user_id, competition_id)
      );
    `);
    console.log('Database: Table "user_competition_stats" checked/created.');

    // 8.15 Create Platform Revenue Table
    await query(`
      CREATE TABLE IF NOT EXISTS platform_revenue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        amount DECIMAL(12, 4) NOT NULL,
        source VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "platform_revenue" checked/created.');

    // 8.16 Create User Chests Table
    await query(`
      CREATE TABLE IF NOT EXISTS user_chests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        xp_milestone INT NOT NULL,
        reward_type VARCHAR(20),
        reward_value VARCHAR(100),
        opened_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "user_chests" checked/created.');

    // 8.17 Alter users table for USDT balance
    await query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS usdt_balance DECIMAL(15, 6) DEFAULT 0.000000;
    `);
    
    // 8.18 Alter transactions table for unique tx_hash
    await query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(100) UNIQUE DEFAULT NULL;
    `);

    // 8.19 Create Global Settings Table
    await query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        key VARCHAR(100) PRIMARY KEY,
        value VARCHAR(255) NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "global_settings" checked/created.');

    // Seed default settings if empty
    const seedSettings = [
      { key: 'usdt_exchange_rate', value: '130', desc: 'Taux de change USDT -> HTG' },
      { key: 'usdt_min_deposit', value: '5', desc: 'Montant minimum de dépôt en USDT' },
      { key: 'usdt_min_withdrawal', value: '5', desc: 'Montant minimum de retrait en USDT' },
      { key: 'usdt_withdrawal_fee', value: '10', desc: 'Pourcentage de frais de retrait en USDT' },
      { key: 'usdt_admin_wallet', value: '0x0000000000000000000000000000000000000000', desc: 'Adresse du portefeuille principal USDT BEP20 de l\'administrateur' },
      { key: 'usdt_confirmations_required', value: '3', desc: 'Nombre de confirmations requises sur la blockchain' },
      { key: 'usdt_deposits_enabled', value: 'true', desc: 'Activer ou désactiver les dépôts USDT' },
      { key: 'usdt_withdrawals_enabled', value: 'true', desc: 'Activer ou désactiver les retraits USDT' },
      { key: 'ls_nogoal_multiplier', value: '1.20', desc: 'Multiplicateur de gain pour le pari PAS DE BUT dans Last Second (ex: 1.20)' }
    ];

    for (const s of seedSettings) {
      await query(`
        INSERT INTO global_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING;
      `, [s.key, s.value, s.desc]);
    }
    console.log('Database: Default global settings checked/seeded.');

    // 8.20 Create USDT Conversions Table
    await query(`
      CREATE TABLE IF NOT EXISTS usdt_conversions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        usdt_amount DECIMAL(15, 6) NOT NULL,
        rate DECIMAL(10, 4) NOT NULL,
        htg_amount DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database: Table "usdt_conversions" checked/created.');

    // Seed default competition configurations if empty
    const configCheck = await query("SELECT COUNT(*) FROM comp_configs");
    if (parseInt(configCheck.rows[0].count) === 0) {
      // 1. Daily XP config
      await query(
        `INSERT INTO comp_configs (key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution) 
         VALUES ('daily_xp', 5.00, 50.00, 2000.00, 10, '[30, 20, 15, 10, 8, 5, 4, 3, 3, 2]'::jsonb)`
      );
      // 2. Weekly XP config
      await query(
        `INSERT INTO comp_configs (key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution) 
         VALUES ('weekly_xp', 5.00, 250.00, 15000.00, 20, '[20, 14, 11, 9, 8, 6, 5, 4, 3.5, 3.5, 2.5, 2, 2, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 1]'::jsonb)`
      );
      // 3. Monthly XP config
      await query(
        `INSERT INTO comp_configs (key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution) 
         VALUES ('monthly_xp', 5.00, 1000.00, 50000.00, 50, '[12, 8, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2.5, 2, 2, 1.8, 1.8, 1.6, 1.6, 1.4, 1.4, 1.2, 1.2, 1, 1, 1, 1, 1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.6, 0.6, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3]'::jsonb)`
      );
      // 4. XP Battle config
      await query(
        `INSERT INTO comp_configs (key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution) 
         VALUES ('xp_battle', 2.00, 100.00, 10000.00, 10, '[]'::jsonb)`
      );
      // 5. Lucky XP Chest config
      await query(
        `INSERT INTO comp_configs (key, percentage_revenue, min_prize_pool, max_prize_pool, winner_count, payout_distribution, extra_settings) 
         VALUES ('lucky_chest', 0.00, 0.00, 0.00, 0, '[]'::jsonb, '{
           "probabilities": {"ket": 0.70, "htg": 0.25, "rare": 0.05},
           "ket_rewards": [500, 1000, 2500, 5000, 10000],
           "htg_rewards": [10, 25, 50],
           "rare_rewards": [
             {"type": "ticket", "name": "Ticket XP Battle"},
             {"type": "badge", "name": "Badge Temporaire Exclusif"},
             {"type": "frame", "name": "Cadre de Profil Exclusif"},
             {"type": "title", "name": "Titre Spécial Temporaire"}
           ]
         }'::jsonb)`
      );
      console.log('Database: Default competition configurations seeded.');
    }

    // 9. Seed Admin User
    const adminCheck = await query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const adminEmail = 'admin@crashplane.com';
      const adminPass = 'AdminCrash2026!';
      const hash = await bcrypt.hash(adminPass, 10);
      await query(
        "INSERT INTO users (email, password_hash, role, balance, is_verified) VALUES ($1, $2, 'admin', 1000000.00, true)",
        [adminEmail, hash]
      );
      console.log(`Database: Seeded default admin account!`);
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPass}`);
      console.log(`IMPORTANT: Please change this password in production.`);
    } else {
      // Ensure existing admin accounts are verified
      await query("UPDATE users SET is_verified = true WHERE role = 'admin'");
    }

  } catch (err) {
    console.error('Database: Error initializing database tables:', err);
    console.log('Hint: Make sure PostgreSQL is running and you have created the database specified in DATABASE_URL.');
  }
};

module.exports = {
  query,
  pool,
  initializeDatabase
};
