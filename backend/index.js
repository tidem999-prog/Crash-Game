const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');
const rewardsRoutes = require('./routes/rewards');
const competitionsRoutes = require('./routes/competitions');
const usdtRoutes = require('./routes/usdt');
const videosRoutes = require('./routes/videos');

const app = express();

// Middlewares
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  'https://ketarena.com',
  'https://www.ketarena.com'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
app.use('/api/uploads', express.static(uploadDir));
app.use('/uploads', express.static(uploadDir)); // Keep for local dev backward compatibility

// Healthcheck — no DB required, always responds immediately
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Crash Game server running.',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
  });
});

// Lazy DB initialization — only runs once on first API call
let dbReady = false;
const ensureDb = async (req, res, next) => {
  if (!dbReady) {
    try {
      const { initializeDatabase } = require('./db');
      await initializeDatabase();
      dbReady = true;
    } catch (err) {
      console.error('DB init failed:', err.message);
      // Continue — individual queries will fail with their own errors
    }
  }
  next();
};

// API routes (with lazy DB init)
app.use('/api/auth', ensureDb, authRoutes);
app.use('/api/transactions', ensureDb, transactionRoutes);
app.use('/api/admin', ensureDb, adminRoutes);
app.use('/api/rewards', ensureDb, rewardsRoutes);
app.use('/api/competitions', ensureDb, competitionsRoutes);
app.use('/api/transactions/usdt', ensureDb, usdtRoutes);
app.use('/api/videos', ensureDb, videosRoutes);

// Serve frontend static files if they exist (production build)
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// Fallback all other GET requests to index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Frontend not built. Please run npm run build in the frontend directory.');
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// VERCEL_ENV is injected automatically by Vercel in all deploy environments
const isVercel = !!process.env.VERCEL_ENV;

if (isVercel) {
  // Vercel serverless — export Express app, no persistent server or Socket.io
  module.exports = app;
} else {
  // Local / self-hosted — start full server with Socket.io + game engine
  const http = require('http');
  const socketIo = require('socket.io');
  const { initGameEngine } = require('./gameEngine');
  const { initKetmesyeEngine } = require('./ketmesyeEngine');
  const { initChatEngine } = require('./chatEngine');
  const { initMinesEngine } = require('./minesEngine');
  const { initKothEngine } = require('./kothEngine');
  const { initBloodmoneyEngine } = require('./bloodmoneyEngine');
  const { initLastsecondEngine } = require('./lastsecondEngine');
  const { initializeDatabase } = require('./db');

  const server = http.createServer(app);
  const io = socketIo(server, {
    cors: { 
      origin: allowedOrigins, 
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  const { initActivePlayersStore, getActivePlayersList } = require('./activePlayersStore');

  const SERVER_START_TIME = Date.now();
  io.on('connection', (socket) => {
    socket.emit('server_version', SERVER_START_TIME);
    socket.emit('active_players_update', getActivePlayersList());
  });

  const PORT = process.env.PORT || 5000;

  (async () => {
    await initializeDatabase();

    const { initCompetitions, checkAndResolveCompetitions } = require('./utils/competitions');
    await initCompetitions(io);

    // Periodic competition checker (every 1 minute)
    setInterval(async () => {
      try {
        await checkAndResolveCompetitions(io);
      } catch (err) {
        console.error('Periodic competition checker error:', err);
      }
    }, 60 * 1000);

    // Periodic inactivity checker (every 1 hour)
    const { checkInactivityAndClean } = require('./utils/progression');
    setInterval(async () => {
      try {
        const { query } = require('./db');
        const activeUsers = await query("SELECT id FROM users WHERE ket_balance > 0");
        for (const row of activeUsers.rows) {
          await checkInactivityAndClean(row.id);
        }
      } catch (err) {
        console.error('Inactivity checker error:', err);
      }
    }, 60 * 60 * 1000); // 1 hour

    initActivePlayersStore(io);
    initGameEngine(io);
    initKetmesyeEngine(io);
    initChatEngine(io);
    initMinesEngine(io);
    initKothEngine(io);
    initBloodmoneyEngine(io);
    initLastsecondEngine(io);
    server.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`SERVEUR CRASH GAME DÉMARRÉ SUR LE PORT : ${PORT}`);
      console.log(`URL API : http://localhost:${PORT}`);
      console.log(`===================================================`);
    });
  })().catch(err => {
    console.error('Fatal: Could not start server:', err);
  });
}
