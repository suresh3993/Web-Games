import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const ATTEMPTS = 5;

/** Faster average reaction → higher points (200 ms ≈ 800 points, 500 ms ≈ 500). */
export const reactionScore = (avgMs: number) => Math.max(0, Math.round(1000 - avgMs));

class ReactionTest extends DomGame {
  private times: number[] = [];
  private state: 'idle' | 'waiting' | 'go' | 'early' = 'idle';
  private goAt = 0;
  private fouls = 0;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.times = [];
    this.state = 'idle';
    this.fouls = 0;
  }

  private arm() {
    this.state = 'waiting';
    const wait = 1200 + this.random() * 2800;
    this.schedule(wait, () => {
      if (this.state !== 'waiting') return;
      this.state = 'go';
      this.render();
      // Measured with performance.now() for millisecond precision.
      this.goAt = performance.now();
    });
  }

  private press() {
    if (this.state === 'idle' || this.state === 'early') this.arm();
    else if (this.state === 'waiting') {
      this.state = 'early';
      this.fouls++;
      this.sfx.bad();
    } else if (this.state === 'go') {
      const ms = Math.round(performance.now() - this.goAt);
      this.times.push(ms);
      this.sfx.good();
      if (this.times.length >= ATTEMPTS) {
        const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
        this.setScore(Math.max(0, reactionScore(avg) - this.fouls * 50));
        this.end('completed', { averageMs: Math.round(avg), fouls: this.fouls });
        return;
      }
      this.state = 'idle';
    }
    this.render();
  }

  protected override onAction(action: string) {
    if (action === 'pad') this.press();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      this.press();
      return true;
    }
    return false;
  }

  protected view() {
    const avg = this.times.length ? Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length) : 0;
    const cfg = {
      idle: { bg: '#1e2a66', text: this.times.length ? `${this.times.at(-1)} ms — click to go again` : 'Click (or press Space) to start' },
      waiting: { bg: '#991b1b', text: 'Wait for green…' },
      go: { bg: '#15803d', text: 'CLICK!' },
      early: { bg: '#a16207', text: 'Too soon! Click to try again' },
    }[this.state];
    return `
      <div class="pv-hud"><span>Attempt <b>${Math.min(this.times.length + 1, ATTEMPTS)}/${ATTEMPTS}</b></span><span>Average <b>${avg || '—'} ms</b></span><span>Fouls <b>${this.fouls}</b></span></div>
      <button type="button" data-action="pad" data-value="" style="all:unset;cursor:pointer;width:min(100%,560px);height:min(55vh,340px);border-radius:18px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:clamp(22px,5vmin,40px);font-weight:800;text-align:center;color:#fff" aria-live="assertive">${cfg.text}</button>
      <p class="pv-muted">Times: ${this.times.map((t) => `${t} ms`).join(' · ') || '—'}</p>`;
  }
}

export default defineGame(
  { key: 'reaction-test', engine: 'DOM', aspectRatio: 1.2, maxScore: 1000, controls: [{ action: 'React', keys: 'Click / Space when green' }] },
  (host) => new ReactionTest(host),
);
