import { settings } from '../game/Settings';

/**
 * Doodle sound effects synthesised with the Web Audio API: nothing to download, works
 * offline. Every one-shot varies its pitch by up to 5% so repeats do not grate.
 */
class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private scratch: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private creak: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    return settings().sound && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private vary(): number {
    return 1 + (Math.random() * 2 - 1) * 0.05;
  }

  private env(ctx: AudioContext, peak: number, attack: number, decay: number, at = ctx.currentTime): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.master!);
    return g;
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, peak: number, at?: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    const v = this.vary();
    osc.frequency.setValueAtTime(from * v, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * v), t + dur);
    osc.connect(this.env(ctx, peak, 0.005, dur, t));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(filterType: BiquadFilterType, fromHz: number, toHz: number, dur: number, peak: number, q = 1): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = this.vary();
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(fromHz, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + dur);
    src.connect(f);
    f.connect(this.env(ctx, peak, 0.004, dur));
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  // ---------- drawing ----------

  /** Pencil scratch while drawing; louder with faster strokes. Pass 0 to fade out. */
  setScratch(speed: number): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    if (!this.scratch) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3200;
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      src.start();
      this.scratch = { src, gain, filter };
    }
    const level = Math.min(0.32, speed * 0.03);
    this.scratch.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
    this.scratch.filter.frequency.setTargetAtTime(2600 + Math.min(2400, speed * 160), ctx.currentTime, 0.05);
  }

  // ---------- bridge ----------

  /** Wooden creak that rises in pitch and volume with the most stressed joint. */
  setCreak(stress: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.creak) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      osc.start();
      this.creak = { osc, gain, filter };
    }
    const s = Math.max(0, Math.min(1.2, stress));
    const level = s < 0.45 ? 0 : Math.min(0.12, (s - 0.45) * 0.22);
    const wobble = 1 + Math.sin(ctx.currentTime * 23) * 0.06;
    this.creak.osc.frequency.setTargetAtTime((70 + s * 90) * wobble, ctx.currentTime, 0.05);
    this.creak.filter.frequency.setTargetAtTime(500 + s * 700, ctx.currentTime, 0.05);
    this.creak.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
  }

  snap(): void {
    this.burst('highpass', 3500, 1800, 0.05, 0.6, 0.7);
    this.tone('triangle', 520, 140, 0.09, 0.35);
  }

  // ---------- vehicle ----------

  boost(): void {
    this.burst('bandpass', 380, 2400, 0.32, 0.45, 1.2);
    this.tone('sine', 220, 440, 0.25, 0.12);
  }

  land(impact: number): void {
    const peak = Math.min(0.5, 0.12 + impact * 0.05);
    this.tone('sine', 150, 55, 0.14, peak);
    if (impact > 4) this.tone('sine', 480, 180, 0.22, peak * 0.4);
  }

  crash(): void {
    this.burst('lowpass', 4000, 250, 0.45, 0.7, 0.8);
    this.tone('sine', 110, 40, 0.3, 0.6);
    // Cartoon slide-whistle down.
    const ctx = this.ready();
    if (ctx) this.tone('sine', 1100, 220, 0.55, 0.16, ctx.currentTime + 0.12);
  }

  // ---------- results ----------

  /** Star ding; index 0, 1, 2 rises in pitch. */
  ding(index: number): void {
    const notes = [1046.5, 1318.5, 1568];
    const f = notes[Math.min(index, notes.length - 1)]!;
    this.tone('sine', f, f, 0.6, 0.3);
    this.tone('sine', f * 2.01, f * 2.01, 0.3, 0.08);
  }

  win(): void {
    const ctx = this.ready();
    if (!ctx) return;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.22, ctx.currentTime + i * 0.08));
  }

  tap(): void {
    this.tone('triangle', 900, 600, 0.05, 0.12);
  }

  /** Silence the continuous sounds (scene change, pause). */
  quiet(): void {
    this.setScratch(0);
    this.setCreak(0);
  }
}

export const Sfx = new SfxEngine();
