import React, { useState, useEffect } from 'react';
import { Users, Coins, Skull, ArrowLeft, DoorOpen, ShieldAlert, Award, Clock } from 'lucide-react';

const KothGame = ({ socket, user, balance, setSelectedGame }) => {
  const activeCurrency = user?.active_currency || 'HTG';
  const [gameState, setGameState] = useState('lobby'); // lobby, waiting, playing, finished
  const [lobbies, setLobbies] = useState([]);
  const [roomData, setRoomData] = useState(null); // roomId, potTotal, playersCount, timeLeft
  const [roundData, setRoundData] = useState(null); // round, totalDoors, timeLeft, alivePlayers
  const [roundResult, setRoundResult] = useState(null); // doors, eliminated (array), aliveCount
  const [gameOverData, setGameOverData] = useState(null); // winner, potTotal, message
  
  const [myChoice, setMyChoice] = useState(null);
  const [iAmAlive, setIAmAlive] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket || !user) return;

    socket.emit('koth_get_lobbies');

    socket.on('koth_lobbies', (data) => {
      setLobbies(data);
    });

    socket.on('koth_room_joined', (data) => {
      setGameState('waiting');
      setRoomData(data);
      setError(null);
      setIAmAlive(true);
      setMyChoice(null);
      setRoundResult(null);
      setGameOverData(null);
    });

    socket.on('koth_lobby_update', (data) => {
      setRoomData(prev => ({ ...prev, ...data }));
    });

    socket.on('koth_game_started', (data) => {
      setGameState('playing');
      setRoomData(prev => ({ ...prev, potTotal: data.potTotal, playersCount: data.totalPlayers }));
    });

    socket.on('koth_round_start', (data) => {
      setRoundData(data);
      setRoundResult(null);
      setMyChoice(null);
    });

    socket.on('koth_round_tick', (data) => {
      setRoundData(prev => prev ? { ...prev, timeLeft: data.timeLeft } : null);
    });

    socket.on('koth_round_result', (data) => {
      setRoundResult(data);
      
      // Check if I died
      const meDead = data.eliminated.find(e => e.id === user.id);
      if (meDead) {
        setIAmAlive(false);
      }
    });

    socket.on('koth_game_over', (data) => {
      setGameState('finished');
      setGameOverData(data);
    });

    socket.on('koth_game_cancelled', (msg) => {
      setGameState('lobby');
      setError(msg);
      setRoomData(null);
      socket.emit('koth_get_lobbies');
    });

    socket.on('koth_error', (msg) => {
      setError(msg);
    });

    return () => {
      socket.off('koth_lobbies');
      socket.off('koth_room_joined');
      socket.off('koth_lobby_update');
      socket.off('koth_game_started');
      socket.off('koth_round_start');
      socket.off('koth_round_tick');
      socket.off('koth_round_result');
      socket.off('koth_game_over');
      socket.off('koth_game_cancelled');
      socket.off('koth_error');
    };
  }, [socket, user]);

  const handleCreateRoom = () => {
    socket.emit('koth_create_room', { userId: user.id, email: user.email });
  };

  const handleJoinRoom = (roomId) => {
    socket.emit('koth_join_room', { userId: user.id, email: user.email, roomId });
  };

  const handleChooseDoor = (idx) => {
    if (!iAmAlive || myChoice !== null || roundResult) return;
    setMyChoice(idx);
    socket.emit('koth_make_choice', { doorIndex: idx });
  };

  const renderLobby = () => (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-xl h-fit">
        <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-wider flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          <span>Créer un Tournoi</span>
        </h2>
        
        <div className="p-4 bg-slate-950 rounded-xl mb-6 border border-slate-800/50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Frais d'entrée</span>
            <span className="text-white font-black text-lg">{activeCurrency === 'KET' ? '1000 KET' : '150 HTG'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Ajout au Pot</span>
            <span className="text-emerald-400 font-bold">{activeCurrency === 'KET' ? '900 KET' : '135 HTG'}</span>
          </div>
        </div>

        <button 
          onClick={handleCreateRoom}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-lg active:scale-95"
        >
          HÉBERGER UN KOTH
        </button>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-bold text-white mb-2 uppercase tracking-wider flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
          <span>Tournois en attente</span>
        </h2>
        
        {lobbies.filter(lobby => (lobby.currency || 'HTG') === activeCurrency).length === 0 ? (
          <div className="bg-slate-900/30 border border-slate-800/50 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <Users className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 font-medium">Aucun tournoi disponible.</p>
            <p className="text-slate-500 text-sm mt-1">Créez le vôtre pour affronter d'autres joueurs !</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {lobbies.filter(lobby => (lobby.currency || 'HTG') === activeCurrency).map(lobby => (
              <div key={lobby.id} className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Users className="w-4 h-4" />
                    <span className="font-bold">{lobby.playersCount} Inscrits</span>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pot Actuel</p>
                    <p className="text-emerald-400 font-black">{parseFloat(lobby.potTotal).toFixed(0)} {lobby.currency || 'HTG'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleJoinRoom(lobby.id)}
                  className="mt-auto w-full py-3 bg-slate-800 hover:bg-indigo-600 text-white font-black rounded-xl transition-all"
                >
                  REJOINDRE ({lobby.entryFee || (lobby.currency === 'KET' ? 1000 : 150)} {lobby.currency || 'HTG'})
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden pt-16 pb-20 lg:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setSelectedGame(null)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-white flex items-center space-x-3">
                <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                  KING OF THE HILL
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-widest">
                  BATTLE ROYALE
                </span>
              </h1>
              <p className="text-slate-400 text-sm font-medium">Évitez les portes mortelles. Le dernier survivant gagne le pot !</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-bold">
            {error}
          </div>
        )}

        {/* LOBBY */}
        {gameState === 'lobby' && renderLobby()}

        {/* WAITING ROOM */}
        {gameState === 'waiting' && roomData && (
          <div className="max-w-2xl mx-auto text-center space-y-8 py-12">
            <div className="relative inline-block">
              <div className="w-32 h-32 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-display font-black text-3xl text-indigo-400">
                {roomData.timeLeft}s
              </div>
            </div>
            
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-widest mb-2">En attente des joueurs</h2>
              <p className="text-slate-400">Le tournoi commencera à la fin du compte à rebours.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-xs font-bold uppercase mb-1">Inscrits</p>
                <p className="text-2xl font-black text-white">{roomData.playersCount}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-900/30">
                <Coins className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-slate-400 text-xs font-bold uppercase mb-1">Pot Actuel</p>
                <p className="text-2xl font-black text-emerald-400">{parseFloat(roomData.potTotal).toFixed(0)} {roomData.currency || activeCurrency}</p>
              </div>
            </div>
          </div>
        )}

        {/* PLAYING STATE */}
        {gameState === 'playing' && roundData && (
          <div className="max-w-4xl mx-auto">
            {/* HUD */}
            <div className="flex flex-wrap justify-between items-center bg-slate-900/80 p-4 rounded-2xl border border-slate-800 mb-8 backdrop-blur-md gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-xl bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center">
                  <span className="font-black text-2xl text-indigo-400">R{roundData.round}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Survivants</p>
                  <p className="text-xl font-black text-white flex items-center">
                    <Users className="w-5 h-5 mr-2 text-indigo-400" />
                    {roundData.alivePlayers} / {roomData?.playersCount}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2 text-slate-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Temps restant</span>
                </div>
                <div className={`text-4xl font-display font-black ${roundData.timeLeft <= 3 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                  {roundData.timeLeft}s
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pot Total</p>
                <p className="text-2xl font-black text-emerald-400">{parseFloat(roomData?.potTotal).toFixed(0)} {roomData?.currency || activeCurrency}</p>
              </div>
            </div>

            {/* Game Area */}
            {!iAmAlive ? (
              <div className="bg-rose-950/20 border border-rose-900/50 rounded-3xl p-12 text-center">
                <Skull className="w-20 h-20 text-rose-500 mx-auto mb-6 animate-bounce" />
                <h2 className="text-4xl font-display font-black text-rose-500 mb-2 uppercase">Éliminé !</h2>
                <p className="text-slate-400 text-lg">Vous regardez maintenant la partie en tant que spectateur.</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="text-center">
                  <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Choisissez une porte</h3>
                  <p className="text-slate-400">Attention, les pièges augmentent à chaque round !</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                  {Array.from({ length: roundData.totalDoors }).map((_, idx) => {
                    
                    let bgClass = "bg-slate-800 hover:bg-slate-700 border-slate-700";
                    let iconColor = "text-slate-400";
                    
                    if (myChoice === idx) {
                      bgClass = "bg-indigo-600 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.4)] transform scale-105";
                      iconColor = "text-white";
                    }

                    // Reveal result
                    if (roundResult) {
                      if (roundResult.doors[idx] === 'trap') {
                        bgClass = "bg-rose-600 border-rose-500";
                        iconColor = "text-white";
                      } else {
                        bgClass = "bg-emerald-600 border-emerald-500";
                        iconColor = "text-white";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleChooseDoor(idx)}
                        disabled={myChoice !== null || roundResult !== null}
                        className={`aspect-square rounded-3xl border-4 transition-all duration-300 flex flex-col items-center justify-center space-y-4 ${bgClass}`}
                      >
                        {roundResult && roundResult.doors[idx] === 'trap' ? (
                          <Skull className={`w-16 h-16 ${iconColor}`} />
                        ) : (
                          <DoorOpen className={`w-16 h-16 ${iconColor}`} />
                        )}
                        <span className={`text-xl font-black ${iconColor}`}>Porte {idx + 1}</span>
                      </button>
                    )
                  })}
                </div>

                {roundResult && (
                  <div className="text-center animate-fade-in mt-8">
                    {myChoice === null ? (
                      <p className="text-xl font-bold text-rose-500">Temps écoulé ! Vous êtes éliminé.</p>
                    ) : roundResult.doors[myChoice] === 'trap' ? (
                      <p className="text-xl font-bold text-rose-500">BOOM ! La porte était piégée.</p>
                    ) : (
                      <p className="text-xl font-bold text-emerald-400">Ouf ! Vous avez survécu.</p>
                    )}
                    <p className="text-slate-400 mt-2">{roundResult.eliminated.length} joueurs éliminés ce round.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* GAME OVER STATE */}
        {gameState === 'finished' && gameOverData && (
          <div className="max-w-2xl mx-auto bg-slate-900/80 p-12 rounded-3xl border border-slate-800 text-center animate-fade-in backdrop-blur-md shadow-2xl">
            {gameOverData.winner ? (
              <>
                <Award className="w-24 h-24 text-emerald-500 mx-auto mb-6" />
                <h2 className="text-5xl font-display font-black text-emerald-400 mb-4 uppercase drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                  Gagnant !
                </h2>
                <p className="text-2xl text-white font-bold mb-2">
                  {gameOverData.winner.id === user.id ? 'Félicitations, vous avez survécu !' : `Le joueur ${gameOverData.winner.email.split('@')[0]} remporte le pot.`}
                </p>
                <div className="inline-block mt-4 py-3 px-8 bg-slate-950 border border-slate-800 rounded-2xl">
                  <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-1">Pot Remporté</p>
                  <p className="text-3xl font-black text-emerald-400">{parseFloat(gameOverData.potTotal).toFixed(2)} {gameOverData.currency || activeCurrency}</p>
                </div>
              </>
            ) : (
              <>
                <Skull className="w-24 h-24 text-rose-500 mx-auto mb-6" />
                <h2 className="text-4xl font-display font-black text-rose-500 mb-4 uppercase">
                  Aucun Survivant
                </h2>
                <p className="text-lg text-slate-400">{gameOverData.message}</p>
              </>
            )}

            <button 
              onClick={() => {
                setGameState('lobby');
                setRoomData(null);
                setRoundData(null);
                setRoundResult(null);
                setGameOverData(null);
                socket.emit('koth_get_lobbies');
              }}
              className="mt-12 py-4 px-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-lg active:scale-95"
            >
              RETOURNER AU LOBBY
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default KothGame;
