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
  score() { this.tone(523, .1); this.tone(659, .1, 'square', .035, .09); this.tone(784, .18, 'square', .035, .18); }
}
