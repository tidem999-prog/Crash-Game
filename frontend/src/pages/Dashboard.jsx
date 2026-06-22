import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth, apiRequest } from '../context/AuthContext';
import { 
  Plane, Landmark, ArrowUpRight, ArrowDownRight, History, 
  Wallet, ShieldAlert, Award, Clock, Coins, Upload, Send, HelpCircle, Gamepad2, ArrowLeft, Users, Gem,
  Copy, Check, Flame, User, Volume2, VolumeX, X, RefreshCw
} from 'lucide-react';
import KetmesyeGame from './KetmesyeGame';
import MinesGame from './MinesGame';
import KothGame from './KothGame';
import BloodmoneyGame from './BloodmoneyGame';
import LastSecondGame from './LastSecondGame';
import Competitions from './Competitions';
import { initAudio, playTakeoff, playCrash, playCashout, playClick, startEngineSound, stopEngineSound, updateEnginePitch, setMuted } from '../utils/audio';

export default function Dashboard() {
  const { user, refreshBalance, updateBalance, updateProfile, convertKet } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('play'); // 'play', 'deposit', 'withdraw', 'history', 'profile'
  const [selectedGame, setSelectedGame] = useState(null); // null, 'crash', 'ketmesye', 'mines'
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
      if (tab === 'play') {
        setSelectedGame(null);
      }
    }
  }, [location]);
  
  // Profile & KET conversion states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [convertAmount, setConvertAmount] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);

  // Rewards & Progression states
  const [rewardsStats, setRewardsStats] = useState(null);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [convertAmountRewards, setConvertAmountRewards] = useState('');
  const [convertLoadingRewards, setConvertLoadingRewards] = useState(false);
  const [rewardsError, setRewardsError] = useState('');
  const [rewardsSuccess, setRewardsSuccess] = useState('');
  
  // Game state
  const [socket, setSocket] = useState(null);
  const [gameStatus, setGameStatus] = useState('waiting'); // 'waiting', 'flying', 'crashed'
  const [isAudioMuted, setIsAudioMuted] = useState(false);
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
  const [depPhone, setDepPhone] = useState('');
  const [depSuccess, setDepSuccess] = useState('');
  const [depError, setDepError] = useState('');
  const [depLoading, setDepLoading] = useState(false);
  const [copiedText, setCopiedText] = useState({ moncash: false, natcash: false });
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
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

  // USDT states
  const [usdtStats, setUsdtStats] = useState(null);
  const [loadingUsdtStats, setLoadingUsdtStats] = useState(false);
  const [copiedUsdtText, setCopiedUsdtText] = useState(false);

  // USDT Deposit Form State
  const [usdtDepTxHash, setUsdtDepTxHash] = useState('');
  const [usdtDepLoading, setUsdtDepLoading] = useState(false);
  const [usdtDepSuccess, setUsdtDepSuccess] = useState('');
  const [usdtDepError, setUsdtDepError] = useState('');

  // USDT Withdrawal Form State
  const [usdtWdAmount, setUsdtWdAmount] = useState('');
  const [usdtWdAddress, setUsdtWdAddress] = useState('');
  const [usdtWdLoading, setUsdtWdLoading] = useState(false);
  const [usdtWdSuccess, setUsdtWdSuccess] = useState('');
  const [usdtWdError, setUsdtWdError] = useState('');

  // USDT Exchange Form State
  const [usdtExAmount, setUsdtExAmount] = useState('');
  const [usdtExLoading, setUsdtExLoading] = useState(false);
  const [usdtExSuccess, setUsdtExSuccess] = useState('');
  const [usdtExError, setUsdtExError] = useState('');

  // Selectors for cashier methods
  const [depositMethod, setDepositMethod] = useState('fiat'); // 'fiat' or 'usdt'
  const [withdrawMethod, setWithdrawMethod] = useState('fiat'); // 'fiat' or 'usdt'

  // Referral state
  const [referralsData, setReferralsData] = useState({ totalReferrals: 0, totalEarnings: 0.0, referrals: [] });
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Notifications / Toasts
  const [notifications, setNotifications] = useState([]);

  // Bonus & XP Booster claims
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [selectedRewardOption, setSelectedRewardOption] = useState(null); // 'bonus' or 'booster'

  // Withdrawal warning modal
  const [showWdWarning, setShowWdWarning] = useState(false);

  // Bonus Promo Modal state
  const [showBonusPromoModal, setShowBonusPromoModal] = useState(false);

  const [socketStatus, setSocketStatus] = useState('connecting'); // 'connecting', 'connected', 'disconnected'
  const activeTabRef = useRef(activeTab);
  const selectedGameRef = useRef(selectedGame);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedGameRef.current = selectedGame;
  }, [selectedGame]);

  // Local Simulation state & refs
  const [isLocalSim, setIsLocalSim] = useState(false);
  const [isKetmesyePlaying, setIsKetmesyePlaying] = useState(false);
  const localLoopRef = useRef(null);
  const localBetRef = useRef(null);
  const userBalanceRef = useRef(0);
  const prevStatusRef = useRef('');
  const userIdRef = useRef(null);

  const stopLocalSimulation = () => {
    if (localLoopRef.current) {
      clearInterval(localLoopRef.current);
      clearTimeout(localLoopRef.current);
      localLoopRef.current = null;
    }
    setIsLocalSim(false);
    stopEngineSound();
  };

  useEffect(() => {
    if (user) {
      userBalanceRef.current = user.active_currency === 'KET' 
        ? parseFloat(user.ket_balance || 0) 
        : (parseFloat(user.balance || 0) + parseFloat(user.bonus_balance || 0) + parseFloat(user.locked_winnings || 0));
      userIdRef.current = user.id;
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      
      // Adjust default betAmount when currency toggles
      if (user.active_currency === 'KET') {
        if (betAmount < 100) {
          setBetAmount(100);
        }
      } else {
        if (betAmount >= 100) {
          setBetAmount(10);
        }
      }
    }
  }, [user]);

  const generateLocalTarget = () => {
    const random = Math.random();
    const mult = 0.95 / (1 - random);
    return Math.min(parseFloat(mult.toFixed(2)), 100.00);
  };

  const handleMuteToggle = () => {
    const muted = !isAudioMuted;
    setIsAudioMuted(muted);
    setMuted(muted);
    if (!muted && gameStatus === 'flying') {
      startEngineSound();
      updateEnginePitch(multiplier);
    }
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
    
    startEngineSound();
    
    const startTime = Date.now();
    if (localLoopRef.current) clearInterval(localLoopRef.current);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentMultiplier = parseFloat(Math.pow(1.07, elapsed).toFixed(2));
      setMultiplier(currentMultiplier);
      updateEnginePitch(currentMultiplier);

      // Check auto cashout
      const bet = localBetRef.current;
      if (bet && bet.status === 'placed' && bet.autoCashout && currentMultiplier >= bet.autoCashout) {
        const autoMult = bet.autoCashout;
        const payout = parseFloat((bet.amount * autoMult).toFixed(2));
        const isKet = bet.currency === 'KET';
        const currentBal = isKet ? (user?.ket_balance || 0) : (user?.balance || 0);
        const newBal = currentBal + payout;
        updateBalance(newBal, isKet ? 'KET' : 'HTG');

        const cashedOutBet = {
          ...bet,
          status: 'cashed_out',
          cashoutMultiplier: autoMult,
          payout
        };
        setMyBet(cashedOutBet);
        localBetRef.current = cashedOutBet;
        setCashoutSuccess({ payout, multiplier: autoMult });
        addNotification(`Gagné (Auto) ! +${payout} ${isKet ? 'KET' : 'HTG'} (${autoMult.toFixed(2)}x)`, 'success');
        playCashout();
      }

      // Check crash
      if (currentMultiplier >= target) {
        clearInterval(interval);
        setGameStatus('crashed');
        setMultiplier(target);
        addNotification(`L'avion s'est écrasé à ${target.toFixed(2)}x`, 'danger');
        playCrash();
        
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

        const timeout = setTimeout(() => {
          const nextTarget = generateLocalTarget();
          runLocalWaitingPhase(nextTarget);
        }, 3000);
        localLoopRef.current = timeout;
      }
    }, 100);
    localLoopRef.current = interval;
  };

  useEffect(() => {
    return () => {
      stopLocalSimulation();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'play' && selectedGame === 'crash') {
      if (socketStatus === 'disconnected') {
        if (!isLocalSim) {
          setIsLocalSim(true);
          addNotification("Mode Démo Activé (Simulation locale car le serveur est hors-ligne)", "info");
          const firstTarget = generateLocalTarget();
          runLocalWaitingPhase(firstTarget);
        }
      } else {
        if (isLocalSim) {
          stopLocalSimulation();
        }
      }
    } else {
      if (isLocalSim) {
        stopLocalSimulation();
      }
      stopEngineSound();
    }
  }, [activeTab, selectedGame, socketStatus, isLocalSim]);

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
        setSocketStatus('disconnected');
      }
    }, 3000);

    newSocket.on('connect', () => {
      clearTimeout(connTimeout);
      setSocketStatus('connected');
    });

    newSocket.on('connect_error', () => {
      clearTimeout(connTimeout);
      newSocket.close();
      setSocketStatus('disconnected');
    });

    newSocket.on('game_state', (data) => {
      setGameStatus(data.status);
      setMultiplier(parseFloat(data.multiplier));
      setCountdown(data.countdown);
      setGameHistory(data.history || []);
      setOnlineUsersCount(data.onlineUsersCount || 0);

      if (data.status === 'flying' && prevStatusRef.current !== 'flying') {
        if (activeTabRef.current === 'play' && selectedGameRef.current === 'crash') {
          startEngineSound();
        }
      } else if (data.status !== 'flying') {
        stopEngineSound();
      }

      // Only reset active bet states when transitioning from another state (e.g. crashed) to 'waiting'
      if (data.status === 'waiting' && prevStatusRef.current !== 'waiting') {
        setMyBet(null);
        setCashoutSuccess(null);
        setBetError('');
      }
      
      prevStatusRef.current = data.status;
    });

    newSocket.on('game_tick', (data) => {
      const mult = parseFloat(data.multiplier);
      setMultiplier(mult);
      if (activeTabRef.current === 'play' && selectedGameRef.current === 'crash') {
        updateEnginePitch(mult);
      }
    });

    newSocket.on('game_crash', (data) => {
      setGameStatus('crashed');
      setMultiplier(parseFloat(data.crashMultiplier));
      addNotification(`L'avion s'est écrasé à ${data.crashMultiplier}x`, 'danger');
      refreshBalance(); // Refresh final balance
      if (activeTabRef.current === 'play' && selectedGameRef.current === 'crash') {
        playCrash();
      } else {
        stopEngineSound();
      }
    });

    newSocket.on('bet_success', (data) => {
      setMyBet({
        amount: data.betAmount,
        autoCashout: data.autoCashout,
        status: 'placed',
        currency: data.currency
      });
      updateBalance(data.newBalance, data.currency);
      addNotification(`Pari de ${data.betAmount} ${data.currency || 'HTG'} enregistré !`, 'success');
    });

    newSocket.on('bet_error', (data) => {
      setBetError(data.message);
      addNotification(data.message, 'danger');
    });

    newSocket.on('cashout_success', (data) => {
      setMyBet(prev => prev ? { ...prev, status: 'cashed_out', cashoutMultiplier: data.multiplier, payout: data.payout } : null);
      setCashoutSuccess({ payout: data.payout, multiplier: data.multiplier });
      updateBalance(data.newBalance, data.currency);
      addNotification(`Gagné ! +${data.payout} ${data.currency || 'HTG'} (${data.multiplier}x)`, 'success');
      playCashout();
    });

    newSocket.on('cashout_error', (data) => {
      addNotification(data.message, 'danger');
    });

    newSocket.on('player_cashed_out', (data) => {
      addNotification(`${data.email} a encaissé +${data.payout} ${data.currency || 'HTG'} à ${data.multiplier}x`, 'info');
    });

    newSocket.on('balance_update', (data) => {
      if (userIdRef.current && userIdRef.current === data.userId) {
        updateBalance(data);
      }
    });

    newSocket.on('global_notification', (data) => {
      addNotification(data.message, data.type);
    });

    newSocket.on('active_players_update', (data) => {
      setActiveBets(data || []);
      setActiveBetsCount(data ? data.length : 0);
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

  const fetchUsdtStats = async () => {
    setLoadingUsdtStats(true);
    try {
      const data = await apiRequest('/api/transactions/usdt/stats');
      setUsdtStats(data);
    } catch (err) {
      console.error('Error fetching USDT stats:', err);
    } finally {
      setLoadingUsdtStats(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'deposit' || activeTab === 'withdraw' || activeTab === 'exchange' || activeTab === 'history') {
      fetchUsdtStats();
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

  const fetchRewardsStats = async () => {
    setLoadingRewards(true);
    setRewardsError('');
    setRewardsSuccess('');
    try {
      const data = await apiRequest('/api/rewards/dashboard');
      setRewardsStats(data);
      // Mark notifications as read once loaded
      const hasUnread = data.notifications?.some(n => !n.is_read);
      if (hasUnread) {
        await markNotificationsAsRead();
      }
    } catch (err) {
      console.error('Error fetching rewards dashboard:', err);
    } finally {
      setLoadingRewards(false);
    }
  };

  const markNotificationsAsRead = async () => {
    try {
      await apiRequest('/api/rewards/notifications/read', { method: 'POST' });
      setRewardsStats(prev => {
        if (!prev) return null;
        return {
          ...prev,
          notifications: prev.notifications.map(n => ({ ...n, is_read: true }))
        };
      });
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  const handleConvertRewardsSubmit = async () => {
    setRewardsError('');
    setRewardsSuccess('');
    const amt = parseFloat(convertAmountRewards);
    if (isNaN(amt) || amt <= 0) {
      setRewardsError('Veuillez saisir un montant KET valide.');
      return;
    }
    setConvertLoadingRewards(true);
    try {
      const data = await apiRequest('/api/rewards/convert', {
        method: 'POST',
        body: { amount: amt }
      });
      setRewardsSuccess(data.message || 'Conversion réussie !');
      addNotification(data.message || 'Conversion réussie !', 'success');
      setConvertAmountRewards('');
      refreshBalance();
      // Reload stats to get new balance/history/limits
      await fetchRewardsStats();
    } catch (err) {
      setRewardsError(err.message || 'Échec de la conversion.');
      addNotification(err.message || 'Échec de la conversion.', 'danger');
    } finally {
      setConvertLoadingRewards(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'rewards') {
      fetchRewardsStats();
    }
  }, [activeTab]);

  useEffect(() => {
    if (depFile) {
      const url = URL.createObjectURL(depFile);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [depFile]);

  // 3. Play Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Make canvas responsive
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = window.innerWidth < 640 ? 240 : 350;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const w = canvas.width;
      const h = canvas.height;
      const isMobile = w < 640;
      
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
      ctx.fillText('0s', 45, h - 15);
      ctx.fillText('Time', w / 2 - 15, h - 15);
      ctx.fillText('1.00x', 5, h - 45);

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
        ctx.font = isMobile ? 'bold 26px Outfit' : 'bold 36px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${countdown}s`, w / 2, h / 2 - 30);

        ctx.fillStyle = '#94a3b8';
        ctx.font = isMobile ? '500 10px Inter' : '500 12px Inter';
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
        const paddingBottom = 45;
        
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
        ctx.font = isMobile ? '900 36px Outfit' : '900 64px Outfit';
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
          const paddingBottom = 45;
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
        ctx.font = isMobile ? '900 32px Outfit' : '900 48px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CRASHED', w / 2, h / 2 - 40);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = isMobile ? 'bold 24px Outfit' : 'bold 36px Outfit';
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
    playClick();
    
    const isKet = user?.active_currency === 'KET';
    const minBet = isKet ? 100 : 10;
    const currentBalance = isKet 
      ? (user?.ket_balance || 0) 
      : ((user?.balance || 0) + (user?.bonus_balance || 0) + (user?.locked_winnings || 0));
    const currencyLabel = isKet ? 'KET' : 'HTG';

    if (betAmount < minBet) {
      addNotification(`La mise minimale est de ${minBet} ${currencyLabel}.`, 'danger');
      return setBetError(`La mise minimale est de ${minBet} ${currencyLabel}.`);
    }

    if (betAmount > currentBalance) {
      addNotification('Solde insuffisant sur votre compte.', 'danger');
      return setBetError('Solde insuffisant sur votre compte.');
    }

    if (isLocalSim) {
      const newBal = currentBalance - betAmount;
      updateBalance(newBal, isKet ? 'KET' : 'HTG');
      const placedBet = {
        amount: parseFloat(betAmount),
        currency: currencyLabel,
        autoCashout: autoCashout ? parseFloat(autoCashout) : null,
        status: 'placed'
      };
      setMyBet(placedBet);
      localBetRef.current = placedBet;
      addNotification(`Pari de ${betAmount} ${currencyLabel} enregistré !`, 'success');
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
      const isKet = bet.currency === 'KET';
      const currentBal = isKet ? (user?.ket_balance || 0) : ((user?.balance || 0) + (user?.bonus_balance || 0) + (user?.locked_winnings || 0));
      const newBal = currentBal + payout;
      updateBalance(newBal, isKet ? 'KET' : 'HTG');
      
      const cashedOutBet = {
        ...bet,
        status: 'cashed_out',
        cashoutMultiplier: currentMultiplier,
        payout
      };
      setMyBet(cashedOutBet);
      localBetRef.current = cashedOutBet;
      setCashoutSuccess({ payout, multiplier: currentMultiplier });
      addNotification(`Gagné ! +${payout} ${isKet ? 'KET' : 'HTG'} (${currentMultiplier.toFixed(2)}x)`, 'success');
      playCashout();
    } else {
      if (!socket || !myBet || myBet.status !== 'placed') return;
      socket.emit('cash_out', { userId: user.id });
    }
  };

  const handleCopyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(prev => ({ ...prev, [key]: true }));
      addNotification(`Le numéro officiel ${key === 'moncash' ? 'MonCash' : 'NatCash'} a été copié.`, 'success');
      setTimeout(() => {
        setCopiedText(prev => ({ ...prev, [key]: false }));
      }, 2000);
    }).catch(err => {
      addNotification('Impossible de copier le numéro.', 'danger');
    });
  };

  // 6. Deposit Form Handler
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setDepError('');
    setDepSuccess('');
    
    if (!depAmount || parseFloat(depAmount) <= 0) {
      return setDepError('Veuillez saisir un montant valide.');
    }

    if (!depPhone) {
      return setDepError('Veuillez saisir le numéro de téléphone expéditeur.');
    }

    if (!depFile) {
      return setDepError('Veuillez télécharger la capture d\'écran comme preuve.');
    }

    const formData = new FormData();
    formData.append('provider', depProvider);
    formData.append('amount', depAmount);
    formData.append('phone_number', depPhone);
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
      setDepPhone('');
      setDepFile(null);
    } catch (err) {
      setDepError(err.message || 'Échec de la soumission.');
    } finally {
      setDepLoading(false);
    }
  };

  const handleClaimRewardChoice = async (choice) => {
    if (!user || !user.pendingBonusChoices || user.pendingBonusChoices.length === 0) return;
    const choiceId = user.pendingBonusChoices[0].id;
    setClaimLoading(true);
    setClaimError('');
    try {
      const data = await apiRequest(`/api/competitions/bonus-choices/${choiceId}/claim`, {
        method: 'POST',
        body: { choice }
      });
      addNotification(data.message, 'success');
      setSelectedRewardOption(null);
      await refreshBalance();
    } catch (err) {
      setClaimError(err.message || 'Une erreur est survenue.');
    } finally {
      setClaimLoading(false);
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

    // Intercept with Warning if active bonus/locked winnings exist
    const hasActiveBonus = parseFloat(user?.bonus_balance || 0) > 0 || parseFloat(user?.locked_winnings || 0) > 0;
    if (hasActiveBonus) {
      setShowWdWarning(true);
      return;
    }

    await executeWithdraw(false);
  };

  const executeWithdraw = async (confirmCancelBonus = false) => {
    const amt = parseFloat(wdAmount);
    setWdLoading(true);
    try {
      const data = await apiRequest('/api/transactions/withdraw', {
        method: 'POST',
        body: { amount: amt, phone_number: wdPhone, provider: wdProvider, confirmCancelBonus }
      });
      setWdSuccess(`Demande enregistrée. ${(amt - amt * 0.1).toFixed(2)} HTG (après 10% de frais) seront transférés.`);
      updateBalance(data.newBalance);
      setWdAmount('');
      setWdPhone('');
      setShowWdWarning(false);
    } catch (err) {
      setWdError(err.message || 'Échec de la demande.');
    } finally {
      setWdLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      addNotification('Veuillez remplir tous les champs.', 'danger');
      return;
    }
    setProfileLoading(true);
    try {
      await updateProfile(firstName.trim(), lastName.trim());
      addNotification('Profil mis à jour avec succès.', 'success');
    } catch (err) {
      addNotification(err.message || 'Échec de la mise à jour.', 'danger');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleConvertKetSubmit = async () => {
    const amt = parseFloat(convertAmount);
    if (isNaN(amt) || amt < 200000) {
      addNotification('Le montant de conversion minimal est de 200 000 KET.', 'danger');
      return;
    }
    if (amt > (user?.ket_balance || 0)) {
      addNotification('Solde KET insuffisant.', 'danger');
      return;
    }
    setConvertLoading(true);
    try {
      await convertKet(amt);
      addNotification('Conversion réussie ! Votre solde HTG a été crédité.', 'success');
      setConvertAmount('');
    } catch (err) {
      addNotification(err.message || 'Échec de la conversion.', 'danger');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleCopyToUsdtClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUsdtText(true);
      addNotification("L'adresse USDT (BEP20) officielle a été copiée.", 'success');
      setTimeout(() => {
        setCopiedUsdtText(false);
      }, 2000);
    }).catch(err => {
      addNotification("Impossible de copier l'adresse.", 'danger');
    });
  };

  const handleUsdtDepositSubmit = async (e) => {
    e.preventDefault();
    setUsdtDepError('');
    setUsdtDepSuccess('');

    if (!usdtDepTxHash) {
      return setUsdtDepError('Le hash de la transaction (Tx Hash) est requis.');
    }

    setUsdtDepLoading(true);
    try {
      const data = await apiRequest('/api/transactions/usdt/deposit', {
        method: 'POST',
        body: { txHash: usdtDepTxHash }
      });
      
      if (data.status === 'pending_confirmations') {
        setUsdtDepSuccess(data.message);
        addNotification(data.message, 'info');
      } else {
        setUsdtDepSuccess(data.message || 'Votre dépôt USDT a été crédité avec succès.');
        addNotification(data.message || 'Votre dépôt USDT a été crédité avec succès.', 'success');
        setUsdtDepTxHash('');
        await refreshBalance();
        await fetchUsdtStats();
      }
    } catch (err) {
      setUsdtDepError(err.message || 'Échec de la validation de la transaction.');
      addNotification(err.message || 'Échec de la validation de la transaction.', 'danger');
    } finally {
      setUsdtDepLoading(false);
    }
  };

  const handleUsdtWithdrawSubmit = async (e) => {
    e.preventDefault();
    setUsdtWdError('');
    setUsdtWdSuccess('');

    const amt = parseFloat(usdtWdAmount);
    const minWd = usdtStats?.configs?.minWd || 5;

    if (!usdtWdAmount || amt < minWd) {
      return setUsdtWdError(`Le montant minimal de retrait est de ${minWd} USDT.`);
    }

    if (amt > (user?.usdt_balance || 0)) {
      return setUsdtWdError('Solde USDT insuffisant.');
    }

    if (!usdtWdAddress) {
      return setUsdtWdError("Veuillez saisir l'adresse BEP20 de destination.");
    }

    setUsdtWdLoading(true);
    try {
      const data = await apiRequest('/api/transactions/usdt/withdraw', {
        method: 'POST',
        body: { amount: amt, address: usdtWdAddress }
      });
      setUsdtWdSuccess(data.message || 'Votre demande de retrait a été enregistrée.');
      addNotification(data.message || 'Votre demande de retrait a été enregistrée.', 'success');
      setUsdtWdAmount('');
      setUsdtWdAddress('');
      await refreshBalance();
      await fetchUsdtStats();
    } catch (err) {
      setUsdtWdError(err.message || 'Échec de la demande.');
      addNotification(err.message || 'Échec de la demande.', 'danger');
    } finally {
      setUsdtWdLoading(false);
    }
  };

  const handleUsdtExchangeSubmit = async (e) => {
    e.preventDefault();
    setUsdtExError('');
    setUsdtExSuccess('');

    const amt = parseFloat(usdtExAmount);
    if (!usdtExAmount || amt <= 0) {
      return setUsdtExError('Veuillez saisir un montant de conversion valide.');
    }

    if (amt > (user?.usdt_balance || 0)) {
      return setUsdtExError('Solde USDT insuffisant.');
    }

    setUsdtExLoading(true);
    try {
      const data = await apiRequest('/api/transactions/usdt/exchange', {
        method: 'POST',
        body: { amount: amt }
      });
      setUsdtExSuccess(data.message || 'Conversion réalisée avec succès.');
      addNotification(data.message || 'Conversion réalisée avec succès.', 'success');
      setUsdtExAmount('');
      await refreshBalance();
      await fetchUsdtStats();
    } catch (err) {
      setUsdtExError(err.message || 'Échec de la conversion.');
      addNotification(err.message || 'Échec de la conversion.', 'danger');
    } finally {
      setUsdtExLoading(false);
    }
  };

  return (
    <div className={`max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 grid grid-cols-1 ${selectedGame === 'ketmesye' && activeTab === 'play' ? '' : 'lg:grid-cols-4'} gap-6 relative`}>
      
      {/* Fullscreen Reward Choice Overlay */}
      {user?.pendingBonusChoices && user.pendingBonusChoices.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden my-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="text-center space-y-2 mb-6 relative z-10">
              <h2 className="font-display font-black text-xl md:text-2xl text-white tracking-wide uppercase">
                🎁 RÉCOMPENSE DE DÉPÔT DISPONIBLE !
              </h2>
              <p className="text-[11px] md:text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                Félicitations pour votre dépôt de <strong className="text-white">{user.pendingBonusChoices[0].depositAmount.toLocaleString('fr-FR')} HTG</strong>.
                Choisissez votre récompense ci-dessous. Attention, cette décision est définitive et ne peut pas être annulée.
              </p>
            </div>

            {claimError && (
              <div className="mb-4 p-3 bg-red-950/35 border border-red-500/35 rounded-xl text-red-400 text-[10px] font-bold animate-shake">
                {claimError}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-6 relative z-10">
              {/* Option A: Bonus Dépôt */}
              <button
                type="button"
                onClick={() => setSelectedRewardOption('bonus')}
                className={`text-left p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer group ${
                  selectedRewardOption === 'bonus'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.25)] transform scale-[1.02]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-450 hover:border-slate-700 hover:bg-slate-900/10'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className={`p-2.5 rounded-xl border ${
                      selectedRewardOption === 'bonus'
                        ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      <Coins className="h-5 w-5" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                      OPTION A
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm text-white group-hover:text-indigo-400 transition-colors">
                    {user.pendingBonusChoices[0].bonusType === 'first_deposit' ? 'Bonus Premier Dépôt 100%' :
                     user.pendingBonusChoices[0].bonusType === 'vip_recharge' ? 'Bonus VIP Recharge 50%' : 'Bonus Recharge 25%'}
                  </h3>

                  <p className="text-[11px] text-slate-400 leading-normal">
                    Créditez <strong className="text-white">{user.pendingBonusChoices[0].potentialBonus.toLocaleString('fr-FR')} HTG</strong> supplémentaires sur votre solde bonus.
                  </p>

                  <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-800 text-[9px] text-slate-500 leading-normal space-y-1">
                    <p>🎯 <strong className="text-slate-400 font-bold">Wager Requirement:</strong> 10x conditions de mise.</p>
                    <p>💰 <strong className="text-slate-400 font-bold">Total requis:</strong> {(user.pendingBonusChoices[0].potentialBonus * 10).toLocaleString('fr-FR')} HTG de mise.</p>
                    <p>⏱️ <strong className="text-slate-400 font-bold">Validité:</strong> 7 jours.</p>
                  </div>
                </div>
              </button>

              {/* Option B: XP Booster */}
              <button
                type="button"
                onClick={() => setSelectedRewardOption('booster')}
                className={`text-left p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer group ${
                  selectedRewardOption === 'booster'
                    ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.25)] transform scale-[1.02]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-450 hover:border-slate-700 hover:bg-slate-900/10'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className={`p-2.5 rounded-xl border ${
                      selectedRewardOption === 'booster'
                        ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      <Flame className="h-5 w-5" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                      OPTION B
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm text-white group-hover:text-purple-400 transition-colors">
                    XP Booster x2 (7 jours)
                  </h3>

                  <p className="text-[11px] text-slate-400 leading-normal">
                    Doublez l'XP généré par toutes vos mises sur Ketarena pendant les 7 prochains jours.
                  </p>

                  <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-800 text-[9px] text-slate-500 leading-normal space-y-1">
                    <p>⚡ <strong className="text-slate-400 font-bold">XP Multiplier:</strong> x2.0 XP sur tous les wagers HTG.</p>
                    <p>🏆 <strong className="text-slate-400 font-bold">Leaderboards:</strong> Grimpez deux fois plus vite dans les compétitions.</p>
                    <p>🎁 <strong className="text-slate-400 font-bold">Coffres:</strong> Débloquez les coffres Lucky XP Chest ultra-rapidement.</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="flex flex-col items-center space-y-2 relative z-10">
              <button
                type="button"
                onClick={() => handleClaimRewardChoice(selectedRewardOption)}
                disabled={!selectedRewardOption || claimLoading}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-black rounded-xl text-xs transition-all shadow-lg active:scale-95 flex items-center space-x-2 cursor-pointer"
              >
                {claimLoading ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>CHARGEMENT...</span>
                  </>
                ) : (
                  <span>ACTIVER MA RÉCOMPENSE</span>
                )}
              </button>
              <p className="text-[9px] text-slate-500">
                En activant, vous acceptez les règles générales des bonus Ketarena.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Warning Modal */}
      {showWdWarning && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 text-center animate-pop-in relative">
            <div className="mx-auto w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center shadow-md">
              <ShieldAlert className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h3 className="font-display font-black text-base text-white uppercase">
                ⚠️ ATTENTION : RETRAIT AVEC BONUS ACTIF
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Vous avez un bonus actif sur votre compte :
              </p>
              <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-800 text-xs font-mono font-bold text-slate-300 space-y-1">
                <p>🎁 Solde Bonus : <span className="text-red-400">{(user?.bonus_balance || 0).toFixed(2)} HTG</span></p>
                <p>🔒 Gains Bloqués : <span className="text-red-400">{(user?.locked_winnings || 0).toFixed(2)} HTG</span></p>
              </div>
              <p className="text-[10px] text-red-400/90 leading-relaxed font-bold">
                Effectuer ce retrait annulera définitivement et immédiatement votre bonus actif ainsi que vos gains bloqués.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWdWarning(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                ANNULER LE RETRAIT
              </button>
              <button
                type="button"
                onClick={() => executeWithdraw(true)}
                disabled={wdLoading}
                className="flex-1 py-2.5 bg-red-650 hover:bg-red-550 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
              >
                {wdLoading ? 'CHARGEMENT...' : 'CONFIRMER ET PERDRE LE BONUS'}
              </button>
            </div>
          </div>
        </div>
      )}

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

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 max-w-5xl mx-auto w-full px-2">
              {/* Card 1: Crash Plane */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-indigo-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/crash_plane.png" alt="Crash Plane" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-300 z-0"></div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-indigo-600/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-indigo-400 border border-indigo-500/15">
                      <Plane className="h-5 w-5 md:h-8 md:w-8 rotate-45" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-indigo-500/10 text-indigo-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-indigo-500/20">
                      Multiplicateur
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    CRASH PLANE
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Suivez la courbe de vol en temps réel ! La mise augmente de seconde en seconde.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('crash')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-indigo-600/15"
                >
                  JOUER
                </button>
              </div>

              {/* Card 2: Ketmesye (Snake) */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-yellow-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/ketmesye_snake.png" alt="KetMesye Snake" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-yellow-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-yellow-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-yellow-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-yellow-500 border border-yellow-500/15 animate-pulse">
                      <Gamepad2 className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-yellow-500/20">
                      Action PvP
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    KETMESYE
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    L'arène de serpent multijoueur ! Contrôlez votre serpent, mangez des pièces et encaissez.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('ketmesye')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-black rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-yellow-600/15"
                >
                  SPAWN
                </button>
              </div>

              {/* Card 3: Mines */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-cyan-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/mines_game.png" alt="Mines Game" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-cyan-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-cyan-500 border border-cyan-500/15 animate-pulse">
                      <Gem className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-cyan-500/10 text-cyan-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-cyan-500/20">
                      Solo / RNG
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    MINES
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Trouvez les diamants et évitez les mines ! Retirez vos gains à tout moment.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('mines')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-cyan-600/15"
                >
                  JOUER
                </button>
              </div>

              {/* Card 4: Duel Snake 1v1 */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-emerald-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/duel_snake.png" alt="Duel Snake" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-emerald-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-emerald-500 border border-emerald-500/15 animate-pulse">
                      <Gamepad2 className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-emerald-500/20">
                      1v1 P2P
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    DUEL SNAKE
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Affrontez un adversaire en 1v1 ! Misez et remportez 90% du pot. (Pénalités de mort)
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('snake_duel')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-emerald-600/15"
                >
                  DÉFIER
                </button>
              </div>

              {/* Card 5: KOTH (King of the Hill) */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-purple-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/koth_crown.png" alt="KOTH Crown" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-purple-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-purple-500 border border-purple-500/15 animate-pulse">
                      <ShieldAlert className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-purple-500/10 text-purple-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-purple-500/20">
                      BATTLE ROYALE
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    KING OF THE HILL
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Tournoi éliminatoire massif. Le dernier survivant rafle l'intégralité de la cagnotte !
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('koth')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-purple-600/15"
                >
                  REJOINDRE
                </button>
              </div>

              {/* Card 6: BLOOD MONEY */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-red-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/blood_money.png" alt="Blood Money" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-red-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-red-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-red-500 border border-red-500/15 animate-pulse">
                      <Flame className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-red-500/10 text-red-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-red-500/20">
                      CRASH URBAIN
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    BLOOD MONEY
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Échappez à la police dans cette course intense ! Choisissez votre route et encaissez votre butin avant d'être arrêté.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('bloodmoney')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-red-600/15"
                >
                  JOUER
                </button>
              </div>

              {/* Card 7: LAST SECOND */}
              <div className="glass-panel group relative rounded-2xl md:rounded-3xl p-3 md:p-6 bg-slate-900/40 border border-slate-800 hover:border-emerald-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl transform hover:-translate-y-1">
                <img src="/games/last_second.png" alt="Last Second" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
                <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-300 z-0"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3 md:mb-6">
                    <div className="bg-emerald-500/10 p-2 md:p-4 rounded-xl md:rounded-2xl text-emerald-400 border border-emerald-500/15 animate-pulse">
                      <Clock className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-emerald-500/20">
                      LIVE FOOTBALL
                    </span>
                  </div>

                  <h3 className="font-display font-black text-sm md:text-xl text-white mb-1 md:mb-2 tracking-wide">
                    LAST SECOND
                  </h3>
                  <p className="text-slate-400 text-[9px] md:text-xs leading-tight md:leading-relaxed mb-4 md:mb-6">
                    Pariez en direct sur des matchs réels ! Encaissez avant le but ou tenez bon sans but.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedGame('lastsecond')}
                  className="relative z-10 w-full py-2 md:py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg md:rounded-xl text-[9px] md:text-xs transition-all tracking-wide shadow-md shadow-emerald-600/15"
                >
                  JOUER
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
                  <p className="text-white text-lg font-bold">+{cashoutSuccess.payout} {myBet?.currency || user?.active_currency || 'HTG'}</p>
                  <p className="text-emerald-300 text-xs mt-1">Encaissé à {cashoutSuccess.multiplier}x</p>
                </div>
              )}

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

            {/* Wagering Control Panel */}
            <div className="glass-panel p-4 sm:p-5 rounded-3xl mt-4 max-w-xl mx-auto w-full space-y-4">
              {/* Inputs Bar */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-900 shadow-inner">
                {/* Bet Amount Control */}
                <div className="flex flex-col justify-center">
                  <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {user?.active_currency === 'KET' ? 'Montant (Min: 100 KET)' : 'Montant (Min: 10 HTG)'}
                  </label>
                  <div className="relative rounded-xl overflow-hidden flex border border-slate-800 bg-slate-900/40">
                    <span className="bg-slate-900 px-2 sm:px-3 py-1 sm:py-2 text-slate-500 text-xs sm:text-sm font-bold flex items-center">
                      {user?.active_currency || 'HTG'}
                    </span>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBetAmount(val === '' ? '' : parseInt(val) || 0);
                      }}
                      onBlur={() => {
                        const minVal = user?.active_currency === 'KET' ? 100 : 10;
                        if (!betAmount || betAmount < minVal) setBetAmount(minVal);
                      }}
                      disabled={myBet && myBet.status === 'placed'}
                      className="block w-full px-2 py-1 sm:px-3 sm:py-2 bg-transparent text-slate-200 focus:outline-none text-xs sm:text-sm font-bold"
                    />
                    <button 
                      onClick={() => {
                        const minVal = user?.active_currency === 'KET' ? 100 : 10;
                        setBetAmount(prev => Math.max(minVal, Math.round((parseInt(prev) || 0) / 2)));
                      }}
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

              {/* Bet Action Button */}
              <div className="w-full flex flex-col justify-center">
                {myBet && myBet.status === 'placed' && gameStatus === 'flying' ? (
                  // Live cashout button
                  <button
                    onClick={handleCashout}
                    className="w-full py-3.5 sm:py-4 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-base sm:text-lg tracking-wider transition-all duration-150 transform active:scale-95 glow-emerald hover:brightness-105"
                  >
                    CASH OUT
                    <span className="block text-xs font-mono font-bold text-slate-900/70 mt-0.5">
                      {(betAmount * multiplier).toFixed(2)} {myBet.currency || user?.active_currency || 'HTG'}
                    </span>
                  </button>
                ) : myBet && myBet.status === 'placed' ? (
                  // Placed but waiting for round start
                  <button
                    disabled
                    className="w-full py-3.5 sm:py-4 px-4 bg-emerald-600 text-slate-950 font-black rounded-xl font-bold text-sm select-none border border-emerald-500 glow-emerald shadow-lg shadow-emerald-500/20"
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
                    className="w-full py-3.5 sm:py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed glow-indigo"
                  >
                    PLACER LE PARI
                    <span className="block text-xs font-mono font-normal text-indigo-200 mt-0.5">
                      Mise: {betAmount} {user?.active_currency || 'HTG'} {autoCashout ? `@ ${autoCashout}x` : ''}
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



        {/* Tab content 4: PLAY GAME (MINES ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'mines' && (
          <MinesGame socket={socket} user={user} balance={userBalanceRef.current} setSelectedGame={setSelectedGame} />
        )}

        {/* Tab content 1: PLAY GAME (KETMESYE GAME ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'ketmesye' && (
          <KetmesyeGame 
            socket={socket} 
            onBackToLobby={() => setSelectedGame(null)} 
            addNotification={addNotification} 
            onPlayStateChange={(playing) => setIsKetmesyePlaying(playing)}
          />
        )}

        {/* Tab content: PLAY GAME (SNAKE DUEL ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'snake_duel' && (
          <KetmesyeGame 
            socket={socket} 
            onBackToLobby={() => setSelectedGame(null)} 
            addNotification={addNotification} 
            onPlayStateChange={(playing) => setIsKetmesyePlaying(playing)}
            initialMode="duel"
          />
        )}

        {/* Tab content: PLAY GAME (KOTH ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'koth' && (
          <KothGame socket={socket} user={user} balance={userBalanceRef.current} setSelectedGame={setSelectedGame} />
        )}

        {/* Tab content: PLAY GAME (BLOOD MONEY ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'bloodmoney' && (
          <BloodmoneyGame socket={socket} setSelectedGame={setSelectedGame} />
        )}

        {/* Tab content: PLAY GAME (LAST SECOND ACTIVE) */}
        {activeTab === 'play' && selectedGame === 'lastsecond' && (
          <LastSecondGame socket={socket} onBackToLobby={() => setSelectedGame(null)} addNotification={addNotification} />
        )}

        {/* Tab content 2: DEPOSITS */}
        {activeTab === 'deposit' && (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 max-w-4xl mx-auto">
            <div className="text-center md:text-left">
              <h3 className="font-display font-black text-2xl text-white">Méthode de Dépôt</h3>
              <p className="text-sm text-slate-400 mt-1">Créditez votre compte manuellement ou via le réseau blockchain BEP20.</p>
            </div>

            {/* Method Selector */}
            <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-4">
              <button
                type="button"
                onClick={() => setDepositMethod('fiat')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  depositMethod === 'fiat'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-450 hover:text-slate-200'
                }`}
              >
                <Landmark className="h-4 w-4" />
                <span>MonCash / NatCash</span>
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('usdt')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  depositMethod === 'usdt'
                    ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-450 hover:text-slate-200'
                }`}
              >
                <Coins className="h-4 w-4 text-emerald-400" />
                <span>USDT (BEP20)</span>
              </button>
            </div>

            {depositMethod === 'fiat' ? (
              <div className="space-y-6">
                {/* Promo Banner / Info Link */}
                <div 
                  onClick={() => setShowBonusPromoModal(true)}
                  className="group cursor-pointer relative overflow-hidden bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-slate-900/40 hover:from-indigo-500/15 hover:via-purple-500/15 hover:to-slate-900/60 border border-indigo-500/20 hover:border-indigo-500/45 rounded-2xl p-4 flex items-center justify-between transition-all duration-300 shadow-md animate-fade-in"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                      <Award className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm flex flex-wrap items-center gap-1.5">
                        🎁 Obtenez un Bonus à partir de 500 HTG !
                        <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          Offre Spéciale
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">Choisissez entre un Bonus sur Dépôt (jusqu'à +100%) ou un Booster XP. <span className="text-indigo-400 font-semibold group-hover:underline">Cliquez ici pour voir les conditions.</span></p>
                    </div>
                  </div>
                  <div className="text-slate-500 group-hover:text-slate-300 transition-colors pl-2 shrink-0">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                </div>

                {/* Payment instructions */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  
                  {/* MonCash Card */}
                  <div className="p-3 sm:p-5 bg-gradient-to-b from-slate-900/60 to-red-500/5 border border-red-500/10 hover:border-red-500/30 rounded-2xl flex flex-col justify-between transition-all duration-300 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-red-600 text-white flex items-center justify-center font-black text-xs sm:text-sm">M</span>
                        <span className="font-bold text-slate-200 text-xs sm:text-sm">MonCash</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('36203465', 'moncash')}
                        className={`flex items-center justify-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                          copiedText.moncash 
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' 
                            : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:text-white text-slate-400'
                        }`}
                      >
                        {copiedText.moncash ? (
                          <>
                            <Check className="h-2.5 w-2.5" />
                            <span>Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Numéro :</p>
                      <p className="font-mono font-black text-sm sm:text-xl text-red-500 mt-0.5">36203465</p>
                    </div>
                  </div>

                  {/* NatCash Card */}
                  <div className="p-3 sm:p-5 bg-gradient-to-b from-slate-900/60 to-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 rounded-2xl flex flex-col justify-between transition-all duration-300 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-xs sm:text-sm">N</span>
                        <span className="font-bold text-slate-200 text-xs sm:text-sm">NatCash</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('42398022', 'natcash')}
                        className={`flex items-center justify-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                          copiedText.natcash 
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' 
                            : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:text-white text-slate-400'
                        }`}
                      >
                        {copiedText.natcash ? (
                          <>
                            <Check className="h-2.5 w-2.5" />
                            <span>Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Numéro :</p>
                      <p className="font-mono font-black text-sm sm:text-xl text-emerald-400 mt-0.5">42398022</p>
                    </div>
                  </div>

                </div>

                <form onSubmit={handleDepositSubmit} className="space-y-5">
                  {depError && (
                    <div className="p-3.5 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl animate-fade-in font-bold">
                      {depError}
                    </div>
                  )}
                  {depSuccess && (
                    <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl animate-fade-in font-bold">
                      {depSuccess}
                    </div>
                  )}

                  {/* Provider choice */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Choisir le fournisseur</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDepProvider('moncash')}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                          depProvider === 'moncash' 
                            ? 'border-red-500 bg-red-500/10 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${depProvider === 'moncash' ? 'bg-red-400' : 'bg-slate-600'}`}></span>
                        <span>MonCash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepProvider('natcash')}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                          depProvider === 'natcash' 
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${depProvider === 'natcash' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                        <span>NatCash</span>
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Montant envoyé (HTG)</label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        placeholder="Ex: 500"
                        value={depAmount}
                        onChange={(e) => setDepAmount(e.target.value)}
                        className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-700 font-bold"
                        required
                      />
                      <span className="absolute right-4 text-xs font-bold text-slate-500 pointer-events-none">HTG</span>
                    </div>
                    
                    {/* Preset Chips */}
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {[250, 500, 1000, 2500, 5000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDepAmount(prev => {
                            const current = parseFloat(prev) || 0;
                            return (current + val).toString();
                          })}
                          className="bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95"
                        >
                          +{val.toLocaleString('fr-FR')} HTG
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phone number from which money is sent */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Numéro de téléphone expéditeur (MonCash / NatCash)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 36203465"
                      value={depPhone}
                      onChange={(e) => setDepPhone(e.target.value)}
                      className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-700 font-bold"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                      Veuillez saisir le numéro de téléphone avec lequel vous avez effectué le transfert de fonds (le numéro expéditeur), afin que notre équipe puisse associer et valider votre transaction.
                    </p>
                  </div>

                  {/* File Screenshot Upload */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Capture d'écran de la transaction</label>
                    
                    {!depFile ? (
                      <div 
                        onClick={() => {
                          const input = document.getElementById('screenshot-upload-input');
                          if (input) input.click();
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          const files = e.dataTransfer.files;
                          if (files && files.length > 0) {
                            const file = files[0];
                            if (['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
                              setDepFile(file);
                            } else {
                              addNotification('Seuls les formats JPEG, PNG et GIF sont autorisés.', 'danger');
                            }
                          }
                        }}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center hover:bg-slate-900/10 hover:border-indigo-500/50 transition-all relative flex flex-col items-center justify-center cursor-pointer ${
                          isDragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 bg-slate-950/40'
                        }`}
                      >
                        <input
                          id="screenshot-upload-input"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) setDepFile(file);
                          }}
                          className="hidden"
                        />
                        <div className="bg-slate-900/60 p-3 rounded-full text-slate-500 mb-2.5">
                          <Upload className="h-6 w-6" />
                        </div>
                        <p className="text-xs text-slate-355 font-bold">
                          Cliquez ou déposez votre capture d'écran ici
                        </p>
                        <p className="text-[10px] text-slate-600 mt-1">Seuls les formats JPEG, PNG et GIF sont autorisés (max. 5 Mo).</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 animate-slide-up">
                        <div className="flex items-center">
                          {filePreviewUrl ? (
                            <img
                              src={filePreviewUrl}
                              alt="Reçu"
                              className="w-12 h-12 rounded-lg border border-slate-800 object-cover bg-black"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-500">
                              <Upload className="h-5 w-5" />
                            </div>
                          )}
                          <div className="flex flex-col text-left ml-3">
                            <span className="text-xs font-bold text-slate-200 max-w-[200px] truncate" title={depFile.name}>
                              {depFile.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {(depFile.size / 1024).toFixed(1)} Ko
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDepFile(null)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-505 text-red-400 transition-all cursor-pointer"
                        >
                          <span>Retirer</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={depLoading}
                    className="w-full py-4 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer font-display"
                  >
                    {depLoading ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Traitement en cours...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Soumettre le Reçu</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              // USDT BEP20 Deposit Interface
              <div className="space-y-6 animate-fade-in">
                {/* Warnings */}
                <div className="p-4 bg-amber-950/20 border border-amber-500/25 rounded-2xl flex items-start space-x-3 text-amber-350 text-xs">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold uppercase tracking-wider text-amber-400">Réseau BNB Smart Chain (BEP20) Uniquement</p>
                    <p className="mt-0.5 leading-relaxed text-amber-500/90 font-medium">Envoyez uniquement des USDT via le réseau BEP20. Tout autre réseau ou actif entraînera une perte définitive des fonds.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  {/* QR Code Column */}
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-950/40 border border-slate-900 rounded-3xl text-center gap-3">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">QR Code de Dépôt</span>
                    {usdtStats?.configs?.adminWallet ? (
                      <div className="bg-white p-2 rounded-2xl border border-slate-200">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${usdtStats.configs.adminWallet}`} 
                          alt="QR Code USDT"
                          className="w-36 h-36"
                        />
                      </div>
                    ) : (
                      <div className="w-36 h-36 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 animate-pulse text-[10px]">
                        Chargement...
                      </div>
                    )}
                    <span className="text-[9px] text-slate-500 font-semibold leading-normal">Scannez pour obtenir l'adresse de transfert.</span>
                  </div>

                  {/* Wallet details & Copy address Column */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="p-5 bg-gradient-to-b from-slate-900/60 to-emerald-500/5 border border-emerald-500/10 rounded-2xl shadow-md space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-200 text-sm flex items-center space-x-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-450 animate-pulse"></span>
                          <span>USDT Wallet Officiel</span>
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => handleCopyToUsdtClipboard(usdtStats?.configs?.adminWallet || '')}
                          disabled={!usdtStats?.configs?.adminWallet}
                          className={`flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            copiedUsdtText
                              ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                              : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:text-white text-slate-400'
                          }`}
                        >
                          {copiedUsdtText ? (
                            <>
                              <Check className="h-3 w-3" />
                              <span>Copié !</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copier l'adresse</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="p-3.5 bg-slate-950 border border-slate-900 rounded-xl">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Adresse BEP20 :</p>
                        <p className="font-mono font-black text-xs sm:text-sm text-emerald-400 mt-1 break-all select-all">
                          {usdtStats?.configs?.adminWallet || '0x...'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900 flex flex-col">
                          <span className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Dépôt Minimum :</span>
                          <span className="font-black text-white mt-0.5">{usdtStats?.configs?.minDep || 5} USDT</span>
                        </div>
                        <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900 flex flex-col">
                          <span className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Réseau :</span>
                          <span className="font-black text-white mt-0.5">BEP20 (BSC)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tx Hash form */}
                <form onSubmit={handleUsdtDepositSubmit} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                  <h4 className="font-display font-black text-sm text-white">Vérification Automatique de la Blockchain</h4>
                  <p className="text-xs text-slate-400 leading-normal">
                    Une fois votre transfert USDT BEP20 effectué, collez le <strong>Transaction Hash (Tx Hash)</strong> de la transaction ci-dessous. Notre scanner interrogera la blockchain BSC pour créditer votre compte instantanément.
                  </p>

                  {usdtDepError && (
                    <div className="p-3.5 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl font-bold animate-shake">
                      {usdtDepError}
                    </div>
                  )}
                  {usdtDepSuccess && (
                    <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-bold animate-fade-in">
                      {usdtDepSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaction Hash (Tx Hash)</label>
                    <input
                      type="text"
                      placeholder="Ex: 0xe00adbc2..."
                      value={usdtDepTxHash}
                      onChange={(e) => setUsdtDepTxHash(e.target.value)}
                      className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={usdtDepLoading}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer font-display"
                  >
                    {usdtDepLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>VÉRIFICATION BLOCKCHAIN...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="h-4 w-4 text-emerald-450" />
                        <span>Vérifier et Créditer mon USDT</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Tab content 3: WITHDRAWALS */}
        {activeTab === 'withdraw' && (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 max-w-2xl mx-auto">
            <div className="text-center md:text-left">
              <h3 className="font-display font-black text-2xl text-white">Demande de Retrait</h3>
              <p className="text-sm text-slate-400 mt-1">Retirez vos HTG ou vos USDT de votre compte en toute sécurité.</p>
            </div>

            {/* Method Selector */}
            <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-4">
              <button
                type="button"
                onClick={() => setWithdrawMethod('fiat')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  withdrawMethod === 'fiat'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Landmark className="h-4 w-4" />
                <span>MonCash / NatCash</span>
              </button>
              <button
                type="button"
                onClick={() => setWithdrawMethod('usdt')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  withdrawMethod === 'usdt'
                    ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Coins className="h-4 w-4 text-emerald-400" />
                <span>USDT (BEP20)</span>
              </button>
            </div>

            {withdrawMethod === 'fiat' ? (
              <>
                {/* Fee Warning */}
                <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl flex items-start space-x-3 text-indigo-300 text-xs animate-fade-in">
                  <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Frais de retrait de 10% applicables</p>
                    <p className="mt-0.5 text-indigo-400/80">Pour assurer les coûts opérationnels et de transfert, 10% sont automatiquement prélevés sur chaque retrait.</p>
                  </div>
                </div>

                <form onSubmit={handleWithdrawSubmit} className="space-y-5">
                  {wdError && (
                    <div className="p-3.5 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl animate-fade-in">
                      {wdError}
                    </div>
                  )}
                  {wdSuccess && (
                    <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl animate-fade-in">
                      {wdSuccess}
                    </div>
                  )}

                  {/* Provider choice */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Choisir la méthode de retrait</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setWdProvider('moncash')}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                          wdProvider === 'moncash' 
                            ? 'border-red-500 bg-red-500/10 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${wdProvider === 'moncash' ? 'bg-red-500' : 'bg-slate-600'}`}></span>
                        <span>MonCash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWdProvider('natcash')}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                          wdProvider === 'natcash' 
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${wdProvider === 'natcash' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                        <span>NatCash</span>
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Montant du retrait (HTG)</label>
                      <button
                        type="button"
                        onClick={() => setWdAmount((user?.balance ?? 0).toString())}
                        className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase cursor-pointer"
                      >
                        Solde Max ({(user?.balance ?? 0).toLocaleString('fr-FR')} G)
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        placeholder="Min: 100 HTG"
                        value={wdAmount}
                        onChange={(e) => setWdAmount(e.target.value)}
                        className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-700 font-bold font-mono"
                        required
                      />
                      <span className="absolute right-4 text-xs font-bold text-slate-500 pointer-events-none">HTG</span>
                    </div>
                    
                    {/* Preset Chips */}
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {[100, 250, 500, 1000, 5000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWdAmount(val.toString())}
                          className="bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95"
                        >
                          {val.toLocaleString('fr-FR')} HTG
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phone number */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Numéro de Téléphone (MonCash / NatCash)</label>
                    <input
                      type="text"
                      placeholder="Ex: 36203465"
                      value={wdPhone}
                      onChange={(e) => setWdPhone(e.target.value)}
                      className="block w-full px-4 py-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-700 font-bold"
                      required
                    />
                  </div>

                  {/* Automatic Fee Calculation display */}
                  {wdAmount && parseFloat(wdAmount) >= 100 && (
                    <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5 text-xs animate-slide-up">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Montant demandé :</span>
                        <span className="font-mono text-slate-300 font-bold">{parseFloat(wdAmount).toFixed(2)} HTG</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Frais opérationnels (10%) :</span>
                        <span className="font-mono text-red-500">-{ (parseFloat(wdAmount) * 0.1).toFixed(2) } HTG</span>
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                        <span className="text-slate-200">Total net à recevoir :</span>
                        <span className="font-mono text-emerald-400 font-black tracking-wide">{ (parseFloat(wdAmount) * 0.9).toFixed(2) } HTG</span>
                      </div>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={wdLoading}
                    className="w-full py-4 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer font-display"
                  >
                    {wdLoading ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Traitement en cours...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Demander le Retrait</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* USDT Warning */}
                <div className="p-4 bg-amber-950/20 border border-amber-500/25 rounded-2xl flex items-start space-x-3 text-amber-300 text-xs animate-fade-in">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold uppercase tracking-wider text-amber-400">Réseau BNB Smart Chain (BEP20) Uniquement</p>
                    <p className="mt-0.5 leading-relaxed text-amber-500/90 font-medium">Saisissez uniquement une adresse de destination BEP20 valide. Tout retrait envoyé vers un autre réseau ou une adresse erronée entraînera une perte définitive des fonds.</p>
                  </div>
                </div>

                <form onSubmit={handleUsdtWithdrawSubmit} className="space-y-5 animate-fade-in">
                  {usdtWdError && (
                    <div className="p-3.5 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl font-bold animate-shake">
                      {usdtWdError}
                    </div>
                  )}
                  {usdtWdSuccess && (
                    <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-bold animate-fade-in">
                      {usdtWdSuccess}
                    </div>
                  )}

                  {/* Wallet address input */}
                  <div className="flex flex-col gap-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Adresse de destination BEP20 (USDT)</label>
                    <input
                      type="text"
                      placeholder="Ex: 0x9f53..."
                      value={usdtWdAddress}
                      onChange={(e) => setUsdtWdAddress(e.target.value)}
                      className="block w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                      required
                    />
                  </div>

                  {/* Amount input */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Montant du retrait (USDT)</label>
                      <button
                        type="button"
                        onClick={() => setUsdtWdAmount((user?.usdt_balance ?? 0).toString())}
                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase cursor-pointer"
                      >
                        Solde Max ({(user?.usdt_balance ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT)
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.000001"
                        placeholder={`Min: ${usdtStats?.configs?.minWd || 5} USDT`}
                        value={usdtWdAmount}
                        onChange={(e) => setUsdtWdAmount(e.target.value)}
                        className="block w-full px-4 py-3.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                        required
                      />
                      <span className="absolute right-4 text-xs font-bold text-slate-500 pointer-events-none">USDT</span>
                    </div>
                  </div>

                  {/* Automatic Fee Calculation display */}
                  {usdtWdAmount && parseFloat(usdtWdAmount) > 0 && (
                    <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5 text-xs animate-slide-up">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Montant demandé :</span>
                        <span className="font-mono text-slate-300 font-bold">{parseFloat(usdtWdAmount).toFixed(6)} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Frais opérationnels ({usdtStats?.configs?.feeWd || 10}%) :</span>
                        <span className="font-mono text-red-500">-{ (parseFloat(usdtWdAmount) * ((usdtStats?.configs?.feeWd || 10) / 100)).toFixed(6) } USDT</span>
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                        <span className="text-slate-200">Total net à recevoir :</span>
                        <span className="font-mono text-emerald-400 font-black tracking-wide">{ (parseFloat(usdtWdAmount) * (1 - (usdtStats?.configs?.feeWd || 10) / 100)).toFixed(6) } USDT</span>
                      </div>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={usdtWdLoading}
                    className="w-full py-4 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer font-display"
                  >
                    {usdtWdLoading ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Traitement en cours...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Demander le Retrait USDT</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
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
                            {bet.is_won ? `+${bet.payout_amount ? bet.payout_amount.toFixed(2) : '0.00'} ${bet.currency || 'HTG'}` : `- ${bet.bet_amount ? bet.bet_amount.toFixed(2) : '0.00'} ${bet.currency || 'HTG'}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* My Transactions History Table */}
            <div className="glass-panel p-6 rounded-3xl animate-fade-in">
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
                      {myHistory.transactions.map((tx, idx) => {
                        const isUsdt = tx.provider === 'usdt_bep20';
                        return (
                          <tr key={idx} className="hover:bg-slate-900/25 transition-colors">
                            <td className="py-3 text-slate-400">
                              {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                tx.type === 'deposit' ? 'bg-emerald-950/60 border border-emerald-500/20 text-emerald-400' : 'bg-red-950/60 border border-red-500/20 text-red-400'
                              }`}>
                                {tx.type === 'deposit' ? 'Dépôt' : 'Retrait'}
                              </span>
                            </td>
                            <td className="py-3 text-slate-300 font-medium">
                              {isUsdt ? (
                                tx.type === 'deposit' ? (
                                  <a
                                    href={`https://bscscan.com/tx/${tx.tx_hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-500 hover:underline font-bold"
                                  >
                                    USDT BEP20 (Blockchain)
                                  </a>
                                ) : (
                                  <a
                                    href={`https://bscscan.com/address/${tx.phone_number}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-500 hover:underline font-mono"
                                    title={tx.phone_number}
                                  >
                                    Vers {tx.phone_number.substring(0, 6)}...{tx.phone_number.substring(tx.phone_number.length - 4)}
                                  </a>
                                )
                              ) : (
                                tx.type === 'deposit' ? (tx.provider ? tx.provider.toUpperCase() : 'N/A') : `Vers ${tx.phone_number || 'N/A'}`
                              )}
                            </td>
                            <td className="py-3 font-mono font-bold text-slate-400">
                              {tx.amount ? tx.amount.toFixed(isUsdt ? 4 : 2) : '0.00'} {isUsdt ? 'USDT' : 'HTG'}
                            </td>
                            <td className="py-3 font-mono text-red-455/80">
                              {tx.fee > 0 ? `-${tx.fee.toFixed(isUsdt ? 4 : 2)} ${isUsdt ? 'USDT' : 'HTG'}` : '-'}
                            </td>
                            <td className="py-3 font-mono font-bold text-slate-200">
                              {tx.net_amount ? tx.net_amount.toFixed(isUsdt ? 4 : 2) : '0.00'} {isUsdt ? 'USDT' : 'HTG'}
                            </td>
                            <td className="py-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tx.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' :
                                tx.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                                'bg-amber-500/10 text-amber-400'
                              }`}>
                                {tx.status === 'approved' ? 'Approuvé' :
                                 tx.status === 'rejected' ? 'Refusé' :
                                 'En attente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
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

        {/* Tab content 6: PROFILE & KET TOKEN */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fade-in">
            {/* Header info / summary card */}
            <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center space-x-4">
                <div className="bg-indigo-600/10 p-4 rounded-2xl text-indigo-400 border border-indigo-500/15">
                  <User className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="font-display font-black text-xl text-white">
                    {user?.first_name || user?.last_name ? `${user.first_name} ${user.last_name}` : 'Utilisateur'}
                  </h4>
                  <p className="text-xs text-slate-400">{user?.email}</p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                    Devise Active: <span className={user?.active_currency === 'KET' ? 'text-pink-400' : 'text-emerald-400'}>{user?.active_currency || 'HTG'}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col items-start md:items-end md:text-right">
                <span className="text-xs text-slate-400">Solde KET Accumulé</span>
                <span className="font-mono font-black text-2xl text-pink-400 mt-0.5">
                  {Math.round(user?.ket_balance || 0).toLocaleString('en-US')} KET
                </span>
                <span className="text-[10px] text-slate-500 mt-1">
                  Équivaut à {((user?.ket_balance || 0) / 10000).toFixed(2)} HTG
                </span>
              </div>
            </div>

            {/* Profile update card */}
            <div className="max-w-xl mx-auto w-full">
              
              {/* Profile info form */}
              <div className="glass-panel p-6 rounded-3xl space-y-4">
                <h3 className="font-display font-black text-lg text-white flex items-center space-x-2">
                  <User className="h-5 w-5 text-indigo-400" />
                  <span>Informations du Profil</span>
                </h3>
                <p className="text-xs text-slate-400">Mettez à jour votre nom et prénom associés à votre compte.</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Prénom</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Prénom"
                      className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Nom</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Nom de famille"
                      className="block w-full px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <button
                    onClick={handleUpdateProfile}
                    disabled={profileLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    {profileLoading ? 'Mise à jour...' : 'Mettre à jour le Profil'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab content 7: REWARDS AND PROGRESSION */}
        {activeTab === 'rewards' && (
          loadingRewards && !rewardsStats ? (
            <div className="flex h-64 items-center justify-center bg-transparent">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            </div>
          ) : !rewardsStats ? (
            <div className="text-center py-12 text-slate-500 font-bold">
              Une erreur est survenue lors du chargement des statistiques.
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Level / XP progression and KET balance stats grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Progression Widget */}
                <div className="glass-panel p-6 rounded-3xl space-y-4 bg-gradient-to-br from-slate-900/40 via-indigo-950/5 to-slate-900/40 border border-slate-800 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
                  
                  <div className="flex items-center space-x-3.5">
                    <div className="bg-indigo-600/10 p-3.5 rounded-2xl text-indigo-400 border border-indigo-500/15">
                      <Award className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Niveau de Fidélité</p>
                      <h4 className="font-display font-black text-xl text-white mt-0.5 flex items-center space-x-2">
                        <span>Niveau {rewardsStats.level}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          rewardsStats.badge === 'Bronze' ? 'bg-amber-900/30 border border-amber-500/20 text-amber-500' :
                          rewardsStats.badge === 'Argent' ? 'bg-slate-700/30 border border-slate-500/20 text-slate-400' :
                          rewardsStats.badge === 'Or' ? 'bg-yellow-950/40 border border-yellow-500/20 text-yellow-500' :
                          rewardsStats.badge === 'Platine' ? 'bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 font-extrabold' :
                          'bg-pink-950/40 border border-pink-500/30 text-pink-400 font-extrabold shadow-md shadow-pink-500/15'
                        }`}>
                          {rewardsStats.badge}
                        </span>
                      </h4>
                    </div>
                  </div>

                  {/* XP Progress Bar */}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-400">Progression XP</span>
                      <span className="font-mono text-slate-300">
                        {rewardsStats.nextXpRequired 
                          ? `${rewardsStats.xp.toFixed(1)} / ${rewardsStats.nextXpRequired} XP` 
                          : `${rewardsStats.xp.toFixed(1)} XP (Niveau Max)`}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          rewardsStats.badge === 'Diamant' 
                            ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500' 
                            : 'bg-indigo-600'
                        }`}
                        style={{ 
                          width: `${rewardsStats.nextXpRequired 
                            ? Math.max(5, ((rewardsStats.xp - rewardsStats.xpRequired) / (rewardsStats.nextXpRequired - rewardsStats.xpRequired)) * 100) 
                            : 100}%` 
                        }}
                      />
                    </div>
                    {rewardsStats.nextBadge && (
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Gagnez encore <strong className="text-slate-400">{(rewardsStats.nextXpRequired - rewardsStats.xp).toFixed(1)} XP</strong> pour passer au rang <strong className="text-slate-400">{rewardsStats.nextBadge}</strong>.
                      </p>
                    )}
                  </div>
                </div>

                {/* KET Wallet Widget */}
                <div className="glass-panel p-6 rounded-3xl space-y-4 bg-gradient-to-br from-slate-900/40 via-pink-950/5 to-slate-900/40 border border-slate-800 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl pointer-events-none"></div>

                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3.5">
                      <div className="bg-pink-600/10 p-3.5 rounded-2xl text-pink-400 border border-pink-500/15">
                        <Coins className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Solde KET Fidélité</p>
                        <h4 className="font-mono font-black text-2xl text-pink-400 mt-0.5">
                          {Math.round(rewardsStats.ketBalance).toLocaleString('fr-FR')} KET
                        </h4>
                      </div>
                    </div>
                    
                    {/* Status Badge */}
                    <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 py-1 px-2.5 rounded-full">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Sécurisé</span>
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-slate-400 leading-relaxed bg-slate-950/40 border border-slate-900 rounded-xl p-3.5">
                    <div className="flex justify-between">
                      <span>Valeur réelle convertible :</span>
                      <strong className="text-white">{(rewardsStats.ketBalance / 10000).toFixed(2)} HTG</strong>
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                      <span>Règle d'inactivité :</span>
                      <span>Les KET expirent après 10j d'inactivité.</span>
                    </div>
                  </div>
                </div>

              </div>


              {/* Conversion Form & Requirements Checklist Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Left part: Requirements list (1 col) */}
                <div className="glass-panel p-6 rounded-3xl space-y-4 bg-slate-900/30 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display font-black text-sm text-white uppercase tracking-wider mb-3">Conditions de Conversion</h3>
                    <div className="space-y-3">
                      {/* Req 1: Level 5 */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Niveau 5 (Diamant)</span>
                        {rewardsStats.level >= 5 ? (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                            <Check className="h-4 w-4" />
                            <span>Rempli</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 text-red-500 font-bold">
                            <ShieldAlert className="h-4 w-4" />
                            <span>Requis</span>
                          </span>
                        )}
                      </div>
                      
                      {/* Req 2: Net Loss */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Condition d'activité</span>
                        {rewardsStats.netLoss >= 10000 ? (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                            <Check className="h-4 w-4" />
                            <span>Rempli</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 text-red-500 font-bold">
                            <ShieldAlert className="h-4 w-4" />
                            <span>Requis</span>
                          </span>
                        )}
                      </div>
                      
                      {/* Req 3: Cooldown */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Délai Cooldown (21j)</span>
                        {rewardsStats.daysRemaining === 0 ? (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                            <Check className="h-4 w-4" />
                            <span>Prêt</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 text-amber-500 font-bold">
                            <Clock className="h-4 w-4" />
                            <span>{rewardsStats.daysRemaining} jours</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800 text-[10px] text-slate-500 leading-relaxed">
                    Taux d'échange officiel : <strong>10 000 KET = 1 HTG</strong>. La conversion est instantanée et s'ajoute à votre solde HTG disponible.
                  </div>
                </div>

                {/* Right part: Input Form (2 cols) */}
                <div className="md:col-span-2 glass-panel p-6 rounded-3xl space-y-4 bg-slate-900/40 border border-slate-800 relative overflow-hidden">
                  
                  {/* Lock Overlay if criteria are not met */}
                  {(rewardsStats.level < 5 || rewardsStats.netLoss < 10000 || rewardsStats.daysRemaining > 0) && (
                    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-6 z-10 text-center">
                      <div className="bg-slate-900 border border-slate-800 p-3 rounded-full text-pink-400 mb-3 shadow-lg">
                        <ShieldAlert className="h-8 w-8" />
                      </div>
                      <h4 className="font-display font-black text-sm text-white uppercase tracking-wider">Conversion Verrouillée</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                        Vous devez remplir toutes les conditions dans le panneau de gauche pour pouvoir déverrouiller la conversion KET.
                      </p>
                    </div>
                  )}

                  <h3 className="font-display font-black text-lg text-white">Convertir vos KET</h3>
                  <p className="text-xs text-slate-400">
                    Saisissez le montant de jetons KET à convertir en HTG (Minimum 1 000 KET).
                  </p>

                  <div className="space-y-4">
                    {rewardsError && (
                      <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl font-bold animate-fade-in">
                        {rewardsError}
                      </div>
                    )}
                    {rewardsSuccess && (
                      <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-bold animate-fade-in">
                        {rewardsSuccess}
                      </div>
                    )}

                    <div className="relative">
                      <input
                        type="number"
                        step="1000"
                        min="1000"
                        value={convertAmountRewards}
                        onChange={(e) => setConvertAmountRewards(e.target.value)}
                        placeholder="Montant minimum: 1000 KET"
                        className="block w-full pl-4 pr-16 py-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-pink-500 font-bold"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-pink-400">KET</span>
                    </div>

                    {convertAmountRewards && !isNaN(parseFloat(convertAmountRewards)) && (
                      <div className="flex justify-between items-center text-xs bg-pink-500/10 border border-pink-500/15 p-3.5 rounded-xl animate-fade-in">
                        <span className="text-pink-300 font-semibold">Montant converti estimé:</span>
                        <span className="font-mono font-black text-white">
                          +{(parseFloat(convertAmountRewards) / 10000).toFixed(2)} HTG
                        </span>
                      </div>
                    )}

                    <button
                      onClick={handleConvertRewardsSubmit}
                      disabled={convertLoadingRewards || !convertAmountRewards || parseFloat(convertAmountRewards) < 1000 || parseFloat(convertAmountRewards) > rewardsStats.ketBalance}
                      className="w-full py-3.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-pink-600/15 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
                    >
                      {convertLoadingRewards ? 'Conversion...' : 'Convertir en HTG'}
                    </button>
                  </div>
                </div>

              </div>

              {/* Progression notifications & transaction history tabs split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Notifications list */}
                <div className="glass-panel p-6 rounded-3xl">
                  <h3 className="font-display font-black text-base text-white mb-4 flex items-center space-x-2">
                    <ShieldAlert className="h-5 w-5 text-indigo-400" />
                    <span>Notifications de Progression</span>
                  </h3>
                  
                  {rewardsStats.notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Aucune notification pour le moment.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {rewardsStats.notifications.map((notif, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 rounded-xl border text-xs leading-normal flex items-start space-x-2.5 bg-slate-950/40 border-slate-900 text-slate-400"
                        >
                          <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                            notif.type === 'level_up' ? 'bg-indigo-500' :
                            notif.type === 'expiration' ? 'bg-red-500' : 'bg-amber-500'
                          }`} />
                          <div className="flex-grow">
                            <p className="font-medium">{notif.message}</p>
                            <span className="text-[9px] text-slate-500 block mt-1 font-mono">
                              {new Date(notif.created_at).toLocaleDateString('fr-FR')} {new Date(notif.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* KET History table */}
                <div className="glass-panel p-6 rounded-3xl">
                  <h3 className="font-display font-black text-base text-white mb-4 flex items-center space-x-2">
                    <History className="h-5 w-5 text-pink-400" />
                    <span>Historique des Jetons KET</span>
                  </h3>

                  {rewardsStats.history.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Aucun historique de jetons KET trouvé.</p>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto pr-1">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Description</th>
                            <th className="pb-2 text-right">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {rewardsStats.history.map((hLog, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/10 transition-colors">
                              <td className="py-2.5 text-slate-500 font-mono">
                                {new Date(hLog.created_at).toLocaleDateString('fr-FR')}
                              </td>
                              <td className="py-2.5 text-slate-300 font-medium">
                                {hLog.description}
                              </td>
                              <td className={`py-2.5 text-right font-mono font-bold ${
                                hLog.type === 'earning' ? 'text-emerald-400' : 
                                hLog.type === 'expiration' ? 'text-red-400' : 'text-pink-400'
                              }`}>
                                {hLog.amount > 0 ? `+${Math.round(hLog.amount).toLocaleString('fr-FR')}` : Math.round(hLog.amount).toLocaleString('fr-FR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )
        )}

        {/* Tab content: EXCHANGE (CONVERSION USDT -> HTG) */}
        {activeTab === 'exchange' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {/* Main conversion card */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 bg-gradient-to-br from-slate-900/40 via-emerald-950/5 to-slate-900/40 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="text-center md:text-left">
                <h3 className="font-display font-black text-2xl text-white flex items-center space-x-2">
                  <Coins className="h-6 w-6 text-emerald-400" />
                  <span>Exchange USDT → HTG</span>
                </h3>
                <p className="text-sm text-slate-400 mt-1">Convertissez instantanément vos USDT en gourdes (HTG) pour jouer directement sur Ketarena.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Stats panel */}
                <div className="space-y-4">
                  <div className="p-5 bg-slate-950/60 rounded-2xl border border-slate-900 space-y-3">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Solde USDT disponible :</span>
                      <span className="font-mono text-2xl font-black text-emerald-400 block mt-0.5">
                        {(user?.usdt_balance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT
                      </span>
                    </div>
                    <div className="border-t border-slate-900 pt-3">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Taux de conversion actuel :</span>
                      <span className="text-sm font-bold text-white block mt-0.5">
                        1 USDT = {usdtStats?.configs?.rate || 130} HTG
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-900 text-xs text-slate-400 leading-relaxed">
                    💡 <strong className="text-slate-300">Zéro frais de conversion :</strong> Ketarena n'applique aucun frais lors des conversions de devises. Vous recevez exactement la contrevaleur en HTG selon le taux fixé par l'administration.
                  </div>
                </div>

                {/* Form panel */}
                <form onSubmit={handleUsdtExchangeSubmit} className="space-y-4">
                  {usdtExError && (
                    <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-400 text-xs rounded-xl font-bold animate-shake">
                      {usdtExError}
                    </div>
                  )}
                  {usdtExSuccess && (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-bold animate-fade-in">
                      {usdtExSuccess}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Montant à convertir (USDT)</label>
                      <button
                        type="button"
                        onClick={() => setUsdtExAmount((user?.usdt_balance ?? 0).toString())}
                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase cursor-pointer"
                      >
                        Tout convertir
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="Ex: 10"
                        value={usdtExAmount}
                        onChange={(e) => setUsdtExAmount(e.target.value)}
                        className="block w-full px-4 py-3.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                        required
                      />
                      <span className="absolute right-4 text-xs font-bold text-slate-500 pointer-events-none">USDT</span>
                    </div>
                  </div>

                  {usdtExAmount && parseFloat(usdtExAmount) > 0 && (
                    <div className="p-4 bg-emerald-950/15 rounded-xl border border-emerald-500/10 flex items-center justify-between animate-slide-up">
                      <span className="text-xs text-emerald-300 font-bold">Montant crédité sur votre compte :</span>
                      <span className="font-mono text-lg font-black text-white">
                        +{(parseFloat(usdtExAmount) * (usdtStats?.configs?.rate || 130)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
                      </span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={usdtExLoading || !usdtExAmount || parseFloat(usdtExAmount) <= 0 || parseFloat(usdtExAmount) > (user?.usdt_balance || 0)}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/15 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
                  >
                    {usdtExLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>CONVERSION EN COURS...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        <span>Convertir en HTG</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* History panel */}
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <h3 className="font-display font-black text-lg text-white flex items-center space-x-2">
                <History className="h-5 w-5 text-emerald-500" />
                <span>Historique des Conversions USDT</span>
              </h3>

              {!usdtStats?.histories?.conversions || usdtStats.histories.conversions.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Aucune conversion enregistrée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Débité</th>
                        <th className="pb-3">Taux Appliqué</th>
                        <th className="pb-3 text-right">Crédité</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {usdtStats.histories.conversions.map((conv, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/25 transition-colors">
                          <td className="py-3 text-slate-400 font-mono">
                            {new Date(conv.created_at).toLocaleDateString('fr-FR')} {new Date(conv.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                          </td>
                          <td className="py-3 font-mono font-bold text-red-400">
                            -{parseFloat(conv.usdt_amount).toFixed(4)} USDT
                          </td>
                          <td className="py-3 font-mono text-slate-400">
                            1 USDT = {parseFloat(conv.rate).toFixed(0)} HTG
                          </td>
                          <td className="py-3 text-right font-mono font-black text-emerald-400">
                            +{parseFloat(conv.htg_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
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

        {/* Tab content 8: COMPETITIONS */}
        {activeTab === 'competitions' && (
          <Competitions onNotificationAdded={addNotification} />
        )}

      </div>

      {/* Right Sidebar: Active Bets list & Statistics */}
      {!(selectedGame === 'ketmesye' && activeTab === 'play') && (
        <div className="space-y-6">
        
        {/* Active XP Booster Badge */}
        {user?.xp_booster_expires_at && new Date(user.xp_booster_expires_at) > new Date() && (
          <div className="glass-panel p-5 rounded-3xl bg-gradient-to-br from-yellow-500/10 via-purple-500/5 to-yellow-500/10 border border-yellow-500/20 flex items-center justify-between shadow-lg shadow-yellow-500/5 animate-pulse-slow">
            <div className="flex items-center space-x-3">
              <div className="bg-yellow-500/20 p-2.5 rounded-xl text-yellow-500 border border-yellow-500/30">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-display font-black text-xs text-white uppercase tracking-wider">
                  ⚡ XP BOOSTER X2 ACTIF !
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  XP multiplié par 2.0 sur tous vos wagers.
                </p>
              </div>
            </div>
            <span className="text-[9px] font-bold text-yellow-400 bg-yellow-500/15 px-2.5 py-1 rounded-full border border-yellow-500/25">
              {Math.max(0, Math.ceil((new Date(user.xp_booster_expires_at) - new Date()) / (1000 * 60 * 60 * 24)))}j restants
            </span>
          </div>
        )}

        {/* Active Bonus & Wager Requirement Tracking Card */}
        {user?.wager_requirement_required > 0 && (
          <div className="glass-panel p-5 rounded-3xl bg-gradient-to-br from-slate-900/40 via-indigo-950/5 to-slate-900/40 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="bg-indigo-650/15 p-2 rounded-xl text-indigo-400 border border-indigo-500/25">
                  <Coins className="h-4 w-4" />
                </div>
                <h4 className="font-display font-black text-xs text-white uppercase tracking-wider">
                  🎁 BONUS DE DÉPÔT ACTIF
                </h4>
              </div>
              <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/20 animate-pulse">
                ACTIVE
              </span>
            </div>

            {/* Balances detailed breakdown */}
            <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-900">
              <div className="flex flex-col">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Cash</span>
                <span className="text-[10px] font-bold text-white font-mono">{(user?.balance ?? 0).toFixed(2)} G</span>
              </div>
              <div className="flex flex-col border-l border-slate-900">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Bonus</span>
                <span className="text-[10px] font-bold text-indigo-400 font-mono">{(user?.bonus_balance ?? 0).toFixed(2)} G</span>
              </div>
              <div className="flex flex-col border-l border-slate-900">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Locked</span>
                <span className="text-[10px] font-bold text-purple-400 font-mono">{(user?.locked_winnings ?? 0).toFixed(2)} G</span>
              </div>
            </div>

            {/* Wager Requirement Progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-slate-400">Progression Wager (10x)</span>
                <span className="text-white font-mono">
                  {Math.round(user?.wager_requirement_progress ?? 0)} / {Math.round(user?.wager_requirement_required ?? 0)} G
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round(((user?.wager_requirement_progress ?? 0) / (user?.wager_requirement_required ?? 1)) * 100))}%`
                  }}
                ></div>
              </div>

              <div className="flex justify-between items-center text-[9px] text-slate-500 pt-0.5">
                <span>{Math.min(100, Math.round(((user?.wager_requirement_progress ?? 0) / (user?.wager_requirement_required ?? 1)) * 100))}% complété</span>
                <span className="flex items-center text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                  <Clock className="h-3 w-3 mr-1" />
                  {user?.bonus_expires_at ? (() => {
                    const diffMs = new Date(user.bonus_expires_at) - new Date();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    if (diffDays > 0) return `${diffDays}j ${diffHours}h restants`;
                    return `${diffHours}h restantes`;
                  })() : 'Expiré'}
                </span>
              </div>
            </div>
          </div>
        )}

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
                    <span className="text-[10px] font-mono text-slate-500">
                      {player.betAmount ? player.betAmount.toFixed(0) : '0'} {player.currency || 'HTG'} | <span className="text-indigo-400 font-semibold">{player.game === 'crash' ? 'Crash' : player.game === 'ketmesye' ? 'Ket Mesye (Sepan)' : player.game === 'snake_duel' ? 'Duel Ket Mesye' : player.game === 'koth' ? 'KOTH' : player.game === 'mines' ? 'Mines' : player.game === 'bloodmoney' ? 'Blood Money' : player.game}</span>
                    </span>
                  </div>
                  {player.status === 'cashed_out' || player.cashedOut ? (
                    <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/15">
                      +{player.payoutAmount ? player.payoutAmount.toFixed(0) : '0'} {player.currency || 'HTG'} {player.cashoutMultiplier ? `(${player.cashoutMultiplier.toFixed(2)}x)` : ''}
                    </span>
                  ) : player.status === 'lost' || player.status === 'crashed' || player.status === 'dead' || player.status === 'eliminated' ? (
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/15 uppercase">
                      Éliminé
                    </span>
                  ) : player.game === 'crash' && gameStatus === 'crashed' ? (
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/15 uppercase">
                      Éliminé
                    </span>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[9px] text-slate-500 animate-pulse">En jeu</span>
                      <div className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></div>
                    </div>
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

      {/* Bonus / XP Booster Promo Modal */}
      {showBonusPromoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/25 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowBonusPromoModal(false)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 hover:text-white border border-slate-700/50 hover:border-slate-500 text-slate-400 transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Content header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Award className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Offres de Dépôt KetArena
                </span>
                <h3 className="font-display font-black text-xl sm:text-2xl text-white mt-1">Détails des Bonus de Dépôt</h3>
              </div>
            </div>

            {/* Modal body */}
            <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
              <p>
                Pour remercier nos joueurs et multiplier vos opportunités de victoires, KetArena vous permet d'activer des récompenses exclusives lors de vos dépôts. Pour être éligible à ces avantages, votre dépôt doit être d'un montant minimum de <strong className="text-indigo-400 font-bold">500 HTG</strong>.
              </p>

              <div className="grid md:grid-cols-2 gap-5 mt-4">
                
                {/* Option A Box */}
                <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-indigo-500/20 transition-all">
                  <div>
                    <div className="flex items-center space-x-2.5 mb-3">
                      <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center font-bold text-indigo-400 text-sm">A</div>
                      <h4 className="font-bold text-white text-base">Option A : Solde Bonus</h4>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Créditez votre portefeuille de jetons additionnels utilisables sur l'ensemble des jeux :</p>
                    <ul className="space-y-2 text-xs text-slate-400 pl-1">
                      <li className="flex items-start">
                        <span className="text-indigo-400 mr-2 font-bold">•</span>
                        <span><strong className="text-slate-200 font-semibold">Premier Dépôt :</strong> +100% de bonus ajouté (ex: déposez 1000 HTG, recevez 1000 HTG de bonus).</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-indigo-400 mr-2 font-bold">•</span>
                        <span><strong className="text-slate-200 font-semibold">Recharges Régulières :</strong> +25% de bonus sur chaque dépôt approuvé.</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-indigo-400 mr-2 font-bold">•</span>
                        <span><strong className="text-indigo-400 font-bold">VIP Recharge :</strong> +50% de bonus à partir du Niveau VIP 5.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="mt-5 pt-3.5 border-t border-slate-900 space-y-2">
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                      <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span><strong>Validité :</strong> Expire après 7 jours si non complété.</span>
                    </div>
                    <div className="flex items-start space-x-2 text-[10px] text-slate-500">
                      <ShieldAlert className="h-3.5 w-3.5 text-pink-500/80 shrink-0 mt-0.5" />
                      <span><strong>Wager :</strong> Condition de mise de 10x le montant du bonus. Les retraits de solde sont indisponibles tant que le wager est actif.</span>
                    </div>
                  </div>
                </div>

                {/* Option B Box */}
                <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-purple-500/20 transition-all">
                  <div>
                    <div className="flex items-center space-x-2.5 mb-3">
                      <div className="h-7 w-7 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center font-bold text-purple-400 text-sm">B</div>
                      <h4 className="font-bold text-white text-base">Option B : Booster XP</h4>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Accélérez votre progression VIP sans aucune contrainte de retrait ni wager :</p>
                    <ul className="space-y-2 text-xs text-slate-400 pl-1">
                      <li className="flex items-start">
                        <span className="text-purple-400 mr-2 font-bold">•</span>
                        <span><strong className="text-slate-200 font-semibold">Multiplicateur :</strong> +50% de vitesse d'accumulation d'XP.</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-purple-400 mr-2 font-bold">•</span>
                        <span><strong className="text-slate-200 font-semibold">Éligibilité :</strong> Valable sur toutes vos mises réelles de jeux.</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-purple-400 mr-2 font-bold">•</span>
                        <span><strong className="text-purple-400 font-bold">Niveau VIP :</strong> Idéal pour débloquer rapidement des statuts VIP permanents.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="mt-5 pt-3.5 border-t border-slate-900 space-y-2">
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                      <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span><strong>Durée :</strong> Reste actif pendant 24 heures consécutives.</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                      <Coins className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span><strong>Retraits :</strong> Aucune restriction sur les retraits, aucun wager requis.</span>
                    </div>
                  </div>
                </div>

              </div>

              <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-4 flex items-start space-x-3 mt-4 text-xs text-slate-400 leading-relaxed">
                <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-200 font-bold">Comment réclamer votre choix ?</span><br />
                  Une fois que votre transfert de fonds aura été examiné et approuvé par notre équipe financière, un sélecteur s'affichera directement en plein écran sur votre tableau de bord. Vous aurez alors un délai de 7 jours après validation pour confirmer votre choix entre l'Option A (Bonus) ou l'Option B (Booster).
                </div>
              </div>

            </div>

            {/* Modal footer */}
            <div className="mt-6 pt-5 border-t border-slate-900 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBonusPromoModal(false)}
                className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/10 transition-all cursor-pointer"
              >
                J'ai compris
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
