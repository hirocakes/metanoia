// Tiny synthesised sound bank — oscillators and noise only, so the game
// ships with zero audio files and still feels alive.

let ctxAudio = null;
let master = null;
let muted = false;

function ensure() {
  if (ctxAudio) return ctxAudio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctxAudio = new AC();
  master = ctxAudio.createGain();
  master.gain.value = 0.5;
  master.connect(ctxAudio.destination);
  return ctxAudio;
}

function tone(freq, dur, type = 'sine', gain = 0.25, slideTo = null) {
  const ac = ensure();
  if (!ac || muted) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(ac.currentTime + dur + 0.02);
}

function noise(dur, gain = 0.18, filterFreq = 1400) {
  const ac = ensure();
  if (!ac || muted) return;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start();
}

export const audio = {
  unlock() { const ac = ensure(); if (ac && ac.state === 'suspended') ac.resume(); },
  isMuted() { return muted; },
  toggle() { muted = !muted; return muted; },
  swing() { noise(0.16, 0.14, 2600); },
  hit() { tone(180, 0.14, 'square', 0.22, 90); noise(0.1, 0.12, 900); },
  hurt() { tone(140, 0.3, 'sawtooth', 0.26, 60); },
  dash() { noise(0.2, 0.12, 3200); tone(520, 0.12, 'sine', 0.1, 880); },
  skill() { tone(220, 0.5, 'sawtooth', 0.2, 1300); tone(330, 0.5, 'sine', 0.14, 1700); },
  levelup() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.2), i * 90)); },
  pickup() { tone(880, 0.1, 'sine', 0.14, 1320); },
  death() { tone(320, 0.4, 'sawtooth', 0.16, 70); },
  victory() { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.18), i * 130)); },
  defeat() { [330, 262, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sawtooth', 0.16), i * 160)); }
};
