const express = require('express');
const router = express.Router();
const https = require('https');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Helper to load settings from DB
const getSetting = async (key, defaultValue) => {
  try {
    const res = await query("SELECT value FROM global_settings WHERE key = $1", [key]);
    return res.rows.length > 0 ? res.rows[0].value : defaultValue;
  } catch (err) {
    console.error(`Error loading setting '${key}':`, err);
    return defaultValue;
  }
};

// JSON-RPC helper to communicate with BNB Smart Chain RPC
const fetchRPC = (method, params) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: 1
    });

    const options = {
      hostname: 'bsc-dataseed.binance.org',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 10000 // 10 seconds timeout
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) {
            reject(new Error(json.error.message || 'RPC Error'));
          } else {
            resolve(json.result);
          }
        } catch (err) {
          reject(new Error('Failed to parse RPC response: ' + body));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC request timed out'));
    });

    req.write(data);
    req.end();
  });
};

// 1. VERIFY USDT BEP20 DEPOSIT
router.post('/deposit', authenticateToken, async (req, res) => {
  let { txHash } = req.body;

  if (!txHash) {
    return res.status(400).json({ error: 'Le hash de la transaction (Tx Hash) est requis.' });
  }

  txHash = txHash.trim();
  const txHashRegex = /^0x[a-fA-F0-9]{64}$/;
  if (!txHashRegex.test(txHash)) {
    return res.status(400).json({ error: 'Format de Tx Hash invalide. Il doit s\'agir d\'un hash hexadécimal de 64 caractères préfixé par 0x.' });
  }

  try {
    // Check if deposits are enabled globally
    const depositsEnabled = (await getSetting('usdt_deposits_enabled', 'true')) === 'true';
    if (!depositsEnabled) {
      return res.status(400).json({ error: 'Les dépôts USDT sont actuellement désactivés par l\'administrateur.' });
    }

    // Verify if txHash already exists in the transactions database
    const txCheck = await query("SELECT * FROM transactions WHERE tx_hash = $1", [txHash]);
    
    let existingTx = null;
    if (txCheck.rows.length > 0) {
      existingTx = txCheck.rows[0];
      if (existingTx.status === 'approved') {
        return res.status(400).json({ error: 'Cette transaction a déjà été validée et créditée.' });
      }
      if (existingTx.status === 'rejected') {
        return res.status(400).json({ error: 'Cette transaction a été rejetée par l\'administrateur.' });
      }
      // If it exists but is pending, we can proceed to check if it now has enough confirmations
    }

    // Call RPC to get transaction receipt
    console.log(`USDT Deposit Check: Fetching receipt for ${txHash}`);
    const receipt = await fetchRPC('eth_getTransactionReceipt', [txHash]);

    if (!receipt) {
      return res.status(404).json({ error: 'Transaction non trouvée sur la blockchain. Assurez-vous d\'avoir saisi le bon Tx Hash et que la transaction est confirmée dans votre portefeuille.' });
    }

    // Check status
    if (receipt.status !== '0x1') {
      return res.status(400).json({ error: 'Cette transaction a échoué sur la blockchain.' });
    }

    // Fetch current block to check confirmations
    const currentBlockHex = await fetchRPC('eth_blockNumber', []);
    const currentBlock = parseInt(currentBlockHex, 16);
    const txBlockNumber = parseInt(receipt.blockNumber, 16);
    const confirmations = currentBlock - txBlockNumber;

    const reqConfirmations = parseInt(await getSetting('usdt_confirmations_required', '3'));

    // Scan logs to check for USDT transfer to admin wallet
    const usdtContract = '0x55d398326f99059ff775485246999027b3197955';
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const adminWallet = await getSetting('usdt_admin_wallet', '');

    if (!adminWallet || adminWallet === '0x0000000000000000000000000000000000000000') {
      return res.status(500).json({ error: 'Adresse de portefeuille de réception admin non configurée. Veuillez contacter le support.' });
    }

    let usdtTransferFound = false;
    let transferredAmount = 0;

    for (const log of (receipt.logs || [])) {
      const isUSDT = log.address.toLowerCase() === usdtContract.toLowerCase();
      const isTransfer = log.topics && log.topics[0] && log.topics[0].toLowerCase() === transferTopic;
      
      if (isUSDT && isTransfer && log.topics[2]) {
        const recipientAddress = '0x' + log.topics[2].substring(26).toLowerCase();
        if (recipientAddress === adminWallet.toLowerCase()) {
          usdtTransferFound = true;
          // Decode uint256 transferred value (18 decimals for BSC USDT)
          const hexData = log.data.startsWith('0x') ? log.data : '0x' + log.data;
          const rawVal = BigInt(hexData);
          transferredAmount = Number(rawVal) / 1e18;
          break;
        }
      }
    }

    if (!usdtTransferFound) {
      return res.status(400).json({ error: 'Aucun transfert USDT BEP20 vers le portefeuille officiel de la plateforme n\'a été détecté dans cette transaction.' });
    }

    const minDeposit = parseFloat(await getSetting('usdt_min_deposit', '5'));
    if (transferredAmount < minDeposit) {
      return res.status(400).json({ error: `Le montant minimum de dépôt est de ${minDeposit} USDT. Cette transaction contient ${transferredAmount.toFixed(2)} USDT.` });
    }

    // Check if user is suspended
    const userRes = await query("SELECT is_suspended FROM users WHERE id = $1", [req.user.id]);
    if (userRes.rows[0].is_suspended) {
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    // Handle validations based on confirmations
    if (confirmations < reqConfirmations) {
      // If the transaction wasn't saved yet, insert as pending
      if (!existingTx) {
        await query(
          `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, tx_hash, phone_number) 
           VALUES ($1, 'deposit', 'pending', $2, 0.00, $2, 'usdt_bep20', $3, $4)`,
          [req.user.id, transferredAmount, txHash, `Virement vers ${adminWallet.substring(0,6)}...`]
        );
      }
      return res.json({
        status: 'pending_confirmations',
        confirmations,
        required: reqConfirmations,
        amount: transferredAmount,
        message: `Tranzaksyon repérer! Li bezwen plis konfimasyon sou blockchain la (${confirmations}/${reqConfirmations}). Tanpri re-klike verifye nan kèk segonn.`
      });
    }

    // We have enough confirmations! Time to approve and credit the user
    await query('BEGIN');

    if (existingTx) {
      // Update pending row to approved
      await query(
        "UPDATE transactions SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [existingTx.id]
      );
    } else {
      // Create approved row
      await query(
        `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, tx_hash, phone_number, processed_at) 
         VALUES ($1, 'deposit', 'approved', $2, 0.00, $2, 'usdt_bep20', $3, $4, CURRENT_TIMESTAMP)`,
        [req.user.id, transferredAmount, txHash, `Virement vers ${adminWallet.substring(0,6)}...`]
      );
    }

    // Credit user's USDT balance
    await query("UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2", [transferredAmount, req.user.id]);

    // Send notifications
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_deposit_confirmed', $2)",
      [req.user.id, `Votre dépôt USDT de ${transferredAmount.toFixed(2)} USDT a été crédité avec succès.`]
    );

    await query('COMMIT');

    res.json({
      status: 'approved',
      amount: transferredAmount,
      message: 'Votre dépôt USDT a été crédité avec succès.'
    });

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('USDT Deposit Verification Error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la validation du dépôt USDT : ' + err.message });
  }
});

