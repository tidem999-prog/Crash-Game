import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { MessageCircle, Send } from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;

const AdminChat = () => {
  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [inputText, setInputText] = useState('');
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join_admin');
    });

    socketRef.current.on('active_sessions', (sessionsArray) => {
      // sessionsArray is [ [sessionId, sessionObject], ... ]
      setActiveSessions(sessionsArray.map(([id, data]) => ({ id, ...data })));
    });

    socketRef.current.on('new_message', ({ sessionId, message }) => {
      setActiveSessions((prev) => {
        const index = prev.findIndex(s => s.id === sessionId);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            messages: [...updated[index].messages, message]
          };
          return updated;
        } else {
          // New session entirely
          return [...prev, { id: sessionId, messages: [message], userId: sessionId }];
        }
      });
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const selectedSession = activeSessions.find(s => s.id === selectedSessionId);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedSession?.messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedSessionId) return;

    socketRef.current.emit('admin_reply', {
      sessionId: selectedSessionId,
      text: inputText,
    });
    setInputText('');
  };

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-4 lg:col-span-3">
      <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3 flex items-center space-x-2">
        <MessageCircle className="h-5 w-5 text-indigo-400" />
        <span>Support Client (Ketarena)</span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[500px]">
        {/* Sessions List */}
        <div className="col-span-1 border-r border-slate-800 pr-2 overflow-y-auto">
          {activeSessions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">Aucune session active.</p>
          ) : (
            activeSessions.map((session) => {
              const lastMsg = session.messages[session.messages.length - 1];
              return (
                <div
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`p-3 mb-2 rounded-xl cursor-pointer border transition-colors ${
                    selectedSessionId === session.id
                      ? 'bg-purple-900/40 border-purple-500/50'
                      : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-200 truncate">User: {session.id.slice(0, 12)}...</div>
                  {lastMsg && (
                    <div className="text-[10px] text-slate-400 truncate mt-1">
                      {lastMsg.sender === 'admin' ? 'Vous: ' : ''}{lastMsg.text}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Chat Area */}
        <div className="col-span-1 md:col-span-2 flex flex-col h-full bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden">
          {!selectedSessionId ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Sélectionnez une session pour discuter
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-slate-900 p-3 border-b border-slate-800 text-slate-200 font-bold text-sm flex items-center justify-between">
                <span>Discussion: {selectedSessionId.slice(0, 12)}...</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {selectedSession?.messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col max-w-[80%] ${
                      msg.sender === 'admin' ? 'self-end' : 'self-start'
                    }`}
                  >
                    <div
                      className={`px-3 py-2 rounded-xl text-sm ${
                        msg.sender === 'admin'
                          ? 'bg-purple-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className={`text-[9px] text-slate-500 mt-1 ${msg.sender === 'admin' ? 'text-right' : 'text-left'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={sendMessage} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Tapez votre réponse..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors flex items-center"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminChat;
