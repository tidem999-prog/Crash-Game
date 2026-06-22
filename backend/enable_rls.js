const { query } = require('./db');

const enableRLS = async () => {
  console.log("=============================================");
  console.log("AKTIVASYON ROW-LEVEL SECURITY (RLS) DINAMIK SOU SUPABASE");
  console.log("=============================================");

  try {
    // Jwenn tout tab ki nan schema public la
    const result = await query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);

    const tables = result.rows.map(row => row.tablename);

    if (tables.length === 0) {
      console.log("❌ Pa gen okenn tab ki jwenn nan schema public lan.");
      process.exit(0);
    }

    console.log(`Jwenn ${tables.length} tab pou sekirize.\n`);

    for (const table of tables) {
      console.log(`Ap aktive RLS sou tab: "${table}"...`);
      await query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ RLS aktive avèk siksè sou "${table}".`);
    }

    console.log("\n=============================================");
    console.log("SEKIRITE DYNAMIK AKTIWE AVÈK SIKSÈ !");
    console.log("Tout tab nan schema public la sekirize kounye a kont aksè piblik anaza.");
    console.log("=============================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Erreur pandan aktivasyon RLS la:", err.message);
    process.exit(1);
  }
};

enableRLS();
