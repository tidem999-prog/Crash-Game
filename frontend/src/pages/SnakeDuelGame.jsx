import React, { useState, useEffect, useRef } from 'react';
import { Play, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Skull, Apple, Clock, Coins } from 'lucide-react';

const GRID_SIZE = 20;

const SnakeDuelGame = ({ socket, user, balance, setSelectedGame }) => {
  const [gameState, setGameState] = useState('lobby'); // lobby, waiting, playing, finished
  const [pendingDuels, setPendingDuels] = useState([]);
  const [betAmount, setBetAmount] = useState('100');
  
  const [gameData, setGameData] = useState(null);
  const [error, setError] = useState(null);
  
  // Canvas refs
  const canvasRef = useRef(null);
  
  // Listeners
  useEffect(() => {
    if (!socket || !user) return;

    socket.emit('snake_get_pending');

    socket.on('snake_pending_duels', (duels) => {
      setPendingDuels(duels);
    });

    socket.on('snake_duel_created', (data) => {
      setGameState('waiting');
      setError(null);
      // Wait for someone to join
    });

    socket.on('snake_duel_starting', (data) => {
      if (data.playerA_id === user.id || data.playerB_id === user.id) {
        setGameState('waiting'); // Waiting for loop to start
        socket.emit('snake_claim_spot', { userId: user.id, duelId: data.duelId });
      }
    });

    socket.on('snake_state_update', (data) => {
      setGameState('playing');
      setGameData(data);
      drawGame(data);
    });

    socket.on('snake_game_over', (data) => {
      setGameState('finished');
      setGameData(prev => ({ ...prev, result: data }));
    });

    socket.on('snake_game_cancelled', (msg) => {
      setGameState('lobby');
      setError(msg);
      socket.emit('snake_get_pending');
    });

    socket.on('snake_error', (msg) => {
      setError(msg);
    });

    return () => {
      socket.off('snake_pending_duels');
      socket.off('snake_duel_created');
      socket.off('snake_duel_starting');
      socket.off('snake_state_update');
      socket.off('snake_game_over');
      socket.off('snake_game_cancelled');
      socket.off('snake_error');
    };
  }, [socket, user]);

  // Keyboard controls
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleKeyDown = (e) => {
      if (['ArrowUp', 'w', 'W'].includes(e.key)) socket.emit('snake_change_direction', { direction: 'UP' });
      if (['ArrowDown', 's', 'S'].includes(e.key)) socket.emit('snake_change_direction', { direction: 'DOWN' });
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) socket.emit('snake_change_direction', { direction: 'LEFT' });
      if (['ArrowRight', 'd', 'D'].includes(e.key)) socket.emit('snake_change_direction', { direction: 'RIGHT' });
      
      // Prevent default scrolling for arrows
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, socket]);

  const drawGame = (data) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellSize = canvas.width / GRID_SIZE;

    // Draw Grid (optional, slight lines)
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Draw Food
    if (data.food) {
      ctx.fillStyle = '#ef4444'; // red-500
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ef4444';
      ctx.beginPath();
      ctx.arc(
        data.food.x * cellSize + cellSize / 2, 
        data.food.y * cellSize + cellSize / 2, 
        cellSize / 2.5, 
        0, 
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    }

    // Draw Player 1 (Blue)
    if (data.p1) {
      drawSnake(ctx, data.p1.snake, cellSize, data.p1.id === user.id ? '#06b6d4' : '#3b82f6', data.p1.id === user.id);
    }
    
    // Draw Player 2 (Purple)
    if (data.p2) {
      drawSnake(ctx, data.p2.snake, cellSize, data.p2.id === user.id ? '#06b6d4' : '#a855f7', data.p2.id === user.id);
    }
  };

  const drawSnake = (ctx, snake, cellSize, color, isMe) => {
    if (!snake || snake.length === 0) return;
    
    // Head
    ctx.fillStyle = isMe ? '#22d3ee' : color; // brighter if me
    ctx.shadowBlur = 5;
    ctx.shadowColor = color;
    ctx.fillRect(snake[0].x * cellSize, snake[0].y * cellSize, cellSize, cellSize);
    
    // Body
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    for (let i = 1; i < snake.length; i++) {
      ctx.fillRect(snake[i].x * cellSize, snake[i].y * cellSize, cellSize, cellSize);
    }
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleCreateDuel = () => {
    setError(null);
    socket.emit('snake_create_duel', { userId: user.id, betAmount: parseFloat(betAmount) });
  };

  const handleJoinDuel = (duelId) => {
    setError(null);
    socket.emit('snake_join_duel', { userId: user.id, duelId });
  };

  const sendDirection = (dir) => {
    socket.emit('snake_change_direction', { direction: dir });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden pt-16 pb-20 lg:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setSelectedGame(null)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-cyan-500/50 transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-white flex items-center space-x-3">
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                  DUEL SNAKE
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-widest">
                  1v1
                </span>
              </h1>
              <p className="text-slate-400 text-sm font-medium">Survivez et gagnez la cagnotte !</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-bold flex items-center space-x-2">
            <span>{error}</span>
          </div>
        )}

        {/* LOBBY STATE */}
        {gameState === 'lobby' && (
          <div className="grid lg:grid-cols-3 gap-6">
            
            {/* Create Duel Panel */}
            <div className="lg:col-span-1 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-sm h-fit">
              <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-wider flex items-center space-x-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                <span>Créer un duel</span>
              </h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mise (HTG)</label>
                  <input 
                    type="number" 
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white font-bold outline-none transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {[100, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setBetAmount(amt.toString())}
                      className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors"
                    >
                      {amt}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-3 bg-slate-950 rounded-xl mb-6 border border-slate-800/50 text-xs text-slate-400 font-medium">
                <p>Commission : 10% par joueur.</p>
                <p className="mt-1">Le gagnant remporte <span className="text-emerald-400">90% du pot total</span> !</p>
                <p className="mt-1">Gagnez en ayant <span className="text-rose-400">le moins de morts</span> en 2 minutes.</p>
              </div>

              <button 
                onClick={handleCreateDuel}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] transform active:scale-95 flex items-center justify-center space-x-2"
              >
                <span>HÉBERGER UN DUEL</span>
              </button>
            </div>

            {/* Pending Duels List */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-bold text-white mb-2 uppercase tracking-wider flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Duels en attente</span>
              </h2>
              
              {pendingDuels.length === 0 ? (
                <div className="bg-slate-900/30 border border-slate-800/50 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                  <Skull className="w-12 h-12 text-slate-600 mb-4" />
                  <p className="text-slate-400 font-medium">Aucun duel en attente.</p>
                  <p className="text-slate-500 text-sm mt-1">Créez le vôtre pour affronter d'autres joueurs !</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {pendingDuels.map(duel => (
                    <div key={duel.id} className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all group flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Adversaire</p>
                          <p className="text-white font-medium truncate max-w-[150px]">{duel.creator_email.split('@')[0]}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Mise</p>
                          <p className="text-emerald-400 font-black">{parseFloat(duel.bet_amount).toFixed(2)} HTG</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleJoinDuel(duel.id)}
                        className="w-full py-2.5 bg-slate-800 group-hover:bg-emerald-600 text-slate-300 group-hover:text-white text-sm font-black rounded-xl transition-all"
                      >
                        REJOINDRE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WAITING STATE */}
        {gameState === 'waiting' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
              <Skull className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-slate-400" />
            </div>
            <h2 className="mt-8 text-2xl font-black text-white uppercase tracking-widest">En attente d'un adversaire...</h2>
            <p className="mt-2 text-slate-400">Le jeu commencera automatiquement.</p>
          </div>
        )}

        {/* PLAYING / FINISHED STATE */}
        {(gameState === 'playing' || gameState === 'finished') && (
          <div className="max-w-4xl mx-auto">
            
            {/* HUD */}
            <div className="flex justify-between items-center bg-slate-900/80 p-4 rounded-2xl border border-slate-800 mb-6 backdrop-blur-md">
              
              {/* Player 1 (Me if I joined first, or just dynamically find Me vs Opponent) */}
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                  <Skull className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-cyan-500 uppercase tracking-wider">Vous</p>
                  <div className="flex space-x-3 text-sm font-bold text-white">
                    <span className="flex items-center"><Apple className="w-4 h-4 mr-1 text-emerald-400"/> {gameData?.p1?.id === user.id ? gameData?.p1?.score : gameData?.p2?.score || 0}</span>
                    <span className="flex items-center"><Skull className="w-4 h-4 mr-1 text-rose-500"/> {gameData?.p1?.id === user.id ? gameData?.p1?.deaths : gameData?.p2?.deaths || 0}</span>
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2 text-slate-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Temps restant</span>
                </div>
                <div className={`text-3xl font-display font-black ${gameData?.timeLeft < 10000 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                  {formatTime(gameData?.timeLeft || 0)}
                </div>
              </div>

              {/* Player 2 (Opponent) */}
              <div className="flex items-center space-x-4 text-right">
                <div>
                  <p className="text-xs font-bold text-purple-500 uppercase tracking-wider">Adversaire</p>
                  <div className="flex justify-end space-x-3 text-sm font-bold text-white">
                    <span className="flex items-center">{gameData?.p1?.id !== user.id ? gameData?.p1?.score : gameData?.p2?.score || 0} <Apple className="w-4 h-4 ml-1 text-emerald-400"/></span>
                    <span className="flex items-center">{gameData?.p1?.id !== user.id ? gameData?.p1?.deaths : gameData?.p2?.deaths || 0} <Skull className="w-4 h-4 ml-1 text-rose-500"/></span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center">
                  <Skull className="w-6 h-6 text-purple-400" />
                </div>
              </div>

            </div>

            {/* Game Canvas container */}
            <div className="relative aspect-square w-full max-w-[500px] mx-auto bg-slate-900 border-4 border-slate-800 rounded-xl overflow-hidden shadow-2xl">
              <canvas 
                ref={canvasRef} 
                width={500} 
                height={500} 
                className="w-full h-full"
              />

              {/* Game Over Overlay */}
              {gameState === 'finished' && gameData?.result && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
                  {gameData.result.reason === 'tie' ? (
                    <>
                      <h2 className="text-4xl font-display font-black text-white mb-2 uppercase">Égalité !</h2>
                      <p className="text-slate-300 mb-6">{gameData.result.message}</p>
                    </>
                  ) : gameData.result.winnerId === user.id ? (
                    <>
                      <h2 className="text-4xl font-display font-black text-emerald-400 mb-2 uppercase drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">Victoire !</h2>
                      <p className="text-slate-300 mb-2">Vous avez survécu au duel.</p>
                      <p className="text-2xl font-black text-white bg-slate-800 py-2 px-6 rounded-xl border border-slate-700">+{gameData.result.payoutAmount} HTG</p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-4xl font-display font-black text-rose-500 mb-2 uppercase drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">Défaite</h2>
                      <p className="text-slate-300 mb-6">L'adversaire a été meilleur cette fois.</p>
                    </>
                  )}
                  
                  <button 
                    onClick={() => {
                      setGameState('lobby');
                      setGameData(null);
                      socket.emit('snake_get_pending');
                    }}
                    className="mt-8 py-3 px-8 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    RETOURNER AU LOBBY
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Controls */}
            {gameState === 'playing' && (
              <div className="mt-8 max-w-[250px] mx-auto grid grid-cols-3 gap-2 lg:hidden">
                <div />
                <button 
                  onClick={() => sendDirection('UP')}
                  className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 rounded-2xl flex items-center justify-center transition-colors border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
                >
                  <ArrowUp className="w-8 h-8 text-white" />
                </button>
                <div />
                
                <button 
                  onClick={() => sendDirection('LEFT')}
                  className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 rounded-2xl flex items-center justify-center transition-colors border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
                >
                  <ArrowLeft className="w-8 h-8 text-white" />
                </button>
                <button 
                  onClick={() => sendDirection('DOWN')}
                  className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 rounded-2xl flex items-center justify-center transition-colors border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
                >
                  <ArrowDown className="w-8 h-8 text-white" />
                </button>
                <button 
                  onClick={() => sendDirection('RIGHT')}
                  className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 rounded-2xl flex items-center justify-center transition-colors border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
                >
                  <ArrowRight className="w-8 h-8 text-white" />
                </button>
              </div>
            )}
            <div className="text-center mt-6 hidden lg:block text-slate-500 text-sm font-medium">
              Utilisez les touches ZQSD ou les Flèches directionnelles pour jouer.
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default SnakeDuelGame;
