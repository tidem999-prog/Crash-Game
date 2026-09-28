import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Award, Play, AlertTriangle, ArrowLeft, Trophy, Shield, Coins, Sparkles, 
  HelpCircle, Zap, Clock, Skull, Volume2, VolumeX 
} from 'lucide-react';
import { 
  initAudio, playSnakeSpawn, playSnakeCashout, 
  startSnakeBoost, stopSnakeBoost, playSnakeDeath, playSnakeEat,
  playSnakeBoostStart, playSnakeEatCash,
  getMuted, setMuted 
} from '../utils/audio';

export default function KetmesyeGame({ socket, onBackToLobby, addNotification, onPlayStateChange, initialMode }) {
  const { user, refreshBalance, updateBalance } = useAuth();

  // Game configuration
  const MAP_WIDTH = 10000;
  const MAP_HEIGHT = 10000;
  const TICK_RATE = 50;
  const PATH_SPACING = 2;
  const INVINCIBLE_TIME_MS = 2000;

  // Game UI state
  const [gameMode, setGameMode] = useState(initialMode || null); // null, 'classic', 'duel'
  const [duelState, setDuelState] = useState('lobby'); // lobby, waiting, playing, finished
  const [pendingDuels, setPendingDuels] = useState([]);
  const activeCurrency = user?.active_currency || 'HTG';
  const [duelWager, setDuelWager] = useState(activeCurrency === 'KET' ? '100' : (activeCurrency === 'PIECES' ? '500' : '150'));
  const [duelData, setDuelData] = useState(null);
  const [duelResult, setDuelResult] = useState(null);
  const [currentDuelId, setCurrentDuelId] = useState(null);

  const [wager, setWager] = useState(activeCurrency === 'KET' ? 100 : (activeCurrency === 'PIECES' ? 500 : 125));

  useEffect(() => {
    if (activeCurrency === 'KET') {
      setWager(100);
      setDuelWager('100');
    } else if (activeCurrency === 'PIECES') {
      setWager(500);
      setDuelWager('500');
    } else {
      setWager(125);
      setDuelWager('150');
    }
  }, [activeCurrency]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mySnake, setMySnake] = useState(null); // Local copy of player snake stats
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLocalSim, setIsLocalSim] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState(0);

  // Modals / Stats state
  const [cashoutStats, setCashoutStats] = useState(null); // { payout, multiplier, timeSurvived, eliminations }
  const [deathStats, setDeathStats] = useState(null); // { timeSurvived, eliminations, valueLost }

  // Canvas and animation refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastAngleEmitRef = useRef(0);
  const lastBoostEmitRef = useRef(false);
  const lastTouchTimeRef = useRef(0);
  
  // Game states in refs for fast canvas drawing loop
  const snakesRef = useRef({});
  const pelletsRef = useRef([]);
  const localLoopRef = useRef(null);
  const mySnakeIdRef = useRef(null);
  const mapBoundsRef = useRef({ width: 10000, height: 10000 });
  
  // Sound states and refs
  const [isAudioMuted, setIsAudioMuted] = useState(getMuted());
  const prevDeathsRef = useRef(0);
  const prevSnakeValueRef = useRef(0);

  const handleMuteToggle = () => {
    const muted = !isAudioMuted;
    setIsAudioMuted(muted);
    setMuted(muted);
    if (muted) {
      stopSnakeBoost();
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
      stopSnakeBoost();
    };
  }, []);

  useEffect(() => {
    if (onPlayStateChange) {
      onPlayStateChange(isPlaying);
    }
    if (!isPlaying) {
      stopSnakeBoost();
    }
  }, [isPlaying, onPlayStateChange]);

  // Handle pending duels fetch when mode is duel
  useEffect(() => {
    if (socket && socket.connected && gameMode === 'duel') {
      socket.emit('ketmesye_get_pending_duels');
    }
  }, [socket, gameMode]);

  // Initialize socket listeners
  useEffect(() => {
    if (!socket || !socket.connected) {
      // Server is offline, fallback to local simulation
      setIsLocalSim(true);
      addNotification("Mode Démo Activé (Simulation locale)", "info");
      startLocalSimulation();
      return;
    }

    setIsLocalSim(false);

    const cleanListeners = () => {
      socket.off('ketmesye_tick');
      socket.off('ketmesye_join_success');
      socket.off('ketmesye_death');
      socket.off('ketmesye_cashout_success');
      socket.off('ketmesye_kill');
      socket.off('ketmesye_player_cashed_out');
      socket.off('ketmesye_error');
      
      socket.off('ketmesye_pending_duels');
      socket.off('ketmesye_duel_created');
      socket.off('ketmesye_duel_starting');
      socket.off('ketmesye_duel_tick');
      socket.off('ketmesye_duel_over');
      socket.off('ketmesye_duel_cancelled');
    };

    cleanListeners();

    // Classic Sandbox Tick
    socket.on('ketmesye_tick', (data) => {
      if (gameMode === 'duel') return; // ignore sandbox ticks when in duel

      // Eat pellet detection (done FIRST using previous tick's ref values)
      if (mySnakeIdRef.current && snakesRef.current[mySnakeIdRef.current]) {
        const lastSnake = snakesRef.current[mySnakeIdRef.current];
        const lastHead = lastSnake.segments[0];
        const prevPellets = pelletsRef.current || [];
        const newPelletIds = new Set(data.pellets.map(p => p.id));
        
        let ateNormal = false;
        let ateCash = false;
        
        prevPellets.forEach(p => {
          const dist = Math.hypot(lastHead.x - p.x, lastHead.y - p.y);
          if (dist < 36) { // mathematically safe eating range (20 radius + 16 max speed)
            if (!newPelletIds.has(p.id)) {
              if (p.isCashDrop) ateCash = true;
              else ateNormal = true;
            }
          }
        });
        
        if (ateCash) {
          playSnakeEatCash();
        } else if (ateNormal) {
          playSnakeEat();
        }
      }

      // Update refs with new tick data
      if (data.mapWidth) mapBoundsRef.current.width = data.mapWidth;
      if (data.mapHeight) mapBoundsRef.current.height = data.mapHeight;
      snakesRef.current = data.snakes;
      pelletsRef.current = data.pellets;
      setLeaderboard(data.leaderboard || []);
      setOnlinePlayers(Object.keys(data.snakes).length);

      if (mySnakeIdRef.current && data.snakes[mySnakeIdRef.current]) {
        const pSnake = data.snakes[mySnakeIdRef.current];
        setMySnake({
          value: pSnake.value,
          eliminations: pSnake.eliminations,
          length: pSnake.segments.length,
          energy: pSnake.energy || 0
        });
        prevSnakeValueRef.current = pSnake.value;
      } else {
        prevSnakeValueRef.current = 0;
      }
    });

    socket.on('ketmesye_join_success', (data) => {
      setIsPlaying(true);
      setDeathStats(null);
      setCashoutStats(null);
      mySnakeIdRef.current = socket.id;
      setMySnake({
        value: data.initialValue,
        eliminations: 0,
        length: 5,
        energy: 100
      });
      prevSnakeValueRef.current = data.initialValue;
      updateBalance(data.newBalance, data.currency || activeCurrency);
      addNotification(`Vous avez rejoint l'arène avec ${data.wager} ${data.currency || activeCurrency} !`, 'success');
      playSnakeSpawn();
    });

    socket.on('ketmesye_death', (data) => {
      setIsPlaying(false);
      setDeathStats({
        timeSurvived: data.timeSurvived,
        eliminations: data.eliminations,
        valueLost: data.valueLost,
        currency: data.currency || activeCurrency
      });
      mySnakeIdRef.current = null;
      setMySnake(null);
      prevSnakeValueRef.current = 0;
      refreshBalance();
      addNotification(`Votre serpent a été éliminé ! Perte : ${data.valueLost.toFixed(2)} ${data.currency || activeCurrency}.`, 'danger');
      playSnakeDeath();
    });

    socket.on('ketmesye_cashout_success', (data) => {
      setIsPlaying(false);
      setCashoutStats({
        payout: data.payout,
        multiplier: data.multiplier,
        timeSurvived: data.timeSurvived,
        eliminations: data.eliminations,
        currency: data.currency || activeCurrency
      });
      mySnakeIdRef.current = null;
      setMySnake(null);
      prevSnakeValueRef.current = 0;
      updateBalance(data.newBalance, data.currency || activeCurrency);
      addNotification(`Retrait réussi ! +${data.payout.toFixed(2)} ${data.currency || activeCurrency}`, 'success');
      playSnakeCashout();
    });

    socket.on('ketmesye_kill', (data) => {
      addNotification(`Vous avez éliminé ${data.killed} !`, 'success');
    });

    socket.on('ketmesye_player_cashed_out', (data) => {
      addNotification(`${data.email} a encaissé ${data.payout.toFixed(2)} ${data.currency || activeCurrency} !`, 'info');
    });

    // 1v1 Duel Listeners
    socket.on('ketmesye_pending_duels', (duels) => {
      setPendingDuels(duels);
    });

    socket.on('ketmesye_duel_created', (data) => {
      setDuelState('waiting');
      setCurrentDuelId(data.duelId);
    });

    socket.on('ketmesye_duel_starting', (data) => {
      if (data.playerA_id === user.id || data.playerB_id === user.id) {
        setDuelState('playing');
        mySnakeIdRef.current = socket.id;
        socket.emit('ketmesye_claim_duel_spot', { userId: user.id, duelId: data.duelId });
        prevDeathsRef.current = 0;
        prevSnakeValueRef.current = 0;
        playSnakeSpawn();
      }
    });

    socket.on('ketmesye_duel_tick', (data) => {
      // Duel eat pellet detection (done FIRST using previous tick's ref values)
      if (mySnakeIdRef.current && snakesRef.current[mySnakeIdRef.current]) {
        const lastSnake = snakesRef.current[mySnakeIdRef.current];
        const lastHead = lastSnake.segments[0];
        const prevPellets = pelletsRef.current || [];
        const newPelletIds = new Set(data.pellets.map(p => p.id));
        
        let ateNormal = false;
        let ateCash = false;
        
        prevPellets.forEach(p => {
          const dist = Math.hypot(lastHead.x - p.x, lastHead.y - p.y);
          if (dist < 36) { // mathematically safe eating range (20 radius + 16 max speed)
            if (!newPelletIds.has(p.id)) {
              if (p.isCashDrop) ateCash = true;
              else ateNormal = true;
            }
          }
        });
        
        if (ateCash) {
          playSnakeEatCash();
        } else if (ateNormal) {
          playSnakeEat();
        }
      }

      setDuelData(data);
      setIsPlaying(true);
      if (data.mapWidth) mapBoundsRef.current.width = data.mapWidth;
      if (data.mapHeight) mapBoundsRef.current.height = data.mapHeight;
      snakesRef.current = data.snakes;
      pelletsRef.current = data.pellets;

      if (mySnakeIdRef.current && data.snakes[mySnakeIdRef.current]) {
        const pSnake = data.snakes[mySnakeIdRef.current];
        setMySnake({
          value: pSnake.value,
          eliminations: pSnake.eliminations,
          deaths: pSnake.deaths || 0,
          length: pSnake.segments.length,
          energy: pSnake.energy || 0
        });

        // Duel death/respawn detection
        const currentDeaths = pSnake.deaths || 0;
        if (currentDeaths > prevDeathsRef.current) {
          playSnakeDeath();
          setTimeout(() => {
            playSnakeSpawn();
          }, 220);
        }
        prevDeathsRef.current = currentDeaths;
        prevSnakeValueRef.current = pSnake.value;
      }
    });

    socket.on('ketmesye_duel_over', (data) => {
      setIsPlaying(false);
      setDuelState('finished');
      setDuelResult(data);
      mySnakeIdRef.current = null;
      setMySnake(null);
      prevDeathsRef.current = 0;
      prevSnakeValueRef.current = 0;
      refreshBalance();
    });

    socket.on('ketmesye_duel_cancelled', (data) => {
      setIsPlaying(false);
      setDuelState('lobby');
      addNotification(data.reason || "Duel annulé.", "info");
      refreshBalance();
    });

    socket.on('ketmesye_error', (data) => {
      addNotification(data.message, 'danger');
    });

    return () => {
      cleanListeners();
    };
  }, [socket, user, gameMode]);

  // Clean up local simulation loops
  useEffect(() => {
    return () => {
      if (localLoopRef.current) clearInterval(localLoopRef.current);
    };
  }, []);

  // --- LOCAL SIMULATION CODE ---
  const startLocalSimulation = () => {
    const initialPellets = [];
    for (let i = 0; i < 120; i++) {
      initialPellets.push({
        id: Math.random().toString(),
        x: Math.random() * (MAP_WIDTH - 40) + 20,
        y: Math.random() * (MAP_HEIGHT - 40) + 20,
        value: 0.10,
        color: ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8'][Math.floor(Math.random() * 7)],
        isCashDrop: false
      });
    }
    pelletsRef.current = initialPellets;

    const respawnBot = (botId) => {
      const bx = Math.random() * (MAP_WIDTH - 400) + 200;
      const by = Math.random() * (MAP_HEIGHT - 400) + 200;
      const bSegments = [];
      for (let s = 0; s < 6; s++) {
        bSegments.push({ x: bx, y: by + s * 15 });
      }
      snakesRef.current[botId] = {
        id: botId,
        email: `Bot_${botId.split('_')[1] || Math.floor(Math.random() * 5 + 1)}`,
        value: 15,
        segments: bSegments,
        pathHistory: Array(50).fill({ x: bx, y: by }),
        angle: Math.random() * Math.PI * 2,
        speed: 7,
        color: '#a78bfa',
        eliminations: 0,
        isInvincible: false,
        isBoosting: false,
        energy: 100
      };
    };

    const killBot = (botId, killerSnake) => {
      const sks = snakesRef.current;
      const bot = sks[botId];
      if (!bot) return;

      if (killerSnake) {
        killerSnake.eliminations = (killerSnake.eliminations || 0) + 1;
        if (killerSnake.id === mySnakeIdRef.current) {
          addNotification(`Vous avez éliminé ${bot.email} !`, 'success');
        }
      }

      // Drop pellets strictly worth 0.000001 to prevent economy exploit
      const pls = [...(pelletsRef.current || [])];
      bot.segments.forEach(seg => {
        pls.push({
          id: Math.random().toString(),
          x: seg.x + (Math.random() * 8 - 4),
          y: seg.y + (Math.random() * 8 - 4),
          value: 0.000001,
          color: '#c084fc',
          isCashDrop: false,
          isBotDrop: true
        });
      });
      pelletsRef.current = pls;

      delete sks[botId];

      setTimeout(() => {
        respawnBot(botId);
      }, 3500);
    };

    const bots = {};
    for (let i = 1; i <= 5; i++) {
      const bx = Math.random() * (MAP_WIDTH - 200) + 100;
      const by = Math.random() * (MAP_HEIGHT - 200) + 100;
      const bSegments = [];
      for (let s = 0; s < 6; s++) {
        bSegments.push({ x: bx, y: by + s * 15 });
      }
      bots[`bot_${i}`] = {
        id: `bot_${i}`,
        email: `Bot_${i}`,
        value: 10 + i * 5,
        segments: bSegments,
        pathHistory: Array(50).fill({ x: bx, y: by }),
        angle: Math.random() * Math.PI * 2,
        speed: 7,
        color: '#a78bfa',
        eliminations: 0,
        isInvincible: false,
        isBoosting: false,
        energy: 100
      };
    }
    snakesRef.current = bots;

    const interval = setInterval(() => {
      const sks = { ...snakesRef.current };
      const pls = [...pelletsRef.current];
      const myId = mySnakeIdRef.current;
      const me = myId ? sks[myId] : null;

      // 1. Move snakes & Smart Human-like AI for bots
      Object.keys(sks).forEach(id => {
        const s = sks[id];
        if (!s || !s.segments || s.segments.length === 0) return;
        
        if (id.startsWith('bot_')) {
          s.energy = s.energy ?? 100;
          let desiredAngle = s.angle;
          let huntingPlayer = false;

          // A. Hunter instinct: Hunt player, predict trajectory and sprint with boost to cut off
          if (me && me.segments && me.segments[0]) {
            const myHead = me.segments[0];
            const distToPlayer = Math.hypot(myHead.x - s.segments[0].x, myHead.y - s.segments[0].y);

            if (distToPlayer < 700) {
              huntingPlayer = true;
              const leadSteps = Math.min(130, distToPlayer * 0.45);
              const targetX = myHead.x + Math.cos(me.angle) * leadSteps;
              const targetY = myHead.y + Math.sin(me.angle) * leadSteps;
              desiredAngle = Math.atan2(targetY - s.segments[0].y, targetX - s.segments[0].x);

              if (distToPlayer < 300 && s.energy > 25) {
                s.isBoosting = true;
                s.speed = 14;
                s.energy = Math.max(0, s.energy - 2);
              } else {
                s.isBoosting = false;
                s.speed = 7.5;
                s.energy = Math.min(100, s.energy + 1.2);
              }
            }
          }

          // B. Search for closest pellet if not hunting
          if (!huntingPlayer) {
            s.isBoosting = false;
            s.speed = 7;
            s.energy = Math.min(100, (s.energy || 0) + 1.5);

            let closestP = null;
            let minDist = 350;
            const botHead = s.segments[0];
            for (let pi = 0; pi < pls.length; pi += 6) {
              const p = pls[pi];
              const d = Math.hypot(botHead.x - p.x, botHead.y - p.y);
              if (d < minDist) {
                minDist = d;
                closestP = p;
              }
            }
            if (closestP) {
              desiredAngle = Math.atan2(closestP.y - botHead.y, closestP.x - botHead.x);
            } else if (Math.random() < 0.03) {
              desiredAngle += (Math.random() - 0.5) * 1.2;
            }
          }

          // C. Obstacle Avoidance (Survival reflex): look 45px ahead
          const lookAheadX = s.segments[0].x + Math.cos(desiredAngle) * 45;
          const lookAheadY = s.segments[0].y + Math.sin(desiredAngle) * 45;

          let danger = false;
          if (me && me.segments) {
            for (let seg of me.segments) {
              if (Math.hypot(lookAheadX - seg.x, lookAheadY - seg.y) < 24) {
                danger = true;
                break;
              }
            }
          }
          if (!danger) {
            for (let otherId of Object.keys(sks)) {
              if (otherId === id) continue;
              const otherSnake = sks[otherId];
              if (!otherSnake || !otherSnake.segments) continue;
              for (let seg of otherSnake.segments) {
                if (Math.hypot(lookAheadX - seg.x, lookAheadY - seg.y) < 22) {
                  danger = true;
                  break;
                }
              }
              if (danger) break;
            }
          }

          if (danger) {
            desiredAngle += Math.PI * 0.55;
            s.isBoosting = false;
            s.speed = 6.5;
          }

          // D. Wall Avoidance
          const bHead = s.segments[0];
          if (bHead.x < 250) desiredAngle = 0;
          else if (bHead.x > MAP_WIDTH - 250) desiredAngle = Math.PI;
          else if (bHead.y < 250) desiredAngle = Math.PI / 2;
          else if (bHead.y > MAP_HEIGHT - 250) desiredAngle = -Math.PI / 2;

          // E. Smooth angle turn
          let angleDiff = desiredAngle - s.angle;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          s.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.22);
        }

        if (s.isBoosting && s.energy > 0) {
          s.speed = 15;
          s.energy = Math.max(0, s.energy - 2);
        } else {
          s.speed = id.startsWith('bot_') ? 7 : 10;
          if (s.energy !== undefined) {
            s.energy = Math.min(100, s.energy + 1.5);
          }
        }

        const head = { ...s.segments[0] };
        head.x += Math.cos(s.angle) * s.speed;
        head.y += Math.sin(s.angle) * s.speed;

        s.pathHistory.unshift(head);
        
        for (let idx = 0; idx < s.segments.length; idx++) {
          const histIdx = idx * PATH_SPACING;
          s.segments[idx] = s.pathHistory[histIdx] ? { ...s.pathHistory[histIdx] } : { ...s.pathHistory[s.pathHistory.length - 1] };
        }
        
        if (s.pathHistory.length > s.segments.length * PATH_SPACING + 20) {
          s.pathHistory.length = s.segments.length * PATH_SPACING + 5;
        }
      });

      // 2. COLLISION DETECTION (Bidirectional: bot dies if it hits player or other bot body)
      let playerDead = false;
      const deadBots = new Set();

      if (me && me.segments && me.segments[0]) {
        const myHead = me.segments[0];
        if (myHead.x < 0 || myHead.x > MAP_WIDTH || myHead.y < 0 || myHead.y > MAP_HEIGHT) {
          playerDead = true;
        }
      }

      const allSnakeIds = Object.keys(sks);
      allSnakeIds.forEach(idA => {
        const snakeA = sks[idA];
        if (!snakeA || !snakeA.segments || snakeA.segments.length === 0) return;
        const headA = snakeA.segments[0];

        allSnakeIds.forEach(idB => {
          if (idA === idB) return;
          const snakeB = sks[idB];
          if (!snakeB || !snakeB.segments || snakeB.segments.length === 0) return;

          // Head-to-head
          const headB = snakeB.segments[0];
          const headDist = Math.hypot(headA.x - headB.x, headA.y - headB.y);
          if (headDist < 20) {
            if (idA === myId) {
              if (snakeA.value >= snakeB.value) {
                deadBots.add(idB);
                if (me) me.eliminations = (me.eliminations || 0) + 1;
              } else {
                playerDead = true;
              }
            } else if (idB === myId) {
              if (snakeB.value >= snakeA.value) {
                deadBots.add(idA);
                if (me) me.eliminations = (me.eliminations || 0) + 1;
              } else {
                playerDead = true;
              }
            } else {
              if (snakeA.value >= snakeB.value) deadBots.add(idB);
              else deadBots.add(idA);
            }
            return;
          }

          // Head A into Body B
          for (let segIdx = 1; segIdx < snakeB.segments.length; segIdx++) {
            const segB = snakeB.segments[segIdx];
            const dist = Math.hypot(headA.x - segB.x, headA.y - segB.y);
            if (dist < 18) {
              if (idA === myId) {
                playerDead = true;
              } else {
                // Bot crashed into body! Bot DIES!
                deadBots.add(idA);
                if (idB === myId && me) {
                  me.eliminations = (me.eliminations || 0) + 1;
                  addNotification(`Vous avez éliminé ${snakeA.email} !`, 'success');
                }
              }
              break;
            }
          }
        });
      });

      // Process dead bots (drop pellets worth 0.000001)
      deadBots.forEach(botId => {
        killBot(botId, me);
      });

      if (playerDead && me) {
        handleLocalDeath(me);
        return;
      }

      // 3. Pellets eating
      if (myId && sks[myId]) {
        const myHead = me.segments[0];
        for (let i = pls.length - 1; i >= 0; i--) {
          const pellet = pls[i];
          const dist = Math.hypot(myHead.x - pellet.x, myHead.y - pellet.y);
          if (dist < 20) {
            let pVal = pellet.value;
            if (pellet.isBotDrop) {
              pVal = 0.000001; // Dead bot drop value strictly 0.000001!
            }
            me.value = parseFloat((me.value + pVal).toFixed(6));
            me.growthPoints = (me.growthPoints || 0) + (pellet.isBotDrop ? 0.35 : pellet.value);
            const segsToAdd = Math.floor(me.growthPoints / 1.5);
            if (segsToAdd > 0) {
              me.growthPoints -= segsToAdd * 1.5;
              for (let g = 0; g < segsToAdd; g++) {
                if (me.segments.length < 120) {
                  me.segments.push({ ...me.segments[me.segments.length - 1] });
                }
              }
            }
            pls.splice(i, 1);
            playSnakeEat();

            if (!pellet.isCashDrop && !pellet.isBotDrop) {
              pls.push({
                id: Math.random().toString(),
                x: Math.random() * (MAP_WIDTH - 40) + 20,
                y: Math.random() * (MAP_HEIGHT - 40) + 20,
                value: 0.10,
                color: me.color,
                isCashDrop: false,
                isBotDrop: false
              });
            }
          }
        }
        setMySnake({ value: me.value, eliminations: me.eliminations, length: me.segments.length, energy: me.energy || 0 });
      }

      snakesRef.current = sks;
      pelletsRef.current = pls;

      const lb = Object.values(sks)
        .map(s => ({ email: s.email, value: s.value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      setLeaderboard(lb);
      setOnlinePlayers(Object.keys(sks).length);

    }, TICK_RATE);
    
    localLoopRef.current = interval;
  };

  const handleLocalJoin = () => {
    const currentBalance = activeCurrency === 'KET' ? parseFloat(user.ket_balance || 0) : (parseFloat(user.balance || 0) + parseFloat(user.bonus_balance || 0) + parseFloat(user.locked_winnings || 0));
    if (wager > currentBalance) {
      return addNotification("Solde insuffisant.", "danger");
    }
    updateBalance(currentBalance - wager, activeCurrency);

    const spawnX = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
    const spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;
    const startSegments = [];
    for (let i = 0; i < 5; i++) {
      startSegments.push({ x: spawnX, y: spawnY + i * 15 });
    }

    const myId = "local_human_player";
    mySnakeIdRef.current = myId;
    const initialValue = parseFloat((wager * 0.90).toFixed(2));

    snakesRef.current[myId] = {
      id: myId,
      email: user.email.split('@')[0],
      wager,
      value: initialValue,
      segments: startSegments,
      pathHistory: Array(50).fill({ x: spawnX, y: spawnY }),
      angle: -Math.PI / 2,
      speed: 10,
      color: '#34d399',
      eliminations: 0,
      isInvincible: false,
      spawnTime: Date.now(),
      isBoosting: false,
      energy: 100
    };

    setIsPlaying(true);
    setDeathStats(null);
    setCashoutStats(null);
    setMySnake({
      value: initialValue,
      eliminations: 0,
      length: 5,
      energy: 100
    });
    prevSnakeValueRef.current = initialValue;
    addNotification(`[Mode Démo] Spawn réussi !`, 'success');
    playSnakeSpawn();
  };

  const handleLocalDeath = (me) => {
    setIsPlaying(false);
    const pls = [...pelletsRef.current];
    const valPerDrop = parseFloat(((me.value * 0.5) / me.segments.length).toFixed(4));
    me.segments.forEach(seg => {
      pls.push({
        id: Math.random().toString(),
        x: seg.x,
        y: seg.y,
        value: valPerDrop,
        color: '#fbbf24',
        isCashDrop: true
      });
    });
    pelletsRef.current = pls;

    setDeathStats({
      timeSurvived: Math.floor((Date.now() - me.spawnTime) / 1000),
      eliminations: me.eliminations,
      valueLost: me.value
    });

    delete snakesRef.current[mySnakeIdRef.current];
    mySnakeIdRef.current = null;
    setMySnake(null);
    prevSnakeValueRef.current = 0;
    addNotification("[Mode Démo] Vous êtes mort !", "danger");
    playSnakeDeath();
  };

  const handleLocalCashout = () => {
    const myId = mySnakeIdRef.current;
    const me = snakesRef.current[myId];
    if (!me) return;

    const payout = me.value;
    const currentBalance = activeCurrency === 'KET' ? parseFloat(user.ket_balance || 0) : (parseFloat(user.balance || 0) + parseFloat(user.bonus_balance || 0) + parseFloat(user.locked_winnings || 0));
    updateBalance(currentBalance + payout, activeCurrency);

    setCashoutStats({
      payout,
      multiplier: parseFloat((payout / me.wager).toFixed(2)),
      timeSurvived: Math.floor((Date.now() - me.spawnTime) / 1000),
      eliminations: me.eliminations
    });

    setIsPlaying(false);
    delete snakesRef.current[myId];
    mySnakeIdRef.current = null;
    setMySnake(null);
    prevSnakeValueRef.current = 0;
    addNotification(`[Mode Démo] Retrait réussi : +${payout} HTG`, 'success');
    playSnakeCashout();
  };

  // --- RENDERING CANVAS DRAW LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight || 450;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const draw = () => {
      if (!canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;
      const curMapW = mapBoundsRef.current?.width || MAP_WIDTH;
      const curMapH = mapBoundsRef.current?.height || MAP_HEIGHT;

      let camera = { x: curMapW / 2, y: curMapH / 2 };
      const myId = mySnakeIdRef.current;
      const localSnake = snakesRef.current[myId];
      if (localSnake && localSnake.segments && localSnake.segments[0]) {
        camera = { x: localSnake.segments[0].x, y: localSnake.segments[0].y };
      }

      const offsetX = w / 2 - camera.x;
      const offsetY = h / 2 - camera.y;

      // Magnetic suction client-side for local snake
      if (localSnake && localSnake.segments && localSnake.segments[0]) {
        const hx = localSnake.segments[0].x;
        const hy = localSnake.segments[0].y;
        const pullRadius = 120;
        const pellets = pelletsRef.current || [];
        for (let i = 0; i < pellets.length; i++) {
          const p = pellets[i];
          const dx = hx - p.x;
          const dy = hy - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < pullRadius && dist > 1) {
            const factor = (pullRadius - dist) / pullRadius;
            p.x += (dx / dist) * (factor * 11);
            p.y += (dy / dist) * (factor * 11);
          }
        }
      }

      // Draw Grid (Hexagonal grid with viewport culling)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const hexSize = 50;
      const startCol = Math.floor((camera.x - w / 2) / (hexSize * 1.5)) - 1;
      const endCol = Math.ceil((camera.x + w / 2) / (hexSize * 1.5)) + 1;
      const startRow = Math.floor((camera.y - h / 2) / (hexSize * Math.sqrt(3))) - 1;
      const endRow = Math.ceil((camera.y + h / 2) / (hexSize * Math.sqrt(3))) + 1;

      for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row <= endRow; row++) {
          const cx = col * hexSize * 1.5 + offsetX;
          const cy = row * hexSize * Math.sqrt(3) + (col % 2 === 0 ? 0 : (hexSize * Math.sqrt(3)) / 2) + offsetY;

          ctx.beginPath();
          for (let side = 0; side < 6; side++) {
            const angle = (side * Math.PI) / 3;
            const x = cx + hexSize * Math.cos(angle);
            const y = cy + hexSize * Math.sin(angle);
            if (side === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // Draw Arena Borders (Glowing boundary + danger zone)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 16;
      ctx.strokeRect(offsetX, offsetY, curMapW, curMapH);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
      ctx.fillRect(offsetX - 2000, offsetY - 2000, curMapW + 4000, 2000);
      ctx.fillRect(offsetX - 2000, offsetY + curMapH, curMapW + 4000, 2000);
      ctx.fillRect(offsetX - 2000, offsetY, 2000, curMapH);
      ctx.fillRect(offsetX + curMapW, offsetY, 2000, curMapH);

      // Draw Pellets with Viewport Culling and Specular Sheen
      const pellets = pelletsRef.current || [];
      for (let i = 0; i < pellets.length; i++) {
        const p = pellets[i];
        const px = p.x + offsetX;
        const py = p.y + offsetY;

        // Viewport culling
        if (px < -25 || px > w + 25 || py < -25 || py > h + 25) continue;

        if (p.isCashDrop) {
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(px, py, 9.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#1e293b';
          ctx.font = '900 9px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('G', px, py + 0.5);
        } else {
          // Shiny multi-color normal pellet
          ctx.fillStyle = p.color || '#38bdf8';
          ctx.beginPath();
          ctx.arc(px, py, 5.5, 0, Math.PI * 2);
          ctx.fill();

          // Specular highlight dot (gives glossy 3D orb look)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.beginPath();
          ctx.arc(px - 1.5, py - 1.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Snakes with Slither.io continuous spine & dorsal sheen
      const snakeIds = Object.keys(snakesRef.current);
      // Draw other snakes first, local snake last for clear visibility
      snakeIds.sort((a, b) => (a === myId ? 1 : b === myId ? -1 : 0));

      snakeIds.forEach(id => {
        const s = snakesRef.current[id];
        if (!s || !s.segments || s.segments.length === 0) return;

        const isLocal = id === myId;
        const segments = s.segments;
        const head = segments[0];

        // Quick screen bounding box check for culling distant snakes
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < segments.length; i++) {
          const sx = segments[i].x + offsetX;
          const sy = segments[i].y + offsetY;
          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
        }
        if (maxX < -50 || minX > w + 50 || maxY < -50 || minY > h + 50) return;

        // Dynamic body radius: starts small (13.5px) and grows smoothly as it eats
        const segCount = segments.length;
        const maxRadius = Math.min(26, 13.5 + Math.sqrt(Math.max(0, segCount - 5)) * 1.4);

        // Build continuous dense interpolated spine
        const spine = [];
        for (let i = 0; i < segments.length - 1; i++) {
          const p0 = segments[i];
          const p1 = segments[i + 1];
          const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const steps = Math.max(1, Math.ceil(dist / 4));
          for (let step = 0; step < steps; step++) {
            const frac = step / steps;
            const overallT = (i + frac) / (segments.length - 1);
            spine.push({
              x: p0.x + (p1.x - p0.x) * frac + offsetX,
              y: p0.y + (p1.y - p0.y) * frac + offsetY,
              radius: maxRadius * (1.0 - overallT * 0.42) // tail tapers smoothly
            });
          }
        }
        spine.push({
          x: segments[segments.length - 1].x + offsetX,
          y: segments[segments.length - 1].y + offsetY,
          radius: maxRadius * 0.58
        });

        // Determine body color & invincible blink
        let bodyColor = s.color || '#3b82f6';
        if (s.isInvincible && Math.floor(Date.now() / 150) % 2 === 0) {
          bodyColor = 'rgba(255, 255, 255, 0.5)';
        }

        // Layer 1: Body Outer Aura / Shadow
        if (isLocal) {
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowBlur = 0;
        }

        // Layer 2: Continuous Body (drawn from tail to head)
        ctx.fillStyle = bodyColor;
        for (let i = spine.length - 1; i >= 0; i--) {
          const pt = spine[i];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Layer 3: Dorsal Spine Sheen (Slither 3D highlight)
        if (spine.length > 2) {
          ctx.beginPath();
          ctx.moveTo(spine[0].x, spine[0].y);
          for (let i = 1; i < spine.length; i++) {
            ctx.lineTo(spine[i].x, spine[i].y);
          }
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.lineWidth = maxRadius * 0.42;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }

        // Layer 4: Head & Expressive Eyes
        const hx = head.x + offsetX;
        const hy = head.y + offsetY;
        const headRadius = maxRadius * 1.08;

        // Head base circle
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // Front shield arc for local player
        if (isLocal) {
          ctx.beginPath();
          ctx.arc(hx, hy, headRadius + 4, s.angle - Math.PI / 1.6, s.angle + Math.PI / 1.6);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Eyes placement based on angle
        const eyeAngleOffset = 0.54;
        const eyeDist = headRadius * 0.56;
        const eyeRadius = Math.max(3.2, headRadius * 0.28);
        const pupilRadius = eyeRadius * 0.54;

        const eyeLeftX = hx + Math.cos(s.angle - eyeAngleOffset) * eyeDist;
        const eyeLeftY = hy + Math.sin(s.angle - eyeAngleOffset) * eyeDist;
        const eyeRightX = hx + Math.cos(s.angle + eyeAngleOffset) * eyeDist;
        const eyeRightY = hy + Math.sin(s.angle + eyeAngleOffset) * eyeDist;

        // Sclera (white)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeLeftY, eyeRadius, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeRightY, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (looking towards snake direction)
        const pupilDist = eyeRadius * 0.35;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(eyeLeftX + Math.cos(s.angle) * pupilDist, eyeLeftY + Math.sin(s.angle) * pupilDist, pupilRadius, 0, Math.PI * 2);
        ctx.arc(eyeRightX + Math.cos(s.angle) * pupilDist, eyeRightY + Math.sin(s.angle) * pupilDist, pupilRadius, 0, Math.PI * 2);
        ctx.fill();

        // Value Badge & Name Tag
        const tagText = gameMode === 'duel' ? `${s.deaths} Mò | ${s.value.toFixed(1)} G` : `${s.value.toFixed(2)} G`;
        ctx.font = 'bold 10px Inter';
        const textWidth = ctx.measureText(tagText).width;
        const tagWidth = textWidth + 14;
        const tagHeight = 17;
        const tagX = hx - tagWidth / 2;
        const tagY = hy - headRadius - 18;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 5);
        else ctx.rect(tagX, tagY, tagWidth, tagHeight);
        ctx.fill();
        ctx.strokeStyle = isLocal ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isLocal ? '#fbbf24' : '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, hx, tagY + tagHeight / 2 + 0.5);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9px Inter';
        ctx.fillText(s.email ? s.email.split('@')[0] : 'Joueur', hx, tagY - 6);
      });

      // --- RADAR MINIMAP (Bottom-Left) ---
      if (isPlaying) {
        const mapSize = 85;
        const mapX = 18;
        const mapY = h - mapSize - 18;

        // Minimap background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mapX, mapY, mapSize, mapSize, 10);
        else ctx.rect(mapX, mapY, mapSize, mapSize);
        ctx.fill();
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arena crosshairs
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mapX + mapSize / 2, mapY);
        ctx.lineTo(mapX + mapSize / 2, mapY + mapSize);
        ctx.moveTo(mapX, mapY + mapSize / 2);
        ctx.lineTo(mapX + mapSize, mapY + mapSize / 2);
        ctx.stroke();

        // Cash drop pellets on minimap
        pellets.forEach(p => {
          if (p.isCashDrop) {
            const mx = mapX + (p.x / curMapW) * mapSize;
            const my = mapY + (p.y / curMapH) * mapSize;
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(mx - 1, my - 1, 2, 2);
          }
        });

        // Other snakes (red dots)
        snakeIds.forEach(id => {
          if (id === myId) return;
          const s = snakesRef.current[id];
          if (!s || !s.segments || !s.segments[0]) return;
          const mx = mapX + (s.segments[0].x / curMapW) * mapSize;
          const my = mapY + (s.segments[0].y / curMapH) * mapSize;
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        // Local player snake (pulsing beacon dot)
        if (localSnake && localSnake.segments && localSnake.segments[0]) {
          const mx = mapX + (localSnake.segments[0].x / curMapW) * mapSize;
          const my = mapY + (localSnake.segments[0].y / curMapH) * mapSize;

          const pulse = (Date.now() % 1200) / 1200;
          ctx.strokeStyle = `rgba(34, 197, 94, ${1 - pulse})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mx, my, 3 + pulse * 6, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Radar tag
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 8px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('RADAR', mapX + 6, mapY + 11);
      }

      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isPlaying, gameMode]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const angle = Math.atan2(dy, dx);

    const myId = mySnakeIdRef.current;
    if (myId && snakesRef.current[myId]) {
      snakesRef.current[myId].angle = angle;
    }

    if (Math.abs(angle - lastAngleEmitRef.current) > 0.05) {
      lastAngleEmitRef.current = angle;
      if (isLocalSim) {
        // Local handling
      } else if (socket && socket.connected) {
        socket.emit('ketmesye_input', { angle });
      }
    }
  };

  const handleBoostChange = (isBoosting) => {
    if (lastBoostEmitRef.current === isBoosting || !isPlaying) return;
    lastBoostEmitRef.current = isBoosting;

    if (isBoosting) {
      startSnakeBoost();
    } else {
      stopSnakeBoost();
    }

    const myId = mySnakeIdRef.current;
    if (myId && snakesRef.current[myId]) {
      snakesRef.current[myId].isBoosting = isBoosting;
    }

    if (!isLocalSim && socket && socket.connected) {
      socket.emit('ketmesye_boost', { isBoosting });
    }
  };

  // Keyboard controls for boost
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleBoostChange(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleBoostChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying]);

  const handleTouchStart = (e) => {
    handleTouchMove(e);
  };

  const handleTouchEnd = () => {
    handleBoostChange(false);
  };

  const handleTouchMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying || e.touches.length === 0) return;

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const angle = Math.atan2(dy, dx);

    const myId = mySnakeIdRef.current;
    if (myId && snakesRef.current[myId]) {
      snakesRef.current[myId].angle = angle;
    }

    if (Math.abs(angle - lastAngleEmitRef.current) > 0.05) {
      lastAngleEmitRef.current = angle;
      if (isLocalSim) {
        // Local handling
      } else if (socket && socket.connected) {
        socket.emit('ketmesye_input', { angle });
      }
    }
  };

  // Spawn Request Classic
  const handleSpawn = () => {
    const minWager = activeCurrency === 'KET' ? 100 : 125;
    if (wager < minWager) {
      return addNotification(`La mise minimale est de ${minWager} ${activeCurrency}.`, "danger");
    }

    const currentBalance = activeCurrency === 'KET' ? parseFloat(user.ket_balance || 0) : (parseFloat(user.balance || 0) + parseFloat(user.bonus_balance || 0) + parseFloat(user.locked_winnings || 0));
    if (wager > currentBalance) {
      return addNotification("Solde insuffisant pour cette mise.", "danger");
    }

    if (isLocalSim) {
      handleLocalJoin();
    } else {
      if (socket && socket.connected) {
        socket.emit('ketmesye_join', {
          userId: user.id,
          email: user.email,
          wager: parseFloat(wager)
        });
      } else {
        addNotification("Serveur hors-ligne. Utilisation du Mode Démo.", "info");
        setIsLocalSim(true);
        startLocalSimulation();
      }
    }
  };

  // Cashout request
  const handleCashout = () => {
    if (isLocalSim) {
      handleLocalCashout();
    } else {
      if (socket && socket.connected) {
        socket.emit('ketmesye_cashout');
      }
    }
  };

  // 1v1 Duel Matchmaking requests
  const handleCreateDuel = () => {
    const minWager = activeCurrency === 'KET' ? 100 : 150;
    if (parseFloat(duelWager) < minWager) {
      return addNotification(`La mise minimale pour un duel est de ${minWager} ${activeCurrency}.`, "danger");
    }
    const currentBalance = activeCurrency === 'KET' ? parseFloat(user.ket_balance || 0) : (parseFloat(user.balance || 0) + parseFloat(user.bonus_balance || 0) + parseFloat(user.locked_winnings || 0));
    if (parseFloat(duelWager) > currentBalance) {
      return addNotification("Solde insuffisant.", "danger");
    }
    socket.emit('ketmesye_create_duel', { userId: user.id, betAmount: parseFloat(duelWager) });
  };

  const handleJoinDuel = (duelId) => {
    socket.emit('ketmesye_join_duel', { userId: user.id, duelId });
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Fullscreen & Orientation locking
  const toggleFullscreenAndRotate = async () => {
    try {
      const docElm = document.documentElement;
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

      if (!isFullscreen) {
        if (docElm.requestFullscreen) {
          await docElm.requestFullscreen();
        } else if (docElm.webkitRequestFullscreen) {
          await docElm.webkitRequestFullscreen();
        } else {
          throw new Error("Fullscreen API not supported");
        }

        if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          try {
            await window.screen.orientation.lock('landscape');
          } catch (e) {
            console.warn("Screen orientation lock failed", e);
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error(err);
      addNotification("Vire telefòn nan kouche ak men w (iPhone/Safari pa sipòte l otomatik).", "info");
    }
  };

  return (
    <div 
      className={`flex flex-col bg-slate-950 overflow-hidden transition-all duration-300 ${
        isPlaying ? 'z-[9999]' : 'relative w-full min-h-[500px] border border-slate-900 rounded-3xl'
      }`}
      style={isPlaying ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100dvh', width: '100vw' } : {}}
    >
      
      {/* Header bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 sm:px-6 sm:py-4 flex items-center justify-between z-10 animate-fade-in">
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          <button 
            onClick={() => {
              if (gameMode !== null && !isPlaying) {
                setGameMode(null);
                setDuelState('lobby');
              } else {
                onBackToLobby();
              }
            }}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
            title="Retour"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div>
            <h2 className="font-display font-black text-sm sm:text-lg text-white tracking-wide flex flex-wrap items-center gap-1 sm:gap-2">
              <span>KET<span className="text-yellow-500">MESYE</span></span>
              <span className="text-[8px] sm:text-xs uppercase bg-yellow-500/20 text-yellow-400 font-bold px-1.5 py-0.5 rounded">
                {gameMode === 'duel' ? '1v1 Duel' : 'Snake Arena'}
              </span>
            </h2>
            <p className="text-[8px] sm:text-[10px] text-slate-500 font-medium line-clamp-1">
              {gameMode === 'duel' ? 'Survivez et surpassez votre adversaire pendant 2 minutes.' : `Battez vos adversaires et encaissez les ${activeCurrency} en temps réel.`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isPlaying && (
            <button 
              onClick={toggleFullscreenAndRotate}
              className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 p-1.5 sm:p-2 rounded-lg transition-all border border-slate-700"
              title="Tourner / Plein Écran"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M12 20v-4"/>
                <path d="M8 16h8"/>
              </svg>
            </button>
          )}
          <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-950 border border-slate-800 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
            <div className={`h-1.5 w-1.5 sm:h-2.5 sm:w-2.5 rounded-full ${isLocalSim ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-[9px] sm:text-xs font-semibold text-slate-400 font-mono">
              {isLocalSim ? `Mode Démo (${onlinePlayers})` : `${onlinePlayers} Joueur${onlinePlayers > 1 ? 's' : ''} en ligne`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-grow flex flex-col md:flex-row relative" style={isPlaying ? { height: '100%' } : {}}>
        
        {/* Game Canvas Container */}
        <div 
          className="relative overflow-hidden bg-slate-950/80" 
          style={{ flex: 1, minHeight: isPlaying ? '0' : '420px' }}
        >
          
          <canvas 
            ref={canvasRef} 
            onMouseMove={handleMouseMove}
            onMouseDown={() => handleBoostChange(true)}
            onMouseUp={() => handleBoostChange(false)}
            onMouseLeave={() => handleBoostChange(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="block w-full h-full cursor-crosshair touch-none" 
          />

          {/* Mute/Unmute speaker icon button */}
          <button 
            onClick={handleMuteToggle}
            className="absolute bottom-3 left-3 z-30 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md"
            title={isAudioMuted ? "Activer le son" : "Couper le son"}
          >
            {isAudioMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            )}
          </button>

          {/* DUEL HUD (Time & Player Profiles) */}
          {isPlaying && gameMode === 'duel' && duelData && (
            <>
              {/* Floating top timer and profiles HUD */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-md border border-slate-800 px-6 py-3 rounded-2xl flex items-center justify-between shadow-2xl z-30 space-x-8 max-w-[90%] sm:max-w-xl w-full">
                {/* Creator (Player A) Profile */}
                <div className="flex items-center space-x-3 text-left">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Skull className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider block">Joueur A</span>
                    <span className="text-[10px] font-black text-white block">
                      {Object.values(duelData.snakes).find(s => s.email && s.color === '#06b6d4')?.email?.split('@')[0] || 'A'}
                    </span>
                    <div className="flex items-center space-x-2 text-[9px] font-bold text-slate-400 mt-0.5">
                      <span className="flex items-center text-rose-500"><Skull className="w-3 h-3 mr-0.5" /> {Object.values(duelData.snakes).find(s => s.color === '#06b6d4')?.deaths || 0}</span>
                      <span>|</span>
                      <span>{Object.values(duelData.snakes).find(s => s.color === '#06b6d4')?.value?.toFixed(0)} {duelData.currency || activeCurrency}</span>
                    </div>
                  </div>
                </div>

                {/* Match Clock */}
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest flex items-center"><Clock className="w-3 h-3 mr-1 text-slate-500" /> TEMPS</span>
                  <span className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${duelData.timeLeft < 15000 ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>
                    {formatTime(duelData.timeLeft || 0)}
                  </span>
                </div>

                {/* Opponent (Player B) Profile */}
                <div className="flex items-center space-x-3 text-right">
                  <div>
                    <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider block">Joueur B</span>
                    <span className="text-[10px] font-black text-white block">
                      {Object.values(duelData.snakes).find(s => s.email && s.color === '#a855f7')?.email?.split('@')[0] || 'B'}
                    </span>
                    <div className="flex items-center space-x-2 text-[9px] font-bold text-slate-400 mt-0.5 justify-end">
                      <span>{Object.values(duelData.snakes).find(s => s.color === '#a855f7')?.value?.toFixed(0)} {duelData.currency || activeCurrency}</span>
                      <span>|</span>
                      <span className="flex items-center text-rose-500">{Object.values(duelData.snakes).find(s => s.color === '#a855f7')?.deaths || 0} <Skull className="w-3 h-3 ml-0.5" /></span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Skull className="w-4 h-4 text-purple-400" />
                  </div>
                </div>
              </div>

              {/* Floating Bottom Center Energy for local user */}
              {mySnake && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl flex items-center space-x-3 shadow-2xl z-20 w-[60%] sm:w-64">
                  <div className="flex-grow">
                    <div className="flex justify-between items-center text-[8px] font-bold text-slate-400 mb-0.5 uppercase">
                      <span>Vitesse Boost</span>
                      <span>{Math.round(mySnake.energy)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-75 ${mySnake.energy > 20 ? 'bg-yellow-400' : 'bg-red-500'}`}
                        style={{ width: `${mySnake.energy}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Boost Button */}
              <button 
                className="absolute bottom-16 right-4 bg-yellow-500/80 backdrop-blur-md p-3.5 rounded-full border-2 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.5)] touch-none select-none z-30"
                onTouchStart={(e) => { e.preventDefault(); handleBoostChange(true); }}
                onTouchEnd={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onTouchCancel={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onMouseDown={(e) => { e.preventDefault(); handleBoostChange(true); }}
                onMouseUp={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onMouseLeave={(e) => { e.preventDefault(); handleBoostChange(false); }}
              >
                <Zap className="h-6 w-6 text-white fill-white" />
              </button>
            </>
          )}

          {/* SANDBOX FLOATING HUD */}
          {isPlaying && gameMode === 'classic' && mySnake && (
            <>
              <div className="absolute top-3 right-3 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-3 rounded-2xl w-48 pointer-events-none shadow-xl hidden sm:block">
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-1.5 mb-1.5">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide">Top Joueurs</span>
                </div>
                <div className="space-y-1">
                  {leaderboard.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 font-medium truncate max-w-[90px]">{index + 1}. {item.email.split('@')[0]}</span>
                      <span className="font-mono text-yellow-500 font-bold">{item.value.toFixed(1)}</span>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="text-slate-500 text-[9px] text-center">Aucun joueur actif</p>
                  )}
                </div>
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl flex items-center space-x-4 shadow-2xl z-20 w-[92%] sm:w-auto sm:min-w-[280px]">
                <div className="flex flex-col shrink-0 w-24">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Solde Arena</span>
                  <span className="font-mono text-base sm:text-lg font-black text-emerald-400">{mySnake.value.toFixed(2)} {activeCurrency}</span>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] text-slate-400">{mySnake.eliminations} kills</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden" title="Énergie pour Boost">
                    <div 
                      className={`h-full transition-all duration-75 ${mySnake.energy > 20 ? 'bg-yellow-400' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, mySnake.energy || 0))}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleCashout}
                  className="flex-grow flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-xs sm:text-sm"
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>CASH OUT</span>
                </button>
              </div>

              <button 
                className="absolute bottom-24 right-4 sm:hidden bg-yellow-500/80 backdrop-blur-md p-3.5 rounded-full border-2 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.5)] touch-none select-none z-30"
                onTouchStart={(e) => { e.preventDefault(); handleBoostChange(true); }}
                onTouchEnd={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onTouchCancel={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onMouseDown={(e) => { e.preventDefault(); handleBoostChange(true); }}
                onMouseUp={(e) => { e.preventDefault(); handleBoostChange(false); }}
                onMouseLeave={(e) => { e.preventDefault(); handleBoostChange(false); }}
              >
                <Zap className="h-6 w-6 text-white fill-white" />
              </button>
            </>
          )}

          {/* MODE SELECTOR (First Screen) */}
          {gameMode === null && !isPlaying && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-6 z-20 animate-fade-in overflow-y-auto">
              <div className="max-w-2xl w-full text-center py-4 my-auto">
                <h3 className="font-display font-black text-2xl sm:text-3xl text-white mb-2 uppercase tracking-wide">
                  CHOISISSEZ VOTRE MODE DE JEU
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mb-8 max-w-lg mx-auto">
                  Entrez dans l'arène de serpent KetMesye sous deux formes différentes. Misez et survivez !
                </p>

                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Public Sandbox Card */}
                  <div 
                    onClick={() => setGameMode('classic')}
                    className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-yellow-500/30 p-6 rounded-3xl transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.02] active:scale-95 shadow-xl"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Trophy className="w-6 h-6" />
                      </div>
                      <h4 className="text-base sm:text-lg font-black text-white text-left uppercase mb-1">Mòd Arène Classique</h4>
                      <p className="text-xs text-slate-400 text-left leading-relaxed">
                        Rejoignez l'arène multijoueur publique. Grandissez en mangeant les granulés ou les autres serpents, et encaissez (Cash Out) à tout moment !
                      </p>
                    </div>
                    <button className="w-full mt-6 py-2.5 bg-slate-800 group-hover:bg-yellow-500 text-slate-300 group-hover:text-slate-950 font-black rounded-xl transition-all text-xs">
                      OUVRIR L'ARÈNE
                    </button>
                  </div>

                  {/* 1v1 Duel Card */}
                  <div 
                    onClick={() => setGameMode('duel')}
                    className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/30 p-6 rounded-3xl transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.02] active:scale-95 shadow-xl"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Shield className="w-6 h-6" />
                      </div>
                      <h4 className="text-base sm:text-lg font-black text-white text-left uppercase mb-1">Mòd Duel 1v1</h4>
                      <p className="text-xs text-slate-400 text-left leading-relaxed">
                        Défiez un joueur en 1v1 direct pendant 2 minutes. Respawn après chaque mort. Celui qui meurt le moins remporte 90% du pot total !
                      </p>
                    </div>
                    <button className="w-full mt-6 py-2.5 bg-slate-800 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white font-black rounded-xl transition-all text-xs">
                      ENTRER AUX DUELS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CLASSIC JOIN SCREEN */}
          {gameMode === 'classic' && !isPlaying && !cashoutStats && !deathStats && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-6 z-20 overflow-y-auto">
              <div className="bg-gradient-to-r from-yellow-500/10 to-indigo-500/10 p-6 rounded-3xl border border-slate-800 max-w-sm w-full text-center shadow-2xl animate-fade-in py-6 my-auto">
                <div className="h-14 w-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center text-yellow-500 mx-auto mb-4">
                  <Play className="h-7 w-7" />
                </div>
                
                <h3 className="font-display font-black text-xl text-slate-200 mb-2">REJOINDRE L'ARÈNE</h3>
                <p className="text-xs text-slate-400 mb-6">Misez vos {activeCurrency}, mangez les orbes et les autres joueurs pour gonfler votre valeur, et retirez votre cash avant de vous faire percuter !</p>

                <div className="flex flex-col space-y-4 text-left mb-6">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mise d'entrée (Min: {activeCurrency === 'KET' ? '100' : (activeCurrency === 'PIECES' ? '250' : '125')} {activeCurrency})</label>
                    <div className="flex border border-slate-800 bg-slate-950 rounded-xl overflow-hidden mt-1.5">
                      <span className="bg-slate-900 px-3 py-2 text-xs font-bold text-slate-500 flex items-center border-r border-slate-800">{activeCurrency}</span>
                      <input
                        type="number"
                        value={wager}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWager(val === '' ? '' : parseInt(val) || 0);
                        }}
                        onBlur={() => {
                          const minWager = activeCurrency === 'KET' ? 100 : (activeCurrency === 'PIECES' ? 250 : 125);
                          if (!wager || wager < minWager) setWager(minWager);
                        }}
                        className="block w-full px-3 py-2 bg-transparent text-slate-200 text-sm font-bold font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(activeCurrency === 'KET' ? [100, 250, 500, 1000] : (activeCurrency === 'PIECES' ? [250, 500, 1000, 2500] : [125, 250, 625, 1250])).map(val => (
                      <button
                        key={val}
                        onClick={() => setWager(val)}
                        className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                          wager === val ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSpawn}
                  className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>SPAWN</span>
                </button>
              </div>
            </div>
          )}

          {/* DUEL LOBBY SCREEN */}
          {gameMode === 'duel' && duelState === 'lobby' && !isPlaying && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 z-20 overflow-y-auto">
              <div className="max-w-4xl w-full grid md:grid-cols-3 gap-6 animate-fade-in my-auto">
                
                {/* Create Duel Card */}
                <div className="md:col-span-1 bg-slate-900/50 p-6 rounded-3xl border border-slate-850 shadow-xl flex flex-col justify-between">
                  <div>
                    <h3 className="font-display font-black text-lg text-white mb-2 uppercase tracking-wide flex items-center space-x-2">
                      <Coins className="w-5 h-5 text-emerald-400" />
                      <span>HÉBERGER DUEL</span>
                    </h3>
                    <p className="text-xs text-slate-400 mb-6">Créez une instance de duel 1v1. La mise sera bloquée dans un séquestre sécurisé.</p>

                    <div className="flex flex-col space-y-4 mb-6">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mise du duel (Min: {activeCurrency === 'KET' ? '100' : (activeCurrency === 'PIECES' ? '250' : '150')} {activeCurrency})</label>
                        <div className="flex border border-slate-800 bg-slate-950 rounded-xl overflow-hidden mt-1.5">
                          <span className="bg-slate-900 px-3 py-2 text-xs font-bold text-slate-500 flex items-center border-r border-slate-800">{activeCurrency}</span>
                          <input
                            type="number"
                            value={duelWager}
                            onChange={(e) => setDuelWager(e.target.value)}
                            className="block w-full px-3 py-2 bg-transparent text-slate-200 text-sm font-bold font-mono focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {(activeCurrency === 'KET' ? [100, 250, 500] : (activeCurrency === 'PIECES' ? [250, 500, 1000] : [150, 300, 750])).map(val => (
                          <button
                            key={val}
                            onClick={() => setDuelWager(val.toString())}
                            className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                              duelWager === val.toString() ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-900 text-[10px] text-slate-400 font-medium space-y-1.5 mb-6">
                      <p>• Payout: 90% du pot total.</p>
                      <p>• Commission plateforme: 10% par joueur.</p>
                      <p>• Victoire calculée par le nombre de morts.</p>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateDuel}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-600/25 active:scale-95 text-xs uppercase"
                  >
                    Lancer le Défi
                  </button>
                </div>

                {/* Duels List */}
                <div className="md:col-span-2 bg-slate-900/30 p-6 rounded-3xl border border-slate-850/50 flex flex-col min-h-[350px]">
                  <h3 className="font-display font-black text-lg text-white mb-4 uppercase tracking-wide flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>DÉFIS EN ATTENTE</span>
                  </h3>

                  {pendingDuels.filter(duel => (duel.currency || 'HTG') === activeCurrency).length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-8 border border-slate-800/40 border-dashed rounded-2xl">
                      <Skull className="w-10 h-10 text-slate-700 mb-3" />
                      <p className="text-slate-400 font-bold text-xs">Aucun duel en attente.</p>
                      <p className="text-slate-500 text-[10px] mt-1 max-w-[200px] mx-auto">Hébergez un duel pour affronter les joueurs en ligne !</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4 overflow-y-auto max-h-[300px]">
                      {pendingDuels.filter(duel => (duel.currency || 'HTG') === activeCurrency).map((duel) => (
                        <div key={duel.id} className="bg-slate-900/80 p-4 border border-slate-800 hover:border-indigo-500/20 rounded-2xl flex flex-col justify-between transition-all group">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">Hôte</span>
                              <span className="text-xs font-black text-white block max-w-[120px] truncate">{duel.creatorEmail.split('@')[0]}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">Mise</span>
                              <span className="text-xs font-black text-emerald-400 font-mono">{parseFloat(duel.betAmount).toFixed(0)} {duel.currency || 'HTG'}</span>
                            </div>
                          </div>

                          <button 
                            onClick={() => handleJoinDuel(duel.id)}
                            className="w-full py-2 bg-slate-800 group-hover:bg-indigo-600 text-slate-400 group-hover:text-white font-bold rounded-xl transition-all text-xs"
                          >
                            REJOINDRE
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* DUEL WAITING STATE */}
          {gameMode === 'duel' && duelState === 'waiting' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 text-center animate-fade-in">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                <Skull className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
              </div>
              <h3 className="mt-8 font-display font-black text-lg text-white uppercase tracking-widest">EN ATTENTE D'UN JOUEUR...</h3>
              <p className="mt-2 text-xs text-slate-400 max-w-[200px]">Le duel commencera dès qu'un autre joueur acceptera votre défi.</p>
              
              <button 
                onClick={() => {
                  if (currentDuelId && socket && socket.connected) {
                    socket.emit('ketmesye_cancel_duel', { duelId: currentDuelId, userId: user.id });
                  }
                  setDuelState('lobby');
                  setCurrentDuelId(null);
                }}
                className="mt-6 py-2 px-6 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Annuler
              </button>
            </div>
          )}

          {/* DUEL RESOLUTION OVERLAY */}
          {gameMode === 'duel' && duelState === 'finished' && duelResult && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 text-center">
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl animate-fade-in">
                {duelResult.reason === 'tie' ? (
                  <>
                    <div className="bg-slate-800 p-4 rounded-full text-slate-300 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h3 className="font-display font-black text-2xl text-white tracking-wide uppercase">ÉGALITÉ !</h3>
                    <p className="text-slate-400 text-xs mt-1 mb-6">Les scores et morts étaient identiques. Vos mises ont été remboursées.</p>
                  </>
                ) : duelResult.winnerId === user.id ? (
                  <>
                    <div className="bg-emerald-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25 animate-bounce">
                      <Award className="h-8 w-8" />
                    </div>
                    <h3 className="font-display font-black text-2xl text-emerald-400 tracking-wide uppercase drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">VICTOIRE !</h3>
                    <p className="text-slate-300 text-xs mt-1 mb-6">Vous avez surpassé votre adversaire.</p>
                    <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-900 mb-6 flex justify-between items-center text-xs">
                      <span className="text-slate-500">Mise Gagnée</span>
                      <span className="font-mono font-bold text-emerald-400">+{duelResult.payoutAmount.toFixed(0)} {duelResult.currency || activeCurrency}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-rose-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/25">
                      <Skull className="h-8 w-8" />
                    </div>
                    <h3 className="font-display font-black text-2xl text-rose-500 tracking-wide uppercase">DÉFAITE</h3>
                    <p className="text-slate-400 text-xs mt-1 mb-6">Votre adversaire a eu moins de morts ou un meilleur score.</p>
                  </>
                )}

                <button
                  onClick={() => {
                    setDuelState('lobby');
                    setDuelResult(null);
                    socket.emit('ketmesye_get_pending_duels');
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs uppercase"
                >
                  Retourner au lobby
                </button>
              </div>
            </div>
          )}

          {/* SANDBOX CASHOUT SUCCESS */}
          {gameMode === 'classic' && cashoutStats && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-fade-in">
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl animate-pulse-glow">
                <div className="bg-emerald-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
                  <Award className="h-8 w-8 animate-bounce" />
                </div>
                
                <h3 className="font-display font-black text-2xl text-emerald-400 tracking-wide">RETRAIT RÉUSSI !</h3>
                <p className="text-slate-300 text-xs mt-1 mb-6">Votre solde a été crédité avec succès</p>

                <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-4 space-y-3 mb-6 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Montant Reçu</span>
                    <span className="font-mono font-bold text-emerald-400">{cashoutStats.payout.toFixed(2)} {cashoutStats.currency || activeCurrency}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Multiplicateur</span>
                    <span className="font-mono font-bold text-slate-300">{cashoutStats.multiplier.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Temps survécu</span>
                    <span className="font-mono font-bold text-slate-300">{cashoutStats.timeSurvived} secondes</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Éliminations</span>
                    <span className="font-mono font-bold text-slate-300">{cashoutStats.eliminations} jwè</span>
                  </div>
                </div>

                <button
                  onClick={() => setCashoutStats(null)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-md"
                >
                  Rejouer
                </button>
              </div>
            </div>
          )}

          {/* SANDBOX DEATH OVERLAY */}
          {gameMode === 'classic' && deathStats && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-fade-in">
              <div className="bg-red-950/40 border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                <div className="bg-red-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/25">
                  <AlertTriangle className="h-8 w-8 text-white" />
                </div>
                
                <h3 className="font-display font-black text-2xl text-red-500 tracking-wide">SÉPAN AN MOURI !</h3>
                <p className="text-slate-300 text-xs mt-1 mb-6">Vous avez percuté un obstacle oswa un adversaire</p>

                <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-4 space-y-3 mb-6 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Mise Perdue</span>
                    <span className="font-mono font-bold text-red-400">{deathStats.valueLost.toFixed(2)} {deathStats.currency || activeCurrency}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Temps survécu</span>
                    <span className="font-mono font-bold text-slate-300">{deathStats.timeSurvived} secondes</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Éliminations</span>
                    <span className="font-mono font-bold text-slate-300">{deathStats.eliminations} jwè</span>
                  </div>
                </div>

                <button
                  onClick={() => setDeathStats(null)}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all shadow-md"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
