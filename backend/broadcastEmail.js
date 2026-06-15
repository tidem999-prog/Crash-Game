const { query } = require('./db');
const { sendEmail } = require('./utils/email');

const broadcast = async () => {
  const subject = process.argv[2];
  const bodyText = process.argv[3];

  if (!subject || !bodyText) {
    console.error("Erreur: Ou dwe bay yon Subject ak yon Mesaj.");
    console.log("Kouman pou w kouri l: node broadcastEmail.js \"Sijè\" \"Mesaj la\"");
    process.exit(1);
  }

  try {
    console.log("Ap konekte ak database pou rekipere itilizatè yo...");
    const res = await query("SELECT email FROM users");
    const users = res.rows;
    console.log(`Jwenn ${users.length} itilizatè nan database la.`);

    if (users.length === 0) {
      console.log("Pa gen okenn itilizatè.");
      process.exit(0);
    }

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < users.length; i++) {
      const email = users[i].email;
      console.log(`[${i + 1}/${users.length}] Ap voye bay: ${email}...`);

      try {
        await sendEmail({
          to: email,
          subject: subject,
          text: bodyText,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
                  <div style="background-color: #fbbf24; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; color: #1e1b4b; font-size: 24px;">Ketarena Arena</h1>
                  </div>
                  <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; background-color: #fff;">
                    <p style="font-size: 16px;">Bonjour,</p>
                    <p style="font-size: 16px; white-space: pre-line;">${bodyText}</p>
                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #6b7280; text-align: center;">Cet e-mail a été envoyé automatiquement par Ketarena Arena Support.</p>
                  </div>
                </div>`
        });
        successCount++;
        // Rete tann 200ms ant chak email pou evite SMTP a bloke
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Echèk pou voye bay ${email}:`, err.message);
        failureCount++;
      }
    }

    console.log("\n=============================================");
    console.log("Difizyon Email la Fini !");
    console.log(`- Siksè: ${successCount}`);
    console.log(`- Echèk: ${failureCount}`);
    console.log("=============================================");
    process.exit(0);
  } catch (err) {
    console.error("Erreur pandan difizyon an:", err);
    process.exit(1);
  }
};

broadcast();
