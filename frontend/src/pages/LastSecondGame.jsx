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
  const [showResultOverlay, setShowResultOverlay] = useState(false);

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
          setShowResultOverlay(false);
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
      setRound(prev => ({
        ...prev,
        elapsed: data.elapsed
      }));
    });

    // Round ended with a GOAL
    socket.on('lastsecond:round:closed:goal', (data) => {
      setGoalOverlay({
        scorer: data.scorer,
        multiplier: data.multiplier
      });
      setTimeout(() => {
        setShowResultOverlay(true);
      }, 2000);
      refreshBalance();
    });

    // Round ended with NO GOAL
    socket.on('lastsecond:round:closed:nogoal', (data) => {
      setNoGoalOverlay({
        multiplier: data.multiplier
      });
      setTimeout(() => {
        setShowResultOverlay(true);
      }, 2000);
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
        setBetAmount(100);
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

    // Initialize 11 players for Home (Blue) in a 4-4-2 layout
    const GK1_COLOR = '#fbbf24'; // Yellow GK shirt
    const team1 = [
      { id: 1, label: '1', baseX: 45, baseY: 110, x: 45, y: 110, targetX: 45, targetY: 110, color: GK1_COLOR, role: 'gk' },
      { id: 2, label: '2', baseX: 90, baseY: 50, x: 90, y: 50, targetX: 90, targetY: 50, color: '#3b82f6', role: 'df' },
      { id: 3, label: '4', baseX: 80, baseY: 90, x: 80, y: 90, targetX: 80, targetY: 90, color: '#3b82f6', role: 'df' },
      { id: 4, label: '5', baseX: 80, baseY: 130, x: 80, y: 130, targetX: 80, targetY: 130, color: '#3b82f6', role: 'df' },
      { id: 5, label: '3', baseX: 90, baseY: 170, x: 90, y: 170, targetX: 90, targetY: 170, color: '#3b82f6', role: 'df' },
      { id: 6, label: '6', baseX: 170, baseY: 40, x: 170, y: 40, targetX: 170, targetY: 40, color: '#3b82f6', role: 'md' },
      { id: 7, label: '8', baseX: 160, baseY: 85, x: 160, y: 85, targetX: 160, targetY: 85, color: '#3b82f6', role: 'md' },
      { id: 8, label: '10', baseX: 160, baseY: 135, x: 160, y: 135, targetX: 160, targetY: 135, color: '#3b82f6', role: 'md' },
      { id: 9, label: '7', baseX: 170, baseY: 180, x: 170, y: 180, targetX: 170, targetY: 180, color: '#3b82f6', role: 'md' },
      { id: 10, label: '9', baseX: 250, baseY: 85, x: 250, y: 85, targetX: 250, targetY: 85, color: '#3b82f6', role: 'fw' },
      { id: 11, label: '11', baseX: 250, baseY: 135, x: 250, y: 135, targetX: 250, targetY: 135, color: '#3b82f6', role: 'fw' }
    ];

    // Initialize 11 players for Away (Red) in a 4-4-2 layout
    const GK2_COLOR = '#10b981'; // Green GK shirt
    const team2 = [
      { id: 1, label: '1', baseX: 555, baseY: 110, x: 555, y: 110, targetX: 555, targetY: 110, color: GK2_COLOR, role: 'gk' },
      { id: 2, label: '2', baseX: 510, baseY: 50, x: 510, y: 50, targetX: 510, targetY: 50, color: '#ef4444', role: 'df' },
      { id: 3, label: '4', baseX: 520, baseY: 90, x: 520, y: 90, targetX: 520, targetY: 90, color: '#ef4444', role: 'df' },
      { id: 4, label: '5', baseX: 520, baseY: 130, x: 520, y: 130, targetX: 520, targetY: 130, color: '#ef4444', role: 'df' },
      { id: 5, label: '3', baseX: 510, baseY: 170, x: 510, y: 170, targetX: 510, targetY: 170, color: '#ef4444', role: 'df' },
      { id: 6, label: '6', baseX: 430, baseY: 40, x: 430, y: 40, targetX: 430, targetY: 40, color: '#ef4444', role: 'md' },
      { id: 7, label: '8', baseX: 440, baseY: 85, x: 440, y: 85, targetX: 440, targetY: 85, color: '#ef4444', role: 'md' },
      { id: 8, label: '10', baseX: 440, baseY: 135, x: 440, y: 135, targetX: 440, targetY: 135, color: '#ef4444', role: 'md' },
      { id: 9, label: '7', baseX: 430, baseY: 180, x: 430, y: 180, targetX: 430, targetY: 180, color: '#ef4444', role: 'md' },
      { id: 10, label: '9', baseX: 350, baseY: 85, x: 350, y: 85, targetX: 350, targetY: 85, color: '#ef4444', role: 'fw' },
      { id: 11, label: '11', baseX: 350, baseY: 135, x: 350, y: 135, targetX: 350, targetY: 135, color: '#ef4444', role: 'fw' }
    ];

    const ball = { x: 300, y: 110, targetX: 300, targetY: 110, size: 4.5, color: '#ffffff' };
    let frameCount = 0;
    let ballInNet = false;
    let netVibration = 0;

    // Shot initial values
    let shotStartX = 300;
    let shotStartY = 110;

    const animate = () => {
      frameCount++;

      // 1. Transition phase state check
      if (goalOverlay && phaseRef.current !== 'scoring') {
        phaseRef.current = 'scoring';
        const homeScored = goalOverlay.scorer === match.home_team;
        const shooter = homeScored ? team1[9] : team2[9]; // Striker takes the shot
        ball.x = shooter.x;
        ball.y = shooter.y;
        shotStartX = shooter.x;
        shotStartY = shooter.y;
        ball.targetX = homeScored ? 578 : 22;
        ball.targetY = 95 + Math.random() * 30; // Random height in the goal mouth
        ballInNet = false;
      } 
      else if (noGoalOverlay && phaseRef.current !== 'missing') {
        phaseRef.current = 'missing';
        const shootRight = Math.random() < 0.5;
        const shooter = shootRight ? team1[9] : team2[9]; // Missed shot
        ball.x = shooter.x;
        ball.y = shooter.y;
        shotStartX = shooter.x;
        shotStartY = shooter.y;
        ball.targetX = shootRight ? 595 : 5;
        ball.targetY = Math.random() < 0.5 ? 40 : 180; // Out of bounds
        ballInNet = false;
      }
      else if (!goalOverlay && !noGoalOverlay) {
        if (round.status === 'ticking') {
          phaseRef.current = 'dribbling';
        } else {
          phaseRef.current = 'idle';
        }
      }

      const phase = phaseRef.current;

      // 2. State specific updates
      if (phase === 'idle') {
        ball.targetX = 300;
        ball.targetY = 110;
        ball.x += (ball.targetX - ball.x) * 0.05;
        ball.y += (ball.targetY - ball.y) * 0.05;
        ballInNet = false;

        // Base idle pacing
        team1.forEach(p => {
          p.targetX = p.baseX + Math.sin(frameCount * 0.03 + p.id) * 6;
          p.targetY = p.baseY + Math.cos(frameCount * 0.02 + p.id) * 6;
        });
        team2.forEach(p => {
          p.targetX = p.baseX + Math.sin(frameCount * 0.035 + p.id) * 6;
          p.targetY = p.baseY + Math.cos(frameCount * 0.018 + p.id) * 6;
        });
      } 
      else if (phase === 'dribbling') {
        // Ball travels around midfield zone
        if (frameCount % 100 === 0) {
          ball.targetX = 180 + Math.random() * 240; // 180 to 420
          ball.targetY = 40 + Math.random() * 140;  // 40 to 180
        }
        ball.x += (ball.targetX - ball.x) * 0.05;
        ball.y += (ball.targetY - ball.y) * 0.05;
        ballInNet = false;

        // Goalkeepers track the ball height
        team1[0].targetY = Math.max(90, Math.min(130, ball.y));
        team2[0].targetY = Math.max(90, Math.min(130, ball.y));

        // Find closest players on each team to the ball (excluding GKs)
        let closestP1 = team1[9];
        let minDist1 = Infinity;
        team1.forEach((p, idx) => {
          if (idx > 0) {
            const dist = Math.hypot(p.x - ball.x, p.y - ball.y);
            if (dist < minDist1) { minDist1 = dist; closestP1 = p; }
          }
        });

        let closestP2 = team2[9];
        let minDist2 = Infinity;
        team2.forEach((p, idx) => {
          if (idx > 0) {
            const dist = Math.hypot(p.x - ball.x, p.y - ball.y);
            if (dist < minDist2) { minDist2 = dist; closestP2 = p; }
          }
        });

        // Other players pace around base coordinates
        team1.forEach((p, idx) => {
          if (idx > 0) {
            p.targetX = p.baseX + Math.sin(frameCount * 0.02 + p.id) * 8;
            p.targetY = p.baseY + Math.cos(frameCount * 0.015 + p.id) * 8;
          }
        });
        team2.forEach((p, idx) => {
          if (idx > 0) {
            p.targetX = p.baseX + Math.sin(frameCount * 0.025 + p.id) * 8;
            p.targetY = p.baseY + Math.cos(frameCount * 0.02 + p.id) * 8;
          }
        });

        // Both closest players run to challenge for the ball
        closestP1.targetX = ball.x - 6;
        closestP1.targetY = ball.y;
        closestP2.targetX = ball.x + 6;
        closestP2.targetY = ball.y;
      } 
      else if (phase === 'scoring') {
        ball.x += (ball.targetX - ball.x) * 0.15;
        ball.y += (ball.targetY - ball.y) * 0.15;

        const homeScored = goalOverlay?.scorer === match.home_team;
        const shooter = homeScored ? team1[9] : team2[9];
        const gk = homeScored ? team2[0] : team1[0];

        // Scorer celebrates / runs to follow shot
        shooter.targetX = ball.x - (homeScored ? 25 : -25);
        shooter.targetY = ball.y;

        // Opponent GK dives towards shot but misses
        gk.targetY = ball.targetY + (ball.targetY > 110 ? -15 : 15);
        gk.targetX = homeScored ? 562 : 38;

        // Rest of the teammates run towards scorer to celebrate!
        const winningTeam = homeScored ? team1 : team2;
        winningTeam.forEach((p, idx) => {
          if (p.id !== shooter.id && p.id > 1) {
            p.targetX = shooter.x + Math.sin(frameCount * 0.05 + p.id) * 20;
            p.targetY = shooter.y + Math.cos(frameCount * 0.05 + p.id) * 20;
          }
        });

        const distToGoal = Math.abs(ball.x - ball.targetX);
        if (distToGoal < 7) {
          ballInNet = true;
          netVibration = Math.sin(frameCount * 0.6) * 4.5;
        }
      } 
      else if (phase === 'missing') {
        ball.x += (ball.targetX - ball.x) * 0.12;
        ball.y += (ball.targetY - ball.y) * 0.12;
        ballInNet = false;

        // Run back to positions
        team1.forEach(p => { p.targetX = p.baseX; p.targetY = p.baseY; });
        team2.forEach(p => { p.targetX = p.baseX; p.targetY = p.baseY; });
      }

      // 3. Interpolate and clamp players coordinates
      team1.forEach(p => {
        p.x += (p.targetX - p.x) * 0.08;
        p.y += (p.targetY - p.y) * 0.08;
        p.x = Math.max(30, Math.min(570, p.x));
        p.y = Math.max(20, Math.min(200, p.y));
      });
      team2.forEach(p => {
        p.x += (p.targetX - p.x) * 0.08;
        p.y += (p.targetY - p.y) * 0.08;
        p.x = Math.max(30, Math.min(570, p.x));
        p.y = Math.max(20, Math.min(200, p.y));
      });

      // 4. DRAWING THE SOCCER PITCH
      ctx.clearRect(0, 0, 600, 220);

      // Alternating green stripes
      const numStripes = 8;
      const stripeWidth = 600 / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#14351f' : '#1a4027';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, 220);
      }

      // Pitch borders & lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(30, 20, 540, 180);

      // Center Line
      ctx.beginPath();
      ctx.moveTo(300, 20);
      ctx.lineTo(300, 200);
      ctx.stroke();

      // Center Circle
      ctx.beginPath();
      ctx.arc(300, 110, 35, 0, Math.PI * 2);
      ctx.stroke();

      // Center Spot
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(300, 110, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Penalty Areas
      ctx.strokeRect(30, 55, 50, 110);
      ctx.strokeRect(520, 55, 50, 110);

      // Penalty Spots
      ctx.beginPath();
      ctx.arc(80, 110, 1.5, 0, Math.PI * 2);
      ctx.arc(520, 110, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Goal Nets
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      
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

      // Clamp ball coordinates (pitch boundaries X:15 to 585, Y:15 to 205)
      ball.x = Math.max(15, Math.min(585, ball.x));
      ball.y = Math.max(15, Math.min(205, ball.y));

      // 5. DRAW ENTITIES
      // Draw Shadows
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      team1.forEach(p => {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 7.5, 7.5, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      team2.forEach(p => {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 7.5, 7.5, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.ellipse(ball.x, ball.y + 5.5, 4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Shot Trail in Scoring/Missing phases
      if (phase === 'scoring' || phase === 'missing') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(shotStartX, shotStartY);
        ctx.lineTo(ball.x, ball.y);
        ctx.stroke();

        // Draw Scorer Golden Indicator Crown
        const homeScored = phase === 'scoring' ? (goalOverlay?.scorer === match.home_team) : (ball.targetX > 300);
        const shooter = homeScored ? team1[9] : team2[9];
        
        ctx.fillStyle = '#fbbf24'; // Gold
        ctx.strokeStyle = '#d97706'; // Darker Gold border
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Draw a small 3-pointed crown above the shooter's jersey
        ctx.moveTo(shooter.x - 5, shooter.y - 13);
        ctx.lineTo(shooter.x - 3, shooter.y - 18);
        ctx.lineTo(shooter.x, shooter.y - 14);
        ctx.lineTo(shooter.x + 3, shooter.y - 18);
        ctx.lineTo(shooter.x + 5, shooter.y - 13);
        ctx.lineTo(shooter.x + 4, shooter.y - 11);
        ctx.lineTo(shooter.x - 4, shooter.y - 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Draw Team 1 players (Blue)
      team1.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Jersey text number
        ctx.fillStyle = p.color === GK1_COLOR ? '#111827' : '#ffffff';
        ctx.font = 'bold 7.5px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y);
      });

      // Draw Team 2 players (Red)
      team2.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Jersey text number
        ctx.fillStyle = p.color === GK2_COLOR ? '#111827' : '#ffffff';
        ctx.font = 'bold 7.5px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y);
      });

      // Draw Ball (White with details)
      ctx.fillStyle = ball.color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Ball pentagon texture
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Draw GOAL or NO GOAL overlay text directly on the canvas pitch grass
      if (phase === 'scoring' && ballInNet) {
        ctx.fillStyle = '#fbbf24'; // Gold
        ctx.font = '900 24px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('BUT !!!', 300, 95);
        ctx.fillText('BUT !!!', 300, 95);

        const winnerTeam = goalOverlay?.scorer || (ball.targetX > 300 ? match.home_team : match.away_team);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, system-ui';
        ctx.strokeText(`VAINQUEUR : ${winnerTeam.toUpperCase()}`, 300, 120);
        ctx.fillText(`VAINQUEUR : ${winnerTeam.toUpperCase()}`, 300, 120);
      } else if (phase === 'missing' && Math.abs(ball.x - ball.targetX) < 15) {
        ctx.fillStyle = '#ef4444'; // Red
        ctx.font = '900 20px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('PAS DE BUT !', 300, 110);
        ctx.fillText('PAS DE BUT !', 300, 110);
      }

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
    const currentBalance = isKet ? (user?.ket_balance || 0) : ((user?.balance || 0) + (user?.bonus_balance || 0) + (user?.locked_winnings || 0));
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
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800/80 px-3 sm:px-4 py-1.5 rounded-2xl shadow-lg backdrop-blur-md flex flex-col items-center justify-between z-20 text-[10px] sm:text-xs font-bold text-white select-none whitespace-nowrap relative">
          <div className="flex items-center space-x-1.5 sm:space-x-3">
            <span className={`font-medium flex items-center space-x-1 ${goalOverlay && goalOverlay.scorer === match.home_team ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
              {match.home_team.toUpperCase().substring(0, 3)}
              {goalOverlay && goalOverlay.scorer === match.home_team && <span className="text-[10px] animate-bounce">👑</span>}
            </span>
            <span className="font-mono text-indigo-400 text-xs sm:text-sm font-black bg-slate-950/80 px-1.5 sm:px-2 py-0.5 rounded-md border border-slate-850 inline-block whitespace-nowrap">
              {match.score_home}:{match.score_away}
            </span>
            <span className={`font-medium flex items-center space-x-1 ${goalOverlay && goalOverlay.scorer === match.away_team ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
              {goalOverlay && goalOverlay.scorer === match.away_team && <span className="text-[10px] animate-bounce">👑</span>}
              {match.away_team.toUpperCase().substring(0, 3)}
            </span>
            
            {/* Live Minute Pill */}
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-mono font-black flex items-center space-x-1 whitespace-nowrap ${
              match.status === 'live' 
                ? 'bg-rose-950 border border-rose-500/20 text-rose-400 animate-pulse'
                : 'bg-slate-850 border border-slate-700/20 text-slate-400'
            }`}>
              <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-current mr-0.5"></span>
              <span>{getFormattedMatchTime()}</span>
            </span>

            {/* Multiplier pill floating at the top right of the score panel! */}
            {round.status === 'ticking' && (
              <span className="absolute -top-3.5 -right-3.5 font-mono text-emerald-400 text-xs sm:text-sm font-black bg-emerald-950 border border-emerald-500/30 px-2 py-0.5 rounded-xl whitespace-nowrap animate-pulse shadow-md shadow-emerald-500/25">
                {tickingMultiplier.toFixed(2)}x
              </span>
            )}
          </div>

          {/* Mises en cours text under the score! */}
          {round.status === 'ticking' && (
            <div className="text-[8px] text-slate-400 font-medium uppercase tracking-widest mt-1">
              Mises en cours : <span className="text-indigo-400 font-black">{round.activeBetsCount}</span>
            </div>
          )}
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

          {round.status === 'idle' && (
            <div className="flex flex-col items-center justify-center text-center space-y-1 bg-slate-900/50 p-3 rounded-2xl border border-slate-850/20 backdrop-blur-sm">
              <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-widest font-bold">CHARGEMENT...</p>
            </div>
          )}

          {/* Exploding Goal Overlay (Win) */}
          {goalOverlay && showResultOverlay && (
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
              
              {/* User Bet Result inside the overlay */}
              {myBet && (myBet.status === 'won' || myBet.status === 'cashed_out') ? (
                <div className="mt-3 bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded-full text-xs sm:text-sm uppercase tracking-wider animate-pulse shadow-lg shadow-emerald-500/40">
                  🏆 GAGNANT ! +{(myBet.payout || (myBet.amount * (myBet.cashed_out_at || goalOverlay.multiplier))).toFixed(0)} {currencyLabel}
                </div>
              ) : myBet ? (
                <div className="mt-3 bg-rose-500 text-white font-black px-4 py-1.5 rounded-full text-xs sm:text-sm uppercase tracking-wider">
                  ❌ PERDU ! -{myBet.amount} {currencyLabel}
                </div>
              ) : null}
            </div>
          )}

          {/* Red No-Goal Overlay (Lose) */}
          {noGoalOverlay && showResultOverlay && (
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
              
              {/* User Bet Result inside the overlay */}
              {myBet && myBet.status === 'won' ? (
                <div className="mt-3 bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded-full text-xs sm:text-sm uppercase tracking-wider animate-pulse shadow-lg shadow-emerald-500/40">
                  🏆 GAGNANT ! +{(myBet.payout || (myBet.amount * noGoalOverlay.multiplier)).toFixed(0)} {currencyLabel}
                </div>
              ) : myBet ? (
                <div className="mt-3 bg-rose-500 text-white font-black px-4 py-1.5 rounded-full text-xs sm:text-sm uppercase tracking-wider">
                  ❌ PERDU ! -{myBet.amount} {currencyLabel}
                </div>
              ) : null}
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

        {/* Bottom Center Countdown Pill */}
        {round.status === 'ticking' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-rose-500 z-20 select-none bg-slate-950/70 px-2.5 py-0.5 rounded-full border border-rose-950/40">
            Temps restant: {Math.max(0, 30 - round.elapsed).toFixed(1)}s
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

        {/* Bottom Red Progress Bar */}
        {round.status === 'ticking' && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950 z-25 overflow-hidden rounded-b-3xl">
            <div 
              className="h-full transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(239,68,68,0.8)]" 
              style={{ 
                width: `${Math.max(0, 100 - (round.elapsed / 30) * 100)}%`,
                backgroundColor: '#ef4444' 
              }}
            />
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
                Montant de la mise ({isKet ? 'Min: 100 KET' : 'Min: 10 HTG'})
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
                    const minVal = isKet ? 100 : 10;
                    if (!betAmount || betAmount < minVal) setBetAmount(minVal);
                  }}
                  disabled={myBet && myBet.status === 'placed'}
                  className="block w-full px-3 py-2 bg-transparent text-slate-200 focus:outline-none text-xs font-bold"
                />
                <button 
                  onClick={() => {
                    const minVal = isKet ? 100 : 10;
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