// 2. SUBMIT USDT WITHDRAWAL REQUEST
router.post('/withdraw', authenticateToken, async (req, res) => {
  const { amount, address } = req.body;

  if (!amount || !address) {
    return res.status(400).json({ error: 'Le montant et l\'adresse de destination BEP20 sont requis.' });
  }

  const withdrawAmount = parseFloat(amount);
  if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ error: 'Veuillez saisir un montant de retrait valide.' });
  }

  const addressClean = address.trim();
  const bep20Regex = /^0x[a-fA-F0-9]{40}$/;
  if (!bep20Regex.test(addressClean)) {
    return res.status(400).json({ error: 'Adresse BEP20 invalide. Elle doit commencer par 0x et faire 42 caractères.' });
  }

  try {
    // Check if withdrawals are enabled
    const withdrawalsEnabled = (await getSetting('usdt_withdrawals_enabled', 'true')) === 'true';
    if (!withdrawalsEnabled) {
      return res.status(400).json({ error: 'Les retraits USDT sont actuellement désactivés par l\'administrateur.' });
    }

    const minWd = parseFloat(await getSetting('usdt_min_withdrawal', '5'));
    if (withdrawAmount < minWd) {
      return res.status(400).json({ error: `Le montant minimum de retrait est de ${minWd} USDT.` });
    }

    await query('BEGIN');

    // Fetch user details
    const userRes = await query("SELECT usdt_balance, is_suspended FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    if (userRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];
    if (user.is_suspended) {
      await query('ROLLBACK');
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    const currentUsdt = parseFloat(user.usdt_balance || 0);
    if (currentUsdt < withdrawAmount) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Solde USDT insuffisant pour effectuer ce retrait.' });
    }

    // Fetch withdrawal fee percentage (default 10%)
    const feePercent = parseFloat(await getSetting('usdt_withdrawal_fee', '10'));
    const feeAmount = parseFloat((withdrawAmount * (feePercent / 100)).toFixed(6));
    const netAmount = parseFloat((withdrawAmount - feeAmount).toFixed(6));

    // Deduct USDT balance from user
    await query("UPDATE users SET usdt_balance = usdt_balance - $1 WHERE id = $2", [withdrawAmount, req.user.id]);

    // Create pending withdrawal transaction
    // Storing destination address inside 'phone_number' to keep compatibility with transaction tables structure
    await query(
      `INSERT INTO transactions (user_id, type, status, amount, fee, net_amount, provider, phone_number) 
       VALUES ($1, 'withdrawal', 'pending', $2, $3, $4, 'usdt_bep20', $5)`,
      [req.user.id, withdrawAmount, feeAmount, netAmount, addressClean]
    );

    // Send notifications
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_withdrawal_requested', $2)",
      [req.user.id, `Votre demande de retrait de ${withdrawAmount.toFixed(2)} USDT vers ${addressClean.substring(0, 8)}... a été enregistrée.`]
    );

    await query('COMMIT');

    res.json({
      message: 'Votre demande de retrait a été enregistrée avec succès. Un administrateur la validera dans de brefs délais.',
      netAmount
    });

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('USDT Withdrawal Request Error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la soumission du retrait USDT : ' + err.message });
  }
});

