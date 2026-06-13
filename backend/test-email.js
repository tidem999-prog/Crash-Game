require('dotenv').config();
const { sendEmail } = require('./utils/email');

console.log("Démarrage du test SMTP...");
sendEmail({
  to: 'tidem999@gmail.com',
  subject: 'Test SMTP VPS',
  text: 'Si ou resevwa sa, SMTP a mache byen sou VPS la!'
})
.then(r => {
  console.log("SIKSÈ :", r);
  process.exit(0);
})
.catch(e => {
  console.error("ERÈ :", e);
  process.exit(1);
});
