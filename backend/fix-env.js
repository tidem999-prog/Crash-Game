const fs = require('fs');
const path = require('path');
const { sendEmail } = require('./utils/email');

async function main() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error("Error: .env file not found at", envPath);
    return;
  }

  console.log("Reading .env file...");
  let content = fs.readFileSync(envPath, 'utf8');
  
  // Clean carriage returns
  content = content.replace(/\r/g, '');
  
  const lines = content.split('\n');
  let cleanedPass = "";
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('SMTP_PASS=')) {
      let val = line.substring('SMTP_PASS='.length).trim();
      // Strip any wrapping quotes to get the raw password
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      val = val.trim();
      cleanedPass = val;
      // Re-write the line cleanly wrapped in double quotes
      lines[i] = `SMTP_PASS="${val}"`;
    }
  }
  
  const newContent = lines.join('\n');
  fs.writeFileSync(envPath, newContent, 'utf8');
  console.log("Cleaned .env file written successfully!");
  console.log("Cleaned password length:", cleanedPass.length);
  console.log("Cleaned password ends with '#':", cleanedPass.endsWith('#'));

  // Clear node cache for .env variables
  delete process.env.SMTP_PASS;
  require('dotenv').config({ override: true });

  console.log("---------------------------------------------");
  console.log("Sending test email using cleaned SMTP settings...");
  try {
    const res = await sendEmail({
      to: 'tidem999@gmail.com',
      subject: 'Test Notifikasyon Depo VPS - Apre Netwayaj',
      text: 'Si ou resevwa imel sa a, sa vle di SMTP a ap mache byen sou sèvè a apre nou fin netwaye .env la!',
      html: '<h2>Test Sèvè Korije</h2><p>Tout bagay ap mache byen sou sèvè a kounye a!</p>'
    });
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("FAILED TO SEND EMAIL:", err.message || err);
  }
}

main();