// 3. EXCHANGE USDT → HTG
router.post('/exchange', authenticateToken, async (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ error: 'Le montant à convertir est requis.' });
  }

  const exchangeAmount = parseFloat(amount);
  if (isNaN(exchangeAmount) || exchangeAmount <= 0) {
    return res.status(400).json({ error: 'Veuillez saisir un montant de conversion valide.' });
  }

  try {
    await query('BEGIN');

    // Fetch user details
    const userRes = await query("SELECT usdt_balance, balance, is_suspended FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    if (userRes.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];
    if (user.is_suspended) {
      await query('ROLLBACK');
      return res.status(403).json({ error: 'Compte suspendu. Impossible d\'effectuer des transactions.' });
    }

    const currentUsdt = parseFloat(user.usdt_balance || 0);
    if (currentUsdt < exchangeAmount) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Solde USDT insuffisant pour effectuer cette conversion.' });
    }

    // Get current conversion rate
    const rate = parseFloat(await getSetting('usdt_exchange_rate', '130'));
    const htgReceived = parseFloat((exchangeAmount * rate).toFixed(2));

    // Deduct USDT and credit HTG
    await query("UPDATE users SET usdt_balance = usdt_balance - $1, balance = balance + $2 WHERE id = $3", [exchangeAmount, htgReceived, req.user.id]);

    // Log the conversion
    await query(
      `INSERT INTO usdt_conversions (user_id, usdt_amount, rate, htg_amount) 
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, exchangeAmount, rate, htgReceived]
    );

    // Send notifications
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'usdt_exchange_completed', $2)",
      [req.user.id, `Votre conversion de ${exchangeAmount.toFixed(2)} USDT vers ${htgReceived.toFixed(2)} HTG a été réalisée avec succès.`]
    );

    await query('COMMIT');

    res.json({
      message: 'Votre conversion USDT vers HTG a été réalisée avec succès.',
      usdtAmount: exchangeAmount,
      rate,
      htgReceived
    });

  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('USDT Exchange Error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la conversion USDT : ' + err.message });
  }
});

// 4. GET USER USDT STATS & HISTORY
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userRes = await query("SELECT usdt_balance, balance FROM users WHERE id = $1", [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const user = userRes.rows[0];

    // Calculate total deposited USDT (approved deposits)
    const depRes = await query("SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'deposit' AND provider = 'usdt_bep20' AND status = 'approved'", [req.user.id]);
    const totalDeposited = parseFloat(depRes.rows[0].total || 0);

    // Calculate total withdrawn USDT (approved/completed withdrawals)
    const wdRes = await query("SELECT SUM(amount) as total FROM transactions WHERE user_id = $1 AND type = 'withdrawal' AND provider = 'usdt_bep20' AND status = 'approved'", [req.user.id]);
    const totalWithdrawn = parseFloat(wdRes.rows[0].total || 0);

    // Calculate total converted USDT
    const convRes = await query("SELECT SUM(usdt_amount) as total FROM usdt_conversions WHERE user_id = $1", [req.user.id]);
    const totalConverted = parseFloat(convRes.rows[0].total || 0);

    // Fetch lists
    const depositsList = await query(
      "SELECT id, amount, status, tx_hash, created_at, processed_at FROM transactions WHERE user_id = $1 AND type = 'deposit' AND provider = 'usdt_bep20' ORDER BY created_at DESC", 
      [req.user.id]
    );
    const withdrawalsList = await query(
      "SELECT id, amount, fee, net_amount, status, phone_number as address, created_at, processed_at FROM transactions WHERE user_id = $1 AND type = 'withdrawal' AND provider = 'usdt_bep20' ORDER BY created_at DESC", 
      [req.user.id]
    );
    const conversionsList = await query(
      "SELECT id, usdt_amount, rate, htg_amount, created_at FROM usdt_conversions WHERE user_id = $1 ORDER BY created_at DESC", 
      [req.user.id]
    );

    // Fetch current exchange config values to display in UI
    const rate = parseFloat(await getSetting('usdt_exchange_rate', '130'));
    const adminWallet = await getSetting('usdt_admin_wallet', '');
    const minDep = parseFloat(await getSetting('usdt_min_deposit', '5'));
    const minWd = parseFloat(await getSetting('usdt_min_withdrawal', '5'));
    const feeWd = parseFloat(await getSetting('usdt_withdrawal_fee', '10'));

    res.json({
      balances: {
        usdt: parseFloat(user.usdt_balance || 0),
        htg: parseFloat(user.balance || 0)
      },
      stats: {
        totalDeposited,
        totalWithdrawn,
        totalConverted
      },
      configs: {
        rate,
        adminWallet,
        minDep,
        minWd,
        feeWd
      },
      histories: {
        deposits: depositsList.rows,
        withdrawals: withdrawalsList.rows,
        conversions: conversionsList.rows
      }
    });

  } catch (err) {
    console.error('Get USDT stats error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques USDT.' });
  }
});

module.exports = router;
