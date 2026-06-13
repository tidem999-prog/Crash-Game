const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

// Make sure upload directory exists (skipped silently on read-only filesystems like Vercel)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('Could not create upload directory (read-only filesystem?):', err.message);
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
  const { provider, amount, phone_number } = req.body;

  if (!provider || !amount || !phone_number) {
    return res.status(400).json({ error: 'Fournisseur, montant et numéro de téléphone requis.' });
  }

  const depositAmount = parseFloat(amount);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return res.status(400).json({ error: 'Le montant du dépôt doit être un nombre positif.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Veuillez télécharger la capture d\'écran comme preuve de paiement.' });
  }

  const screenshotUrl = `/api/uploads/${req.file.filename}`;

  try {
    // Check if user is suspended
    const userRes = await query('SELECT is_suspended, email FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows[0].is_suspended) {
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    const userEmail = userRes.rows[0].email;

    // Insert pending deposit
    // For deposit: net_amount is same as amount (no fees on deposit)
    await query(
      `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, screenshot_url, phone_number) 
       VALUES ($1, 'deposit', 'pending', $2, 0.00, $2, $3, $4, $5)`,
      [req.user.id, depositAmount, provider.toLowerCase(), screenshotUrl, phone_number]
    );

    // Send email alert to admin
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    sendEmail({
      to: 'tidem999@gmail.com',
      subject: `[KetMesye Arena] Nouveau Dépôt de ${userEmail} - ${depositAmount} HTG`,
      text: `Nouveau dépôt soumis :\n\nUtilisateur : ${userEmail}\nFournisseur : ${provider}\nMontant : ${depositAmount} HTG\nNuméro de téléphone expéditeur : ${phone_number}\nReçu : ${appUrl}${screenshotUrl}`,
      html: `<p><strong>Nouveau dépôt soumis :</strong></p>
             <ul>
               <li><strong>Utilisateur :</strong> ${userEmail}</li>
               <li><strong>Fournisseur :</strong> ${provider.toUpperCase()}</li>
               <li><strong>Montant :</strong> ${depositAmount} HTG</li>
               <li><strong>Numéro expéditeur (depuis lequel les fonds sont envoyés) :</strong> ${phone_number}</li>
               <li><strong>Lien du reçu :</strong> <a href="${appUrl}${screenshotUrl}" target="_blank">Voir la capture d'écran</a></li>
             </ul>`
    }).catch(err => console.error('Error sending deposit email notification:', err));

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
  const { amount, phone_number, provider } = req.body;

  if (!amount || !phone_number || !provider) {
    return res.status(400).json({ error: 'Montant, numéro de téléphone et fournisseur (moncash/natcash) de retrait requis.' });
  }

  const withdrawAmount = parseFloat(amount);
  if (isNaN(withdrawAmount) || withdrawAmount < 100) {
    return res.status(400).json({ error: 'Le montant minimal de retrait est de 100 HTG.' });
  }

  const selectedProvider = provider.toLowerCase();
  if (selectedProvider !== 'moncash' && selectedProvider !== 'natcash') {
    return res.status(400).json({ error: 'Fournisseur de retrait invalide.' });
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
      `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, phone_number) 
       VALUES ($1, 'withdrawal', 'pending', $2, $3, $4, $5, $6)`,
      [req.user.id, withdrawAmount, fee, netAmount, selectedProvider, phone_number]
    );

    await query('COMMIT');

    // Send email alert to admin
    sendEmail({
      to: 'tidem999@gmail.com',
      subject: `[KetMesye Arena] Nouvelle Demande de Retrait de ${req.user.email} - ${withdrawAmount} HTG`,
      text: `Nouvelle demande de retrait soumise :\n\nUtilisateur : ${req.user.email}\nFournisseur : ${selectedProvider}\nMontant brut : ${withdrawAmount} HTG\nFrais (10%) : ${fee} HTG\nMontant net à payer : ${netAmount} HTG\nNuméro destinataire : ${phone_number}`,
      html: `<p><strong>Nouvelle demande de retrait soumise :</strong></p>
             <ul>
               <li><strong>Utilisateur :</strong> ${req.user.email}</li>
               <li><strong>Fournisseur :</strong> ${selectedProvider.toUpperCase()}</li>
               <li><strong>Montant brut :</strong> ${withdrawAmount} HTG</li>
               <li><strong>Frais (10%) :</strong> ${fee} HTG</li>
               <li><strong>Montant net à payer :</strong> ${netAmount} HTG</li>
               <li><strong>Numéro destinataire :</strong> ${phone_number}</li>
             </ul>`
    }).catch(err => console.error('Error sending withdrawal email notification:', err));

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
       LEFT JOIN games g ON b.game_id = g.id
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
        crash_multiplier: r.crash_multiplier ? parseFloat(r.crash_multiplier) : null
      }))
    });

  } catch (err) {
    console.error('My history error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de l\'historique.' });
  }
});

module.exports = router;
