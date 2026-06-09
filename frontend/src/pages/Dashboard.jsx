import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth, apiRequest } from '../context/AuthContext';
import { 
  Plane, Landmark, ArrowUpRight, ArrowDownRight, History, 
  Wallet, ShieldAlert, Award, Clock, Coins, Upload, Send, HelpCircle, Gamepad2, ArrowLeft, Users
} from 'lucide-react';
import KetmesyeGame from './KetmesyeGame';

export default function Dashboard() {
  const { user, refreshBalance, updateBalance } = useAuth();
  const [activeTab, setActiveTab] = useState('play'); // 'play', 'deposit', 'withdraw', 'history'
  const [selectedGame, setSelectedGame] = useState(null); // null, 'crash', 'ketmesye'
  
  // Game state
  const [socket, setSocket] = useState(null);
  const [gameStatus, setGameStatus] = useState('waiting'); // 'waiting', 'flying', 'crashed'
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown] = useState(10);
  const [gameHistory, setGameHistory] = useState([]);
  const [activeBets, setActiveBets] = useState([]);
  const [activeBetsCount, setActiveBetsCount] = useState(0);
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  
  // My betting state
  const [betAmount, setBetAmount] = useState(10);
  const [autoCashout, setAutoCashout] = useState('');
  const [myBet, setMyBet] = useState(null); // null, { amount, autoCashout, status: 'placed'/'cashed_out'/'lost' }
  const [betError, setBetError] = useState('');
  const [cashoutSuccess, setCashoutSuccess] = useState(null); // { payout, multiplier }
  
  // Deposit state
  const [depProvider, setDepProvider] = useState('moncash');
  const [depAmount, setDepAmount] = useState('');
  const [depFile, setDepFile] = useState(null);
  const [depSuccess, setDepSuccess] = useState('');
  const [depError, setDepError] = useState('');
  const [depLoading, setDepLoading] = useState(false);
  
  // Withdrawal state
  const [wdAmount, setWdAmount] = useState('');
  const [wdPhone, setWdPhone] = useState('');
  const [wdProvider, setWdProvider] = useState('moncash');
  const [wdSuccess, setWdSuccess] = useState('');
  const [wdError, setWdError] = useState('');
  const [wdLoading, setWdLoading] = useState(false);

  // History state
  const [myHistory, setMyHistory] = useState({ transactions: [], bets: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Referral state
  const [referralsData, setReferralsData] = useState({ totalReferrals: 0, totalEarnings: 0.0, referrals: [] });
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Notifications / Toasts
  const [notifications, setNotifications] = useState([]);

  // Local Simulation state & refs
  const [isLocalSim, setIsLocalSim] = useState(false);
  const localLoopRef = useRef(null);
  const localBetRef = useRef(null);
  const userBalanceRef = useRef(0);
  const prevStatusRef = useRef('');

  useEffect(() => {
    if (user) {
      userBalanceRef.current = user.balance;
    }
  }, [user]);

  const generateLocalTarget = () => {
    const random = Math.random();
    const mult = 0.95 / (1 - random);
    return Math.min(parseFloat(mult.toFixed(2)), 100.00);
  };

  const startLocalSimulation = () => {
    if (isLocalSim) return;
    setIsLocalSim(true);
    addNotification("Mode Démo Activé (Simulation locale car le serveur est hors-ligne)", "info");
    const firstTarget = generateLocalTarget();
    runLocalWaitingPhase(firstTarget);
  };

  const runLocalWaitingPhase = (target) => {
    setGameStatus('waiting');
    setMultiplier(1.00);
    setCountdown(10);
    setMyBet(null);
    localBetRef.current = null;
    setCashoutSuccess(null);
    setBetError('');

    let count = 10;
    if (localLoopRef.current) clearInterval(localLoopRef.current);
    
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        runLocalFlyingPhase(target);
      }
    }, 1000);
    localLoopRef.current = interval;
  };

  const runLocalFlyingPhase = (target) => {
    setGameStatus('flying');
    setCountdown(0);
    setMultiplier(1.00);
    setCashoutSuccess(null);
    
    const startTime = Date.now();
    if (localLoopRef.current) clearInterval(localLoopRef.current);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentMultiplier = parseFloat(Math.pow(1.07, elapsed).toFixed(2));
      setMultiplier(currentMultiplier);

      // Check auto cashout
      const bet = localBetRef.current;
      if (bet && bet.status === 'placed' && bet.autoCashout && currentMultiplier >= bet.autoCashout) {
        const autoMult = bet.autoCashout;
        const payout = parseFloat((bet.amount * autoMult).toFixed(2));
        const newBal = userBalanceRef.current + payout;
        updateBalance(newBal);

        const cashedOutBet = {
          ...bet,
          status: 'cashed_out',
          cashoutMultiplier: autoMult,
          payout
        };
        setMyBet(cashedOutBet);
        localBetRef.current = cashedOutBet;
        setCashoutSuccess({ payout, multiplier: autoMult });
        addNotification(`Gagné (Auto) ! +${payout} HTG (${autoMult.toFixed(2)}x)`, 'success');
      }

      // Check crash
      if (currentMultiplier >= target) {
        clearInterval(interval);
        setGameStatus('crashed');
        setMultiplier(target);
        addNotification(`L'avion s'est écrasé à ${target.toFixed(2)}x`, 'danger');
        
        // Save history
        setGameHistory(prev => [target, ...prev.slice(0, 9)]);

        // Check if lost
        const finalBet = localBetRef.current;
        if (finalBet && finalBet.status === 'placed') {
          const lostBet = { ...finalBet, status: 'lost' };
          setMyBet(lostBet);
          localBetRef.current = lostBet;
          addNotification('Vous avez perdu la mise.', 'danger');
        }

        setTimeout(() => {
          const nextTarget = generateLocalTarget();
          runLocalWaitingPhase(nextTarget);
        }, 3000);
      }
    }, 100);
    localLoopRef.current = interval;
  };

  useEffect(() => {
    return () => {
      if (localLoopRef.current) {
        clearInterval(localLoopRef.current);
      }
    };
  }, []);

  // Canvas Refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const flightProgressRef = useRef(0);
  const particlesRef = useRef([]);

  const addNotification = (text, type = 'info') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // 1. WebSocket Setup
  useEffect(() => {
    const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 5000
    });
    setSocket(newSocket);

    // Timeout fallback to local simulation
    const connTimeout = setTimeout(() => {
      if (!newSocket.connected) {
        console.warn('Socket connection timeout. Falling back to local simulation.');
        newSocket.close();
        startLocalSimulation();
      }
    }, 3000);

    newSocket.on('connect', () => {
      clearTimeout(connTimeout);
    });

    newSocket.on('connect_error', () => {
      clearTimeout(connTimeout);
      newSocket.close();
      startLocalSimulation();
    });

    newSocket.on('game_state', (data) => {
      setGameStatus(data.status);
      setMultiplier(parseFloat(data.multiplier));
      setCountdown(data.countdown);
      setGameHistory(data.history || []);
      setActiveBets(data.activeBetsList || []);
      setActiveBetsCount(data.activeBetsCount || 0);
      setOnlineUsersCount(data.onlineUsersCount || 0);

      // Only reset active bet states when transitioning from another state (e.g. crashed) to 'waiting'
      if (data.status === 'waiting' && prevStatusRef.current !== 'waiting') {
        setMyBet(null);
        setCashoutSuccess(null);
        setBetError('');
      }
      
      prevStatusRef.current = data.status;
    });

    newSocket.on('game_tick', (data) => {
      setMultiplier(parseFloat(data.multiplier));
    });

    newSocket.on('game_crash', (data) => {
      setGameStatus('crashed');
      setMultiplier(parseFloat(data.crashMultiplier));
      addNotification(`L'avion s'est écrasé à ${data.crashMultiplier}x`, 'danger');
      refreshBalance(); // Refresh final balance
    });

    newSocket.on('bet_success', (data) => {
      setMyBet({
        amount: data.betAmount,
        autoCashout: data.autoCashout,
        status: 'placed'
      });
      updateBalance(data.newBalance);
      addNotification(`Pari de ${data.betAmount} HTG enregistré !`, 'success');
    });

    newSocket.on('bet_error', (data) => {
      setBetError(data.message);
      addNotification(data.message, 'danger');
    });

    newSocket.on('cashout_success', (data) => {
      setMyBet(prev => prev ? { ...prev, status: 'cashed_out', cashoutMultiplier: data.multiplier, payout: data.payout } : null);
      setCashoutSuccess({ payout: data.payout, multiplier: data.multiplier });
      updateBalance(data.newBalance);
      addNotification(`Gagné ! +${data.payout} HTG (${data.multiplier}x)`, 'success');
    });

    newSocket.on('cashout_error', (data) => {
      addNotification(data.message, 'danger');
    });

    newSocket.on('player_cashed_out', (data) => {
      addNotification(`${data.email} a encaissé +${data.payout} HTG à ${data.multiplier}x`, 'info');
    });

    return () => {
      clearTimeout(connTimeout);
      newSocket.close();
    };
  }, []);

  // 2. Fetch History on Tab Active
  const fetchUserHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await apiRequest('/api/transactions/my-history');
      setMyHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchUserHistory();
    }
  }, [activeTab]);

  const fetchReferralsData = async () => {
    setLoadingReferrals(true);
    try {
      const data = await apiRequest('/api/auth/referrals');
      setReferralsData(data);
    } catch (err) {
      console.error('Error fetching referrals:', err);
    } finally {
      setLoadingReferrals(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'referrals') {
      fetchReferralsData();
    }
  }, [activeTab]);

  // 3. Play Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Make canvas responsive
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 350;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const w = canvas.width;
      const h = canvas.height;
      
      // Draw grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 1;
      const gridCount = 8;
      for (let i = 0; i <= gridCount; i++) {
        // Vertical gridlines
        const x = (w / gridCount) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h - 30);
        ctx.stroke();
        
        // Horizontal gridlines
        const y = ((h - 30) / gridCount) * i;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw Axes Labels
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText('0s', 45, h - 85);
      ctx.fillText('Time', w / 2 - 15, h - 80);
      ctx.fillText('1.00x', 5, h - 100);

      if (gameStatus === 'waiting') {
        // Draw waiting circle countdown
        ctx.fillStyle = 'rgba(99, 102, 241, 0.05)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 70, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 70, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (countdown / 10)));
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${countdown}s`, w / 2, h / 2 - 30);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 12px Inter';
        ctx.fillText('PRÉPARATION DU VOL', w / 2, h / 2 + 15);
        ctx.fillText('MISEZ MAINTENANT', w / 2, h / 2 + 35);
        
        // Reset flight path
        flightProgressRef.current = 0;
        particlesRef.current = [];
      } 
      else if (gameStatus === 'flying') {
        flightProgressRef.current = Math.min(flightProgressRef.current + 0.005, 1);
        
        // Calculate dynamic plane coordinates along a curve
        // Curve equation: y = x^1.8
        const paddingLeft = 50;
        const paddingBottom = 95;
        
        const startX = paddingLeft;
        const startY = h - paddingBottom;
        const endX = w - 60;
        const endY = 40;

        // Current coordinates of plane (based on elapsed flightProgress and multiplier)
        // Ensure the plane goes up higher as multiplier increases
        const capMultiplier = Math.min(multiplier, 15); // visual capping
        const relativeYFactor = (capMultiplier - 1) / 14; // normalized 0 to 1
        
        const currentX = startX + (endX - startX) * Math.min(flightProgressRef.current * 1.5, 1);
        const currentY = startY - (startY - endY) * Math.min(relativeYFactor, 1);

        // Draw bezier path
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#6366f1';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(startX + (currentX - startX) * 0.5, startY, currentX, currentY);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Add jet smoke particles
        if (Math.random() < 0.4) {
          particlesRef.current.push({
            x: currentX - 10,
            y: currentY + 5,
            size: Math.random() * 6 + 2,
            alpha: 0.8,
            vx: -Math.random() * 2 - 1,
            vy: Math.random() * 1 - 0.5
          });
        }

        // Draw and update smoke trail particles
        particlesRef.current.forEach((p, idx) => {
          ctx.fillStyle = `rgba(168, 85, 247, ${p.alpha})`; // Purple smoke
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.015;
          p.size = Math.max(0.1, p.size - 0.05);

          if (p.alpha <= 0) {
            particlesRef.current.splice(idx, 1);
          }
        });

        // Draw plane icon ✈️ (or custom vector shape)
        ctx.save();
        ctx.translate(currentX, currentY);
        // Calculate tangent angle for rotation
        const dx = currentX - (startX + (currentX - startX) * 0.95);
        const dy = currentY - (startY - (startY - endY) * relativeYFactor * 0.95);
        const angle = Math.atan2(dy, dx);
        ctx.rotate(angle);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✈️', 0, 0);
        ctx.restore();

        // Draw big multiplier text in center
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 64px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Pulse color if cashing out
        if (myBet && myBet.status === 'cashed_out') {
          ctx.fillStyle = '#10b981'; // Green
        }
        
        ctx.fillText(`${multiplier.toFixed(2)}x`, w / 2, h / 2 - 25);
      } 
      else if (gameStatus === 'crashed') {
        // Redraw the path static
         const paddingLeft = 50;
         const paddingBottom = 95;
        const startX = paddingLeft;
        const startY = h - paddingBottom;
        const endX = w - 60;
        const endY = 40;
        const capMultiplier = Math.min(multiplier, 15);
        const relativeYFactor = (capMultiplier - 1) / 14;
        const currentX = startX + (endX - startX) * Math.min(flightProgressRef.current * 1.5, 1);
        const currentY = startY - (startY - endY) * Math.min(relativeYFactor, 1);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Red faded path
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(startX + (currentX - startX) * 0.5, startY, currentX, currentY);
        ctx.stroke();

        // Draw explosion sparks
        if (particlesRef.current.length === 0 || Math.random() < 0.2) {
          // Spawn explosion debris
          for (let i = 0; i < 20; i++) {
            particlesRef.current.push({
              x: currentX,
              y: currentY,
              size: Math.random() * 4 + 2,
              color: Math.random() > 0.5 ? '#ef4444' : '#f59e0b', // Red or orange sparks
              alpha: 1,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8
            });
          }
        }

        particlesRef.current.forEach((p, idx) => {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.03;
          if (p.alpha <= 0) {
            particlesRef.current.splice(idx, 1);
          }
        });
        ctx.globalAlpha = 1;

        // Big red crash notice
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 48px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CRASHED', w / 2, h / 2 - 40);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit';
        ctx.fillText(`@ ${multiplier.toFixed(2)}x`, w / 2, h / 2 + 10);
      }

      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [gameStatus, countdown, multiplier]);

  // 4. Place Bet Handler
  const handlePlaceBet = () => {
    setBetError('');
    
    if (betAmount < 10) {
      addNotification('La mise minimale est de 10 HTG.', 'danger');
      return setBetError('La mise minimale est de 10 HTG.');
    }

    if (betAmount > user.balance) {
      addNotification('Solde insuffisant sur votre compte.', 'danger');
      return setBetError('Solde insuffisant sur votre compte.');
    }

    if (isLocalSim) {
      const newBal = user.balance - betAmount;
      updateBalance(newBal);
      const placedBet = {
        amount: parseFloat(betAmount),
        autoCashout: autoCashout ? parseFloat(autoCashout) : null,
        status: 'placed'
      };
      setMyBet(placedBet);
      localBetRef.current = placedBet;
      addNotification(`Pari de ${betAmount} HTG enregistré !`, 'success');
    } else {
      if (!socket) return;
      socket.emit('place_bet', {
        userId: user.id,
        email: user.email,
        betAmount: parseFloat(betAmount),
        autoCashout: autoCashout ? parseFloat(autoCashout) : null
      });
    }
  };

  // 5. Cashout Handler
  const handleCashout = () => {
    if (isLocalSim) {
      const bet = localBetRef.current;
      if (!bet || bet.status !== 'placed' || gameStatus !== 'flying') return;
      
      const currentMultiplier = multiplier;
      const payout = parseFloat((bet.amount * currentMultiplier).toFixed(2));
      const newBal = userBalanceRef.current + payout;
      updateBalance(newBal);
      
      const cashedOutBet = {
        ...bet,
        status: 'cashed_out',
        cashoutMultiplier: currentMultiplier,
        payout
      };
      setMyBet(cashedOutBet);
      localBetRef.current = cashedOutBet;
      setCashoutSuccess({ payout, multiplier: currentMultiplier });
      addNotification(`Gagné ! +${payout} HTG (${currentMultiplier.toFixed(2)}x)`, 'success');
    } else {
      if (!socket || !myBet || myBet.status !== 'placed') return;
      socket.emit('cash_out', { userId: user.id });
    }
  };

  // 6. Deposit Form Handler
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setDepError('');
    setDepSuccess('');
    
    if (!depAmount || parseFloat(depAmount) <= 0) {
      return setDepError('Veuillez saisir un montant valide.');
    }

    if (!depFile) {
      return setDepError('Veuillez télécharger la capture d\'écran comme preuve.');
    }

    const formData = new FormData();
    formData.append('provider', depProvider);
    formData.append('amount', depAmount);
    formData.append('screenshot', depFile);

    setDepLoading(true);
    try {
      await apiRequest('/api/transactions/deposit', {
        method: 'POST',
        body: formData,
        // Custom headers empty so fetch does NOT set Content-Type as json
        headers: {}
      });
      setDepSuccess('Votre demande a été soumise avec succès ! Un administrateur va créditer votre compte après vérification du reçu.');
      setDepAmount('');
      setDepFile(null);
    } catch (err) {
      setDepError(err.message || 'Échec de la soumission.');
    } finally {
      setDepLoading(false);
    }
  };

  // 7. Withdrawal Form Handler
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setWdError('');
    setWdSuccess('');

    const amt = parseFloat(wdAmount);
    if (!wdAmount || amt < 100) {
      return setWdError('Le montant minimal de retrait est de 100 HTG.');
    }

    if (amt > user.balance) {
      return setWdError('Solde insuffisant.');
    }

    if (!wdPhone) {
      return setWdError('Veuillez saisir un numéro de téléphone.');
    }

    setWdLoading(true);
    try {
      const data = await apiRequest('/api/transactions/withdraw', {
        method: 'POST',
        body: { amount: amt, phone_number: wdPhone, provider: wdProvider }
      });
      setWdSuccess(`Demande enregistrée. ${(amt - amt * 0.1).toFixed(2)} HTG (après 10% de frais) seront transférés.`);
      updateBalance(data.newBalance);
      setWdAmount('');
      setWdPhone('');
    } catch (err) {
      setWdError(err.message || 'Échec de la demande.');
    } finally {
      setWdLoading(false);
    }
  };

  return (
    <div className={`max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 grid grid-cols-1 ${selectedGame === 'ketmesye' && activeTab === 'play' ? '' : 'lg:grid-cols-4'} gap-6 relative`}>
      
      {/* Toast Notifications */}
      <div className="fixed top-20 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`p-3.5 rounded-xl border text-xs font-semibold shadow-lg backdrop-blur-md animate-slide-up flex items-center justify-between ${
              n.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300' :
              n.type === 'danger' ? 'bg-red-950/80 border-red-500/30 text-red-300 animate-shake' :
              'bg-slate-900/90 border-slate-800 text-slate-300'
            }`}
          >
            <span>{n.text}</span>
          </div>
        ))}
      </div>

      {/* Main Tabs (Play / Deposit / Withdraw / History) */}
      <div className={`${selectedGame === 'ketmesye' && activeTab === 'play' ? 'lg:col-span-4' : 'lg:col-span-3'} flex flex-col space-y-6`}>
        
        {/* Navigation Tabs Header */}
        <div className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex-1 py-2 px-1 sm:py-3 sm:px-4 rounded-xl text-[10px] sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 ${
              activeTab === 'play' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plane className="h-3.5 w-3.5 sm:h-4 sm:w-4 rotate-45" />
            <span>Jeu</span>
          </button>
          
          <button
            onClick={() => setActiveTab('deposit')}
            className={`flex-1 py-2 px-1 sm:py-3 sm:px-4 rounded-xl text-[10px] sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 ${
              activeTab === 'deposit' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Dépôt</span>
          </button>

          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-2 px-1 sm:py-3 sm:px-4 rounded-xl text-[10px] sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 ${
              activeTab === 'withdraw' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Landmark className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Retrait</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-1 sm:py-3 sm:px-4 rounded-xl text-[10px] sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 ${
              activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Historique</span>
          </button>

          <button
            onClick={() => setActiveTab('referrals')}
            className={`flex-1 py-2 px-1 sm:py-3 sm:px-4 rounded-xl text-[10px] sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 ${
              activeTab === 'referrals' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Parrainage</span>
          </button>
        </div>

        {/* Tab content 1: PLAY GAME (GAME LOBBY) */}
        {activeTab === 'play' && selectedGame === null && (
          <div className="flex flex-col space-y-8 animate-fade-in py-4">
            <div className="text-center max-w-lg mx-auto">
              <h2 className="font-display font-black text-3xl text-white tracking-wide uppercase">
                Lobby de Jeux <span className="text-indigo-500 font-extrabold">HTG</span>
              </h2>
              <p className="text-slate-400 text-xs mt-2 uppercase tracking-wider font-semibold">
                Sélectionnez un jeu et multipliez vos HTG en direct !
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto w-full px-2">
              {/* Card 1: Crash Plane */}
              <div className="glass-panel group relative rounded-3xl p-6 bg-slate-900/40 border border-slate-800 hover:border-indigo-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-300"></div>
                
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="bg-indigo-600/10 p-4 rounded-2xl text-indigo-400 border border-indigo-500/15">
                      <Plane className="h-8 w-8 rotate-45" />
                    </div>
                    <span className="text-[10px] font-bold tracking-wider uppercase bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                      Multiplicateur
                    </span>
                  </div>

                  <h3 className="font-display font-black text-xl text-white mb-2 tracking-wide">
                    CRASH PLANE
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed mb-6">
                    Suivez la courbe de vol en temps réel ! La mise augmente de seconde en seconde. Récupérez vos gains avant le crash inattendu pour empocher jusqu'à 100x votre mise.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('crash')}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all tracking-wide shadow-md shadow-indigo-600/15"
                >
                  JOUER (CRASH PLANE)
                </button>
              </div>

              {/* Card 2: Ketmesye (Snake) */}
              <div className="glass-panel group relative rounded-3xl p-6 bg-slate-900/40 border border-slate-800 hover:border-yellow-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-yellow-500/10 transition-all duration-300"></div>

                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="bg-yellow-500/10 p-4 rounded-2xl text-yellow-500 border border-yellow-500/15 animate-pulse">
                      <Gamepad2 className="h-8 w-8" />
                    </div>
                    <span className="text-[10px] font-bold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 px-3 py-1 rounded-full border border-yellow-500/20">
                      Multijoueur Action
                    </span>
                  </div>

                  <h3 className="font-display font-black text-xl text-white mb-2 tracking-wide">
                    KETMESYE
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed mb-6">
                    L'arène de serpent multijoueur en temps réel avec wagers ! Contrôlez votre serpent avec la souris, mangez des pièces, détruisez les autres jwè yo et encaissez votre butin quand vous le voulez.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('ketmesye')}
                  className="w-full py-3.5 bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-black rounded-xl text-xs transition-all tracking-wide shadow-md shadow-yellow-600/15"
                >
                  SPAWN (KETMESYE ARENA)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab content 1: PLAY GAME (CRASH GAME ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'crash' && (
          <div className="space-y-6">
            <button 
              onClick={() => setSelectedGame(null)} 
              className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-xs font-bold bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl w-fit transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour au Lobby</span>
            </button>
            
            {/* Visual Screen Container */}
            <div className="relative glass-panel rounded-3xl overflow-hidden bg-slate-950/80 border border-slate-900">
              
              {/* Recent Game History Bar */}
              <div className="absolute top-3 left-3 right-3 flex items-center space-x-2 overflow-x-auto pb-1.5 z-20">
                {gameHistory.map((val, idx) => (
                  <span 
                    key={idx} 
                    className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                      val >= 2.00 ? 'bg-emerald-950/60 border-emerald-500/20 text-emerald-400' : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    {val.toFixed(2)}x
                  </span>
                ))}
              </div>

              {/* Game Interactive Canvas */}
              <canvas ref={canvasRef} className="block w-full max-h-[350px]" />
              
              {/* Dynamic Game Overlay banner */}
              {cashoutSuccess && (
                <div className="absolute inset-0 bg-emerald-950/60 flex flex-col items-center justify-center backdrop-blur-sm z-30 animate-pulse-glow">
                  <div className="bg-emerald-600 p-4 rounded-full text-white mb-3 shadow-lg">
                    <Award className="h-8 w-8 animate-bounce" />
                  </div>
                  <h3 className="font-display font-black text-3xl text-emerald-300">VICTOIRE !</h3>
                  <p className="text-white text-lg font-bold">+{cashoutSuccess.payout} HTG</p>
                  <p className="text-emerald-300 text-xs mt-1">Encaissé à {cashoutSuccess.multiplier}x</p>
                </div>
              )}

              {/* Horizontal Inputs Bar (Overlay at the bottom of the visual screen container) */}
              <div className="absolute bottom-3 left-3 right-3 grid grid-cols-2 gap-3 z-30 bg-slate-950/85 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-lg">
                {/* Bet Amount Control */}
                <div className="flex flex-col justify-center">
                  <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Montant (Min: 10 HTG)</label>
                  <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-900/40">
                    <span className="bg-slate-900 px-2 sm:px-3 py-1 sm:py-2 text-slate-500 text-xs sm:text-sm font-bold flex items-center">HTG</span>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBetAmount(val === '' ? '' : parseInt(val) || 0);
                      }}
                      onBlur={() => {
                        if (!betAmount || betAmount < 10) setBetAmount(10);
                      }}
                      disabled={myBet && myBet.status === 'placed'}
                      className="block w-full px-2 py-1 sm:px-3 sm:py-2 bg-transparent text-slate-200 focus:outline-none text-xs sm:text-sm font-bold"
                    />
                    <button 
                      onClick={() => setBetAmount(prev => Math.max(10, Math.round((parseInt(prev) || 0) / 2)))}
                      disabled={myBet && myBet.status === 'placed'}
                      className="bg-slate-900 hover:bg-slate-800 border-l border-slate-800 px-2 text-[10px] sm:text-xs font-bold text-slate-400"
                    >
                      /2
                    </button>
                    <button 
                      onClick={() => setBetAmount(prev => (parseInt(prev) || 0) * 2)}
                      disabled={myBet && myBet.status === 'placed'}
                      className="bg-slate-900 hover:bg-slate-800 border-l border-slate-800 px-2 text-[10px] sm:text-xs font-bold text-slate-400"
                    >
                      x2
                    </button>
                  </div>
                </div>

                {/* Auto Cashout Control */}
                <div className="flex flex-col justify-center">
                  <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center space-x-1">
                    <span>Auto Cash Out</span>
                    <span className="text-[9px] text-slate-500 font-normal lowercase hidden sm:inline">(optionnel)</span>
                  </label>
                  <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-900/40">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 2.0"
                      value={autoCashout}
                      onChange={(e) => setAutoCashout(e.target.value)}
                      disabled={myBet && myBet.status === 'placed'}
                      className="block w-full px-3 py-1 sm:px-4 sm:py-2 bg-transparent text-slate-200 focus:outline-none text-xs sm:text-sm font-bold"
                    />
                    <span className="bg-slate-900 px-2 sm:px-3 py-1 sm:py-2 text-slate-500 text-xs sm:text-sm font-bold flex items-center">x</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Wagering Control Panel */}
            <div className="glass-panel p-5 rounded-3xl mt-4 max-w-xl mx-auto w-full">
              {/* Bet Action Button */}
              <div className="w-full flex flex-col justify-center">
                {myBet && myBet.status === 'placed' && gameStatus === 'flying' ? (
                  // Live cashout button
                  <button
                    onClick={handleCashout}
                    className="w-full py-4 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-lg tracking-wider transition-all duration-150 transform active:scale-95 glow-emerald hover:brightness-105"
                  >
                    CASH OUT
                    <span className="block text-xs font-mono font-bold text-slate-900/70 mt-0.5">
                      {(betAmount * multiplier).toFixed(2)} HTG
                    </span>
                  </button>
                ) : myBet && myBet.status === 'placed' ? (
                  // Placed but waiting for round start
                  <button
                    disabled
                    className="w-full py-4 px-4 bg-emerald-600 text-slate-950 font-black rounded-xl font-bold text-sm select-none border border-emerald-500 glow-emerald shadow-lg shadow-emerald-500/20"
                  >
                    PARI ENREGISTRÉ
                    <span className="block text-[10px] font-bold text-slate-900/80 mt-0.5">
                      Attente du décollage de l'avion...
                    </span>
                  </button>
                ) : (
                  // Open to place bets
                  <button
                    onClick={handlePlaceBet}
                    disabled={gameStatus !== 'waiting'}
                    className="w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed glow-indigo"
                  >
                    PLACER LE PARI
                    <span className="block text-xs font-mono font-normal text-indigo-200 mt-0.5">
                      Mise: {betAmount} HTG {autoCashout ? `@ ${autoCashout}x` : ''}
                    </span>
                  </button>
                )}
                {betError && (
                  <p className="text-red-500 text-xs mt-2 text-center font-bold">{betError}</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab content 1: PLAY GAME (KETMESYE ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'ketmesye' && (
          <KetmesyeGame 
            socket={socket} 
            onBackToLobby={() => setSelectedGame(null)} 
            addNotification={addNotification} 
          />
        )}

        {/* Tab content 2: DEPOSITS */}
        {activeTab === 'deposit' && (
          <div className="glass-panel p-8 rounded-3xl space-y-6">
            <div>
              <h3 className="font-display font-black text-2xl text-white">Méthode de Dépôt</h3>
              <p className="text-sm text-slate-400 mt-1">Créditez votre compte manuellement en effectuant un transfert sur nos numéros officiels.</p>
            </div>

            {/* Payment instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-yellow-950/20 border border-yellow-500/20 rounded-2xl flex items-start space-x-3">
                <Coins className="h-6 w-6 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">MonCash Haïti</h4>
                  <p className="text-xs text-slate-400 mt-1">Numéro de transfert :</p>
                  <p className="font-mono font-black text-lg text-yellow-400">36203465</p>
                </div>
              </div>

              <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-2xl flex items-start space-x-3">
                <Coins className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">NatCash Haïti</h4>
                  <p className="text-xs text-slate-400 mt-1">Numéro de transfert :</p>
                  <p className="font-mono font-black text-lg text-red-400">42398022</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              {depError && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl">
                  {depError}
                </div>
              )}
              {depSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl">
                  {depSuccess}
                </div>
              )}

              {/* Provider choice */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Choisir le fournisseur</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDepProvider('moncash')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      depProvider === 'moncash' ? 'border-yellow-500/50 bg-yellow-500/5 text-yellow-400' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    MonCash
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepProvider('natcash')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      depProvider === 'natcash' ? 'border-red-500/50 bg-red-500/5 text-red-400' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    NatCash
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Montant envoyé (HTG)</label>
                <input
                  type="number"
                  placeholder="Ex: 500"
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* File Screenshot Upload */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Capture d'écran de la transaction</label>
                <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-slate-700 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setDepFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required
                  />
                  <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-bold">
                    {depFile ? depFile.name : "Cliquez ou déposez votre capture d'écran ici"}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">Seuls les formats JPEG, PNG et GIF sont autorisés.</p>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={depLoading}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {depLoading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Soumettre le Reçu</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab content 3: WITHDRAWALS */}
        {activeTab === 'withdraw' && (
          <div className="glass-panel p-8 rounded-3xl space-y-6">
            <div>
              <h3 className="font-display font-black text-2xl text-white">Demande de Retrait</h3>
              <p className="text-sm text-slate-400 mt-1">Retirez vos HTG vers votre compte MonCash ou NatCash. Les fonds sont envoyés sous 24h par l'admin.</p>
            </div>

            {/* Fee Warning */}
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl flex items-start space-x-3 text-indigo-300 text-xs">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">Frais de retrait de 10% applicables</p>
                <p className="mt-0.5 text-indigo-400">Pour assurer les coûts opérationnels et de transfert, 10% sont automatiquement prélevés sur chaque retrait.</p>
              </div>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              {wdError && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl">
                  {wdError}
                </div>
              )}
              {wdSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl">
                  {wdSuccess}
                </div>
              )}

              {/* Provider choice */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Choisir la méthode de retrait</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWdProvider('moncash')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      wdProvider === 'moncash' ? 'border-yellow-500/50 bg-yellow-500/5 text-yellow-400' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    MonCash
                  </button>
                  <button
                    type="button"
                    onClick={() => setWdProvider('natcash')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      wdProvider === 'natcash' ? 'border-red-500/50 bg-red-500/5 text-red-400' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    NatCash
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Montant du retrait (HTG)</label>
                <input
                  type="number"
                  placeholder="Min: 100 HTG"
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Numéro de Téléphone (MonCash / NatCash)</label>
                <input
                  type="text"
                  placeholder="Ex: 36203465"
                  value={wdPhone}
                  onChange={(e) => setWdPhone(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Automatic Fee Calculation display */}
              {wdAmount && parseFloat(wdAmount) >= 100 && (
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Montant demandé :</span>
                    <span className="font-mono text-slate-300 font-bold">{parseFloat(wdAmount).toFixed(2)} HTG</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Frais opérationnels (10%) :</span>
                    <span className="font-mono text-red-400">-{ (parseFloat(wdAmount) * 0.1).toFixed(2) } HTG</span>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                    <span className="text-slate-300">Total net à recevoir :</span>
                    <span className="font-mono text-emerald-400">{ (parseFloat(wdAmount) * 0.9).toFixed(2) } HTG</span>
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={wdLoading}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {wdLoading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Demander le Retrait</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab content 4: HISTORIES */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            {/* My Bets History Table */}
            <div className="glass-panel p-6 rounded-3xl">
              <h3 className="font-display font-black text-xl text-white mb-4 flex items-center space-x-2">
                <Award className="h-5 w-5 text-indigo-400" />
                <span>Mes Paris Récents</span>
              </h3>
              
              {loadingHistory ? (
                <div className="flex py-10 justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : myHistory.bets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Vous n'avez placé aucun pari pour le moment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Mise</th>
                        <th className="pb-3 text-center">Multiplicateur Crash</th>
                        <th className="pb-3 text-center">Encaissé à</th>
                        <th className="pb-3 text-right">Gain net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {myHistory.bets.map((bet, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/25 transition-colors">
                          <td className="py-3 text-slate-400">{new Date(bet.created_at).toLocaleDateString('fr-FR')} {new Date(bet.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
                          <td className="py-3 font-mono font-bold text-slate-300">{bet.bet_amount ? bet.bet_amount.toFixed(2) : '0.00'} HTG</td>
                          <td className="py-3 text-center font-mono font-bold text-slate-400">{bet.crash_multiplier ? bet.crash_multiplier.toFixed(2) + 'x' : '-'}</td>
                          <td className={`py-3 text-center font-mono font-bold ${bet.is_won ? 'text-emerald-400' : 'text-red-400'}`}>
                            {bet.is_won ? `${bet.cashout_multiplier ? bet.cashout_multiplier.toFixed(2) : '-'}x` : 'Crash'}
                          </td>
                          <td className={`py-3 text-right font-mono font-black ${bet.is_won ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {bet.is_won ? `+${bet.payout_amount ? bet.payout_amount.toFixed(2) : '0.00'} HTG` : '0.00 HTG'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* My Transactions History Table */}
            <div className="glass-panel p-6 rounded-3xl">
              <h3 className="font-display font-black text-xl text-white mb-4 flex items-center space-x-2">
                <Landmark className="h-5 w-5 text-indigo-400" />
                <span>Mes Dépôts & Retraits</span>
              </h3>

              {loadingHistory ? (
                <div className="flex py-10 justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : myHistory.transactions.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Aucune transaction enregistrée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3">Détail</th>
                        <th className="pb-3">Montant Brut</th>
                        <th className="pb-3">Frais</th>
                        <th className="pb-3">Montant Net</th>
                        <th className="pb-3 text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {myHistory.transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/25 transition-colors">
                          <td className="py-3 text-slate-400">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              tx.type === 'deposit' ? 'bg-emerald-950/60 border border-emerald-500/20 text-emerald-400' : 'bg-red-950/60 border border-red-500/20 text-red-400'
                            }`}>
                              {tx.type === 'deposit' ? 'Dépôt' : 'Retrait'}
                            </span>
                          </td>
                          <td className="py-3 text-slate-300 font-medium">
                            {tx.type === 'deposit' ? (tx.provider ? tx.provider.toUpperCase() : 'N/A') : `Vers ${tx.phone_number || 'N/A'}`}
                          </td>
                          <td className="py-3 font-mono font-bold text-slate-400">{tx.amount ? tx.amount.toFixed(2) : '0.00'} HTG</td>
                          <td className="py-3 font-mono text-red-400/80">{tx.fee > 0 ? `-${tx.fee.toFixed(2)} HTG` : '-'}</td>
                          <td className="py-3 font-mono font-bold text-slate-200">{tx.net_amount ? tx.net_amount.toFixed(2) : '0.00'} HTG</td>
                          <td className="py-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                              tx.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                              'bg-amber-500/10 text-amber-400'
                            }`}>
                              {tx.status === 'approved' ? 'Approuvé' :
                               tx.status === 'rejected' ? 'Refusé' :
                               'En attente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab content 5: REFERRALS */}
        {activeTab === 'referrals' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl flex items-center justify-between shadow-xl">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Filleuls</p>
                  <h4 className="font-display font-black text-3xl text-white mt-1">{referralsData.totalReferrals}</h4>
                </div>
                <div className="bg-indigo-600/10 p-4 rounded-2xl text-indigo-400 border border-indigo-500/15">
                  <Users className="h-6 w-6" />
                </div>
              </div>

              <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl flex items-center justify-between shadow-xl">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Gains Cumulés</p>
                  <h4 className="font-display font-black text-3xl text-emerald-400 mt-1">{parseFloat(referralsData.totalEarnings || 0).toFixed(2)} HTG</h4>
                </div>
                <div className="bg-emerald-600/10 p-4 rounded-2xl text-emerald-400 border border-emerald-500/15">
                  <Coins className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Invite Link Card */}
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <h3 className="font-display font-black text-lg text-white">Lien d'Invitation Personnel</h3>
              <p className="text-xs text-slate-400">Partagez ce lien avec vos amis. Lorsqu'ils effectuent un dépôt, vous gagnez 5% de commission sur leur dépôt approuvé !</p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/auth?ref=${user?.referral_code || ''}`}
                  className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-300 font-mono focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${user?.referral_code || ''}`);
                    setCopiedLink(true);
                    addNotification("Lien d'invitation copié !", "success");
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap"
                >
                  {copiedLink ? "Copié !" : "Copier le Lien"}
                </button>
              </div>
            </div>

            {/* Referred Users List Table */}
            <div className="glass-panel p-6 rounded-3xl">
              <h3 className="font-display font-black text-xl text-white mb-4 flex items-center space-x-2">
                <Users className="h-5 w-5 text-indigo-400" />
                <span>Mes Filleuls Récents</span>
              </h3>
              
              {loadingReferrals ? (
                <div className="flex py-10 justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : referralsData.referrals.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Vous n'avez pas encore parrainé d'amis.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Email du Filleul</th>
                        <th className="pb-3 text-right">Date d'Inscription</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {referralsData.referrals.map((refUser, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/25 transition-colors">
                          <td className="py-3 text-slate-300 font-bold">{refUser.email}</td>
                          <td className="py-3 text-right text-slate-400">{new Date(refUser.created_at).toLocaleDateString('fr-FR')} {new Date(refUser.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Right Sidebar: Active Bets list & Statistics */}
      {!(selectedGame === 'ketmesye' && activeTab === 'play') && (
        <div className="space-y-6">
        
        {/* Admin Control Widget */}
        {user && user.role === 'admin' && (
          <div className="glass-panel p-5 rounded-3xl bg-purple-950/20 border border-purple-500/25 flex flex-col space-y-3">
            <h3 className="font-display font-black text-sm text-purple-300 flex items-center space-x-2">
              <ShieldAlert className="h-4 w-4 text-purple-450" />
              <span>Contrôle Administrateur</span>
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Vous êtes connecté en tant qu'administrateur. Vous pouvez valider les transactions et modérer les comptes jwè yo.
            </p>
            <Link
              to="/admin"
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs text-center transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-purple-500/10"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Ouvrir le Portail Admin</span>
            </Link>
          </div>
        )}
        
        {/* Card for Active Players list in the current round */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col max-h-[500px]">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-900">
            <h3 className="font-display font-black text-sm text-slate-300 flex items-center space-x-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              <span>Joueurs connectés</span>
            </h3>
            <span className="bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full text-[10px] font-bold border border-indigo-500/20">
              {onlineUsersCount} en ligne
            </span>
          </div>

          <div className="flex-grow overflow-y-auto space-y-2 pr-1">
            {activeBets.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">En attente de mises...</p>
            ) : (
              activeBets.map((player, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-xl border border-slate-900/60">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-300">{player.email}</span>
                    <span className="text-[10px] font-mono text-slate-500">{player.betAmount.toFixed(0)} HTG</span>
                  </div>
                  {player.cashedOut ? (
                    <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/15">
                      +{player.payoutAmount.toFixed(0)} HTG ({player.cashoutMultiplier.toFixed(2)}x)
                    </span>
                  ) : gameStatus === 'crashed' ? (
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/15">
                      Crash
                    </span>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Small informational widget */}
        <div className="glass-panel p-4 rounded-xl space-y-2 bg-gradient-to-br from-indigo-950/15 to-purple-950/10 border border-indigo-900/20 w-full">
          <h4 className="font-bold text-[10px] text-indigo-300 uppercase tracking-wider">Comment Jouer ?</h4>
          <ol className="list-decimal pl-4 text-[10px] text-slate-400 space-y-1 leading-relaxed">
            <li>Déposez des fonds en HTG sur MonCash ou NatCash.</li>
            <li>Placez votre pari avant que l'avion ne décolle.</li>
            <li>Observez le multiplicateur augmenter.</li>
            <li>Cliquez sur <strong className="text-emerald-400 font-bold">CASH OUT</strong> pour récupérer vos gains avant l'écrasement.</li>
            <li>Si l'avion s'écrase avant, le pari est perdu.</li>
          </ol>
        </div>
      </div>
      )}

    </div>
  );
}
