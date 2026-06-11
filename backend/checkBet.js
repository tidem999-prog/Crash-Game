require('dotenv').config();
const { query } = require('./db');

async function check() {
  try {
    const res = await query("SELECT balance FROM users WHERE id = 'cf929717-145c-4046-92d4-eb341a07a879'");
    console.log("User Balance:", res.rows[0]?.balance);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
