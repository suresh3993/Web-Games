import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const PADS = [
  { color: '#22c55e', lit: '#86efac', tone: 392 },
  { color: '#ef4444', lit: '#fca5a5', tone: 330 },
  { color: '#eab308', lit: '#fde68a', tone: 262 },
  { color: '#3b82f6', lit: '#93c5fd', tone: 196 },
];

class ColorSequence extends DomGame {
  private sequence: number[] = [];
  private inputPos = 0;
  private lit = -1;
  private playing = false;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.sequence = [];
    this.inputPos = 0;
    this.lit = -1;
    this.message = 'Watch the pads…';
    this.schedule(600, () => this.nextRound());
  }

  private nextRound() {
    this.sequence.push(Math.floor(this.random() * 4));
    this.inputPos = 0;
    this.playing = true;
    this.message = `Round ${this.sequence.length} — watch`;
    const step = Math.max(260, 600 - this.sequence.length * 20);
    this.sequence.forEach((pad, n) => {
      this.schedule(n * step + 200, () => this.flash(pad, step * 0.65));
    });
    this.schedule(this.sequence.length * step + 250, () => {
      this.playing = false;
      this.message = 'Your turn — repeat the sequence';
      this.render();
    });
    this.render();
  }

  private flash(pad: number, ms: number) {
    this.lit = pad;
    this.sfx.beep(PADS[pad]!.tone, ms / 1000, 'sine', 0.08);
    this.render();
    this.schedule(ms, () => {
      this.lit = -1;
      this.render();
    });
  }

  private press(pad: number) {
    if (this.playing) return;
    this.flash(pad, 180);
    if (pad !== this.sequence[this.inputPos]) {
      this.sfx.bad();
      this.message = `Wrong pad! You reached round ${this.sequence.length}.`;
      this.end('completed', { rounds: this.sequence.length - 1 });
      return;
    }
    this.inputPos++;
    if (this.inputPos === this.sequence.length) {
      this.addScore(this.sequence.length * 10);
      this.playing = true;
      this.message = 'Correct!';
      this.schedule(700, () => this.nextRound());
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'pad') this.press(Number(value));
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-4]$/.test(e.key)) {
      this.press(Number(e.key) - 1);
      return true;
    }
    return false;
  }

  protected view() {
    const pads = PADS.map(
      (p, i) =>
        `<button type="button" class="pv-cell" style="border-radius:${['100% 12px 12px 12px', '12px 100% 12px 12px', '12px 12px 12px 100%', '12px 12px 100% 12px'][i]};background:${this.lit === i ? p.lit : p.color};${this.lit === i ? `box-shadow:0 0 40px ${p.lit}` : 'opacity:.75'}" data-action="pad" data-value="${i}" aria-label="Pad ${i + 1}" ${this.playing ? 'disabled' : ''}></button>`,
    ).join('');
    return `
      <div class="pv-hud"><span>Round <b>${this.sequence.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:2;--gap:14px;--w:380px">${pads}</div>
      <p class="pv-muted">Click the pads or press 1–4.</p>`;
  }
}

export default defineGame(
  { key: 'color-sequence', engine: 'DOM', aspectRatio: 0.9, maxScore: 50_000, controls: [{ action: 'Press pad', keys: 'Click / 1–4' }] },
  (host) => new ColorSequence(host),
);
