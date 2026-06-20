import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Gem, Bomb, Play, Banknote, AlertTriangle } from 'lucide-react';

const MinesGame = ({ socket, user, balance, setSelectedGame }) => {
  const [gameState, setGameState] = useState('idle'); // idle, playing, won, lost, cashed_out
  const [betAmount, setBetAmount] = useState('200');
  const [minesCount, setMinesCount] = useState(5);
  
  const [gameData, setGameData] = useState(null);
  const [revealedTiles, setRevealedTiles] = useState([]);
  const [gridMines, setGridMines] = useState([]); // Only populated on game over
  
  const [currentMultiplier, setCurrentMultiplier] = useState(1.00);
  const [nextMultiplier, setNextMultiplier] = useState(1.00);
  
  const [error, setError] = useState(null);
  
  const [timeLeft, setTimeLeft] = useState(4.0);
  const timerRef = useRef(null);

  const startVisualTimer = () => {
    setTimeLeft(4.0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
  };

  const stopVisualTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Recovery on mount
  useEffect(() => {
    if (socket && user) {
      socket.emit('mines_recovery', { userId: user.id });
      
      const onStarted = (data) => {
        setGameData(data);
        setGameState('playing');
        setRevealedTiles([]);
        setGridMines([]);
        setCurrentMultiplier(data.currentMultiplier);
        // compute next multiplier initially
        let prob = (25 - data.minesCount) / 25;
        setNextMultiplier((1 / prob) * 0.40);
        setError(null);
        startVisualTimer();
      };

      const onRecovered = (data) => {
        setGameData(data);
        setGameState('playing');
        setRevealedTiles(data.revealedTiles || []);
        setGridMines([]);
        setCurrentMultiplier(data.currentMultiplier);
        setNextMultiplier(data.nextMultiplier);
        setError(null);
        startVisualTimer();
      };

      const onRevealSafe = (data) => {
        setRevealedTiles(prev => [...prev, data.tileIndex]);
        setCurrentMultiplier(data.currentMultiplier);
        setNextMultiplier(data.nextMultiplier);
        startVisualTimer();
      };

      const onGameOver = (data) => {
        setGameState(data.status); // 'lost', 'cashed_out', 'won'
        setGridMines(data.gridMines || []);
        if (data.status === 'cashed_out' || data.status === 'won') {
          // Optional: Add some sound effect or local animation
        }
        setGameData(prev => prev ? { ...prev, serverSeed: data.serverSeed } : null);
        stopVisualTimer();
      };

      const onError = (msg) => {
        setError(msg);
        setTimeout(() => setError(null), 3000);
      };

      socket.on('mines_started', onStarted);
      socket.on('mines_recovered', onRecovered);
      socket.on('mines_reveal_safe', onRevealSafe);
      socket.on('mines_game_over', onGameOver);
      socket.on('mines_error', onError);

      return () => {
        socket.off('mines_started', onStarted);
        socket.off('mines_recovered', onRecovered);
        socket.off('mines_reveal_safe', onRevealSafe);
        socket.off('mines_game_over', onGameOver);
        socket.off('mines_error', onError);
      };
    }
  }, [socket, user]);

  useEffect(() => {
    if (user) {
      if (user.active_currency === 'KET') {
        setBetAmount('100');
      } else {
        setBetAmount('10');
      }
    }
  }, [user?.active_currency]);

  const handleStart = () => {
    if (!user) return;
    const bet = parseFloat(betAmount);
    const isKet = user?.active_currency === 'KET';
    const minBet = isKet ? 100 : 10;
    const currencyLabel = isKet ? 'KET' : 'HTG';

    if (isNaN(bet) || bet < minBet) return setError(`La mise minimale est de ${minBet} ${currencyLabel}.`);
    if (bet > balance) return setError('Solde insuffisant');
    
    socket.emit('mines_start', {
      userId: user.id,
      betAmount: bet,
      minesCount: parseInt(minesCount)
    });
  };

  const handleTileClick = (index) => {
    if (gameState !== 'playing') return;
    if (revealedTiles.includes(index)) return;
    
    socket.emit('mines_reveal', {
      userId: user.id,
      gameId: gameData.gameId,
      tileIndex: index
    });
  };

  const handleCashout = () => {
    if (gameState !== 'playing') return;
    socket.emit('mines_cashout', {
      userId: user.id,
      gameId: gameData.gameId
    });
  };

  const currentPayout = gameData ? (parseFloat(gameData.netStake) * currentMultiplier).toFixed(2) : 0;
  const isGameOver = gameState === 'lost' || gameState === 'cashed_out' || gameState === 'won';

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 animate-fade-in relative z-10 pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <button 
          onClick={() => setSelectedGame(null)}
          className="flex items-center text-slate-400 hover:text-white transition-colors group"
        >
          <div className="bg-slate-800/50 p-2 rounded-xl mr-3 group-hover:bg-cyan-500/20 transition-colors">
            <ArrowLeft className="h-5 w-5 group-hover:text-cyan-400" />
          </div>
          <span className="font-bold tracking-wide">RETOUR AU LOBBY</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-red-500/10 animate-shake">
          <AlertTriangle className="mr-2 h-5 w-5" />
          {error}
        </div>
      )}

      {gameState === 'playing' && (
        <div className="mb-6 w-full bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-center items-center">
          <div className="flex justify-between w-full px-2 mb-2">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Temps Restant</span>
            <span className={`text-xs font-black ${timeLeft <= 1 ? 'text-red-500 animate-pulse' : 'text-cyan-400'}`}>
              {timeLeft.toFixed(1)}s
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-2 rounded-full transition-all duration-100 ease-linear ${timeLeft <= 1 ? 'bg-red-500' : 'bg-cyan-500'}`}
              style={{ width: `${(timeLeft / 4) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sidebar Controls */}
        <div className="hidden lg:block lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 rounded-3xl bg-slate-900/50 border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <h3 className="font-display font-black text-2xl text-white mb-6 flex items-center">
              <Gem className="mr-2 h-6 w-6 text-cyan-400" />
              MINES
            </h3>

            {/* Bet Input */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mise ({user?.active_currency || 'HTG'})</label>
                {gameState === 'idle' && (
                  <span className="text-[10px] text-cyan-500/70 font-semibold bg-cyan-500/10 px-2 py-0.5 rounded-full">Frais 10%</span>
                )}
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  disabled={gameState === 'playing'}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-3 px-4 text-white font-bold tracking-wide outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              {gameState === 'idle' && (
                 <div className="grid grid-cols-4 gap-2 mt-2">
                   {(user?.active_currency === 'KET' ? [100, 250, 500, 1000] : [50, 100, 200, 500]).map(amt => (
                     <button
                       key={amt}
                       onClick={() => setBetAmount(amt.toString())}
                       className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors"
                     >
                       +{amt}
                     </button>
                   ))}
                 </div>
              )}
            </div>

            {/* Mines Count */}
            <div className="space-y-2 mb-8">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mines (5-24)</label>
              <select 
                value={minesCount}
                onChange={(e) => setMinesCount(parseInt(e.target.value))}
                disabled={gameState === 'playing'}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-3 px-4 text-white font-bold tracking-wide outline-none transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {[...Array(20)].map((_, i) => (
                  <option key={i+5} value={i+5}>{i+5} Mines</option>
                ))}
              </select>
            </div>

            {/* Action Button */}
            {gameState !== 'playing' ? (
              <button 
                onClick={handleStart}
                className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center space-x-2"
              >
                <Play className="w-5 h-5" />
                <span>JOUER</span>
              </button>
            ) : (
              <button 
                onClick={handleCashout}
                disabled={revealedTiles.length === 0}
                className={`w-full py-4 font-black rounded-xl transition-all flex flex-col items-center justify-center ${
                  revealedTiles.length > 0 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:-translate-y-0.5 active:scale-95' 
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span className="text-sm">CASH OUT</span>
                {revealedTiles.length > 0 && (
                  <span className="text-xl tracking-wide">{currentPayout} {gameData?.currency || user?.active_currency || 'HTG'}</span>
                )}
              </button>
            )}

            {/* Next Multiplier Info */}
            {gameState === 'playing' && (
              <div className="mt-6 p-4 bg-slate-950/50 rounded-xl border border-slate-800/50 flex justify-between items-center">
                <span className="text-slate-400 text-xs font-bold">Prochain gain</span>
                <span className="text-cyan-400 font-black">{Number(nextMultiplier).toFixed(2)}x</span>
              </div>
            )}
            
          </div>

        </div>

        {/* Game Grid */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center">
          
          {/* Status Display */}
          <div className="mb-8 text-center h-16 flex flex-col justify-center">
            {gameState === 'idle' && (
              <p className="text-slate-400 font-medium">Configurez votre mise et trouvez les diamants !</p>
            )}
            {gameState === 'playing' && (
              <div className="animate-fade-in">
                <p className="text-cyan-400 font-display font-black text-3xl drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                  {Number(currentMultiplier).toFixed(2)}x
                </p>
              </div>
            )}
            {gameState === 'cashed_out' && (
              <div className="animate-fade-in">
                <p className="text-emerald-400 font-display font-black text-3xl drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] mb-1">
                  +{currentPayout} {gameData?.currency || user?.active_currency || 'HTG'}
                </p>
                <p className="text-emerald-500/80 text-sm font-bold uppercase tracking-wider">Encaissé à {Number(currentMultiplier).toFixed(2)}x</p>
              </div>
            )}
             {gameState === 'won' && (
              <div className="animate-fade-in">
                <p className="text-emerald-400 font-display font-black text-3xl drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] mb-1">
                  +{currentPayout} {gameData?.currency || user?.active_currency || 'HTG'}
                </p>
                <p className="text-emerald-500/80 text-sm font-bold uppercase tracking-wider">Plateau nettoyé à {Number(currentMultiplier).toFixed(2)}x !</p>
              </div>
            )}
            {gameState === 'lost' && (
              <div className="animate-fade-in">
                <p className="text-red-500 font-display font-black text-3xl drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] mb-1">
                  BOOM !
                </p>
                <p className="text-red-400/80 text-sm font-bold uppercase tracking-wider">Vous avez perdu la mise.</p>
              </div>
            )}
          </div>

          {/* 5x5 Grid */}
          <div className="bg-slate-900/60 p-3 sm:p-6 rounded-3xl border border-slate-800 shadow-2xl backdrop-blur-sm max-w-md w-full">
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {[...Array(25)].map((_, index) => {
                const isRevealed = revealedTiles.includes(index);
                const isMine = gridMines.includes(index); // only true at end of game
                
                // Determine styling based on state
                let tileClass = "aspect-square rounded-xl transition-all duration-300 transform flex items-center justify-center relative shadow-inner overflow-hidden cursor-pointer";
                
                if (gameState === 'playing') {
                  if (isRevealed) {
                    tileClass += " bg-slate-800 border border-cyan-500/30 scale-[0.98]";
                  } else {
                    tileClass += " bg-slate-800 hover:bg-slate-700 hover:-translate-y-1 hover:shadow-lg border-b-4 border-slate-950 active:translate-y-0 active:border-b-0";
                  }
                } else if (isGameOver) {
                  if (isMine) {
                    // Highlight the mine that blew up vs unrevealed mines
                    if (gameState === 'lost' && !isRevealed && index === gridMines.find(m => !revealedTiles.includes(m))) {
                      // Actually, if lost, the clicked mine isn't in revealedTiles, but it's the one that triggered game over. 
                      // For simplicity, make all mines red.
                      tileClass += " bg-red-900/80 border border-red-500/50 scale-[0.95] animate-shake";
                    } else {
                      tileClass += " bg-red-900/40 border border-red-500/30 scale-[0.95] opacity-80";
                    }
                  } else if (isRevealed) {
                    tileClass += " bg-slate-800 border border-cyan-500/30 scale-[0.98]";
                  } else {
                    // Safe tile unrevealed at end
                    tileClass += " bg-slate-800/50 opacity-40";
                  }
                } else {
                  // Idle
                  tileClass += " bg-slate-800/80 border-b-4 border-slate-950/50 opacity-80";
                }

                return (
                  <div 
                    key={index} 
                    onClick={() => handleTileClick(index)}
                    className={tileClass}
                  >
                    {isRevealed && !isMine && (
                      <div className="absolute inset-0 bg-cyan-500/10 flex items-center justify-center animate-pop-in">
                        <Gem className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                      </div>
                    )}
                    
                    {isGameOver && isMine && (
                      <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center animate-pop-in">
                        <Bomb className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                      </div>
                    )}

                    {isGameOver && !isMine && !isRevealed && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-30">
                        <Gem className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400/50" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Controls (Hidden on Desktop) */}
          <div className="block lg:hidden w-full max-w-md mt-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mise ({user?.active_currency || 'HTG'})</label>
                <input 
                  type="number" 
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  disabled={gameState === 'playing'}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-3 px-4 text-white font-bold tracking-wide outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mines (5-24)</label>
                <select 
                  value={minesCount}
                  onChange={(e) => setMinesCount(parseInt(e.target.value))}
                  disabled={gameState === 'playing'}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-3 px-4 text-white font-bold tracking-wide outline-none transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {[...Array(20)].map((_, i) => (
                    <option key={i+5} value={i+5}>{i+5} Mines</option>
                  ))}
                </select>
              </div>
            </div>

            {gameState === 'idle' && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(user?.active_currency === 'KET' ? [100, 250, 500, 1000] : [50, 100, 200, 500]).map(amt => (
                  <button
                    key={amt}
                    onClick={() => setBetAmount(amt.toString())}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            )}
            
            {gameState !== 'playing' ? (
              <button 
                onClick={handleStart}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] transform active:scale-95 flex items-center justify-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>JOUER</span>
              </button>
            ) : (
              <button 
                onClick={handleCashout}
                disabled={revealedTiles.length === 0}
                className={`w-full py-3 font-black rounded-xl transition-all flex flex-col items-center justify-center ${
                  revealedTiles.length > 0 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] transform active:scale-95' 
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span className="text-xs">CASH OUT</span>
                {revealedTiles.length > 0 && (
                  <span className="text-lg tracking-wide">{currentPayout} {gameData?.currency || user?.active_currency || 'HTG'}</span>
                )}
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default MinesGame;
