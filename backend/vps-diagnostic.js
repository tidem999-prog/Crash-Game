const { sendEmail } = require('./utils/email');
require('dotenv').config();

async function main() {
  console.log("=============================================");
  console.log("VPS SMTP DIAGNOSTIC");
  console.log("=============================================");
  console.log("SMTP_HOST:", process.env.SMTP_HOST);
  console.log("SMTP_PORT:", process.env.SMTP_PORT);
  console.log("SMTP_USER:", process.env.SMTP_USER);
  console.log("SMTP_FROM:", process.env.SMTP_FROM);
  
  const pass = process.env.SMTP_PASS || "";
  console.log("SMTP_PASS length:", pass.length);
  if (pass.length > 0) {
    console.log("SMTP_PASS ends with '#':", pass.endsWith('#'));
    console.log("SMTP_PASS contains '#':", pass.includes('#'));
  } else {
    console.log("SMTP_PASS is empty!");
  }
  
  console.log("---------------------------------------------");
  console.log("Trying to send a test email to tidem999@gmail.com...");
  try {
    const res = await sendEmail({
      to: 'tidem999@gmail.com',
      subject: 'Test Notifikasyon Depo VPS',
      text: 'Si ou resevwa imel sa a, sa vle di SMTP a ap mache byen sou sèvè a!',
      html: '<h2>Test Sèvè</h2><p>Tout bagay ap mache byen sou sèvè a kounye a!</p>'
    });
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("FAILED TO SEND EMAIL:", err.message || err);
  }
  console.log("=============================================");
}

main();
