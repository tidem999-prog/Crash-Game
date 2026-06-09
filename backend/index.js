const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');

const app = express();

// Middlewares
app.use(cors());
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
  const { initializeDatabase } = require('./db');

  const server = http.createServer(app);
  const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  const PORT = process.env.PORT || 5000;

  (async () => {
    await initializeDatabase();
    initGameEngine(io);
    initKetmesyeEngine(io);
    initChatEngine(io);
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
