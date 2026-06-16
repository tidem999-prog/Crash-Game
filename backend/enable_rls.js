const { query } = require('./db');

const enableRLS = async () => {
  const tables = [
    'users',
    'transactions',
    'games',
    'bets',
    'mines_games',
    'duels',
    'koth_rooms',
    'audit_logs'
  ];

  console.log("=============================================");
  console.log("AKTIVASYON ROW-LEVEL SECURITY (RLS) SOU SUPABASE");
  console.log("=============================================");

  try {
    for (const table of tables) {
      console.log(`Ap aktive RLS sou tab: ${table}...`);
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ RLS aktive avèk siksè sou ${table}.`);
    }

    console.log("\n=============================================");
    console.log("SEKIRITE AKTIWE AVÈK SIKSÈ !");
    console.log("Tout tab yo sekirize kounye a kont aksè piblik anaza.");
    console.log("=============================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Erreur pandan aktivasyon RLS la:", err.message);
    process.exit(1);
  }
};

enableRLS();
