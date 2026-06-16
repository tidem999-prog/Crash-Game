const { query } = require('./db');
const fs = require('fs');
const path = require('path');

const exportEmails = async () => {
  try {
    console.log("Ap konekte ak database pou rale e-mail yo...");
    const res = await query("SELECT email, created_at FROM users ORDER BY created_at DESC");
    const users = res.rows;

    let csvContent = "email,created_at\n";
    users.forEach(user => {
      csvContent += `${user.email},${user.created_at ? new Date(user.created_at).toISOString() : ''}\n`;
    });

    const outputPath = path.join(__dirname, 'emails.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`Siksè! ${users.length} e-mail ekspòte nan: ${outputPath}`);
    process.exit(0);
  } catch (err) {
    console.error("Erreur pandan ekspòtasyon an:", err);
    process.exit(1);
  }
};

exportEmails();
