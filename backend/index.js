const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');

require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static upload folders (transaction screenshots)
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Le serveur Crash Game fonctionne parfaitement.', env: process.env.NODE_ENV || 'development' });
});

// Bind routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Une erreur interne est survenue sur le serveur.' });
});

const PORT = process.env.PORT || 5000;

// Detect if running on Vercel (serverless) – skip WebSockets and game loop
const isVercel = process.env.VERCEL === '1';

if (isVercel) {
  // Serverless mode: only initialize DB and export the HTTP app
  initializeDatabase().catch(err => {
    console.error('DB init error (serverless):', err);
  });
  module.exports = app;
} else {
  // Full server mode: include Socket.io and game engine
  const socketIo = require('socket.io');
  const { initGameEngine } = require('./gameEngine');
  const server = http.createServer(app);

  const io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const startServer = async () => {
    await initializeDatabase();
    initGameEngine(io);
    server.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`SERVEUR CRASH GAME DÉMARRÉ SUR LE PORT : ${PORT}`);
      console.log(`URL API : http://localhost:${PORT}`);
      console.log(`===================================================`);
    });
  };

  startServer().catch(err => {
    console.error('Fatal: Failed to start the Crash Game server:', err);
  });
}

