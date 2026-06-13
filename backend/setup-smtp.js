const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.error("ERÈ: Fichye .env la introuvable nan:", envPath);
  process.exit(1);
}

try {
  let content = fs.readFileSync(envPath, 'utf8');

  // Ranplase paramèt Brevo yo ak Namecheap Private Email
  content = content.replace(/SMTP_HOST=.*/g, 'SMTP_HOST=mail.privateemail.com');
  content = content.replace(/SMTP_PORT=.*/g, 'SMTP_PORT=465');
  content = content.replace(/SMTP_USER=.*/g, 'SMTP_USER=support@ketarena.com');
  content = content.replace(/SMTP_PASS=.*/g, 'SMTP_PASS="9783279477Mc#"');
  
  if (!content.includes('SMTP_FROM')) {
    content += '\nSMTP_FROM=support@ketarena.com\n';
  } else {
    content = content.replace(/SMTP_FROM=.*/g, 'SMTP_FROM=support@ketarena.com');
  }

  fs.writeFileSync(envPath, content, 'utf8');
  console.log("SIKSÈ: Konfigirasyon SMTP la korije sou VPS la!");
} catch (err) {
  console.error("ERÈ pandan modifikasyon an:", err);
}
