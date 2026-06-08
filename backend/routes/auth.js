const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

// Signup
router.post('/signup', async (req, res) => {
  const { email, password, ref } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Veuillez fournir un email et un mot de passe.' });
  }

  try {
    // Check if user already exists
    const userCheck = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Verify referrer code if present
    let referredBy = null;
    if (ref) {
      const referrerCheck = await query('SELECT id FROM users WHERE referral_code = $1', [ref.trim().toUpperCase()]);
      if (referrerCheck.rows.length > 0) {
        referredBy = referrerCheck.rows[0].id;
      }
    }

    // Generate random 8 character code
    let referralCode = '';
    let isUnique = false;
    while (!isUnique) {
      referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      if (referralCode.length === 8) {
        const check = await query("SELECT id FROM users WHERE referral_code = $1", [referralCode]);
        if (check.rows.length === 0) {
          isUnique = true;
        }
      }
    }

    // Create user (starting balance 0.00 HTG, is_verified false)
    const result = await query(
      "INSERT INTO users (email, password_hash, role, balance, is_verified, referred_by, referral_code) VALUES ($1, $2, 'user', 0.00, false, $3, $4) RETURNING id, email, role, balance, created_at",
      [email.toLowerCase(), passwordHash, referredBy, referralCode]
    );

    const user = result.rows[0];

    // Generate email verification token (expires in 1 day)
    const verifyToken = jwt.sign(
      { id: user.id, purpose: 'email-verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const origin = process.env.FRONTEND_URL || req.get('origin') || 'http://localhost:5173';
    const verifyUrl = `${origin}/verify-email?token=${verifyToken}`;

    // Send confirmation email
    await sendEmail({
      to: user.email,
      subject: 'Confirmez votre compte - Crash Plane',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #6366f1; text-align: center;">Bienvenue sur Crash Plane !</h2>
          <p>Bonjour,</p>
          <p>Merci de vous être inscrit sur notre plateforme. Veuillez confirmer votre adresse e-mail en cliquant sur le bouton ci-dessous :</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${verifyUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Confirmer mon compte</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">Si le bouton ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur :<br/>${verifyUrl}</p>
          <p>Si vous n'avez pas créé de compte, vous pouvez ignorer cet e-mail.</p>
        </div>
      `,
      text: `Bonjour,\n\nMerci de vous être inscrit sur Crash Plane. Veuillez confirmer votre adresse e-mail en cliquant sur le lien suivant :\n${verifyUrl}`
    });

    res.status(201).json({
      message: 'Compte créé avec succès. Veuillez vérifier vos e-mails pour confirmer votre compte.'
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Veuillez fournir un email et un mot de passe.' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    const user = result.rows[0];

    if (user.is_suspended) {
      return res.status(403).json({ error: 'Ce compte a été suspendu pour suspicion de fraude.' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Veuillez confirmer votre compte par e-mail avant de vous connecter.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance),
        referral_code: user.referral_code
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// Verify Email Endpoint
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token manquant.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'email-verification') {
      return res.status(400).json({ error: 'Token invalide.' });
    }

    const result = await query(
      "UPDATE users SET is_verified = true WHERE id = $1 RETURNING id, email",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    res.json({ message: 'Votre adresse e-mail a été vérifiée avec succès ! Vous pouvez maintenant vous connecter.' });

  } catch (err) {
    console.error('Verify email error:', err);
    res.status(400).json({ error: 'Le lien de confirmation est invalide ou expiré.' });
  }
});

// Forgot Password Request Endpoint
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Veuillez fournir votre adresse e-mail.' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userRes.rows.length === 0) {
      // Return success anyway to avoid user enumeration
      return res.json({ message: 'Si cet e-mail existe, un lien de réinitialisation a été envoyé.' });
    }

    const user = userRes.rows[0];

    // Generate secure stateless reset token (expires in 1h)
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password-reset' },
      process.env.JWT_SECRET + user.password_hash,
      { expiresIn: '1h' }
    );

    const origin = process.env.FRONTEND_URL || req.get('origin') || 'http://localhost:5173';
    const resetUrl = `${origin}/reset-password?token=${resetToken}&id=${user.id}`;

    // Send reset email
    await sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe - Crash Plane',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #6366f1; text-align: center;">Réinitialisation de mot de passe</h2>
          <p>Bonjour,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Crash Plane.</p>
          <p>Veuillez cliquer sur le bouton ci-dessous pour modifier votre mot de passe (ce lien est valide pendant 1 heure) :</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${resetUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Réinitialiser mon mot de passe</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">Si le bouton ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur :<br/>${resetUrl}</p>
          <p>Si vous n'avez pas demandé ce changement, vous pouvez ignorer cet e-mail en toute sécurité.</p>
        </div>
      `,
      text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe sur Crash Plane.\n\nVeuillez cliquer sur le lien suivant (valide 1h) pour modifier votre mot de passe :\n${resetUrl}`
    });

    res.json({ message: 'Un e-mail de réinitialisation de mot de passe a été envoyé.' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Erreur lors du traitement de la demande.' });
  }
});

// Reset Password Execution Endpoint
router.post('/reset-password', async (req, res) => {
  const { token, userId, newPassword } = req.body;

  if (!token || !userId || !newPassword) {
    return res.status(400).json({ error: 'Paramètres manquants.' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];

    // Verify stateless token using secret appended with current password hash
    const decoded = jwt.verify(token, process.env.JWT_SECRET + user.password_hash);
    if (decoded.purpose !== 'password-reset' || decoded.id !== userId) {
      return res.status(400).json({ error: 'Token de réinitialisation invalide.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, userId]
    );

    res.json({ message: 'Votre mot de passe a été modifié avec succès ! Vous pouvez maintenant vous connecter.' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(400).json({ error: 'Le lien de réinitialisation est invalide ou expiré.' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, email, role, balance, is_suspended, referral_code FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = result.rows[0];

    if (user.is_suspended) {
      return res.status(403).json({ error: 'Ce compte a été suspendu pour suspicion de fraude.' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance),
        referral_code: user.referral_code
      }
    });

  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil.' });
  }
});

// Get Referral stats and list
router.get('/referrals', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Get referral count
    const countRes = await query("SELECT COUNT(*) as count FROM users WHERE referred_by = $1", [userId]);
    const totalReferrals = parseInt(countRes.rows[0].count || 0);

    // 2. Get total referral earnings
    // Referral earnings are deposit transactions of provider = 'referral' credited to this user
    const earningsRes = await query(
      "SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'approved' AND provider = 'referral'",
      [userId]
    );
    const totalEarnings = parseFloat(earningsRes.rows[0].total || 0);

    // 3. Get last 10 referred users
    const referralsList = await query(
      `SELECT email, created_at 
       FROM users 
       WHERE referred_by = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [userId]
    );

    // Mask emails: u***r@domain.com
    const formattedReferrals = referralsList.rows.map(row => {
      const email = row.email;
      const parts = email.split('@');
      const name = parts[0];
      const domain = parts[1];
      const maskedName = name.length > 2 ? `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}` : `${name[0]}*`;
      return {
        email: `${maskedName}@${domain}`,
        created_at: row.created_at
      };
    });

    res.json({
      totalReferrals,
      totalEarnings,
      referrals: formattedReferrals
    });

  } catch (err) {
    console.error('Get referrals error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques de parrainage.' });
  }
});

module.exports = router;
