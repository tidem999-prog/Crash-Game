import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, Award, Clock, Coins, User, Compass, History, Trophy, Lock, Play, Flame, HelpCircle,
  Volume2, VolumeX
} from 'lucide-react';
import { 
  initAudio, playBmBetClick, playTireScreech, startBmEngineSound, 
  updateBmEnginePitch, stopBmEngineSound, playBustedSound, playBmCashout, 
  getMuted, setMuted 
} from '../utils/audio';

export default function BloodmoneyGame({ socket, setSelectedGame }) {
  const { user, refreshBalance, updateBalance } = useAuth();
  
  // Game states
  const [gameState, setGameState] = useState('waiting'); // 'waiting', 'running', 'crashed'
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown] = useState(10);
  const [seedHash, setSeedHash] = useState('');
  const [revealedSeed, setRevealedSeed] = useState('');
  const [gameHistory, setGameHistory] = useState([]);
  const [activeBets, setActiveBets] = useState([]);

  // Betting states
  const [betAmount, setBetAmount] = useState(10);
  const [selectedRoute, setSelectedRoute] = useState('alley'); // 'alley', 'rooftop', 'tunnel'
  const [autoCashout, setAutoCashout] = useState('');
  const [myBet, setMyBet] = useState(null); // null, { amount, status: 'placed'/'cashed_out'/'lost', route }
  const [betError, setBetError] = useState('');
  const [cashoutResult, setCashoutResult] = useState(null); // { payout, multiplier }

  // Sound States
  const [isAudioMuted, setIsAudioMuted] = useState(getMuted());

  const handleMuteToggle = () => {
    const muted = !isAudioMuted;
    setIsAudioMuted(muted);
    setMuted(muted);
    if (!muted && gameState === 'running') {
      startBmEngineSound();
      updateBmEnginePitch(multiplier);
    }
  };

  useEffect(() => {
    const handleGesture = () => {
      initAudio();
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('touchstart', handleGesture);
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopBmEngineSound();
    };
  }, []);

  // Canvas Refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const animationStateRef = useRef({
    elapsedTime: 0,
    runnerFrame: 0,
    bgX: 0,
    skylineX: 0,
    streetX: 0,
    policeProgress: 0,
    shakeIntensity: 0,
    particles: []
  });

  // Keep track of socket id
  const socketIdRef = useRef(null);

  // 1. WebSocket Subscriptions
  useEffect(() => {
    if (!socket) return;

    socketIdRef.current = socket.id;

    socket.on('game:starting', (data) => {
      setGameState('waiting');
      setCountdown(data.countdown);
      setSeedHash(data.seedHash);
      setRevealedSeed('');
      setCashoutResult(null);
      setBetError('');
      
      stopBmEngineSound();

      // Reset runner animation
      animationStateRef.current.policeProgress = 0;
      animationStateRef.current.shakeIntensity = 0;
      animationStateRef.current.particles = [];
      
      // Reset my bet if new round starts
      if (data.countdown === 10) {
        setMyBet(null);
      }
    });

    socket.on('game:started', (data) => {
      setGameState('running');
      setCountdown(0);
      setMultiplier(1.00);

      playTireScreech();
      startBmEngineSound();
    });

    socket.on('game:tick', (data) => {
      setMultiplier(data.multiplier);
      updateBmEnginePitch(data.multiplier);

      // Map progress to 0-1 based on expected crash values (clamped to 100%)
      const estimatedMax = 15.00;
      const progress = Math.min(data.multiplier / estimatedMax, 1.00);
      animationStateRef.current.policeProgress = progress;
      
      if (data.multiplier >= 10) {
        animationStateRef.current.shakeIntensity = Math.min((data.multiplier - 10) * 0.5, 5.0);
      }
    });

    socket.on('game:crashed', (data) => {
      setGameState('crashed');
      setMultiplier(data.crashPoint);
      setRevealedSeed(data.serverSeed);
      refreshBalance();

      playBustedSound();

      // Trigger heavy shake & explosion particles
      animationStateRef.current.shakeIntensity = 12.0;
      const canvas = canvasRef.current;
      const rx = canvas ? canvas.width * 0.65 : 380;
      const ry = canvas ? (canvas.height - 140) - 30 : 170;
      for (let i = 0; i < 35; i++) {
        animationStateRef.current.particles.push({
          x: rx + (Math.random() - 0.5) * 50,
          y: ry + (Math.random() - 0.5) * 50,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.7) * 12,
          size: Math.random() * 8 + 3,
          color: Math.random() > 0.5 ? '#ef4444' : '#f59e0b',
          alpha: 1.0
        });
      }

      if (myBet && myBet.status === 'placed') {
        setMyBet(prev => prev ? { ...prev, status: 'lost' } : null);
      }
    });

    socket.on('bet:success', (data) => {
      setMyBet({
        amount: data.betAmount,
        route: selectedRoute,
        status: 'placed'
      });
      updateBalance(data.newBalance, user?.active_currency || 'HTG');
      setBetError('');
    });

    socket.on('bet:result', (data) => {
      if (data.status === 'won') {
        setMyBet(prev => prev ? { ...prev, status: 'cashed_out', payout: data.payout, multiplier: data.multiplier } : null);
        setCashoutResult({ payout: data.payout, multiplier: data.multiplier });
        updateBalance(data.newBalance, user?.active_currency || 'HTG');
        playBmCashout();
      } else if (data.status === 'lost') {
        setMyBet(prev => prev ? { ...prev, status: 'lost' } : null);
        setBetError(data.message || 'Vous avez été arrêté.');
      } else if (data.status === 'refunded') {
        setMyBet(prev => prev ? { ...prev, status: 'refunded', refundAmount: data.refundAmount } : null);
        updateBalance(data.newBalance, user?.active_currency || 'HTG');
        setBetError(`Remboursement partiel (Tunnel) : +${data.refundAmount} ${user?.active_currency || 'HTG'}`);
      }
    });

    socket.on('bet:error', (msg) => {
      setBetError(msg);
    });

    socket.on('game:state_update', (data) => {
      setGameHistory(data.history || []);
      setActiveBets(data.activeBetsList || []);
      if (data.status) {
        setGameState(data.status);
        setMultiplier(parseFloat(data.multiplier));
        setCountdown(data.countdown);
      }
    });

    // Request initial state sync
    socket.emit('game:request_state');

    return () => {
      socket.off('game:starting');
      socket.off('game:started');
      socket.off('game:tick');
      socket.off('game:crashed');
      socket.off('bet:success');
      socket.off('bet:result');
      socket.off('bet:error');
      socket.off('game:state_update');
    };
  }, [socket, selectedRoute, myBet]);

  useEffect(() => {
    if (user) {
      if (user.active_currency === 'KET') {
        setBetAmount(100);
      } else {
        setBetAmount(10);
      }
    }
  }, [user?.active_currency]);

  // 2. Betting Handlers
  const handlePlaceBet = () => {
    if (!socket || !socket.connected) return;
    playBmBetClick();
    const isKet = user?.active_currency === 'KET';
    const minBet = isKet ? 100 : 10;
    const currencyLabel = isKet ? 'KET' : 'HTG';
    const currentBalance = isKet ? (user?.ket_balance || 0) : (user?.balance || 0);

    if (betAmount < minBet) return setBetError(`La mise minimale est de ${minBet} ${currencyLabel}.`);
    if (betAmount > currentBalance) return setBetError('Solde insuffisant.');

    socket.emit('bet:place', {
      userId: user.id,
      email: user.email,
      amount: parseFloat(betAmount),
      route: selectedRoute,
      autoCashout: autoCashout ? parseFloat(autoCashout) : null
    });
  };

  const handleCashout = () => {
    if (!socket || !socket.connected || !myBet || myBet.status !== 'placed') return;
    socket.emit('bet:cashout', { userId: user.id });
  };

  // 3. Canvas Parallax Animation Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = window.innerWidth < 768 ? 240 : 340;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const state = animationStateRef.current;

      // Camera shake
      ctx.save();
      if (state.shakeIntensity > 0) {
        const dx = (Math.random() - 0.5) * state.shakeIntensity;
        const dy = (Math.random() - 0.5) * state.shakeIntensity;
        ctx.translate(dx, dy);
        state.shakeIntensity = Math.max(0, state.shakeIntensity - 0.2);
      }

      ctx.clearRect(0, 0, w, h);

      // Speed coefficient based on multiplier
      const speedCoeff = gameState === 'running' ? Math.min(multiplier * 0.8, 8.0) : gameState === 'waiting' ? 0.3 : 0;

      // 1. SKY / BACKGROUND
      ctx.fillStyle = '#090d16'; // Deep space dark
      ctx.fillRect(0, 0, w, h);

      // Draw moon
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(w - 120, 70, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(w - 135, 60, 34, 0, Math.PI * 2);
      ctx.fill();

      // 2. PARALLAX SKYLINE (Layer 1 - slow)
      state.skylineX = (state.skylineX - speedCoeff * 0.4) % 600;
      ctx.fillStyle = '#111827';
      for (let i = 0; i < 4; i++) {
        const sx = state.skylineX + i * 200;
        ctx.fillRect(sx, h - 260, 80, 140);
        ctx.fillRect(sx + 80, h - 220, 60, 100);
        ctx.fillRect(sx + 140, h - 290, 40, 170);
      }

      // 3. PARALLAX BUILDINGS (Layer 2 - medium)
      state.bgX = (state.bgX - speedCoeff * 1.5) % 800;
      for (let i = 0; i < 5; i++) {
        const bx = state.bgX + i * 240;
        ctx.fillStyle = '#1e1b4b'; // Dark violet building outline
        ctx.fillRect(bx, h - 235, 140, 100);
        ctx.fillRect(bx + 140, h - 215, 80, 80);

        // Neon signs
        if (i % 2 === 0) {
          ctx.fillStyle = i === 2 ? '#a855f7' : '#ec4899'; // Purple / Pink
          ctx.shadowBlur = 8;
          ctx.shadowColor = ctx.fillStyle;
          ctx.fillRect(bx + 40, h - 205, 8, 40);
          ctx.fillRect(bx + 60, h - 205, 8, 40);
          ctx.shadowBlur = 0; // reset
        }
      }

      // 4. STREET (Layer 3 - fast)
      const streetY = h - 140; // Shifted upwards so street & cars are fully visible above HUD overlay
      ctx.fillStyle = '#0f172a'; // Road base
      ctx.fillRect(0, streetY, w, 80);

      // Sidewalk edge
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, streetY - 6, w, 6);

      // Dash lines
      state.streetX = (state.streetX - speedCoeff * 5) % 120;
      ctx.fillStyle = '#fbbf24'; // Yellow road markers
      for (let i = -1; i < (w / 120) + 2; i++) {
        ctx.fillRect(state.streetX + i * 120, streetY + 30, 45, 6);
      }

      // 5. ROAD BLOCKS & NEON POLES
      // Left side police car
      const runX = w * 0.65; // Make runner position relative to width
      const polX = w * 0.15 + state.policeProgress * (runX - w * 0.15 - 90); // Police car moves closer to runner, relative to width
      const polY = streetY - 26;

      if (gameState === 'running' || gameState === 'crashed') {
        // Draw Police car (Cruiser styling: black body with white door to stand out from road, facing right)
        ctx.fillStyle = '#1e293b'; // slate/dark body
        ctx.fillRect(polX, polY, 70, 20);
        ctx.fillStyle = '#f8fafc'; // white door panel (mirrored to front door)
        ctx.fillRect(polX + 35, polY, 20, 20);
        ctx.fillStyle = '#38bdf8'; // glass cabin (mirrored to face right)
        ctx.beginPath();
        ctx.moveTo(polX + 10, polY);
        ctx.lineTo(polX + 15, polY - 12);
        ctx.lineTo(polX + 35, polY - 12);
        ctx.lineTo(polX + 50, polY);
        ctx.closePath();
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(polX + 15, polY + 20, 9, 0, Math.PI * 2);
        ctx.arc(polX + 55, polY + 20, 9, 0, Math.PI * 2);
        ctx.fill();

        // Sirens (Flashing red and blue)
        const flash = Math.floor(Date.now() / 150) % 2 === 0;
        ctx.fillStyle = flash ? '#ef4444' : '#3b82f6';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(polX + 32, polY - 14, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 6. RUNNER CHARACTER
      if (gameState === 'running' || gameState === 'waiting') {
        const runY = streetY - 30;

        // Running arm/leg physics
        state.runnerFrame += speedCoeff * 0.15;
        const phase = state.runnerFrame;
        const legSwing = Math.sin(phase) * 16;
        const armSwing = Math.cos(phase) * 14;

        ctx.strokeStyle = '#e2e8f0'; // white body lines
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Head
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(runX, runY - 26, 7, 0, Math.PI * 2);
        ctx.fill();

        // Body / Torso
        ctx.beginPath();
        ctx.moveTo(runX, runY - 19);
        ctx.lineTo(runX - 2, runY - 5);
        ctx.stroke();

        // Leg 1 (Front)
        ctx.beginPath();
        ctx.moveTo(runX - 2, runY - 5);
        ctx.lineTo(runX + legSwing, runY + 8);
        ctx.lineTo(runX + legSwing + 4, runY + 18);
        ctx.stroke();

        // Leg 2 (Back)
        ctx.beginPath();
        ctx.moveTo(runX - 2, runY - 5);
        ctx.lineTo(runX - legSwing, runY + 6);
        ctx.lineTo(runX - legSwing - 2, runY + 18);
        ctx.stroke();

        // Arm 1 (Front)
        ctx.beginPath();
        ctx.moveTo(runX - 1, runY - 18);
        ctx.lineTo(runX + armSwing + 6, runY - 10);
        ctx.lineTo(runX + armSwing + 12, runY - 4);
        ctx.stroke();

        // Arm 2 (Back)
        ctx.beginPath();
        ctx.moveTo(runX - 1, runY - 18);
        ctx.lineTo(runX - armSwing - 6, runY - 12);
        ctx.lineTo(runX - armSwing - 10, runY - 6);
        ctx.stroke();

        // Sweat / Steam particles (Stress)
        if (gameState === 'running' && multiplier > 3.0 && Math.random() < 0.15) {
          state.particles.push({
            x: runX - 10,
            y: runY - 15 - Math.random() * 20,
            vx: -Math.random() * 3 - 2,
            vy: -Math.random() * 1.5 - 0.5,
            size: Math.random() * 2.5 + 1,
            color: '#a5f3fc', // sweat drops cyan
            alpha: 0.8
          });
        }
      }

      // 7. PARTICLES DRAWER
      state.particles.forEach((p, idx) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.025;

        if (p.alpha <= 0) {
          state.particles.splice(idx, 1);
        }
      });

      // 8. BUSTED STAMP (crashed state)
      if (gameState === 'crashed') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)'; // Red screen flash
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 20;
        ctx.font = '900 42px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BUSTED !', w / 2, h / 2 - 25);
        ctx.restore();
      }

      ctx.restore();
      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [gameState, multiplier]);

  const getRouteMultiplier = (baseMult, route) => {
    if (route === 'rooftop') return 1.0 + (baseMult - 1.0) * 1.3;
    if (route === 'tunnel') return 1.0 + (baseMult - 1.0) * 0.75;
    return baseMult;
  };
  const routeMult = getRouteMultiplier(multiplier, selectedRoute);
  const estimatedPayout = (parseFloat(betAmount) * routeMult).toFixed(2);

  return (
    <div className="space-y-6">
      
      {/* Back button */}
      <button 
        onClick={() => setSelectedGame(null)} 
        className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-xs font-bold bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl w-fit transition-colors cursor-pointer"
      >
        <span>← Retour au Lobby</span>
      </button>

      {/* Visual Interactive Screen Container */}
      <div className="relative glass-panel rounded-3xl overflow-hidden bg-slate-950/80 border border-slate-900 shadow-2xl">
        
        {/* History values bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center space-x-2 overflow-x-auto pb-1.5 z-20">
          {gameHistory.map((val, idx) => (
            <span 
              key={idx} 
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                val >= 2.00 ? 'bg-purple-950/60 border-purple-500/20 text-purple-400' : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}
            >
              {val.toFixed(2)}x
            </span>
          ))}
        </div>

        {/* Big live multiplier text display */}
        {gameState === 'running' && (
          <div className="absolute top-20 sm:top-28 left-0 right-0 text-center z-20">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black font-display tracking-tight text-white drop-shadow-md select-none animate-pulse-slow">
              {multiplier.toFixed(2)}x
            </h1>
          </div>
        )}

        {/* Lobby preparations overlay */}
        {gameState === 'waiting' && (
          <div className="absolute inset-0 bg-slate-950/65 flex flex-col items-center justify-center backdrop-blur-md z-30">
            <div className="bg-indigo-600/10 p-3 rounded-full text-indigo-400 border border-indigo-500/20 mb-3">
              <Clock className="h-7 w-7 animate-spin" />
            </div>
            <h3 className="font-display font-black text-xl text-white">DÉPART DANS {countdown}s</h3>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Choisissez votre route et préparez-vous à courir</p>
          </div>
        )}

        {/* Victory/Cashout overlay */}
        {cashoutResult && (
          <div className="absolute inset-0 bg-emerald-950/80 flex flex-col items-center justify-center backdrop-blur-md z-30 animate-fade-in">
            <div className="bg-emerald-600 p-4 rounded-full text-white mb-3 shadow-lg">
              <Award className="h-8 w-8 animate-bounce" />
            </div>
            <h3 className="font-display font-black text-3xl text-emerald-300">RÉUSSI !</h3>
            <p className="text-white text-lg font-bold">+{cashoutResult.payout} {user?.active_currency || 'HTG'}</p>
            <p className="text-emerald-450 text-xs mt-1">Échappé à {cashoutResult.multiplier}x</p>
          </div>
        )}

        {/* Interactive Game Canvas */}
        <canvas ref={canvasRef} className="block w-full h-[240px] md:h-[340px]" />

        {/* Mute/Unmute speaker icon button */}
        <button 
          onClick={handleMuteToggle}
          className="absolute bottom-3 right-3 z-30 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md"
        >
          {isAudioMuted ? (
            <VolumeX className="h-4 w-4 text-red-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-emerald-400" />
          )}
        </button>

      </div>

      {/* Control panel below visual screen container */}
      <div className="glass-panel p-4 sm:p-5 rounded-3xl space-y-4">
        {/* Danger Bar (Police Approach) - Placed below canvas to not overlap runner & car */}
        {gameState === 'running' && (
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between animate-fade-in">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alerte Police</span>
            <div className="flex-1 mx-3 h-2 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800">
              <div 
                className={`h-full transition-all duration-300 rounded-full ${
                  animationStateRef.current.policeProgress > 0.8 ? 'bg-red-500 animate-pulse' :
                  animationStateRef.current.policeProgress > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${animationStateRef.current.policeProgress * 100}%` }}
              ></div>
            </div>
            <span className={`text-[10px] font-black ${
              animationStateRef.current.policeProgress > 0.8 ? 'text-red-500 animate-ping' :
              animationStateRef.current.policeProgress > 0.5 ? 'text-amber-500' : 'text-emerald-500'
            }`}>
              {animationStateRef.current.policeProgress > 0.8 ? 'CRITIQUE' :
               animationStateRef.current.policeProgress > 0.5 ? 'PROCHE' : 'SÉCURISÉ'}
            </span>
          </div>
        )}

        {/* HUD input bar */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/90 p-3 rounded-2xl border border-slate-800 shadow-inner">
          {/* Bet input */}
          <div className="flex flex-col justify-center">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Mise ({user?.active_currency || 'HTG'})
            </label>
            <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-900/40">
              <span className="bg-slate-900 px-2 sm:px-3 py-2 text-slate-500 text-xs font-bold flex items-center">
                {user?.active_currency || 'HTG'}
              </span>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => {
                  const limit = user?.active_currency === 'KET' ? 100 : 10;
                  setBetAmount(Math.max(limit, parseInt(e.target.value) || 0));
                }}
                disabled={myBet && myBet.status === 'placed'}
                className="block w-full px-2 py-1 sm:px-3 sm:py-2 bg-transparent text-slate-200 focus:outline-none text-xs sm:text-sm font-bold"
              />
              <button 
                onClick={() => {
                  const limit = user?.active_currency === 'KET' ? 100 : 10;
                  setBetAmount(prev => Math.max(limit, Math.round((parseInt(prev) || 0) / 2)));
                }}
                disabled={myBet && myBet.status === 'placed'}
                className="bg-slate-900 hover:bg-slate-800 border-l border-slate-800 px-1.5 text-[10px] font-bold text-slate-400 cursor-pointer"
              >
                /2
              </button>
              <button 
                onClick={() => setBetAmount(prev => (parseInt(prev) || 0) * 2)}
                disabled={myBet && myBet.status === 'placed'}
                className="bg-slate-900 hover:bg-slate-800 border-l border-slate-800 px-1.5 text-[10px] font-bold text-slate-400 cursor-pointer"
              >
                x2
              </button>
            </div>
          </div>

          {/* Auto Cashout */}
          <div className="flex flex-col justify-center">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Auto Cash Out</label>
            <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-900/40">
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 2.0"
                value={autoCashout}
                onChange={(e) => setAutoCashout(e.target.value)}
                disabled={myBet && myBet.status === 'placed'}
                className="block w-full px-3 py-2 bg-transparent text-slate-200 focus:outline-none text-xs sm:text-sm font-bold"
              />
              <span className="bg-slate-900 px-3 py-2 text-slate-500 text-xs font-bold flex items-center">x</span>
            </div>
          </div>
        </div>

        {/* Strategic Route Selection Bar */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Choisir votre Route Strategique</label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { id: 'alley', name: 'Alley', desc: 'Risque moyen, gain standard (1.0x)' },
              { id: 'rooftop', name: 'Rooftop', desc: 'Risque élevé, gain 1.3x, arrestation 85%' },
              { id: 'tunnel', name: 'Tunnel', desc: 'Risque faible, gain 0.75x, 30% remboursé' }
            ].map((route) => (
              <button
                key={route.id}
                type="button"
                disabled={myBet && myBet.status === 'placed'}
                onClick={() => setSelectedRoute(route.id)}
                className={`p-2 sm:p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  selectedRoute === route.id 
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)]' 
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                } disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                <span className="font-bold text-[10px] sm:text-xs">{route.name}</span>
                <span className="text-[8px] sm:text-[9px] text-slate-500 mt-1 font-semibold leading-tight line-clamp-2 sm:line-clamp-none">{route.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div className="w-full flex flex-col justify-center pt-2">
          {myBet && myBet.status === 'placed' && gameState === 'running' ? (
            <button
              onClick={handleCashout}
              className="w-full py-3.5 sm:py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-base sm:text-lg tracking-wider transition-all transform active:scale-98 glow-emerald cursor-pointer"
            >
              ÉCHAPPER À LA POLICE (CASH OUT)
              <span className="block text-xs font-mono font-bold text-slate-900/70 mt-0.5">
                {estimatedPayout} {user?.active_currency || 'HTG'} ({routeMult.toFixed(2)}x)
              </span>
            </button>
          ) : myBet && myBet.status === 'placed' ? (
            <button
              disabled
              className="w-full py-3.5 sm:py-4 bg-emerald-600 text-slate-950 font-black rounded-xl font-bold text-sm select-none border border-emerald-500 glow-emerald"
            >
              PRÊT À L'ACTION
              <span className="block text-[10px] font-bold text-slate-900/80 mt-0.5">
                Départ imminent de la course...
              </span>
            </button>
          ) : (
            <button
              onClick={handlePlaceBet}
              disabled={gameState !== 'waiting'}
              className="w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-indigo cursor-pointer"
            >
              COMMENCER LA COURSE (PLACER LE PARI)
              <span className="block text-xs font-mono font-normal text-indigo-200 mt-0.5">
                Mise: {betAmount} {user?.active_currency || 'HTG'} | Route: {selectedRoute.toUpperCase()} {autoCashout ? `@ ${autoCashout}x` : ''}
              </span>
            </button>
          )}

          {betError && (
            <p className="text-red-500 text-xs mt-2 text-center font-bold animate-shake">{betError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
