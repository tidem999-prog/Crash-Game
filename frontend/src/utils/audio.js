let audioCtx = null;

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

// 1. Takeoff Jet Engine sweep
export function playTakeoff() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Synthesize white noise buffer
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6.0;
  filter.frequency.setValueAtTime(120, now);
  filter.frequency.exponentialRampToValueAtTime(1400, now + 1.8);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 2.0);

  // Mix in a rising oscillator rumble for engine power
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(55, now); // A1 note
  osc.frequency.exponentialRampToValueAtTime(280, now + 1.8);

  oscGain.gain.setValueAtTime(0.001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.06, now + 0.4);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

  // Extra lowpass filter on rumble oscillator to keep it warm
  const oscFilter = ctx.createBiquadFilter();
  oscFilter.type = 'lowpass';
  oscFilter.frequency.setValueAtTime(400, now);

  osc.connect(oscFilter);
  oscFilter.connect(oscGain);
  oscGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 2.0);
}

// 2. Explosion Crash sound
export function playCrash() {
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

// 3. Metallic Double coin chime
export function playCashout() {
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
