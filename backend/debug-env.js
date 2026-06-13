require('dotenv').config();
console.log("=== ENVIROMENT VARIABLES FOR SMTP ===");
console.log("SMTP HOST:", process.env.SMTP_HOST);
console.log("SMTP PORT:", process.env.SMTP_PORT);
console.log("SMTP USER:", process.env.SMTP_USER);
console.log("SMTP PASS:", process.env.SMTP_PASS);
console.log("=====================================");
