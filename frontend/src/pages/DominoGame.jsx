import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Clock, ShieldAlert, Award, AlertTriangle, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DominoFace = ({ value, horizontal = false }) => {
  const dots = [];
  if (value === 1) dots.push('col-start-2 row-start-2');
  if (value === 2) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-3');
  if (value === 3) dots.push('col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3');
  if (value === 4) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3');
  if (value === 5) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3');
  if (value === 6) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-2', 'col-start-3 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3');

  const dotSize = horizontal ? 'w-[5px] h-[5px]' : 'w-[6px] h-[6px]';

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-[1px] p-[2px] w-full h-full">
      {dots.map((pos, i) => (
        <div key={i} className={`bg-slate-900 rounded-full place-self-center shadow-inner ${dotSize} ${pos}`}></div>
      ))}
    </div>
  );
};

export default function DominoGame({ socket, onBackToLobby, addNotification, onPlayStateChange }) {
  const { user } = useAuth();
  
  const [gameState, setGameState] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [myHand, setMyHand] = useState([]);
  const [error, setError] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [selectedWager, setSelectedWager] = useState(150);
  const [customWager, setCustomWager] = useState('');
  const [selectedTileIndex, setSelectedTileIndex] = useState(null);

  const handleQuit = () => {
    if (socket) socket.emit('domino_leave');
    onBackToLobby();
  };

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
    const wager = customWager !== '' ? parseFloat(customWager) : selectedWager;
    if (isNaN(wager) || wager < 150) {
      setError("La mise minimum est de 150 HTG");
      return;
    }
    socket.emit('domino_join', { userId: user.id, email: user.email, wager });
  };

  const playTile = (tileIndex, side) => {
    if (!socket) return;
    socket.emit('domino_play', { tileIndex, side });
  };

  const handleDominoClick = (idx, tile) => {
    if (!gameState) return;
    const isMyTurn = gameState.players[gameState.turnIndex]?.userId === user.id;
    if (!isMyTurn) return;

    if (gameState.board.length === 0) {
      playTile(idx, 'left');
      return;
    }

    const canLeft = tile[0] === gameState.leftEnd || tile[1] === gameState.leftEnd;
    const canRight = tile[0] === gameState.rightEnd || tile[1] === gameState.rightEnd;

    if (canLeft && !canRight) {
      playTile(idx, 'left');
    } else if (canRight && !canLeft) {
      playTile(idx, 'right');
    } else if (canLeft && canRight) {
      if (selectedTileIndex === idx) {
        setSelectedTileIndex(null); // toggle off
      } else {
        setSelectedTileIndex(idx);
        addNotification('Touchez le côté gauche ou droit du plateau pour placer.', 'info');
      }
    } else {
      addNotification('Mouvement impossible', 'danger');
    }
  };

  const handleBoardClick = (side) => {
    if (selectedTileIndex !== null) {
      playTile(selectedTileIndex, side);
      setSelectedTileIndex(null);
    }
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
    const wagerToPlay = customWager !== '' ? parseFloat(customWager) : selectedWager;
    const potentialWin = !isNaN(wagerToPlay) ? (wagerToPlay * 2) * 0.9 : 0;

    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-3xl border border-slate-800 text-center">
        <h2 className="text-3xl font-black text-white mb-4">DOMINO ARENA 1v1</h2>
        <p className="text-slate-400 mb-6">Sélectionnez votre mise pour affronter un joueur au même montant.</p>
        
        {/* Wager Selection */}
        <div className="flex flex-col items-center space-y-4 mb-8 w-full max-w-sm">
          <div className="grid grid-cols-4 gap-2 w-full">
            {[150, 250, 500, 1250].map(amount => (
              <button
                key={amount}
                onClick={() => { setSelectedWager(amount); setCustomWager(''); }}
                className={`py-2 rounded-lg font-bold text-sm transition-all ${
                  selectedWager === amount && customWager === ''
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {amount}
              </button>
            ))}
          </div>
          <div className="w-full flex items-center space-x-2 bg-slate-800 p-2 rounded-xl">
            <span className="text-slate-400 font-bold ml-2">Perso:</span>
            <input 
              type="number" 
              value={customWager}
              onChange={(e) => { setCustomWager(e.target.value); setSelectedWager(null); }}
              placeholder="Ex: 300"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-bold focus:outline-none focus:border-indigo-500"
              min="150"
            />
            <span className="text-slate-400 font-bold mr-2">HTG</span>
          </div>
          <div className="bg-emerald-950/50 text-emerald-400 px-4 py-2 rounded-full text-sm font-bold w-full border border-emerald-500/20">
            Gain potentiel : +{potentialWin.toFixed(2)} HTG
          </div>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="flex space-x-4">
          <button onClick={handleQuit} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold">Retour</button>
          <button onClick={joinGame} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 shadow-xl shadow-indigo-600/20">
            Rejoindre ({!isNaN(wagerToPlay) ? wagerToPlay : 0} HTG)
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
          <button onClick={handleQuit} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold">Quitter</button>
          <button onClick={() => { setGameOver(null); }} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">Rejouer (Choisir Mise)</button>
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
        <button onClick={handleQuit} className="px-6 py-2 bg-slate-800 text-white rounded-xl text-sm">Annuler</button>
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
      <div className="bg-slate-900 border-b border-slate-800 p-3 flex justify-between items-center">
        <button onClick={handleQuit} className="flex items-center space-x-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold hidden sm:inline">Quitter</span>
        </button>
        <div className="text-center">
          <h2 className="font-black text-white tracking-wide text-lg">DOMINO ARENA</h2>
          {isMyTurn ? (
            <span className="text-emerald-500 font-bold text-sm animate-pulse">C'EST VOTRE TOUR ({Math.ceil(gameState.timeRemaining/1000)}s)</span>
          ) : (
            <span className="text-orange-500 font-bold text-sm">Tour de l'adversaire...</span>
          )}
        </div>
        <div className="w-16"></div> {/* Spacer to center title */}
      </div>

      {/* Opponent Area */}
      {opponent && (
        <div className="bg-slate-900/50 p-3 flex flex-col items-center shadow-md z-10 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-slate-300 font-bold mb-3">
            <div className="bg-indigo-600/20 p-2 rounded-full border border-indigo-500/30">
              <User className="h-5 w-5 text-indigo-400" />
            </div>
            <span className="text-lg">{opponent.email?.split('@')[0]}</span>
          </div>
          <div className="flex space-x-1.5 justify-center">
            {Array.from({ length: opponent.handCount }).map((_, i) => (
              <div key={i} className="w-5 h-9 bg-slate-800 rounded-sm shadow-inner border border-slate-700 flex flex-col items-center justify-center overflow-hidden">
                <div className="w-0.5 h-full bg-indigo-500/10 rotate-45 transform scale-150"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board Area */}
      <div className="flex-grow bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {selectedTileIndex !== null && (
          <div className="absolute inset-0 z-20 flex bg-black/40 backdrop-blur-sm">
            <div onClick={() => handleBoardClick('left')} className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors border-r-2 border-indigo-500/50">
              <span className="bg-indigo-600 text-white px-4 py-2 rounded-full font-bold shadow-lg animate-bounce">Placer à GAUCHE</span>
            </div>
            <div onClick={() => handleBoardClick('right')} className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors border-l-2 border-indigo-500/50">
              <span className="bg-indigo-600 text-white px-4 py-2 rounded-full font-bold shadow-lg animate-bounce">Placer à DROITE</span>
            </div>
          </div>
        )}

        {gameState?.board.length === 0 ? (
          <div className="text-slate-600 font-bold text-2xl opacity-50 border-4 border-dashed border-slate-800 p-8 rounded-3xl">
            La table est vide
          </div>
        ) : (
          <div className="w-full flex justify-center overflow-x-auto whitespace-nowrap p-4 no-scrollbar">
            <div className="flex items-center space-x-1 shrink-0 px-8">
              {gameState?.board.map((item, idx) => {
                const [val1, val2] = item.isFlipped ? [item.tile[1], item.tile[0]] : [item.tile[0], item.tile[1]];
                const isDouble = val1 === val2;
                return (
                  <div key={idx} className={`flex shrink-0 bg-slate-100 border-2 border-slate-300 rounded-md shadow-md items-center justify-center overflow-hidden ${isDouble ? 'flex-col w-6 h-12' : 'flex-row w-12 h-6'}`}>
                    <div className="flex-1 w-full h-full p-0.5 relative flex items-center justify-center">
                      <DominoFace value={val1} horizontal={!isDouble} />
                    </div>
                    <div className={`bg-slate-400 ${isDouble ? 'w-full h-[1px]' : 'h-full w-[1px]'}`}></div>
                    <div className="flex-1 w-full h-full p-0.5 relative flex items-center justify-center">
                      <DominoFace value={val2} horizontal={!isDouble} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action / Boneyard Bar */}
      <div className="bg-slate-900 border-t border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-2 text-slate-400 font-bold">
          <div className="w-6 h-10 bg-slate-800 border border-slate-700 rounded shadow flex items-center justify-center">
            <div className="w-[2px] h-full bg-slate-700"></div>
          </div>
          <span>Pioche : {gameState?.boneyardCount} restants</span>
        </div>
        <div className="space-x-4">
          {isMyTurn && gameState?.boneyardCount > 0 && (
            <button onClick={drawTile} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all">Piocher</button>
          )}
          {isMyTurn && gameState?.boneyardCount === 0 && (
            <button onClick={passTurn} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-600/20 transition-all">Passer</button>
          )}
        </div>
      </div>

      {/* My Hand */}
      <div className="bg-slate-800 p-4 overflow-x-auto pb-8">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="bg-emerald-500/20 p-1.5 rounded-full border border-emerald-500/30">
            <User className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-white font-bold">Votre Main</h3>
        </div>
        
        <div className="flex space-x-3 justify-center min-w-max px-4">
          {myHand.map((tile, idx) => {
            const isSelected = selectedTileIndex === idx;
            return (
              <div key={idx} className="flex flex-col items-center">
                <div 
                  onClick={() => handleDominoClick(idx, tile)}
                  className={`flex flex-col bg-slate-100 border-2 border-slate-300 rounded-xl shadow-xl w-10 h-20 transition-all cursor-pointer overflow-hidden ${
                    isSelected ? 'ring-4 ring-indigo-500 scale-110 -translate-y-4' : 
                    isMyTurn ? 'hover:-translate-y-2 ring-2 ring-transparent hover:ring-indigo-300' : 'opacity-80'
                  }`}
                >
                  <div className="flex-1 p-1 relative"><DominoFace value={tile[0]} /></div>
                  <div className="w-full h-[2px] bg-slate-300"></div>
                  <div className="flex-1 p-1 relative"><DominoFace value={tile[1]} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
