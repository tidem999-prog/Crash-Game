import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { MessageCircle, X, Send } from 'lucide-react';
import './ChatWidget.css'; // We will create this

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Generate or retrieve a session ID for the user
    let storedSession = localStorage.getItem('ketarena_chat_session');
    if (!storedSession) {
      storedSession = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ketarena_chat_session', storedSession);
    }
    setSessionId(storedSession);

    // Initialize socket connection for chat
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join_chat', { sessionId: storedSession });
    });

    socketRef.current.on('chat_history', (history) => {
      setMessages(history);
    });

    socketRef.current.on('new_message', ({ sessionId: msgSessionId, message }) => {
      if (msgSessionId === storedSession) {
        setMessages((prev) => [...prev, message]);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    socketRef.current.emit('send_message', {
      sessionId,
      text: inputText,
    });
    setInputText('');
  };

  return (
    <div className="chat-widget-container">
      {/* Chat Window */}
      {isOpen && (
        <div className="chat-window shadow-xl">
          <div className="chat-header">
            <div className="flex items-center gap-2">
              <div className="chat-avatar">
                <img src="/logo.png" alt="Ketarena Logo" className="w-full h-full object-cover rounded-full" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
                <span style={{display: 'none'}} className="font-bold text-lg text-white">K</span>
              </div>
              <div>
                <h3 className="font-bold m-0 text-white leading-tight">Ketarena</h3>
                <span className="text-xs text-green-300">Online</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              <X size={20} />
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-4 text-sm">
                Bienvenue ! Comment pouvons-nous vous aider ?
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`message-wrapper ${msg.sender === 'user' ? 'message-sent' : 'message-received'}`}>
                  <div className="message-bubble">
                    {msg.text}
                  </div>
                  <div className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="chat-input-area border-t p-2 flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Écrivez votre message..."
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-800"
            />
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-2 transition-colors flex items-center justify-center"
              disabled={!inputText.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="chat-toggle-btn shadow-lg hover:scale-105 transition-transform overflow-hidden"
        >
          <img src="/logo.png" alt="Chat" className="w-full h-full object-cover rounded-full bg-slate-900" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
          <div style={{display: 'none'}} className="flex items-center justify-center w-full h-full bg-gradient-to-tr from-yellow-400 to-purple-600 rounded-full">
            <MessageCircle size={28} color="white" />
          </div>
        </button>
      )}
    </div>
  );
};

export default ChatWidget;
