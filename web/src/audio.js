export class Sound {
  constructor(enabled) { this.enabled = enabled; this.context = null; this.lastBounce = 0; }
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { this.enabled = false; }
  }
  tone(frequency, duration = .06, type = 'square', volume = .035, delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(t); oscillator.stop(t + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  click() { this.tone(330, .035); }
  bounce() {
    const now = performance.now();
    if (now - this.lastBounce < 90) return;
    this.lastBounce = now; this.tone(105, .045, 'triangle', .06);
  }
  score() { this.tone(523, .1); this.tone(659, .1, 'square', .035, .09); this.tone(784, .18, 'square', .035, .18); this.tone(1046, .22, 'triangle', .03, .27); }
  dunk() { this.tone(196, .08, 'sawtooth', .05); this.tone(98, .16, 'triangle', .06, .06); }
  cheer() {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context, t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.7, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(t); src.stop(t + 0.7);
  }
}

// Tiny chiptune step sequencer — no audio assets. Menu is chill, game is upbeat.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
const TRACKS = {
  menu: {
    bpm: 92,
    bass: [36,0,0,0, 0,0,36,0, 33,0,0,0, 0,0,33,0, 41,0,0,0, 0,0,41,0, 43,0,0,0, 0,0,43,0],
    lead: [72,0,0,74, 0,0,76,0, 0,0,74,0, 72,0,0,0, 69,0,0,71, 0,0,72,0, 0,0,71,0, 69,0,0,0]
  },
  game: {
    bpm: 128,
    bass: [36,0,36,36, 0,36,0,36, 33,0,33,33, 0,33,0,33, 41,0,41,41, 0,41,0,41, 43,0,43,43, 0,43,0,43],
    lead: [72,0,74,76, 0,79,76,0, 74,0,72,0, 74,0,0,0, 77,0,76,74, 0,72,0,74, 76,0,74,0, 72,0,0,0]
  }
};

export class Music {
  constructor(sound) {
    this.sound = sound;
    this.track = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.noise = null;
  }
  play(name) {
    if (this.track === name && this.timer) return;
    this.stop();
    if (!TRACKS[name]) return;
    this.track = name;
    const ctx = this.sound.context;
    if (!ctx) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 40);
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.track = null;
  }
  schedule() {
    const ctx = this.sound.context;
    if (!ctx || !this.sound.enabled || !this.track) return;
    const track = TRACKS[this.track];
    const spb = 60 / track.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, track);
      this.nextTime += spb;
      this.step = (this.step + 1) % track.bass.length;
    }
  }
  playStep(step, time, track) {
    const bass = track.bass[step], lead = track.lead[step];
    if (bass) this.tone(NOTE(bass), time, 0.24, 'triangle', 0.055);
    if (lead) this.tone(NOTE(lead), time, 0.15, 'square', 0.022);
    if (step % 4 === 2) this.hat(time);
  }
  tone(freq, time, dur, type, vol) {
    const ctx = this.sound.context;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(time); osc.stop(time + dur);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  hat(time) {
    const ctx = this.sound.context;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, 2205, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 6500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.014, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(time); src.stop(time + 0.03);
  }
}
