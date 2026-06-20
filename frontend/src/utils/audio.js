let audioCtx = null;
let isMuted = false;

// Continuous engine nodes references
let engineOsc = null;
let engineNoise = null;
let engineGain = null;

// Blood Money engine nodes references
let bmEngineOsc = null;
let bmEngineNoise = null;
let bmEngineGain = null;

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
    stopBmEngineSound();
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

// 8. Blood Money - Futuristic ignition click sound
export function playBmBetClick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.25);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(1200, now + 0.25);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

// 9. Blood Money - Screeching tires sound
export function playTireScreech() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(800, now);
  osc1.frequency.linearRampToValueAtTime(1200, now + 0.15);
  osc1.frequency.exponentialRampToValueAtTime(600, now + 0.45);

  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(805, now);
  osc2.frequency.linearRampToValueAtTime(1205, now + 0.15);
  osc2.frequency.exponentialRampToValueAtTime(605, now + 0.45);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1000, now);
  filter.Q.setValueAtTime(3.0, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
}

// 10. Blood Money - Continuous sports car engine loop
export function startBmEngineSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (bmEngineOsc || bmEngineNoise) return;

  const now = ctx.currentTime;
  bmEngineGain = ctx.createGain();
  bmEngineGain.gain.setValueAtTime(0.001, now);
  bmEngineGain.gain.exponentialRampToValueAtTime(0.06, now + 0.3); // low engine hum volume

  bmEngineOsc = ctx.createOscillator();
  bmEngineOsc.type = 'sawtooth';
  bmEngineOsc.frequency.setValueAtTime(60, now); // 60Hz base frequency

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(160, now);

  bmEngineOsc.connect(filter);
  filter.connect(bmEngineGain);

  // Noise for exhaust hiss & wind rush
  const bufferSize = 1 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  bmEngineNoise = ctx.createBufferSource();
  bmEngineNoise.buffer = noiseBuffer;
  bmEngineNoise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(220, now);
  noiseFilter.Q.setValueAtTime(2.0, now);

  bmEngineNoise.connect(noiseFilter);
  noiseFilter.connect(bmEngineGain);

  bmEngineGain.connect(ctx.destination);

  bmEngineOsc.start(now);
  bmEngineNoise.start(now);
}

// 11. Blood Money - Update sports car engine pitch
export function updateBmEnginePitch(multiplier) {
  if (isMuted || !bmEngineOsc) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const targetFreq = Math.min(240, 60 + (multiplier - 1.0) * 15);
  bmEngineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.15);
}

// 12. Blood Money - Stop sports car engine loop
export function stopBmEngineSound() {
  const ctx = getAudioContext();
  const now = ctx ? ctx.currentTime : 0;

  if (bmEngineGain && ctx) {
    try {
      bmEngineGain.gain.setValueAtTime(bmEngineGain.gain.value, now);
      bmEngineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } catch (e) {}
  }

  const oscToStop = bmEngineOsc;
  const noiseToStop = bmEngineNoise;
  bmEngineOsc = null;
  bmEngineNoise = null;
  bmEngineGain = null;

  setTimeout(() => {
    try { if (oscToStop) oscToStop.stop(); } catch (e) {}
    try { if (noiseToStop) noiseToStop.stop(); } catch (e) {}
  }, 120);
}

// 13. Blood Money - Busted siren sound
export function playBustedSound() {
  stopBmEngineSound(); // Stop the engine loop immediately

  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Impact crash boom
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(10, now + 0.8);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(30, now + 0.8);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.8);

  // High-speed police siren (wailing wuu-wuu sound)
  const sirenOsc = ctx.createOscillator();
  const sirenGain = ctx.createGain();
  sirenOsc.type = 'sine';
  sirenOsc.frequency.setValueAtTime(600, now);

  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(4, now); // 4Hz wail speed
  modGain.gain.setValueAtTime(150, now); // wail range 450Hz - 750Hz

  mod.connect(modGain);
  modGain.connect(sirenOsc.frequency);

  sirenGain.gain.setValueAtTime(0.001, now);
  sirenGain.gain.linearRampToValueAtTime(0.12, now + 0.1);
  sirenGain.gain.linearRampToValueAtTime(0.12, now + 1.2);
  sirenGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

  sirenOsc.connect(sirenGain);
  sirenGain.connect(ctx.destination);

  mod.start(now);
  sirenOsc.start(now);
  
  mod.stop(now + 1.5);
  sirenOsc.stop(now + 1.5);
}

// 14. Blood Money - Cash Register / Money bills sweep
export function playBmCashout() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 1. High metal bell ring (ka-ching)
  const bell = ctx.createOscillator();
  const bellGain = ctx.createGain();
  bell.type = 'sine';
  bell.frequency.setValueAtTime(1800, now);

  bellGain.gain.setValueAtTime(0.001, now);
  bellGain.gain.linearRampToValueAtTime(0.1, now + 0.01);
  bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  bell.connect(bellGain);
  bellGain.connect(ctx.destination);
  bell.start(now);
  bell.stop(now + 0.25);

  // 2. Paper cash rustle (short burst of filtered white noise)
  const bufferSize = 0.2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2500, now);
  filter.Q.setValueAtTime(4.0, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now + 0.05); // slight delay after bell
  noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.08);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  
  noise.start(now + 0.05);
  noise.stop(now + 0.22);
}
