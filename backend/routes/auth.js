const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

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

    // Create user (starting balance 0.00 HTG)
    const result = await query(
      "INSERT INTO users (email, password_hash, role, balance) VALUES ($1, $2, 'user', 0.00) RETURNING id, email, role, balance, created_at",
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Simulated email confirmation log
    console.log('\n===================================================');
    console.log(`SIMULATION D'ENVOI D'EMAIL`);
    console.log(`Pour: ${user.email}`);
    console.log(`Sujet: Bienvenue sur Crash Plane - Confirmez votre compte`);
    console.log(`Lien d'activation: http://localhost:3000/verify?id=${user.id}`);
    console.log('===================================================\n');

    res.status(201).json({
      message: 'Compte créé avec succès (Simulé : email envoyé).',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance)
      }
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
        balance: parseFloat(user.balance)
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, email, role, balance, is_suspended FROM users WHERE id = $1', [req.user.id]);
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
        balance: parseFloat(user.balance)
      }
    });

  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil.' });
  }
});

module.exports = router;
