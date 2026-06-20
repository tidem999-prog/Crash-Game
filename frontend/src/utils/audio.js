let audioCtx = null;
let isMuted = false;

// Continuous engine nodes references
let engineOsc = null;
let engineNoise = null;
let engineGain = null;

export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function initAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (err) {
    console.warn('Web Audio API not supported or blocked:', err);
  }
}

export function setMuted(muted) {
  isMuted = muted;
  if (isMuted) {
    stopEngineSound();
  }
}

export function getMuted() {
  return isMuted;
}

// 1. Play Button Click sound
export function playClick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(523.25, now); // C5
  osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5 sweep

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.02); // Louder peak
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); // Longer decay

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.15);
}

// 2. Continuous Engine flight loop sound
export function startEngineSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Don't restart if already playing
  if (engineOsc || engineNoise) return;

  const now = ctx.currentTime;
  engineGain = ctx.createGain();
  engineGain.gain.setValueAtTime(0.001, now);
  engineGain.gain.exponentialRampToValueAtTime(0.08, now + 0.3); // smooth fade-in

  // Low frequency rumble oscillator
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.setValueAtTime(45, now);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(140, now);

  engineOsc.connect(filter);
  filter.connect(engineGain);

  // White noise for air resistance whoosh
  const bufferSize = 1 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  
  engineNoise = ctx.createBufferSource();
  engineNoise.buffer = noiseBuffer;
  engineNoise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(260, now);

  engineNoise.connect(noiseFilter);
  noiseFilter.connect(engineGain);

  engineGain.connect(ctx.destination);

  engineOsc.start(now);
  engineNoise.start(now);
}

// 3. Update flight engine pitch/rumble based on multiplier
export function updateEnginePitch(multiplier) {
  if (isMuted || !engineOsc) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Pitch goes up from 45Hz (1.0x) to 160Hz (15x+) as the plane gains altitude
  const targetFreq = Math.min(160, 45 + (multiplier - 1.0) * 12);
  engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.15);
}

// 4. Terminate flight engine loop
export function stopEngineSound() {
  const ctx = getAudioContext();
  const now = ctx ? ctx.currentTime : 0;
  
  if (engineGain && ctx) {
    try {
      engineGain.gain.setValueAtTime(engineGain.gain.value, now);
      engineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } catch (e) {}
  }
  
  const oscToStop = engineOsc;
  const noiseToStop = engineNoise;
  engineOsc = null;
  engineNoise = null;
  engineGain = null;

  setTimeout(() => {
    try { if (oscToStop) oscToStop.stop(); } catch (e) {}
    try { if (noiseToStop) noiseToStop.stop(); } catch (e) {}
  }, 150);
}

// 5. Short Takeoff Trigger (Deprecated for continuous engine loop, but kept as fallback)
export function playTakeoff() {
  // We prefer using the continuous startEngineSound() loop for the flying phase
  startEngineSound();
}

// 6. Explosion Crash sound
export function playCrash() {
  // Stop the engine loop immediately when crash happens
  stopEngineSound();

  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Synthesize white noise buffer
  const bufferSize = 1.5 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(25, now + 1.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 1.5);

  // Add low boom sub-bass oscillator
  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(90, now);
  boom.frequency.linearRampToValueAtTime(10, now + 0.9);

  boomGain.gain.setValueAtTime(0.35, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

  boom.connect(boomGain);
  boomGain.connect(ctx.destination);

  boom.start(now);
  boom.stop(now + 1.0);
}

// 7. Metallic Double coin chime
export function playCashout() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First coin chime (high bell sound)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now); // D5

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.12);

  // Second coin chime (higher pitch, offset slightly)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5

  gain2.gain.setValueAtTime(0.001, now + 0.08);
  gain2.gain.linearRampToValueAtTime(0.15, now + 0.10);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.4);
}
