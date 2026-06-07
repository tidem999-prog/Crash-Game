const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Make sure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Seuls les fichiers images sont autorisés (JPEG, JPG, PNG, GIF).'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// 1. Submit Deposit Proof
router.post('/deposit', authenticateToken, upload.single('screenshot'), async (req, res) => {
  const { provider, amount } = req.body;

  if (!provider || !amount) {
    return res.status(400).json({ error: 'Fournisseur (moncash/natcash) et montant requis.' });
  }

  const depositAmount = parseFloat(amount);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return res.status(400).json({ error: 'Le montant du dépôt doit être un nombre positif.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Veuillez télécharger la capture d\'écran comme preuve de paiement.' });
  }

  const screenshotUrl = `/uploads/${req.file.filename}`;

  try {
    // Check if user is suspended
    const userRes = await query('SELECT is_suspended FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows[0].is_suspended) {
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    // Insert pending deposit
    // For deposit: net_amount is same as amount (no fees on deposit)
    await query(
      `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, screenshot_url) 
       VALUES ($1, 'deposit', 'pending', $2, 0.00, $2, $3, $4)`,
      [req.user.id, depositAmount, provider.toLowerCase(), screenshotUrl]
    );

    res.status(201).json({
      message: 'Votre reçu de dépôt a été soumis. Un administrateur va le valider sous peu.'
    });

  } catch (err) {
    console.error('Deposit submission error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la soumission du dépôt.' });
  }
});

// 2. Submit Withdrawal Request
router.post('/withdraw', authenticateToken, async (req, res) => {
  const { amount, phone_number } = req.body;

  if (!amount || !phone_number) {
    return res.status(400).json({ error: 'Montant et numéro de téléphone de retrait requis.' });
  }

  const withdrawAmount = parseFloat(amount);
  if (isNaN(withdrawAmount) || withdrawAmount < 10) {
    return res.status(400).json({ error: 'Le montant minimal de retrait est de 10 HTG.' });
  }

  try {
    await query('BEGIN');

    // Fetch user details with lock (SELECT FOR UPDATE) to prevent concurrency race conditions
    const userRes = await query('SELECT balance, is_suspended FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (userRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];
    if (user.is_suspended) {
      await query('ROLLBACK');
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    const balance = parseFloat(user.balance);
    if (balance < withdrawAmount) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Solde insuffisant pour cette demande de retrait.' });
    }

    // Deduct withdrawal amount immediately from balance (prevents betting or requesting again)
    const newBalance = balance - withdrawAmount;
    await query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, req.user.id]);

    // Calculate fees (10% as specified in requirement 4)
    const fee = parseFloat((withdrawAmount * 0.10).toFixed(2));
    const netAmount = parseFloat((withdrawAmount - fee).toFixed(2));

    // Create pending withdrawal transaction
    await query(
      `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, phone_number) 
       VALUES ($1, 'withdrawal', 'pending', $2, $3, $4, $5)`,
      [req.user.id, withdrawAmount, fee, netAmount, phone_number]
    );

    await query('COMMIT');

    res.status(201).json({
      message: 'Demande de retrait enregistrée. Le montant a été déduit et l\'admin va traiter le paiement.',
      newBalance
    });

  } catch (err) {
    await query('ROLLBACK');
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la demande de retrait.' });
  }
});

// 3. User Personal Transaction History
router.get('/my-history', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, type, status, amount, fee, net_amount, provider, phone_number, screenshot_url, created_at, processed_at
       FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const betsResult = await query(
      `SELECT b.id, b.bet_amount, b.cashout_multiplier, b.payout_amount, b.is_won, b.created_at, g.crash_multiplier
       FROM bets b
       JOIN games g ON b.game_id = g.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC LIMIT 50`,
      [req.user.id]
    );

    res.json({
      transactions: result.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        fee: parseFloat(r.fee),
        net_amount: parseFloat(r.net_amount)
      })),
      bets: betsResult.rows.map(r => ({
        ...r,
        bet_amount: parseFloat(r.bet_amount),
        cashout_multiplier: r.cashout_multiplier ? parseFloat(r.cashout_multiplier) : null,
        payout_amount: parseFloat(r.payout_amount),
        crash_multiplier: parseFloat(r.crash_multiplier)
      }))
    });

  } catch (err) {
    console.error('My history error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de l\'historique.' });
  }
});

module.exports = router;
