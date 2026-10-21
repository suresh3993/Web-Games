import type { GameHost } from '../interfaces/game-module';

/** Tiny synthesized sound effects (no audio assets). Respects the host's sound setting. */
export class Sfx {
  private ctx: AudioContext | null = null;

  constructor(private readonly host: GameHost) {}

  beep(frequency: number, seconds = 0.08, type: OscillatorType = 'square', volume = 0.06, delay = 0) {
    if (this.closed || !this.host.settings.soundEnabled || typeof AudioContext === 'undefined') return;
    try {
      this.ctx ??= new AudioContext();
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + seconds);
    } catch {
      // Audio is optional (autoplay policy, no device).
    }
  }

  good() {
    this.beep(660, 0.07, 'triangle');
  }
  bad() {
    this.beep(160, 0.18, 'sawtooth', 0.05);
  }
  click() {
    this.beep(420, 0.03, 'square', 0.03);
  }
  win() {
    // Scheduled on the audio clock (not setTimeout) so nothing fires after destroy().
    [523, 659, 784, 1046].forEach((f, i) => this.beep(f, 0.12, 'triangle', 0.06, i * 0.09));
  }

  private closed = false;

  close() {
    this.closed = true;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
