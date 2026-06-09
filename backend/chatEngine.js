const chatSessions = new Map(); // Store chat sessions in memory: sessionId -> { messages: [] }

function initChatEngine(io) {
  // We can create a dedicated namespace for chat if we want, or just use the main io
  const chatIo = io.of('/chat');

  chatIo.on('connection', (socket) => {
    console.log('[Chat] New connection:', socket.id);

    // When a user opens the widget, they join their own room
    socket.on('join_chat', ({ sessionId }) => {
      // Create session if it doesn't exist
      if (!chatSessions.has(sessionId)) {
        chatSessions.set(sessionId, { messages: [], userId: sessionId });
      }
      
      socket.join(sessionId); // User joins their room
      console.log(`[Chat] User ${sessionId} joined their chat room`);
      
      // Send previous messages to user
      socket.emit('chat_history', chatSessions.get(sessionId).messages);

      // Notify admin that a session is active
      chatIo.to('admin_room').emit('active_sessions', Array.from(chatSessions.entries()));
    });

    // Admin joins the admin room to receive all messages
    socket.on('join_admin', () => {
      socket.join('admin_room');
      console.log('[Chat] Admin joined the admin room');
      
      // Send all active sessions to admin
      socket.emit('active_sessions', Array.from(chatSessions.entries()));
    });

    // Handle message from user
    socket.on('send_message', ({ sessionId, text }) => {
      const message = { id: Date.now(), sender: 'user', text, timestamp: new Date().toISOString() };
      
      if (chatSessions.has(sessionId)) {
        chatSessions.get(sessionId).messages.push(message);
      } else {
         chatSessions.set(sessionId, { messages: [message], userId: sessionId });
      }

      // Send to the user's room (so they see it) and to the admin room
      chatIo.to(sessionId).emit('new_message', { sessionId, message });
      chatIo.to('admin_room').emit('new_message', { sessionId, message });
    });

    // Handle reply from admin
    socket.on('admin_reply', ({ sessionId, text }) => {
      const message = { id: Date.now(), sender: 'admin', text, timestamp: new Date().toISOString() };
      
      if (chatSessions.has(sessionId)) {
        chatSessions.get(sessionId).messages.push(message);
      }

      // Send to the user's room and admin room
      chatIo.to(sessionId).emit('new_message', { sessionId, message });
      chatIo.to('admin_room').emit('new_message', { sessionId, message });
    });

    socket.on('disconnect', () => {
      console.log('[Chat] Disconnected:', socket.id);
    });
  });
}

module.exports = { initChatEngine };
