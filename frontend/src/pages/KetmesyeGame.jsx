import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Award, Play, AlertTriangle, ArrowLeft, Trophy, Shield, Coins, Sparkles, HelpCircle } from 'lucide-react';

export default function KetmesyeGame({ socket, onBackToLobby, addNotification }) {
  const { user, refreshBalance, updateBalance } = useAuth();

  // Game configuration
  const MAP_WIDTH = 2000;
  const MAP_HEIGHT = 2000;
  const TICK_RATE = 50;
  const PATH_SPACING = 2;

  // Game UI state
  const [wager, setWager] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mySnake, setMySnake] = useState(null); // Local copy of player snake stats
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLocalSim, setIsLocalSim] = useState(false);

  // Modals / Stats state
  const [cashoutStats, setCashoutStats] = useState(null); // { payout, multiplier, timeSurvived, eliminations }
  const [deathStats, setDeathStats] = useState(null); // { timeSurvived, eliminations, valueLost }

  // Canvas and animation refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastAngleEmitRef = useRef(0);
  
  // Game states in refs for fast canvas drawing loop (avoids react render lag)
  const snakesRef = useRef({});
  const pelletsRef = useRef([]);
  const localLoopRef = useRef(null);
  const mySnakeIdRef = useRef(null);

  // Initialize socket listeners for Ketmesye
  useEffect(() => {
    if (!socket || !socket.connected) {
      // Server is offline, fallback to local simulation
      setIsLocalSim(true);
      addNotification("Mode Démo Activé (Simulation locale de Ketmesye)", "info");
      startLocalSimulation();
      return;
    }

    setIsLocalSim(false);

    // Clean up any existing listeners on this socket first to prevent duplication
    socket.off('ketmesye_tick');
    socket.off('ketmesye_join_success');
    socket.off('ketmesye_death');
    socket.off('ketmesye_cashout_success');
    socket.off('ketmesye_kill');
    socket.off('ketmesye_player_cashed_out');
    socket.off('ketmesye_error');

    // Socket listeners
    socket.on('ketmesye_tick', (data) => {
      snakesRef.current = data.snakes;
      pelletsRef.current = data.pellets;
      setLeaderboard(data.leaderboard || []);

      // Update local player snake stats
      if (mySnakeIdRef.current && data.snakes[mySnakeIdRef.current]) {
        const pSnake = data.snakes[mySnakeIdRef.current];
        setMySnake({
          value: pSnake.value,
          eliminations: pSnake.eliminations,
          length: pSnake.segments.length
        });
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
        length: 5
      });
      updateBalance(data.newBalance);
      addNotification(`Vous avez rejoint l'arène avec ${data.wager} HTG !`, 'success');
    });

    socket.on('ketmesye_death', (data) => {
      setIsPlaying(false);
      setDeathStats({
        timeSurvived: data.timeSurvived,
        eliminations: data.eliminations,
        valueLost: data.valueLost
      });
      mySnakeIdRef.current = null;
      setMySnake(null);
      refreshBalance();
      addNotification(`Votre serpent a été éliminé ! Perte : ${data.valueLost.toFixed(2)} HTG.`, 'danger');
    });

    socket.on('ketmesye_cashout_success', (data) => {
      setIsPlaying(false);
      setCashoutStats({
        payout: data.payout,
        multiplier: data.multiplier,
        timeSurvived: data.timeSurvived,
        eliminations: data.eliminations
      });
      mySnakeIdRef.current = null;
      setMySnake(null);
      updateBalance(data.newBalance);
      addNotification(`Retrait réussi ! +${data.payout.toFixed(2)} HTG`, 'success');
    });

    socket.on('ketmesye_kill', (data) => {
      addNotification(`Vous avez éliminé ${data.killed} !`, 'success');
    });

    socket.on('ketmesye_player_cashed_out', (data) => {
      addNotification(`${data.email} a encaissé ${data.payout.toFixed(2)} HTG !`, 'info');
    });

    socket.on('ketmesye_error', (data) => {
      addNotification(data.message, 'danger');
    });

    return () => {
      socket.off('ketmesye_tick');
      socket.off('ketmesye_join_success');
      socket.off('ketmesye_death');
      socket.off('ketmesye_cashout_success');
      socket.off('ketmesye_kill');
      socket.off('ketmesye_player_cashed_out');
      socket.off('ketmesye_error');
    };
  }, [socket]);

  // Clean up local simulation loops
  useEffect(() => {
    return () => {
      if (localLoopRef.current) clearInterval(localLoopRef.current);
    };
  }, []);

  // --- LOCAL SIMULATION CODE (BOTS & FOOD DEMO WHEN BACKEND IS OFFLINE) ---
  const startLocalSimulation = () => {
    // Spawn initial normal pellets
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

    // Spawn 5 local simulated bots
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
        isInvincible: false
      };
    }
    snakesRef.current = bots;

    // Local tick loop (50ms)
    const interval = setInterval(() => {
      const now = Date.now();
      const sks = { ...snakesRef.current };
      const pls = [...pelletsRef.current];

      // Move bots and human player
      Object.keys(sks).forEach(id => {
        const s = sks[id];
        
        // Bots simple AI (randomly change angle or move towards food)
        if (id.startsWith('bot_')) {
          if (Math.random() < 0.05) {
            s.angle += (Math.random() - 0.5) * 2;
          }
          // Bounds correction for bots
          const nextX = s.segments[0].x + Math.cos(s.angle) * s.speed;
          const nextY = s.segments[0].y + Math.sin(s.angle) * s.speed;
          if (nextX < 100 || nextX > MAP_WIDTH - 100 || nextY < 100 || nextY > MAP_HEIGHT - 100) {
            s.angle += Math.PI; // turn back
          }
        }

        const head = { ...s.segments[0] };
        head.x += Math.cos(s.angle) * s.speed;
        head.y += Math.sin(s.angle) * s.speed;

        // Unshift to history
        s.pathHistory.unshift(head);
        
        // Update body segments
        for (let idx = 0; idx < s.segments.length; idx++) {
          const histIdx = idx * PATH_SPACING;
          s.segments[idx] = s.pathHistory[histIdx] ? { ...s.pathHistory[histIdx] } : { ...s.pathHistory[s.pathHistory.length - 1] };
        }
        
        if (s.pathHistory.length > s.segments.length * PATH_SPACING + 20) {
          s.pathHistory.length = s.segments.length * PATH_SPACING + 5;
        }
      });

      // Human player local collision checks
      const myId = mySnakeIdRef.current;
      if (myId && sks[myId]) {
        const me = sks[myId];
        const myHead = me.segments[0];

        // Bounds death
        if (myHead.x < 0 || myHead.x > MAP_WIDTH || myHead.y < 0 || myHead.y > MAP_HEIGHT) {
          handleLocalDeath(me);
          return;
        }

        // Body collision checking with bots
        let hasCrashed = false;
        Object.keys(sks).forEach(botId => {
          if (botId === myId) return;
          const bot = sks[botId];

          bot.segments.forEach((seg, i) => {
            if (hasCrashed) return;
            const dist = Math.hypot(myHead.x - seg.x, myHead.y - seg.y);
            if (dist < 18) {
              hasCrashed = true;
            }
          });
        });

        if (hasCrashed) {
          handleLocalDeath(me);
          return;
        }

        // Food eating (human player)
        for (let i = pls.length - 1; i >= 0; i--) {
          const pellet = pls[i];
          const dist = Math.hypot(myHead.x - pellet.x, myHead.y - pellet.y);
          if (dist < 20) {
            me.value = parseFloat((me.value + pellet.value).toFixed(2));
            me.growthPoints = (me.growthPoints || 0) + pellet.value;
            const segsToAdd = Math.floor(me.growthPoints / 2.0);
            if (segsToAdd > 0) {
              me.growthPoints -= segsToAdd * 2.0;
              for (let g = 0; g < segsToAdd; g++) {
                me.segments.push({ ...me.segments[me.segments.length - 1] });
              }
            }
            pls.splice(i, 1);

            // Respawn
            if (!pellet.isCashDrop) {
              pls.push({
                id: Math.random().toString(),
                x: Math.random() * (MAP_WIDTH - 40) + 20,
                y: Math.random() * (MAP_HEIGHT - 40) + 20,
                value: 0.10,
                color: me.color,
                isCashDrop: false
              });
            }
          }
        }
        setMySnake({ value: me.value, eliminations: me.eliminations, length: me.segments.length });
      }

      // Bots eating food
      Object.keys(sks).forEach(botId => {
        if (!botId.startsWith('bot_')) return;
        const bot = sks[botId];
        const botHead = bot.segments[0];
        
        pls.forEach((p, idx) => {
          const dist = Math.hypot(botHead.x - p.x, botHead.y - p.y);
          if (dist < 20) {
            bot.value = parseFloat((bot.value + p.value).toFixed(2));
            bot.growthPoints = (bot.growthPoints || 0) + p.value;
            const segsToAdd = Math.floor(bot.growthPoints / 2.0);
            if (segsToAdd > 0) {
              bot.growthPoints -= segsToAdd * 2.0;
              for (let g = 0; g < segsToAdd; g++) {
                bot.segments.push({ ...bot.segments[bot.segments.length - 1] });
              }
            }
            pls.splice(idx, 1);
            
            pls.push({
              id: Math.random().toString(),
              x: Math.random() * (MAP_WIDTH - 40) + 20,
              y: Math.random() * (MAP_HEIGHT - 40) + 20,
              value: 0.10,
              color: bot.color,
              isCashDrop: false
            });
          }
        });
      });

      // Update refs
      snakesRef.current = sks;
      pelletsRef.current = pls;

      // Update fake leaderboard state
      const lb = Object.values(sks)
        .map(s => ({ email: s.email, value: s.value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      setLeaderboard(lb);

    }, TICK_RATE);
    
    localLoopRef.current = interval;
  };

  const handleLocalJoin = () => {
    if (wager > user.balance) {
      return addNotification("Solde insuffisant.", "danger");
    }

    // Deduct wager locally
    updateBalance(user.balance - wager);

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
      color: '#34d399', // Green
      eliminations: 0,
      isInvincible: false,
      spawnTime: Date.now()
    };

    setIsPlaying(true);
    setDeathStats(null);
    setCashoutStats(null);
    setMySnake({
      value: initialValue,
      eliminations: 0,
      length: 5
    });
    addNotification(`[Mode Démo] Spawn réussi !`, 'success');
  };

  const handleLocalDeath = (me) => {
    setIsPlaying(false);
    
    // Spawn drop pellets
    const pls = [...pelletsRef.current];
    const valPerDrop = parseFloat((me.value / me.segments.length).toFixed(4));
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
    addNotification("[Mode Démo] Vous êtes mort !", "danger");
  };

  const handleLocalCashout = () => {
    const myId = mySnakeIdRef.current;
    const me = snakesRef.current[myId];
    if (!me) return;

    const payout = me.value;
    updateBalance(user.balance + payout);

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
    addNotification(`[Mode Démo] Retrait réussi : +${payout} HTG`, 'success');
  };

  // --- RENDERING CANVAS DRAW LOOP (WebGL / 2D Canvas) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Make canvas fill screen container
    const handleResize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 450;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const draw = () => {
      if (!canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      // Find local snake head coordinates to center the camera
      let camera = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
      const myId = mySnakeIdRef.current;
      const localSnake = snakesRef.current[myId];
      if (localSnake && localSnake.segments && localSnake.segments[0]) {
        camera = { x: localSnake.segments[0].x, y: localSnake.segments[0].y };
      }

      // Map offset (draw coordinate mapping relative to camera screen center)
      const offsetX = w / 2 - camera.x;
      const offsetY = h / 2 - camera.y;

      // 1. Draw Hexagonal / Hex Grid background shifted by camera offset
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

          // Draw grid pattern (subtle lines)
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

      // 2. Draw Arena Borders
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 15;
      ctx.strokeRect(offsetX, offsetY, MAP_WIDTH, MAP_HEIGHT);
      ctx.shadowBlur = 0; // reset shadow

      // Draw out of bounds warning grid shading
      ctx.fillStyle = 'rgba(239, 68, 68, 0.03)';
      ctx.fillRect(offsetX - 2000, offsetY - 2000, MAP_WIDTH + 4000, 2000);
      ctx.fillRect(offsetX - 2000, offsetY + MAP_HEIGHT, MAP_WIDTH + 4000, 2000);
      ctx.fillRect(offsetX - 2000, offsetY, 2000, MAP_HEIGHT);
      ctx.fillRect(offsetX + MAP_WIDTH, offsetY, 2000, MAP_HEIGHT);

      // 3. Draw Pellets
      pelletsRef.current.forEach(p => {
        const px = p.x + offsetX;
        const py = p.y + offsetY;

        // Clip drawing if off-screen to improve rendering performance
        if (px < -30 || px > w + 30 || py < -30 || py > h + 30) return;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (p.isCashDrop) {
          // Yellow cash pellet
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 10;
          ctx.arc(px, py, 9, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw $ sign inside cash pellet
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 10px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', px, py);
          ctx.shadowBlur = 0;
        } else {
          // Normal food pellet
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 4. Draw Snakes
      Object.keys(snakesRef.current).forEach(id => {
        const s = snakesRef.current[id];
        if (!s || !s.segments || s.segments.length === 0) return;

        const isLocal = id === myId;
        const segments = s.segments;
        const head = segments[0];

        // Draw body segments (from tail to neck to overlay correctly)
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;

        for (let i = segments.length - 1; i >= 0; i--) {
          const seg = segments[i];
          const sx = seg.x + offsetX;
          const sy = seg.y + offsetY;

          // Skip if segment is way off screen
          if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

          // Segment size decays slightly towards tail (optimized for mobile/desktop to match 18px backend collision geometry)
          const segmentRadius = Math.max(6, 10 - i * 0.04);

          // Apply glow to local player
          if (isLocal) {
            ctx.shadowColor = s.color;
            ctx.shadowBlur = i === 0 ? 10 : 2;
          }

          // Apply blinking overlay if invincible
          if (s.isInvincible && Math.floor(Date.now() / 150) % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          } else {
            ctx.fillStyle = s.color;
          }

          ctx.beginPath();
          ctx.arc(sx, sy, segmentRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }

        // Draw Head Eyes looking at s.angle (scaled down to fit 10px radius head)
        const hx = head.x + offsetX;
        const hy = head.y + offsetY;
        const eyeOffsetRadius = 6;
        const eyeAngleSpacing = 0.45; // angle from central line

        const eyeLeftX = hx + Math.cos(s.angle - eyeAngleSpacing) * eyeOffsetRadius;
        const eyeLeftY = hy + Math.sin(s.angle - eyeAngleSpacing) * eyeOffsetRadius;
        const eyeRightX = hx + Math.cos(s.angle + eyeAngleSpacing) * eyeOffsetRadius;
        const eyeRightY = hy + Math.sin(s.angle + eyeAngleSpacing) * eyeOffsetRadius;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeLeftY, 2.5, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeRightY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(eyeLeftX + Math.cos(s.angle) * 1.0, eyeLeftY + Math.sin(s.angle) * 1.0, 1.2, 0, Math.PI * 2);
        ctx.arc(eyeRightX + Math.cos(s.angle) * 1.0, eyeRightY + Math.sin(s.angle) * 1.0, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Draw name and value above head (positioned closer for cleaner layout)
        ctx.fillStyle = isLocal ? '#34d399' : '#e2e8f0';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${s.email.split('@')[0]} (${s.value.toFixed(2)} G)`, hx, hy - 14);
      });

      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isPlaying]);

  // Track mouse coordinates on canvas to compute moving direction
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Center of the canvas (player head coordinates)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const angle = Math.atan2(dy, dx);

    // Update locally immediately
    const myId = mySnakeIdRef.current;
    if (myId && snakesRef.current[myId]) {
      snakesRef.current[myId].angle = angle;
    }

    // Emit to socket only if angle has changed significantly
    if (Math.abs(angle - lastAngleEmitRef.current) > 0.05) {
      lastAngleEmitRef.current = angle;
      if (isLocalSim) {
        // Handled locally
      } else if (socket && socket.connected) {
        socket.emit('ketmesye_input', { angle });
      }
    }
  };

  // Track touch coordinates on canvas to compute moving direction (mobile support)
  const handleTouchMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying || e.touches.length === 0) return;

    // Prevent scrolling or bouncing the screen while steering
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Center of the canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const angle = Math.atan2(dy, dx);

    // Update locally immediately
    const myId = mySnakeIdRef.current;
    if (myId && snakesRef.current[myId]) {
      snakesRef.current[myId].angle = angle;
    }

    // Emit to socket if changed
    if (Math.abs(angle - lastAngleEmitRef.current) > 0.05) {
      lastAngleEmitRef.current = angle;
      if (isLocalSim) {
        // Handled locally
      } else if (socket && socket.connected) {
        socket.emit('ketmesye_input', { angle });
      }
    }
  };

  // Human Spawn Request
  const handleSpawn = () => {
    if (wager < 10) {
      return addNotification("La mise minimale est de 10 HTG.", "danger");
    }

    if (wager > user.balance) {
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
        addNotification("Serveur hors-ligne. Utilisation de la simulation locale.", "info");
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

  return (
    <div className="flex flex-col bg-slate-950 w-full min-h-[500px] border border-slate-900 rounded-3xl overflow-hidden relative">
      
      {/* Header bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 sm:px-6 sm:py-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          <button 
            onClick={onBackToLobby}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
            title="Retour au lobby"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div>
            <h2 className="font-display font-black text-sm sm:text-lg text-white tracking-wide flex flex-wrap items-center gap-1 sm:gap-2">
              <span>KET<span className="text-yellow-500">MESYE</span></span>
              <span className="text-[8px] sm:text-xs uppercase bg-yellow-500/20 text-yellow-400 font-bold px-1.5 py-0.5 rounded">Snake Arena</span>
            </h2>
            <p className="text-[8px] sm:text-[10px] text-slate-500 font-medium line-clamp-1">Battez vos adversaires et encaissez les HTG en temps réel</p>
          </div>
        </div>

        {/* Display connection status */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-950 border border-slate-800 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full shrink-0">
          <div className={`h-1.5 w-1.5 sm:h-2.5 sm:w-2.5 rounded-full ${isLocalSim ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-[9px] sm:text-xs font-semibold text-slate-400 font-mono">
            {isLocalSim ? 'Mode Démo' : 'Multiplayer Connecté'}
          </span>
        </div>
      </div>

      <div className="flex-grow flex flex-col md:flex-row relative">
        
        {/* Game Canvas Container */}
        <div className="flex-grow relative h-[420px] sm:h-[450px] overflow-hidden bg-slate-950/80">
          
          {/* Main game Canvas */}
          <canvas 
            ref={canvasRef} 
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchMove}
            onTouchMove={handleTouchMove}
            className="block w-full h-full cursor-crosshair touch-none" 
          />

          {/* Floating HUD controls (While playing) */}
          {isPlaying && mySnake && (
            <>
              {/* Leaderboard panel on top-right (Hidden on small mobile screens to save space) */}
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

              {/* Floating Bottom Center Wager / Cashout Box (Highly optimized and responsive for mobile) */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl flex items-center space-x-4 shadow-2xl z-20 w-[92%] sm:w-auto sm:min-w-[280px]">
                <div className="flex flex-col shrink-0">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Solde Arena</span>
                  <span className="font-mono text-base sm:text-lg font-black text-emerald-400">{mySnake.value.toFixed(2)} G</span>
                  <span className="text-[8px] text-slate-400">{mySnake.eliminations} kills</span>
                </div>

                <button
                  onClick={handleCashout}
                  className="flex-grow flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-xs sm:text-sm"
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>CASH OUT (RETRAIT)</span>
                </button>
              </div>
            </>
          )}

          {/* JOIN SCREEN OVERLAY (Before starting) */}
          {!isPlaying && !cashoutStats && !deathStats && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20">
              <div className="bg-gradient-to-r from-yellow-500/10 to-indigo-500/10 p-6 rounded-3xl border border-slate-800 max-w-sm w-full text-center shadow-2xl">
                <div className="h-14 w-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center text-yellow-500 mx-auto mb-4">
                  <Play className="h-7 w-7" />
                </div>
                
                <h3 className="font-display font-black text-xl text-slate-200 mb-2">REJOINDRE L'ARÈNE</h3>
                <p className="text-xs text-slate-400 mb-6">Misez vos HTG, mangez les orbes et les autres joueurs pour gonfler votre valeur, et retirez votre cash avant de vous faire percuter !</p>

                <div className="flex flex-col space-y-4 text-left mb-6">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mise d'entrée (Min: 10 HTG)</label>
                    <div className="flex border border-slate-800 bg-slate-950 rounded-xl overflow-hidden mt-1.5">
                      <span className="bg-slate-900 px-3 py-2 text-xs font-bold text-slate-500 flex items-center border-r border-slate-800">HTG</span>
                      <input
                        type="number"
                        value={wager}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWager(val === '' ? '' : parseInt(val) || 0);
                        }}
                        onBlur={() => {
                          if (!wager || wager < 10) setWager(10);
                        }}
                        className="block w-full px-3 py-2 bg-transparent text-slate-200 text-sm font-bold font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick wager buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 20, 50, 100].map(val => (
                      <button
                        key={val}
                        onClick={() => setWager(val)}
                        className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                          wager === val ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {val} G
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

          {/* CASHOUT SUCCESS OVERLAY */}
          {cashoutStats && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20">
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl animate-pulse-glow">
                <div className="bg-emerald-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
                  <Award className="h-8 w-8 animate-bounce" />
                </div>
                
                <h3 className="font-display font-black text-2xl text-emerald-400 tracking-wide">RETRAIT RÉUSSI !</h3>
                <p className="text-slate-300 text-xs mt-1 mb-6">Votre solde a été crédité avec succès</p>

                <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-4 space-y-3 mb-6 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Montant Reçu</span>
                    <span className="font-mono font-bold text-emerald-400">{cashoutStats.payout.toFixed(2)} HTG</span>
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

          {/* DEATH OVERLAY */}
          {deathStats && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20">
              <div className="bg-red-950/40 border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                <div className="bg-red-600 p-4 rounded-full text-white w-14 h-14 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/25">
                  <AlertTriangle className="h-8 w-8 text-white" />
                </div>
                
                <h3 className="font-display font-black text-2xl text-red-500 tracking-wide">SÉPAN AN MOURI !</h3>
                <p className="text-slate-300 text-xs mt-1 mb-6">Vous avez percuté un obstacle oswa un adversaire</p>

                <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-4 space-y-3 mb-6 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Mise Perdue</span>
                    <span className="font-mono font-bold text-red-400">{deathStats.valueLost.toFixed(2)} HTG</span>
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
