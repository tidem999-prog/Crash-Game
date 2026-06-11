const io = require('socket.io-client');
const axios = require('axios');

async function testDomino() {
  console.log('Registering...');
  const randomEmail = `test_${Math.floor(Math.random()*10000)}@test.com`;
  const regRes = await axios.post('https://ketarena.com/api/auth/register', {
    email: randomEmail,
    password: 'password123',
    phone: `509${Math.floor(Math.random()*10000000)}`
  });
  
  const token = regRes.data.token;
  const user = regRes.data.user;
  
  // We need balance to play. Let's add balance using the admin API, but we don't have admin token.
  // Wait, I can't add balance.
  // Let me just log in with the provided user and see.
  console.log('Logged in as:', user.email, 'Balance:', user.balance);

  console.log('Connecting to socket...');
  const socket = io('https://ketarena.com', {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('Socket connected! ID:', socket.id);
    
    console.log('Emitting domino_join...');
    socket.emit('domino_join', {
      userId: user.id,
      email: user.email,
      wager: 150
    });
  });

  socket.on('domino_state', (data) => {
    console.log('Received domino_state:', JSON.stringify(data).substring(0, 200));
  });

  socket.on('domino_error', (msg) => {
    console.log('Received domino_error:', msg);
    process.exit(1);
  });

  socket.on('domino_event', (msg) => {
    console.log('Received domino_event:', msg);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    process.exit(0);
  });

  socket.on('connect_error', (err) => {
    console.log('Connect error:', err.message);
    process.exit(1);
  });
  
  // Wait 10 seconds and exit
  setTimeout(() => {
    console.log('Test finished');
    process.exit(0);
  }, 10000);
}

testDomino().catch(console.error);
