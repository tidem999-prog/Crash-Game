import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, Award, Clock, Coins, User, History, Trophy, HelpCircle, 
  Play, ArrowLeft, RefreshCw, Send, Check, Copy, Flame
} from 'lucide-react';

export default function LastSecondGame({ socket, onBackToLobby, addNotification }) {
  const { user, refreshBalance, updateBalance } = useAuth();
  
  // Simulated Match state
  const [match, setMatch] = useState({
    home_team: 'Barcelona',
    away_team: 'Real Madrid',
    score_home: 0,
    score_away: 0,
    minute: 0,
    status: 'live',
    corners: 0,
    yellow_cards: 0
  });

  // Round states
  const [round, setRound] = useState({
    roundId: null,
    status: 'idle', // 'idle', 'waiting', 'ticking', 'ended'
    countdown: 0,
    multiplier: 1.00,
    elapsed: 0,
    seedHash: '',
    history: [],
    onlineUsersCount: 0,
    activeBetsCount: 0,
    activeBetsList: []
  });

  const [tickingMultiplier, setTickingMultiplier] = useState(1.00);

  // Betting states
  const [betAmount, setBetAmount] = useState(10);
  const [betType, setBetType] = useState('goal'); // 'goal' (Betting goal will occur), 'no_goal' (Betting no goal will occur)
  const [autoCashout, setAutoCashout] = useState('');
  const [myBet, setMyBet] = useState(null); // null, { amount, bet_type, status: 'placed'/'cashed_out'/'won'/'lost' }
  const [betError, setBetError] = useState('');
  const [cashoutSuccess, setCashoutSuccess] = useState(null); // { payout, multiplier }
  const [goalOverlay, setGoalOverlay] = useState(null); // null or { scorer, multiplier }
  const [noGoalOverlay, setNoGoalOverlay] = useState(null); // null or { multiplier }
  const [matchTickerEvents, setMatchTickerEvents] = useState([]); // log of simulated match events

  // Keep track of socket
  const socketIdRef = useRef(null);

  // Helper to generate a live commentary simulation based on minute & corners/cards increments
  useEffect(() => {
    if (match.minute > 0) {
      const events = [];
      if (match.corners > 0) {
        events.push(`${Math.max(1, match.minute - 2)}' - Corner pour ${Math.random() > 0.5 ? match.home_team : match.away_team}`);
      }
      if (match.yellow_cards > 0) {
        events.push(`${Math.max(1, match.minute - 1)}' - Carton jaune pour un défenseur`);
      }
      if (match.score_home > 0 || match.score_away > 0) {
        events.push(`${match.minute}' - BUT !!! Le score change !`);
      }
      // Add a standard commentary
      events.push(`${match.minute}' - Phase de jeu intense au milieu du terrain.`);
      
      setMatchTickerEvents(prev => [events[events.length - 1], ...prev].slice(0, 5));
    }
  }, [match.minute, match.corners, match.yellow_cards, match.score_home, match.score_away]);

  // 1. WebSocket listeners registration
  useEffect(() => {
    if (!socket) return;
    
    socketIdRef.current = socket.id;

    // Listen to match updates
    socket.on('match:update', (data) => {
      setMatch(data);
    });

    // Listen to round state changes
    socket.on('round:state', (data) => {
      setRound(prev => ({
        ...prev,
        ...data
      }));
      setTickingMultiplier(data.multiplier);
      
      // If round changes to waiting/idle, reset betting state
      if (data.status === 'waiting') {
        setMyBet(null);
        setCashoutSuccess(null);
        setGoalOverlay(null);
        setNoGoalOverlay(null);
        setBetError('');
      }
    });

    // Listen to live ticks
    socket.on('round:tick', (data) => {
      setTickingMultiplier(data.multiplier);
    });

    // Round ended with a GOAL
    socket.on('round:closed:goal', (data) => {
      setGoalOverlay({
        scorer: data.scorer,
        multiplier: data.multiplier
      });
      refreshBalance();
    });

    // Round ended with NO GOAL
    socket.on('round:closed:nogoal', (data) => {
      setNoGoalOverlay({
        multiplier: data.multiplier
      });
      refreshBalance();
    });

    // Bet confirmed on server
    socket.on('bet:confirmed', (data) => {
      setMyBet({
        amount: parseFloat(betAmount),
        bet_type: betType,
        status: 'placed'
      });
      setBetError('');
      if (addNotification) {
        addNotification(`Pari enregistré sur ${betType === 'goal' ? 'BUT' : 'PAS DE BUT'} !`, 'success');
      }
    });

    socket.on('bet_success', (data) => {
      updateBalance(data.newBalance, user?.active_currency || 'HTG');
    });

    // Bet result (won/lost)
    socket.on('bet:result', (data) => {
      if (data.status === 'won') {
        setMyBet(prev => prev ? { ...prev, status: 'won', payout: data.profit + prev.amount, multiplier: data.multiplier } : null);
        setCashoutSuccess({ payout: data.profit + (myBet?.amount || parseFloat(betAmount)), multiplier: data.multiplier });
        updateBalance(data.newBalance, user?.active_currency || 'HTG');
        if (addNotification) {
          addNotification(`Gagné ! +${data.profit.toFixed(0)} ${data.currency} (${data.multiplier}x)`, 'success');
        }
      } else {
        setMyBet(prev => prev ? { ...prev, status: 'lost' } : null);
        if (addNotification) {
          addNotification(`Pari perdu ! -${betAmount} ${data.currency}`, 'danger');
        }
      }
    });

    // User manual cashout confirmed
    socket.on('bet:cashout:confirm', (data) => {
      setMyBet(prev => prev ? { ...prev, status: 'cashed_out', cashed_out_at: data.multiplier } : null);
      setCashoutSuccess({ payout: data.potentialWin, multiplier: data.multiplier });
      if (addNotification) {
        addNotification(`Encaissé à ${data.multiplier}x ! En attente du but...`, 'success');
      }
    });

    socket.on('bet:error', (data) => {
      setBetError(data.message);
      if (addNotification) {
        addNotification(data.message, 'danger');
      }
    });

    return () => {
      socket.off('match:update');
      socket.off('round:state');
      socket.off('round:tick');
      socket.off('round:closed:goal');
      socket.off('round:closed:nogoal');
      socket.off('bet:confirmed');
      socket.off('bet_success');
      socket.off('bet:result');
      socket.off('bet:cashout:confirm');
      socket.off('bet:error');
    };
  }, [socket, betAmount, betType, myBet]);

  // Adjust default wagers depending on active currency
  useEffect(() => {
    if (user) {
      if (user.active_currency === 'KET') {
        setBetAmount(1000);
      } else {
        setBetAmount(10);
      }
    }
  }, [user?.active_currency]);

  const handlePlaceBet = () => {
    if (!socket || !socket.connected) return;
    setBetError('');

    const isKet = user?.active_currency === 'KET';
    const minBet = isKet ? 1000 : 10;
    const currentBalance = isKet ? (user?.ket_balance || 0) : (user?.balance || 0);
    const currencyLabel = isKet ? 'KET' : 'HTG';

    if (betAmount < minBet) {
      return setBetError(`La mise minimale est de ${minBet} ${currencyLabel}.`);
    }
    if (betAmount > currentBalance) {
      return setBetError('Solde insuffisant.');
    }

    socket.emit('bet:place', {
      userId: user.id,
      email: user.email,
      amount: parseFloat(betAmount),
      type: betType,
      autoCashout: betType === 'goal' && autoCashout ? parseFloat(autoCashout) : null
    });
  };

  const handleCashout = () => {
    if (!socket || !socket.connected || !myBet || myBet.status !== 'placed') return;
    socket.emit('bet:cashout', { roundId: round.roundId });
  };

  const isKet = user?.active_currency === 'KET';
  const currencyLabel = isKet ? 'KET' : 'HTG';

  return (
    <div className="flex flex-col space-y-6 max-w-5xl mx-auto w-full py-4 animate-fade-in relative px-2">
      {/* Return Button */}
      <button 
        onClick={onBackToLobby} 
        className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-xs font-bold bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl w-fit transition-all cursor-pointer hover:-translate-x-0.5"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour au Lobby</span>
      </button>

      {/* Grid Layout: Main Game Area (left/center) and Statistics (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          
          {/* Scoreboard Card */}
          <div className="glass-panel p-5 rounded-3xl bg-gradient-to-br from-slate-900/60 via-indigo-950/5 to-slate-900/60 border border-slate-800/80 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex items-center justify-between border-b border-slate-850/60 pb-3">
              <span className="flex items-center space-x-1 bg-emerald-950/80 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400 uppercase tracking-wider animate-pulse">
                <Clock className="h-3 w-3 mr-0.5 animate-spin" />
                <span>Simulateur Live ({match.status === 'live' ? 'En Direct' : 'Mi-temps'})</span>
              </span>
              <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/50 border border-indigo-900/30 px-3 py-1 rounded-full">
                Minute {match.minute}'
              </span>
            </div>

            {/* Score layout */}
            <div className="flex items-center justify-center py-4 space-x-6 sm:space-x-12 select-none">
              <div className="flex flex-col items-center flex-1 text-right">
                <span className="font-display font-black text-sm sm:text-lg text-slate-100 truncate w-full max-w-[120px]">
                  {match.home_team.toUpperCase()}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">Domicile</span>
              </div>

              {/* Big Score Board */}
              <div className="flex items-center space-x-4 bg-slate-950/80 border border-slate-850 px-5 py-2.5 rounded-2xl shadow-inner font-mono font-black text-2xl sm:text-3xl text-white">
                <span className="text-indigo-400">{match.score_home}</span>
                <span className="text-slate-600">:</span>
                <span className="text-indigo-400">{match.score_away}</span>
              </div>

              <div className="flex flex-col items-center flex-1 text-left">
                <span className="font-display font-black text-sm sm:text-lg text-slate-100 truncate w-full max-w-[120px]">
                  {match.away_team.toUpperCase()}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">Extérieur</span>
              </div>
            </div>

            {/* Extra Stats bar */}
            <div className="flex items-center justify-center space-x-8 text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-850/60">
              <div className="flex items-center space-x-1">
                <span className="text-slate-500">Corners:</span>
                <span className="text-slate-200">{match.corners}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-slate-500">Cartons:</span>
                <span className="text-amber-500">{match.yellow_cards} 🟨</span>
              </div>
            </div>
          </div>

          {/* Interactive Screen - Multiplier Center */}
          <div className="relative glass-panel rounded-3xl overflow-hidden bg-slate-950/80 border border-slate-900 min-h-[260px] flex flex-col items-center justify-center">
            
            {/* Recent History Pill Bar */}
            <div className="absolute top-4 left-4 right-4 flex items-center space-x-2 overflow-x-auto pb-1.5 z-20">
              {round.history.map((val, idx) => (
                <span 
                  key={idx} 
                  className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border flex items-center space-x-1 shrink-0 ${
                    val.type === 'goal' 
                      ? 'bg-emerald-950/60 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-950/60 border-red-500/20 text-red-400'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                  <span>{val.multiplier.toFixed(2)}x {val.type === 'goal' ? 'BUT' : 'FIN'}</span>
                </span>
              ))}
            </div>

            {/* Main Interactive view state */}
            {round.status === 'waiting' && (
              <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center animate-fade-in">
                <div className="bg-indigo-600/10 p-5 rounded-full text-indigo-400 border border-indigo-500/15 animate-pulse-glow">
                  <Clock className="h-10 w-10 animate-spin" />
                </div>
                <div>
                  <h3 className="font-display font-black text-2xl text-white tracking-wide uppercase">
                    Ouverture des Paris
                  </h3>
                  <p className="text-slate-400 text-xs mt-1 uppercase tracking-wider font-semibold">
                    Décollage dans {round.countdown} secondes...
                  </p>
                </div>
                <div className="text-[10px] font-mono text-slate-500 border border-slate-850 px-3 py-1 rounded-full bg-slate-900/20">
                  Hash: {round.seedHash ? round.seedHash.substring(0, 16) + '...' : 'Calculating...'}
                </div>
              </div>
            )}

            {round.status === 'ticking' && (
              <div className="flex flex-col items-center justify-center p-6 text-center animate-fade-in select-none">
                {/* Score minute tracker icon */}
                <div className="flex items-center space-x-1.5 bg-indigo-950/60 border border-indigo-500/15 px-3 py-1.5 rounded-full mb-4">
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping"></span>
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Temps écoulé : {round.elapsed.toFixed(1)}s</span>
                </div>

                <h1 className="font-display font-black text-6xl sm:text-7xl text-white tracking-wide transition-all duration-100 scale-100 hover:scale-105 active:scale-95 animate-pulse-glow">
                  {tickingMultiplier.toFixed(2)}x
                </h1>

                <p className="text-slate-400 text-xs mt-2 uppercase tracking-widest font-semibold flex items-center space-x-1">
                  <span>Mises en cours</span>
                  <span className="text-indigo-400 font-black">({round.activeBetsCount})</span>
                </p>
              </div>
            )}

            {round.status === 'idle' && (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">Initialisation de la manche...</p>
              </div>
            )}

            {/* Exploding Goal Overlay (Win) */}
            {goalOverlay && (
              <div className="absolute inset-0 bg-emerald-950/80 flex flex-col items-center justify-center backdrop-blur-md z-30 animate-pulse-glow">
                <div className="bg-emerald-500 p-4 rounded-full text-white mb-3 shadow-lg shadow-emerald-500/20">
                  <Trophy className="h-10 w-10 animate-bounce" />
                </div>
                <h3 className="font-display font-black text-4xl text-emerald-400 tracking-wide uppercase">
                  BUT !!!
                </h3>
                <p className="text-slate-200 text-xs font-bold uppercase tracking-wider mt-1">
                  Scorer : <span className="text-white font-black">{goalOverlay.scorer.toUpperCase()}</span>
                </p>
                <p className="text-white text-lg font-bold mt-2">Crashed @ {goalOverlay.multiplier.toFixed(2)}x</p>
                <p className="text-[10px] text-emerald-400/80 font-bold uppercase mt-2">Mises "BUT" encaissées payées !</p>
              </div>
            )}

            {/* Red No-Goal Overlay (Lose) */}
            {noGoalOverlay && (
              <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center backdrop-blur-md z-30 animate-pulse-glow">
                <div className="bg-red-500 p-4 rounded-full text-white mb-3 shadow-lg shadow-red-500/20">
                  <ShieldAlert className="h-10 w-10 animate-bounce" />
                </div>
                <h3 className="font-display font-black text-4xl text-red-500 tracking-wide uppercase">
                  FIN DU TEMPS
                </h3>
                <p className="text-slate-200 text-xs font-bold uppercase tracking-wider mt-1">
                  Aucun but marqué dans la fenêtre.
                </p>
                <p className="text-white text-lg font-bold mt-2">Crashed @ {noGoalOverlay.multiplier.toFixed(2)}x</p>
                <p className="text-[10px] text-red-400/80 font-bold uppercase mt-2">Mises "PAS DE BUT" payées !</p>
              </div>
            )}
            
            {/* Visual Confetti / Success Overlay for Cashout */}
            {cashoutSuccess && !goalOverlay && !noGoalOverlay && (
              <div className="absolute bottom-4 right-4 bg-emerald-950/90 border border-emerald-500/30 p-3.5 rounded-2xl flex items-center space-x-3.5 shadow-lg backdrop-blur-md animate-slide-up z-20">
                <div className="bg-emerald-500 p-2 rounded-xl text-white">
                  <Award className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="text-[9px] text-emerald-400 uppercase tracking-widest font-black block">Encaissement validé</span>
                  <span className="font-mono text-sm font-bold text-white block">+{cashoutSuccess.payout.toFixed(0)} {currencyLabel}</span>
                  <span className="text-[10px] text-slate-400 block">Bloqué à {cashoutSuccess.multiplier.toFixed(2)}x</span>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Control Panel */}
          <div className="glass-panel p-5 rounded-3xl space-y-4">
            
            {/* Inputs grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Left Side: Bet Amount and Type */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Montant de la mise ({isKet ? 'Min: 1000 KET' : 'Min: 10 HTG'})
                  </label>
                  <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-950/40">
                    <span className="bg-slate-900/60 px-3 py-2 text-slate-500 text-xs font-bold flex items-center border-r border-slate-800">
                      {currencyLabel}
                    </span>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBetAmount(val === '' ? '' : parseInt(val) || 0);
                      }}
                      onBlur={() => {
                        const minVal = isKet ? 1000 : 10;
                        if (!betAmount || betAmount < minVal) setBetAmount(minVal);
                      }}
                      disabled={myBet && myBet.status === 'placed'}
                      className="block w-full px-3 py-2 bg-transparent text-slate-200 focus:outline-none text-xs font-bold"
                    />
                    <button 
                      onClick={() => {
                        const minVal = isKet ? 1000 : 10;
                        setBetAmount(prev => Math.max(minVal, Math.round((parseInt(prev) || 0) / 2)));
                      }}
                      disabled={myBet && myBet.status === 'placed'}
                      className="bg-slate-900/60 hover:bg-slate-800/80 border-l border-slate-800 px-2.5 text-xs font-bold text-slate-400 cursor-pointer"
                    >
                      /2
                    </button>
                    <button 
                      onClick={() => setBetAmount(prev => (parseInt(prev) || 0) * 2)}
                      disabled={myBet && myBet.status === 'placed'}
                      className="bg-slate-900/60 hover:bg-slate-800/80 border-l border-slate-800 px-2.5 text-xs font-bold text-slate-400 cursor-pointer"
                    >
                      x2
                    </button>
                  </div>
                </div>

                {/* Bet Type Picker */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Pronostic
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBetType('goal')}
                      disabled={myBet && myBet.status === 'placed'}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        betType === 'goal' 
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-black shadow-[0_0_10px_rgba(16,185,129,0.05)]' 
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ⚽ BUT MARQUÉ
                    </button>
                    <button
                      type="button"
                      onClick={() => setBetType('no_goal')}
                      disabled={myBet && myBet.status === 'placed'}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        betType === 'no_goal' 
                          ? 'border-red-500 bg-red-500/10 text-red-400 font-black shadow-[0_0_10px_rgba(239,68,68,0.05)]' 
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🛑 PAS DE BUT
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Auto Cashout and Button */}
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Auto Cash Out</span>
                    {betType === 'no_goal' && <span className="text-[9px] text-red-500 uppercase tracking-widest font-bold">Indisponible (Hold)</span>}
                  </label>
                  <div className={`relative rounded-xl overflow-hidden flex border bg-slate-950/40 ${betType === 'no_goal' ? 'border-red-950/40 opacity-50' : 'border-slate-800'}`}>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 2.0"
                      value={autoCashout}
                      onChange={(e) => setAutoCashout(e.target.value)}
                      disabled={(myBet && myBet.status === 'placed') || betType === 'no_goal'}
                      className="block w-full px-3 py-2 bg-transparent text-slate-200 focus:outline-none text-xs font-bold"
                    />
                    <span className="bg-slate-900/60 px-3 py-2 text-slate-500 text-xs font-bold flex items-center border-l border-slate-800">x</span>
                  </div>
                </div>

                {/* Main Action Wager Button */}
                <div className="w-full">
                  {myBet && myBet.status === 'placed' && tickingMultiplier > 1.00 && round.status === 'ticking' && betType === 'goal' ? (
                    <button
                      onClick={handleCashout}
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm tracking-widest transition-all duration-150 transform active:scale-95 glow-emerald animate-shake cursor-pointer"
                    >
                      CASH OUT ({(betAmount * tickingMultiplier).toFixed(0)} {currencyLabel})
                    </button>
                  ) : myBet && myBet.status === 'placed' ? (
                    <button
                      disabled
                      className="w-full py-3 px-4 bg-emerald-600/80 text-slate-950 font-black rounded-xl text-xs select-none border border-emerald-500/20"
                    >
                      PARI PLACÉ ({betType === 'goal' ? 'BUT' : 'PAS DE BUT'})
                    </button>
                  ) : (
                    <button
                      onClick={handlePlaceBet}
                      disabled={round.status !== 'waiting'}
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-indigo cursor-pointer active:scale-98"
                    >
                      PLACER LE PARI
                    </button>
                  )}
                </div>
              </div>
            </div>

            {betError && (
              <p className="text-red-500 text-[11px] text-center font-bold">{betError}</p>
            )}
          </div>
        </div>

        {/* Column 2: Live Players and Score Ticker Commentary */}
        <div className="space-y-6 flex flex-col justify-between">
          
          {/* Live Match Commentary Ticker */}
          <div className="glass-panel p-5 rounded-3xl bg-slate-900/20 border border-slate-850 flex flex-col flex-1 min-h-[160px] max-h-[220px]">
            <h3 className="font-display font-black text-xs text-slate-350 border-b border-slate-850/60 pb-2 mb-3 uppercase tracking-wider flex items-center space-x-1.5">
              <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
              <span>Commentaire Live</span>
            </h3>
            
            <div className="flex-grow overflow-y-auto space-y-2 pr-1 text-[11px] leading-relaxed">
              {matchTickerEvents.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 italic">En attente d'événements...</p>
              ) : (
                matchTickerEvents.map((evt, idx) => (
                  <div key={idx} className="bg-slate-950/40 p-2 rounded-xl border border-slate-900/50 text-slate-400 font-medium">
                    {evt}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active bets list */}
          <div className="glass-panel p-5 rounded-3xl flex flex-col flex-grow max-h-[380px] min-h-[280px]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-850/60">
              <h3 className="font-display font-black text-xs text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                <span>Joueurs Live</span>
              </h3>
              <span className="bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full text-[10px] font-bold border border-indigo-500/20">
                {round.activeBetsList.length} actifs
              </span>
            </div>

            <div className="flex-grow overflow-y-auto space-y-2 pr-1">
              {round.activeBetsList.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">En attente de parieurs...</p>
              ) : (
                round.activeBetsList.map((player, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-xl border border-slate-900/60">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-300">{player.email}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {player.amount.toFixed(0)} {currencyLabel} | <span className={player.bet_type === 'goal' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{player.bet_type === 'goal' ? 'BUT' : 'PAS DE BUT'}</span>
                      </span>
                    </div>
                    {player.cashedOut ? (
                      <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/15">
                        +{ (player.amount * player.cashed_out_at).toFixed(0) } {currencyLabel} ({player.cashed_out_at.toFixed(2)}x)
                      </span>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[9px] text-slate-500 animate-pulse">En jeu</span>
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
