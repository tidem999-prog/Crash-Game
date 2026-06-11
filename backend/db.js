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

    // 5. Seed Admin User
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
