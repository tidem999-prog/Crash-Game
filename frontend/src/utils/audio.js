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
let bmSirenOsc = null;
let bmSirenMod = null;
let bmSirenGain = null;

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

// 10. Blood Money - Continuous sports car engine loop + Police Sirens chase loop
export function startBmEngineSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (bmEngineOsc || bmEngineNoise || bmSirenOsc) return;

  const now = ctx.currentTime;
  
  // 10.1. Engine setup
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

  // 10.2. Police Siren loop (plays while car is running/escaping)
  bmSirenGain = ctx.createGain();
  bmSirenGain.gain.setValueAtTime(0.001, now);
  bmSirenGain.gain.exponentialRampToValueAtTime(0.035, now + 0.5); // background volume so it doesn't overwhelm the user

  bmSirenOsc = ctx.createOscillator();
  bmSirenOsc.type = 'sine';
  bmSirenOsc.frequency.setValueAtTime(600, now);

  bmSirenMod = ctx.createOscillator();
  bmSirenMod.type = 'sine';
  bmSirenMod.frequency.setValueAtTime(3.5, now); // initial wailing speed

  const sirenModGain = ctx.createGain();
  sirenModGain.gain.setValueAtTime(120, now); // wailing pitch range (480Hz - 720Hz)

  bmSirenMod.connect(sirenModGain);
  sirenModGain.connect(bmSirenOsc.frequency);

  bmSirenOsc.connect(bmSirenGain);
  bmSirenGain.connect(ctx.destination);

  // Start all nodes
  bmEngineOsc.start(now);
  bmEngineNoise.start(now);
  bmSirenOsc.start(now);
  bmSirenMod.start(now);
}

// 11. Blood Money - Update sports car engine pitch and police siren wail speed
export function updateBmEnginePitch(multiplier) {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (bmEngineOsc) {
    const targetFreq = Math.min(240, 60 + (multiplier - 1.0) * 15);
    bmEngineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.15);
  }

  if (bmSirenMod) {
    // Siren wails faster and faster as police catch up (multiplier rises)
    const targetWailFreq = Math.min(8.5, 3.5 + (multiplier - 1.0) * 0.45);
    bmSirenMod.frequency.setTargetAtTime(targetWailFreq, ctx.currentTime, 0.2);
  }
}

// 12. Blood Money - Stop sports car engine and police sirens loops
export function stopBmEngineSound() {
  const ctx = getAudioContext();
  const now = ctx ? ctx.currentTime : 0;

  if (bmEngineGain && ctx) {
    try {
      bmEngineGain.gain.setValueAtTime(bmEngineGain.gain.value, now);
      bmEngineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } catch (e) {}
  }

  if (bmSirenGain && ctx) {
    try {
      bmSirenGain.gain.setValueAtTime(bmSirenGain.gain.value, now);
      bmSirenGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } catch (e) {}
  }

  const oscToStop = bmEngineOsc;
  const noiseToStop = bmEngineNoise;
  const sirenOscToStop = bmSirenOsc;
  const sirenModToStop = bmSirenMod;

  bmEngineOsc = null;
  bmEngineNoise = null;
  bmEngineGain = null;
  bmSirenOsc = null;
  bmSirenMod = null;
  bmSirenGain = null;

  setTimeout(() => {
    try { if (oscToStop) oscToStop.stop(); } catch (e) {}
    try { if (noiseToStop) noiseToStop.stop(); } catch (e) {}
    try { if (sirenOscToStop) sirenOscToStop.stop(); } catch (e) {}
    try { if (sirenModToStop) sirenModToStop.stop(); } catch (e) {}
  }, 120);
}

// 13. Blood Money - Unique Busted sound (Metal Crash + Tire Skid + Descending Game Over failure synth)
export function playBustedSound() {
  stopBmEngineSound(); // Stop the engine and sirens loop immediately

  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 13.1. Impact crash metal boom
  const crashOsc = ctx.createOscillator();
  const crashGain = ctx.createGain();
  crashOsc.type = 'sawtooth';
  crashOsc.frequency.setValueAtTime(140, now);
  crashOsc.frequency.exponentialRampToValueAtTime(10, now + 0.7);

  const crashFilter = ctx.createBiquadFilter();
  crashFilter.type = 'lowpass';
  crashFilter.frequency.setValueAtTime(250, now);
  crashFilter.frequency.exponentialRampToValueAtTime(20, now + 0.7);

  crashGain.gain.setValueAtTime(0.35, now);
  crashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  crashOsc.connect(crashFilter);
  crashFilter.connect(crashGain);
  crashGain.connect(ctx.destination);
  crashOsc.start(now);
  crashOsc.stop(now + 0.7);

  // 13.2. Screeching tires halt / brake skid
  const skidBufferSize = 0.45 * ctx.sampleRate;
  const skidBuffer = ctx.createBuffer(1, skidBufferSize, ctx.sampleRate);
  const skidData = skidBuffer.getChannelData(0);
  for (let i = 0; i < skidBufferSize; i++) {
    skidData[i] = Math.random() * 2 - 1;
  }
  const skidNoise = ctx.createBufferSource();
  skidNoise.buffer = skidBuffer;

  const skidFilter = ctx.createBiquadFilter();
  skidFilter.type = 'bandpass';
  skidFilter.frequency.setValueAtTime(1800, now);
  skidFilter.frequency.exponentialRampToValueAtTime(150, now + 0.4);
  skidFilter.Q.setValueAtTime(4.0, now);

  const skidGain = ctx.createGain();
  skidGain.gain.setValueAtTime(0.12, now);
  skidGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  skidNoise.connect(skidFilter);
  skidFilter.connect(skidGain);
  skidGain.connect(ctx.destination);
  skidNoise.start(now);
  skidNoise.stop(now + 0.4);

  // 13.3. Retro arcade game over failure chords (low descending minor synth)
  const failOsc1 = ctx.createOscillator();
  const failOsc2 = ctx.createOscillator();
  const failGain = ctx.createGain();

  failOsc1.type = 'sawtooth';
  failOsc1.frequency.setValueAtTime(80, now + 0.12);
  failOsc1.frequency.linearRampToValueAtTime(42, now + 0.9);

  failOsc2.type = 'sawtooth';
  failOsc2.frequency.setValueAtTime(82, now + 0.12); // detuned for growl
  failOsc2.frequency.linearRampToValueAtTime(44, now + 0.9);

  const failFilter = ctx.createBiquadFilter();
  failFilter.type = 'lowpass';
  failFilter.frequency.setValueAtTime(220, now + 0.12);
  failFilter.frequency.exponentialRampToValueAtTime(50, now + 0.9);

  failGain.gain.setValueAtTime(0.001, now + 0.12);
  failGain.gain.linearRampToValueAtTime(0.22, now + 0.22);
  failGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

  failOsc1.connect(failFilter);
  failOsc2.connect(failFilter);
  failFilter.connect(failGain);
  failGain.connect(ctx.destination);

  failOsc1.start(now + 0.12);
  failOsc2.start(now + 0.12);
  failOsc1.stop(now + 0.9);
  failOsc2.stop(now + 0.9);
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
