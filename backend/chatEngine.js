const chatSessions = new Map(); // Store chat sessions in memory: sessionId -> { messages: [] }

function initChatEngine(io) {
  io.on('connection', (socket) => {
    console.log('[Chat] New connection:', socket.id);

    // When a user opens the widget, they join their own room
    socket.on('join_chat', ({ sessionId }) => {
      socket.join(sessionId); // User joins their room
      
      // Send previous messages to user ONLY if session exists
      if (chatSessions.has(sessionId)) {
        socket.emit('chat_history', chatSessions.get(sessionId).messages);
        // Notify admin that a session is active (since it has messages)
        io.to('admin_room').emit('active_sessions', Array.from(chatSessions.entries()));
      }
    });

    // Admin joins the admin room to receive all messages
    socket.on('join_admin', () => {
      socket.join('admin_room');
      console.log('[Chat] Admin joined the admin room');
      
      // Send all active sessions to admin
      socket.emit('active_sessions', Array.from(chatSessions.entries()));
    });

    // Handle message from user
    socket.on('send_message', ({ sessionId, text, email }) => {
      const message = { id: Date.now(), sender: 'user', text, timestamp: new Date().toISOString() };
      
      if (chatSessions.has(sessionId)) {
        const session = chatSessions.get(sessionId);
        session.messages.push(message);
        if (email) session.email = email; // Update email if provided
      } else {
         chatSessions.set(sessionId, { messages: [message], userId: sessionId, email });
      }

      // Send to the user's room (so they see it) and to the admin room
      io.to(sessionId).emit('new_message', { sessionId, message });
      io.to('admin_room').emit('new_message', { sessionId, message });
      
      // Ensure admin gets the updated session list with the new session/email
      io.to('admin_room').emit('active_sessions', Array.from(chatSessions.entries()));
    });

    // Handle reply from admin
    socket.on('admin_reply', ({ sessionId, text }) => {
      const message = { id: Date.now(), sender: 'admin', text, timestamp: new Date().toISOString() };
      
      if (chatSessions.has(sessionId)) {
        chatSessions.get(sessionId).messages.push(message);
      }

      // Send to the user's room and admin room
      io.to(sessionId).emit('new_message', { sessionId, message });
      io.to('admin_room').emit('new_message', { sessionId, message });
    });

    // Admin closes a session
    socket.on('close_session', ({ sessionId }) => {
      if (chatSessions.has(sessionId)) {
        chatSessions.delete(sessionId);
        console.log(`[Chat] Admin closed session ${sessionId}`);
        io.to('admin_room').emit('active_sessions', Array.from(chatSessions.entries()));
      }
    });

    socket.on('disconnect', () => {
      console.log('[Chat] Disconnected:', socket.id);
    });
  });
}

module.exports = { initChatEngine };
