import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DominoFace = ({ value, horizontal = false, mini = false }) => {
  const dots = [];
  if (value === 1) dots.push('col-start-2 row-start-2');
  if (value === 2) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-3');
  if (value === 3) dots.push('col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3');
  if (value === 4) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3');
  if (value === 5) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3');
  if (value === 6) dots.push('col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-2', 'col-start-3 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3');

  // Adjust dot sizes based on context
  let dotSize = 'w-[8px] h-[8px]';
  if (mini) dotSize = 'w-[4px] h-[4px]';
  else if (horizontal) dotSize = 'w-[6px] h-[6px]';

  return (
    <div className={`grid grid-cols-3 grid-rows-3 ${mini ? 'gap-[1px] p-[1px]' : 'gap-[2px] p-[2px]'} w-full h-full`}>
      {dots.map((pos, i) => (
        <div key={i} className={`bg-[#111] rounded-full place-self-center shadow-sm ${dotSize} ${pos}`}></div>
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

  useEffect(() => {
    if (onPlayStateChange) onPlayStateChange(isJoined);
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

    socket.on('domino_error', (msg) => {
      setError(msg);
      addNotification(msg, 'danger');
    });

    socket.on('domino_game_over', (data) => {
      setGameOver(data);
      setIsJoined(false);
      setSelectedTileIndex(null);
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
    setSelectedTileIndex(null);
  };

  const handleDominoClick = (idx, tile) => {
    if (!gameState) return;
    const isMyTurn = gameState.players[gameState.turnIndex]?.userId === user.id;
    if (!isMyTurn) {
      addNotification("Ce n'est pas votre tour !", "danger");
      return;
    }

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
        setSelectedTileIndex(null);
      } else {
        setSelectedTileIndex(idx);
      }
    } else {
      addNotification('Ce domino ne peut pas être joué', 'danger');
    }
  };

  const handleBoardClick = (side) => {
    if (selectedTileIndex !== null) {
      playTile(selectedTileIndex, side);
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

  const isTilePlayable = (tile) => {
    if (!gameState || gameState.board.length === 0) return true;
    return tile[0] === gameState.leftEnd || tile[1] === gameState.leftEnd || tile[0] === gameState.rightEnd || tile[1] === gameState.rightEnd;
  };

  const hasPlayableTile = myHand.some(isTilePlayable);

  // Render Waiting/Lobby/Game Over states
  if (!isJoined && !gameOver) {
    const wagerToPlay = customWager !== '' ? parseFloat(customWager) : selectedWager;
    const potentialWin = !isNaN(wagerToPlay) ? (wagerToPlay * 2) * 0.9 : 0;

    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-3xl border border-slate-800 text-center">
        <h2 className="text-3xl font-black text-white mb-4">DOMINO ARENA</h2>
        <p className="text-slate-400 mb-6">Sélectionnez votre mise pour affronter un joueur au même montant.</p>
        
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

  // Main Game View
  return (
    <div className={`flex flex-col bg-[#3c8da3] overflow-hidden transition-all duration-300 ${
      isJoined ? 'fixed inset-0 z-[100] rounded-none' : 'relative w-full min-h-[500px] rounded-3xl'
    }`} style={isJoined ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100dvh', width: '100vw' } : {}}>
      
      {/* Absolute Quit Button */}
      <button onClick={handleQuit} className="absolute top-4 right-4 z-50 bg-red-700/80 hover:bg-red-600 text-white font-bold p-2 rounded shadow-lg backdrop-blur-sm border border-red-500">
        Quitter
      </button>

      {/* Opponent (Top Left) */}
      {opponent && (
        <div className="absolute top-10 left-4 z-30 flex flex-col items-center">
          <div className="bg-[#b57a44] border-4 border-[#8b5a2b] rounded-2xl p-2 shadow-[0_10px_20px_rgba(0,0,0,0.5)] relative">
            <User className="text-[#4a2e15] w-8 h-8" />
            <div className="absolute -bottom-3 -right-3 bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-md border-2 border-white">
              {opponent.handCount}
            </div>
          </div>
          <span className="text-white font-bold mt-2 shadow-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-sm">{opponent.email?.split('@')[0]}</span>
        </div>
      )}

      {/* Player (Bottom Right above hand) */}
      <div className="absolute bottom-40 right-4 z-30 flex flex-col items-center">
        <div className="bg-[#b57a44] border-4 border-[#8b5a2b] rounded-2xl p-2 shadow-[0_10px_20px_rgba(0,0,0,0.5)] relative">
          <User className="text-[#4a2e15] w-8 h-8" />
        </div>
        <span className="text-white font-bold mt-2 shadow-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-sm">{user.email.split('@')[0]}</span>
      </div>

      {/* Turn Indicator (Center Top) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        {isMyTurn ? (
          <div className="bg-emerald-500/90 text-white font-black px-6 py-2 rounded-full shadow-lg border-2 border-emerald-300 animate-pulse backdrop-blur-sm">
            C'EST VOTRE TOUR ({Math.ceil(gameState.timeRemaining/1000)}s)
          </div>
        ) : (
          <div className="bg-orange-500/90 text-white font-bold px-6 py-2 rounded-full shadow-lg border-2 border-orange-300 backdrop-blur-sm">
            Tour de l'adversaire...
          </div>
        )}
      </div>

      {/* Boneyard (Middle Right) */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-28 max-h-[60vh] bg-[#a87042] border-l-8 border-y-8 border-[#7a4b27] rounded-l-2xl shadow-[-10px_0_30px_rgba(0,0,0,0.4)] p-3 flex flex-wrap justify-center content-start gap-1.5 overflow-y-auto no-scrollbar z-20">
        <div className="w-full text-center text-[#3e2712] font-black text-[10px] mb-2 uppercase tracking-wider">Pioche ({gameState?.boneyardCount})</div>
        {Array.from({ length: gameState?.boneyardCount || 0 }).map((_, i) => (
          <div key={i} className="w-8 h-12 bg-[#fdfaf1] rounded-sm shadow-sm border border-[#ccc] relative overflow-hidden shrink-0">
             <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(circle,_#8b5a2b_2px,_transparent_2px)] bg-[size:8px_8px]"></div>
          </div>
        ))}
        {/* Draw Overlay */}
        {isMyTurn && gameState?.boneyardCount > 0 && !hasPlayableTile && (
          <div 
            onClick={drawTile}
            className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-xl cursor-pointer hover:bg-black/40 transition-colors backdrop-blur-[2px]"
          >
            <span className="rotate-90 sm:rotate-0">PIOCHER</span>
          </div>
        )}
      </div>

      {/* Pass Turn Overlay (if no draw and no play) */}
      {isMyTurn && !hasPlayableTile && gameState?.boneyardCount === 0 && (
        <button onClick={passTurn} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-full font-black shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse text-2xl border-4 border-red-300">
          PASSER LE TOUR
        </button>
      )}

      {/* Selection Left/Right Target Overlays */}
      {selectedTileIndex !== null && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div onClick={() => handleBoardClick('left')} className="flex-1 flex flex-col items-center justify-end pb-12 cursor-pointer hover:bg-white/10 transition-colors border-b-2 border-indigo-500/50">
            <span className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-2xl shadow-[0_0_20px_rgba(79,70,229,0.8)] animate-bounce border-2 border-indigo-300">
              PLACER EN HAUT (Gauche)
            </span>
          </div>
          <div onClick={() => handleBoardClick('right')} className="flex-1 flex flex-col items-center justify-start pt-12 cursor-pointer hover:bg-white/10 transition-colors border-t-2 border-indigo-500/50">
            <span className="bg-emerald-600 text-white px-8 py-4 rounded-full font-black text-2xl shadow-[0_0_20px_rgba(5,150,105,0.8)] animate-bounce border-2 border-emerald-300">
              PLACER EN BAS (Droite)
            </span>
          </div>
          {/* Cancel selection */}
          <button onClick={() => setSelectedTileIndex(null)} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white px-6 py-2 rounded-full font-bold shadow-lg border border-slate-600">
            Annuler la sélection
          </button>
        </div>
      )}

      {/* Board Area (Vertical layout like image) */}
      <div className="flex-grow flex justify-center w-full h-full p-4 overflow-y-auto no-scrollbar relative z-10 pb-40">
        {gameState?.board.length === 0 ? (
          <div className="m-auto text-white/50 font-bold text-2xl opacity-50 border-4 border-dashed border-white/20 p-8 rounded-3xl">
            La table est vide
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-[2px] m-auto py-12 shrink-0 min-h-full">
            {gameState?.board.map((item, idx) => {
              const [val1, val2] = item.isFlipped ? [item.tile[1], item.tile[0]] : [item.tile[0], item.tile[1]];
              const isDouble = val1 === val2;
              
              return (
                <div key={idx} className={`flex bg-[#fdfaf1] border border-[#d4c9b3] rounded-[4px] shadow-md items-center justify-center overflow-hidden shrink-0 ${isDouble ? 'flex-row w-16 h-8' : 'flex-col w-8 h-16'}`}>
                  {isDouble ? (
                    <>
                      <div className="flex-1 w-full h-full p-1 relative flex items-center justify-center">
                        <DominoFace value={val1} horizontal={true} />
                      </div>
                      <div className="h-full w-[2px] bg-slate-300"></div>
                      <div className="flex-1 w-full h-full p-1 relative flex items-center justify-center">
                        <DominoFace value={val2} horizontal={true} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 w-full h-full p-1 relative flex items-center justify-center">
                        <DominoFace value={val1} horizontal={false} />
                      </div>
                      <div className="w-full h-[2px] bg-slate-300"></div>
                      <div className="flex-1 w-full h-full p-1 relative flex items-center justify-center">
                        <DominoFace value={val2} horizontal={false} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Player Hand Rack (Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-[#e3ae73] border-t-[12px] border-[#a06a38] flex justify-center items-end pb-3 px-4 overflow-x-auto shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-30 no-scrollbar">
        <div className="flex space-x-2 shrink-0 px-8 h-full items-end">
          {myHand.map((tile, idx) => {
            const isSelected = selectedTileIndex === idx;
            const playable = isMyTurn && isTilePlayable(tile);
            
            return (
              <div 
                key={idx}
                onClick={() => handleDominoClick(idx, tile)}
                className={`flex flex-col bg-[#fdfaf1] border-2 border-[#d4c9b3] rounded-lg shadow-[0_5px_15px_rgba(0,0,0,0.4)] w-14 h-[100px] transition-all cursor-pointer overflow-hidden shrink-0 transform origin-bottom ${
                  isSelected ? 'ring-4 ring-indigo-500 scale-110 -translate-y-4' : 
                  playable ? 'hover:-translate-y-2 ring-2 ring-transparent' : 'opacity-70'
                }`}
              >
                <div className="flex-1 p-1.5 relative"><DominoFace value={tile[0]} horizontal={false} /></div>
                <div className="w-full h-[2px] bg-slate-300"></div>
                <div className="flex-1 p-1.5 relative"><DominoFace value={tile[1]} horizontal={false} /></div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
