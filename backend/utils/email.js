const nodemailer = require('nodemailer');
require('dotenv').config();

const sendEmail = async ({ to, subject, html, text }) => {
  const host = process.env.SMTP_HOST || 'smtp.mailtrap.io';
  const port = process.env.SMTP_PORT || 2525;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  // Fòse itilize domèn nan pou evite pwoblèm Brevo yo avèk Gmail
  const from = '"Ketarena Support" <support@ketarena.com>';

  console.log(`\n===================================================`);
  console.log(`EMAIL UTILITY - SENDING EMAIL`);
  console.log(`Pour: ${to}`);
  console.log(`Sujet: ${subject}`);
  if (text) console.log(`Texte: ${text}`);
  console.log(`===================================================\n`);

  if (!user || !pass) {
    console.log(`Notice: SMTP_USER or SMTP_PASS missing. Email simulated above in logs.`);
    return { status: 'simulated' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: parseInt(port) === 465, // true for 465, false for other ports (like 587)
      auth: {
        user,
        pass
      }
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    console.log(`Email sent successfully: ${info.messageId}`);
    return { status: 'sent', messageId: info.messageId };
  } catch (err) {
    console.error('Error sending email via nodemailer:', err);
    throw err;
  }
};

module.exports = { sendEmail };
