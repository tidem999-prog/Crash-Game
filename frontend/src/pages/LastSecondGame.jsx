import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, Award, Clock, History, Trophy, ArrowLeft 
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
  const [betType, setBetType] = useState('goal'); // 'goal' or 'no_goal'
  const [autoCashout, setAutoCashout] = useState('');
  const [myBet, setMyBet] = useState(null); // null, { amount, bet_type, status: 'placed'/'cashed_out'/'won'/'lost' }
  const [betError, setBetError] = useState('');
  const [cashoutSuccess, setCashoutSuccess] = useState(null); // { payout, multiplier }
  const [goalOverlay, setGoalOverlay] = useState(null); // null or { scorer, multiplier }
  const [noGoalOverlay, setNoGoalOverlay] = useState(null); // null or { multiplier }

  // Canvas and Animation Refs
  const canvasRef = useRef(null);
  const phaseRef = useRef('idle'); // 'idle', 'dribbling', 'scoring', 'missing'
  const socketIdRef = useRef(null);

  // Match clock formatting helper
  const getFormattedMatchTime = () => {
    if (round.status !== 'ticking') {
      const mm = String(match.minute).padStart(2, '0');
      return `${mm}:00`;
    }
    // 1 second real-time = 6 seconds match-time
    const totalSeconds = match.minute * 60 + round.elapsed * 6;
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // 1. WebSocket listeners registration (prefixed with lastsecond:)
  useEffect(() => {
    if (!socket) return;
    
    socketIdRef.current = socket.id;

    // Listen to match updates
    socket.on('lastsecond:match:update', (data) => {
      setMatch(data);
    });

    // Listen to round state changes
    socket.on('lastsecond:round:state', (data) => {
      setRound(prev => {
        // If a new round is opened, reset all active betting states
        if (data.roundId !== prev.roundId) {
          setMyBet(null);
          setCashoutSuccess(null);
          setGoalOverlay(null);
          setNoGoalOverlay(null);
          setBetError('');
        }
        return {
          ...prev,
          ...data
        };
      });
      setTickingMultiplier(data.multiplier);
    });

    // Listen to live ticks
    socket.on('lastsecond:round:tick', (data) => {
      setTickingMultiplier(data.multiplier);
    });

    // Round ended with a GOAL
    socket.on('lastsecond:round:closed:goal', (data) => {
      setGoalOverlay({
        scorer: data.scorer,
        multiplier: data.multiplier
      });
      refreshBalance();
    });

    // Round ended with NO GOAL
    socket.on('lastsecond:round:closed:nogoal', (data) => {
      setNoGoalOverlay({
        multiplier: data.multiplier
      });
      refreshBalance();
    });

    // Bet confirmed on server
    socket.on('lastsecond:bet:confirmed', (data) => {
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

    socket.on('lastsecond:bet_success', (data) => {
      updateBalance(data.newBalance, user?.active_currency || 'HTG');
    });

    // Bet result (won/lost)
    socket.on('lastsecond:bet:result', (data) => {
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
    socket.on('lastsecond:bet:cashout:confirm', (data) => {
      setMyBet(prev => prev ? { ...prev, status: 'cashed_out', cashed_out_at: data.multiplier } : null);
      setCashoutSuccess({ payout: data.potentialWin, multiplier: data.multiplier });
      if (addNotification) {
        addNotification(`Encaissé à ${data.multiplier}x ! En attente du but...`, 'success');
      }
    });

    socket.on('lastsecond:bet:error', (data) => {
      setBetError(data.message);
      if (addNotification) {
        addNotification(data.message, 'danger');
      }
    });

    // Trigger standard toast when another player wagers
    socket.on('lastsecond:player_placed_bet', (data) => {
      const userPrefix = user?.email ? user.email.split('@')[0] : '';
      if (data.email !== userPrefix && addNotification) {
        addNotification(
          `${data.email} a misé ${data.amount} ${data.currency} sur ${data.bet_type === 'goal' ? 'BUT' : 'PAS DE BUT'}`, 
          'info'
        );
      }
    });

    // Trigger standard toast when another player cashes out
    socket.on('lastsecond:player_cashed_out', (data) => {
      const userPrefix = user?.email ? user.email.split('@')[0] : '';
      if (data.email !== userPrefix && addNotification) {
        addNotification(
          `${data.email} a encaissé +${data.payout.toFixed(0)} ${data.currency} (${data.multiplier.toFixed(2)}x)`, 
          'info'
        );
      }
    });

    return () => {
      socket.off('lastsecond:match:update');
      socket.off('lastsecond:round:state');
      socket.off('lastsecond:round:tick');
      socket.off('lastsecond:round:closed:goal');
      socket.off('lastsecond:round:closed:nogoal');
      socket.off('lastsecond:bet:confirmed');
      socket.off('lastsecond:bet_success');
      socket.off('lastsecond:bet:result');
      socket.off('lastsecond:bet:cashout:confirm');
      socket.off('lastsecond:bet:error');
      socket.off('lastsecond:player_placed_bet');
      socket.off('lastsecond:player_cashed_out');
    };
  }, [socket, betAmount, betType, myBet, user, addNotification, updateBalance, refreshBalance]);

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

  // 2D Pitch Canvas Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // DPI resolution setup
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 600 * dpr;
    canvas.height = 220 * dpr;
    ctx.scale(dpr, dpr);

    // Initialize entities
    const ball = { x: 300, y: 110, targetX: 300, targetY: 110, size: 5, color: '#ffffff' };
    const p1 = { x: 200, y: 110, targetX: 200, targetY: 110, color: '#3b82f6', label: '10' };
    const p2 = { x: 400, y: 110, targetX: 400, targetY: 110, color: '#ef4444', label: '7' };
    let frameCount = 0;
    let ballInNet = false;
    let netVibration = 0;

    // Synchronize phase states
    if (goalOverlay) {
      phaseRef.current = 'scoring';
      const homeScored = goalOverlay.scorer === match.home_team;
      ball.targetX = homeScored ? 578 : 22;
      ball.targetY = 110 + (Math.random() * 20 - 10);
      if (homeScored) {
        p1.x = ball.x - 30; p1.y = ball.y - 5;
      } else {
        p2.x = ball.x + 30; p2.y = ball.y - 5;
      }
    } else if (noGoalOverlay) {
      phaseRef.current = 'missing';
      const shootRight = Math.random() < 0.5;
      ball.targetX = shootRight ? 595 : 5;
      ball.targetY = Math.random() < 0.5 ? 40 : 180;
      if (shootRight) {
        p1.x = ball.x - 30; p1.y = ball.y;
      } else {
        p2.x = ball.x + 30; p2.y = ball.y;
      }
    } else if (round.status === 'ticking') {
      phaseRef.current = 'dribbling';
    } else {
      phaseRef.current = 'idle';
    }

    const animate = () => {
      frameCount++;
      const phase = phaseRef.current;

      // Update positions based on active phase
      if (phase === 'idle') {
        ball.targetX = 300;
        ball.targetY = 110;
        p1.targetX = 180 + Math.sin(frameCount * 0.03) * 15;
        p1.targetY = 110 + Math.cos(frameCount * 0.02) * 15;
        p2.targetX = 420 + Math.sin(frameCount * 0.025) * 15;
        p2.targetY = 110 + Math.cos(frameCount * 0.035) * 15;

        ball.x += (ball.targetX - ball.x) * 0.05;
        ball.y += (ball.targetY - ball.y) * 0.05;
        ballInNet = false;
      } 
      else if (phase === 'dribbling') {
        // Ball moves dynamically around the field
        if (frameCount % 100 === 0) {
          ball.targetX = 180 + Math.random() * 240; // between 180 and 420
          ball.targetY = 40 + Math.random() * 140;  // between 40 and 180
        }

        // Players chase the ball
        if (ball.x < 300) {
          p1.targetX = ball.x - 12;
          p1.targetY = ball.y;
          p2.targetX = 380 + Math.sin(frameCount * 0.02) * 20;
          p2.targetY = 110 + Math.cos(frameCount * 0.01) * 30;
        } else {
          p2.targetX = ball.x + 12;
          p2.targetY = ball.y;
          p1.targetX = 220 + Math.sin(frameCount * 0.02) * 20;
          p1.targetY = 110 + Math.cos(frameCount * 0.015) * 30;
        }

        ball.x += (ball.targetX - ball.x) * 0.05;
        ball.y += (ball.targetY - ball.y) * 0.05;
        ballInNet = false;
      } 
      else if (phase === 'scoring') {
        // Ball goes towards goal net
        ball.x += (ball.targetX - ball.x) * 0.12;
        ball.y += (ball.targetY - ball.y) * 0.12;

        // Check if ball reached the net
        const distToGoal = Math.abs(ball.x - ball.targetX);
        if (distToGoal < 8) {
          ballInNet = true;
          netVibration = Math.sin(frameCount * 0.5) * 4;
        }

        const homeScored = goalOverlay?.scorer === match.home_team;
        if (homeScored) {
          p1.targetX = ball.x - 15;
          p1.targetY = ball.y;
          p2.targetX = 480; p2.targetY = 110;
        } else {
          p2.targetX = ball.x + 15;
          p2.targetY = ball.y;
          p1.targetX = 120; p1.targetY = 110;
        }
      } 
      else if (phase === 'missing') {
        // Ball flies wide (out / deyo)
        ball.x += (ball.targetX - ball.x) * 0.1;
        ball.y += (ball.targetY - ball.y) * 0.1;
        p1.targetX = 250; p1.targetY = 110;
        p2.targetX = 350; p2.targetY = 110;
        ballInNet = false;
      }

      // Interpolate players positions
      p1.x += (p1.targetX - p1.x) * 0.08;
      p1.y += (p1.targetY - p1.y) * 0.08;
      p2.x += (p2.targetX - p2.x) * 0.08;
      p2.y += (p2.targetY - p2.y) * 0.08;


      // DRAWING THE SOCCER PITCH
      ctx.clearRect(0, 0, 600, 220);

      // Draw alternating green stripes
      const numStripes = 8;
      const stripeWidth = 600 / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#14351f' : '#1a4027';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, 220);
      }

      // Draw pitch lines (semi-transparent white)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;

      // Field borders
      ctx.strokeRect(30, 20, 540, 180);

      // Center line
      ctx.beginPath();
      ctx.moveTo(300, 20);
      ctx.lineTo(300, 200);
      ctx.stroke();

      // Center circle
      ctx.beginPath();
      ctx.arc(300, 110, 35, 0, Math.PI * 2);
      ctx.stroke();

      // Center spot
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(300, 110, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Penalty areas
      ctx.strokeRect(30, 55, 50, 110);
      ctx.strokeRect(520, 55, 50, 110);

      // Penalty spots
      ctx.beginPath();
      ctx.arc(80, 110, 1.5, 0, Math.PI * 2);
      ctx.arc(520, 110, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Goal nets (vibrating if scored)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      
      // Left Goal Net
      const leftGoalOffset = (phase === 'scoring' && ballInNet && ball.targetX < 100) ? netVibration : 0;
      ctx.beginPath();
      ctx.moveTo(30, 85);
      ctx.lineTo(15 + leftGoalOffset, 85);
      ctx.lineTo(15 + leftGoalOffset, 135);
      ctx.lineTo(30, 135);
      ctx.stroke();

      // Right Goal Net
      const rightGoalOffset = (phase === 'scoring' && ballInNet && ball.targetX > 500) ? netVibration : 0;
      ctx.beginPath();
      ctx.moveTo(570, 85);
      ctx.lineTo(585 + rightGoalOffset, 85);
      ctx.lineTo(585 + rightGoalOffset, 135);
      ctx.lineTo(570, 135);
      ctx.stroke();


      // DRAWING SHADOWS & ENTITIES
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      
      // P1 Shadow
      ctx.beginPath();
      ctx.ellipse(p1.x, p1.y + 10, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // P2 Shadow
      ctx.beginPath();
      ctx.ellipse(p2.x, p2.y + 10, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Ball Shadow
      ctx.beginPath();
      ctx.ellipse(ball.x, ball.y + 6, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw P1 (Domicile - Blue)
      ctx.fillStyle = p1.color;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // P1 Jersey number
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p1.label, p1.x, p1.y);

      // Draw P2 (Extérieur - Red)
      ctx.fillStyle = p2.color;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // P2 Jersey number
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p2.label, p2.x, p2.y);

      // Draw Ball (White)
      ctx.fillStyle = ball.color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pentagon pattern outline
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 1.2, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [round.status, goalOverlay, noGoalOverlay, match.home_team, match.away_team]);

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

    socket.emit('lastsecond:bet:place', {
      userId: user.id,
      email: user.email,
      amount: parseFloat(betAmount),
      type: betType,
      autoCashout: betType === 'goal' && autoCashout ? parseFloat(autoCashout) : null
    });
  };

  const handleCashout = () => {
    if (!socket || !socket.connected || !myBet || myBet.status !== 'placed') return;
    socket.emit('lastsecond:bet:cashout', { roundId: round.roundId });
  };

  const isKet = user?.active_currency === 'KET';
  const currencyLabel = isKet ? 'KET' : 'HTG';

  return (
    <div className="flex flex-col space-y-6 max-w-3xl mx-auto w-full py-4 animate-fade-in relative px-2">
      {/* Return Button */}
      <button 
        onClick={onBackToLobby} 
        className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-xs font-bold bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl w-fit transition-all cursor-pointer hover:-translate-x-0.5"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour au Lobby</span>
      </button>

      {/* Compact simulated match pitch canvas widget */}
      <div className="relative w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 shadow-2xl flex flex-col justify-between max-h-[300px]">
        
        {/* Top Scoreboard Panel */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800/80 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-lg backdrop-blur-md flex items-center space-x-1.5 sm:space-x-3 z-20 text-[10px] sm:text-xs font-bold text-white select-none whitespace-nowrap">
          <span className="text-slate-400 font-medium">{match.home_team.toUpperCase().substring(0, 3)}</span>
          <span className="font-mono text-indigo-400 text-xs sm:text-sm font-black bg-slate-950/80 px-1.5 sm:px-2 py-0.5 rounded-md border border-slate-850 inline-block whitespace-nowrap">
            {match.score_home}:{match.score_away}
          </span>
          <span className="text-slate-400 font-medium">{match.away_team.toUpperCase().substring(0, 3)}</span>
          
          {/* Live Minute Pill */}
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-mono font-black flex items-center space-x-1 whitespace-nowrap ${
            match.status === 'live' 
              ? 'bg-rose-950 border border-rose-500/20 text-rose-400 animate-pulse'
              : 'bg-slate-850 border border-slate-700/20 text-slate-400'
          }`}>
            <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-current mr-0.5"></span>
            <span>{getFormattedMatchTime()}</span>
          </span>
        </div>

        {/* Canvas element */}
        <canvas 
          ref={canvasRef} 
          style={{ width: '100%', height: '220px', display: 'block' }}
        />

        {/* Middle Overlay (Status/Multiplier) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          {round.status === 'waiting' && (
            <div className="flex flex-col items-center justify-center text-center space-y-1 bg-slate-900/50 p-3 rounded-2xl border border-slate-850/20 backdrop-blur-sm">
              <h3 className="font-display font-black text-xs sm:text-sm text-slate-200 tracking-wider uppercase">
                OUVERTURE DES PARIS
              </h3>
              <p className="text-indigo-400 text-[10px] sm:text-xs font-mono font-black animate-pulse">
                PROCHAIN ROUND DANS {round.countdown}s
              </p>
            </div>
          )}

          {round.status === 'ticking' && (
            <div className="flex flex-col items-center justify-center text-center animate-fade-in select-none">
              <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-wide drop-shadow-[0_0_10px_rgba(99,102,241,0.4)]">
                {tickingMultiplier.toFixed(2)}x
              </h1>
              <p className="text-slate-400 text-[8px] sm:text-[9px] uppercase tracking-widest font-semibold mt-1">
                MISES EN COURS : <span className="text-indigo-400 font-black">{round.activeBetsCount}</span>
              </p>
            </div>
          )}

          {round.status === 'idle' && (
            <div className="flex flex-col items-center justify-center text-center space-y-1 bg-slate-900/50 p-3 rounded-2xl border border-slate-850/20 backdrop-blur-sm">
              <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-widest font-bold">CHARGEMENT...</p>
            </div>
          )}

          {/* Exploding Goal Overlay (Win) */}
          {goalOverlay && (
            <div className="absolute inset-0 bg-emerald-950/85 flex flex-col items-center justify-center backdrop-blur-sm z-30 animate-fade-in">
              <div className="bg-emerald-500 p-2.5 rounded-full text-white mb-1.5 shadow-lg shadow-emerald-500/20">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6 animate-bounce" />
              </div>
              <h3 className="font-display font-black text-lg sm:text-2xl text-emerald-400 tracking-wide uppercase">
                BUT !!!
              </h3>
              <p className="text-slate-200 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                Buteur : <span className="text-white font-black">{goalOverlay.scorer.toUpperCase()}</span>
              </p>
              <p className="text-white text-xs sm:text-base font-bold">Crashed @ {goalOverlay.multiplier.toFixed(2)}x</p>
            </div>
          )}

          {/* Red No-Goal Overlay (Lose) */}
          {noGoalOverlay && (
            <div className="absolute inset-0 bg-rose-950/85 flex flex-col items-center justify-center backdrop-blur-sm z-30 animate-fade-in">
              <div className="bg-rose-500 p-2.5 rounded-full text-white mb-1.5 shadow-lg shadow-rose-500/20">
                <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 animate-bounce" />
              </div>
              <h3 className="font-display font-black text-lg sm:text-2xl text-rose-500 tracking-wide uppercase">
                FIN DU MATCH
              </h3>
              <p className="text-slate-200 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                Aucun but marqué dans la fenêtre.
              </p>
              <p className="text-white text-xs sm:text-base font-bold">Crashed @ {noGoalOverlay.multiplier.toFixed(2)}x</p>
            </div>
          )}
        </div>

        {/* Visual Confetti / Success Overlay for Cashout */}
        {cashoutSuccess && !goalOverlay && !noGoalOverlay && (
          <div className="absolute bottom-3 right-3 bg-emerald-950/90 border border-emerald-500/30 p-2.5 rounded-xl flex items-center space-x-2.5 shadow-lg backdrop-blur-md animate-slide-up z-20">
            <div className="bg-emerald-500 p-1.5 rounded-lg text-white">
              <Award className="h-4 w-4" />
            </div>
            <div className="text-left leading-tight">
              <span className="text-[8px] text-emerald-400 uppercase tracking-widest font-black block">Encaissement validé</span>
              <span className="font-mono text-xs font-bold text-white block">+{cashoutSuccess.payout.toFixed(0)} {currencyLabel}</span>
              <span className="text-[9px] text-slate-400 block">Bloqué à {cashoutSuccess.multiplier.toFixed(2)}x</span>
            </div>
          </div>
        )}

        {/* Bottom Extra Info Bar */}
        <div className="absolute bottom-2 left-3 flex items-center space-x-3 text-[9px] font-semibold text-slate-400/80 z-20 select-none bg-slate-950/60 px-2 py-0.5 rounded-full border border-slate-900/40">
          <span>Corners: <strong className="text-slate-200">{match.corners}</strong></span>
          <span>Cartons: <strong className="text-amber-500">{match.yellow_cards} 🟨</strong></span>
        </div>
        
        <div className="absolute bottom-2 right-3 text-[8px] font-mono text-slate-500 z-20 select-none bg-slate-950/60 px-2 py-0.5 rounded-full border border-slate-900/40">
          Hash: {round.seedHash ? round.seedHash.substring(0, 10) + '...' : 'Calcul...'}
        </div>

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
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm tracking-widest transition-all duration-150 transform active:scale-95 glow-emerald animate-shake cursor-pointer animate-pulse"
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

      {/* Recent History Pill Bar */}
      <div className="glass-panel p-4 rounded-3xl flex flex-col space-y-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <History className="h-3.5 w-3.5" />
          <span>Historique des Rounds</span>
        </h4>
        <div className="flex items-center space-x-2 overflow-x-auto pb-1.5 select-none">
          {round.history.length === 0 ? (
            <span className="text-[10px] text-slate-500 italic">Aucun round enregistré</span>
          ) : (
            round.history.map((val, idx) => (
              <span 
                key={idx} 
                className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border flex items-center space-x-1 shrink-0 ${
                  val.type === 'goal' 
                    ? 'bg-emerald-950/60 border-emerald-500/20 text-emerald-400' 
                    : 'bg-rose-950/60 border-rose-500/20 text-rose-400'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                <span>{val.multiplier.toFixed(2)}x {val.type === 'goal' ? 'BUT' : 'FIN'}</span>
              </span>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
