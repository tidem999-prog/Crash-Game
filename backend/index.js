const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const { initGameEngine } = require('./gameEngine');

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS allowed for React local development
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static upload folders (transaction screenshots)
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Le serveur Crash Game fonctionne parfaitement.' });
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

// Initialize Database, Game Loop, and Listen
const startServer = async () => {
  // Initialize Database tables and Seed Admin user
  await initializeDatabase();

  // Initialize Game Loop and WebSockets
  initGameEngine(io);

  // Listen
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
