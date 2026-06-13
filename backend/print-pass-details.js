const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log(".env file not found");
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const match = content.match(/SMTP_PASS=(.*)/);
if (!match) {
  console.log("SMTP_PASS not found in file");
  process.exit(1);
}

const val = match[1];
console.log("Raw string in file:", JSON.stringify(val));
console.log("Length:", val.length);
console.log("Character codes:");
for (let i = 0; i < val.length; i++) {
  console.log(`Char ${i}: ${val[i]} (code: ${val.charCodeAt(i)})`);
}
