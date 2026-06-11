import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Clock, ShieldAlert, Award, AlertTriangle, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function DominoGame({ socket, onBackToLobby, addNotification, onPlayStateChange }) {
  const { user } = useAuth();
  
  const [gameState, setGameState] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [myHand, setMyHand] = useState([]);
  const [error, setError] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  // Inform Dashboard when playing to hide tabs
  useEffect(() => {
    if (onPlayStateChange) {
      onPlayStateChange(isJoined);
    }
  }, [isJoined, onPlayStateChange]);

  useEffect(() => {
    if (!socket) return;

    socket.on('domino_state', (data) => {
      setGameState(data);
      setMyHand(data.myHand || []);
      if (data.status === 'playing' || data.status === 'waiting') {
        setIsJoined(true);
      }
    });

    socket.on('domino_event', (data) => {
      if (data.type === 'play') {
        // Add sound or animation here if needed
      }
    });

    socket.on('domino_error', (msg) => {
      setError(msg);
      addNotification(msg, 'danger');
    });

    socket.on('domino_game_over', (data) => {
      setGameOver(data);
      setIsJoined(false);
      if (data.winnerId === user.id) {
        addNotification(`VICTOIRE ! Vous gagnez ${data.winAmount} HTG`, 'success');
      } else if (data.reason === 'draw') {
        addNotification('Match Nul ! Mise remboursée.', 'info');
      } else {
        addNotification('Vous avez perdu la partie.', 'danger');
      }
    });

    return () => {
      socket.off('domino_state');
      socket.off('domino_event');
      socket.off('domino_error');
      socket.off('domino_game_over');
    };
  }, [socket, user, addNotification]);

  const joinGame = () => {
    if (!socket || !user) return;
    setError(null);
    setGameOver(null);
    socket.emit('domino_join', { userId: user.id, email: user.email });
  };

  const playTile = (tileIndex, side) => {
    if (!socket) return;
    socket.emit('domino_play', { tileIndex, side });
  };

  const drawTile = () => {
    if (!socket) return;
    socket.emit('domino_draw');
  };

  const passTurn = () => {
    if (!socket) return;
    socket.emit('domino_pass');
  };

  // Render
  if (!isJoined && !gameOver) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-3xl border border-slate-800 text-center">
        <h2 className="text-3xl font-black text-white mb-4">DOMINO ARENA 1v1</h2>
        <p className="text-slate-400 mb-6">Mise : 150 HTG | Le gagnant remporte 270 HTG !</p>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="flex space-x-4">
          <button onClick={onBackToLobby} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold">Retour</button>
          <button onClick={joinGame} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500">
            Rejoindre une Table (150 HTG)
          </button>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-3xl border border-slate-800 text-center">
        <h2 className="text-3xl font-black text-white mb-4">Partie Terminée</h2>
        {gameOver.reason === 'draw' ? (
          <p className="text-yellow-500 text-xl font-bold mb-4">Égalité ! Mises remboursées.</p>
        ) : (
          <div className="mb-4">
            <p className={`text-2xl font-bold ${gameOver.winnerId === user.id ? 'text-emerald-500' : 'text-red-500'}`}>
              {gameOver.winnerId === user.id ? 'Vous avez GAGNÉ !' : `Gagnant : ${gameOver.winnerEmail?.split('@')[0]}`}
            </p>
            {gameOver.winnerId === user.id && <p className="text-emerald-400">+{gameOver.winAmount} HTG</p>}
            <p className="text-slate-400 text-sm mt-2">Raison : {gameOver.reason === 'blocked' ? 'Jeu bloqué (Moins de points)' : gameOver.reason === 'disconnect' ? 'Déconnexion' : 'Main vide'}</p>
          </div>
        )}
        <div className="flex space-x-4 mt-6">
          <button onClick={onBackToLobby} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold">Quitter</button>
          <button onClick={joinGame} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">Rejouer (150 HTG)</button>
        </div>
      </div>
    );
  }

  if (gameState && gameState.status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 rounded-3xl border border-slate-800 text-center">
        <RefreshCw className="h-12 w-12 text-indigo-500 animate-spin mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Recherche d'un adversaire...</h3>
        <p className="text-slate-400 mb-6">En attente d'un autre joueur pour démarrer la partie.</p>
        <button onClick={onBackToLobby} className="px-6 py-2 bg-slate-800 text-white rounded-xl text-sm">Annuler</button>
      </div>
    );
  }

  const isMyTurn = gameState && gameState.players[gameState.turnIndex]?.userId === user.id;
  const opponent = gameState?.players.find(p => p.userId !== user.id);
  const me = gameState?.players.find(p => p.userId === user.id);

  return (
    <div className={`flex flex-col bg-slate-950 overflow-hidden transition-all duration-300 ${
      isJoined ? 'fixed inset-0 z-[100] rounded-none' : 'relative w-full min-h-[500px] border border-slate-900 rounded-3xl'
    }`} style={isJoined ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100dvh', width: '100vw' } : {}}>
      
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center">
        <button onClick={onBackToLobby} className="flex items-center space-x-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold">Quitter</span>
        </button>
        <div className="text-center">
          <h2 className="font-black text-white tracking-wide">DOMINO ARENA</h2>
          {isMyTurn ? (
            <span className="text-emerald-500 font-bold text-sm animate-pulse">C'EST VOTRE TOUR ({Math.ceil(gameState.timeRemaining/1000)}s)</span>
          ) : (
            <span className="text-orange-500 font-bold text-sm">Tour de l'adversaire...</span>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end space-x-2 text-slate-300 font-bold">
            <User className="h-4 w-4" />
            <span>{opponent?.email?.split('@')[0]}</span>
          </div>
          <span className="text-xs text-slate-500">{opponent?.handCount} dominos restants</span>
        </div>
      </div>

      {/* Board Area */}
      <div className="flex-grow bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Render domino chain */}
        {gameState?.board.length === 0 ? (
          <div className="text-slate-600 font-bold text-2xl opacity-50 border-4 border-dashed border-slate-800 p-8 rounded-3xl">
            La table est vide
          </div>
        ) : (
          <div className="flex flex-wrap justify-center items-center gap-2 max-w-full overflow-auto p-4">
            {gameState?.board.map((item, idx) => {
              const [val1, val2] = item.isFlipped ? [item.tile[1], item.tile[0]] : [item.tile[0], item.tile[1]];
              const isDouble = val1 === val2;
              return (
                <div key={idx} className={`flex bg-slate-100 border-2 border-slate-800 rounded-md shadow-md items-center justify-center ${isDouble ? 'flex-col w-8 h-16' : 'flex-row w-16 h-8'}`}>
                  <div className="flex-1 flex items-center justify-center font-black text-slate-900 text-lg w-full h-full border-slate-400">
                    {val1}
                  </div>
                  <div className={`bg-slate-400 ${isDouble ? 'w-full h-[2px]' : 'h-full w-[2px]'}`}></div>
                  <div className="flex-1 flex items-center justify-center font-black text-slate-900 text-lg w-full h-full border-slate-400">
                    {val2}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action / Boneyard Bar */}
      <div className="bg-slate-900 border-t border-slate-800 p-4 flex justify-between items-center">
        <div className="text-slate-400 font-bold">Pioche : {gameState?.boneyardCount} restants</div>
        <div className="space-x-4">
          {isMyTurn && gameState?.boneyardCount > 0 && (
            <button onClick={drawTile} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">Piocher</button>
          )}
          {isMyTurn && gameState?.boneyardCount === 0 && (
            <button onClick={passTurn} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">Passer</button>
          )}
        </div>
      </div>

      {/* My Hand */}
      <div className="bg-slate-800 p-4 overflow-x-auto">
        <h3 className="text-slate-300 font-bold mb-3 text-center">Votre Main</h3>
        <div className="flex space-x-4 justify-center min-w-max px-4">
          {myHand.map((tile, idx) => (
            <div key={idx} className="flex flex-col items-center space-y-2">
              <div className="flex flex-col bg-slate-100 border-2 border-slate-900 rounded-lg shadow-xl w-12 h-24 hover:-translate-y-2 transition-transform cursor-pointer overflow-hidden">
                <div className="flex-1 flex items-center justify-center font-black text-2xl text-slate-900 border-b-2 border-slate-300 bg-white/50">{tile[0]}</div>
                <div className="flex-1 flex items-center justify-center font-black text-2xl text-slate-900 bg-white/50">{tile[1]}</div>
              </div>
              {isMyTurn && (
                <div className="flex space-x-1">
                  <button onClick={() => playTile(idx, 'left')} className="text-[10px] bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded">G</button>
                  <button onClick={() => playTile(idx, 'right')} className="text-[10px] bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded">D</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
