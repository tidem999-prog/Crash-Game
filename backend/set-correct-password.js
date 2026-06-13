const fs = require('fs');
const path = require('path');
const { sendEmail } = require('./utils/email');

async function main() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log(".env file not found");
    return;
  }

  let content = fs.readFileSync(envPath, 'utf8');
  
  // Replace whatever SMTP_PASS is currently there with the correct one
  // We'll replace it with the known correct password, wrapped in quotes
  const correctPass = '9783279477Mc#';
  
  if (content.includes('SMTP_PASS=')) {
    content = content.replace(/SMTP_PASS=.*/, `SMTP_PASS="${correctPass}"`);
  } else {
    content += `\nSMTP_PASS="${correctPass}"\n`;
  }
  
  // Also make sure it's clean of \r
  content = content.replace(/\r/g, '');

  fs.writeFileSync(envPath, content, 'utf8');
  console.log("Updated .env with the correct password!");

  // Reload env
  delete process.env.SMTP_PASS;
  require('dotenv').config({ override: true });

  console.log("Sending test email with the correct password...");
  try {
    const res = await sendEmail({
      to: 'tidem999@gmail.com',
      subject: 'Test Notifikasyon Depo VPS - Modpas Korije',
      text: 'Si ou resevwa sa, modpas la korije epi l ap mache sou VPS la!',
      html: '<h2>Modpas Korije!</h2><p>Tout bagay ap mache byen sou sèvè a kounye a!</p>'
    });
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("FAILED:", err.message || err);
  }
}

main();
