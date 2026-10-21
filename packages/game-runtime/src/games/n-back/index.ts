import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const TRIALS = 20;
const BLOCKS = 3;
const STEP_MS = 2500;

class NBack extends DomGame {
  private n = 1;
  private block = 1;
  private seq: number[] = [];
  private pos = -1;
  private lit = -1;
  private responded = false;
  private hits = 0;
  private misses = 0;
  private falseAlarms = 0;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.n = 1;
    this.block = 1;
    this.startBlock();
  }

  private startBlock() {
    // ~30% of trials are matches.
    this.seq = [];
    for (let i = 0; i < TRIALS + this.n; i++) {
      this.seq.push(i >= this.n && this.random() < 0.3 ? this.seq[i - this.n]! : Math.floor(this.random() * 9));
    }
    this.pos = -1;
    this.hits = this.misses = this.falseAlarms = 0;
    this.message = `Block ${this.block}: ${this.n}-back. Press MATCH when the square matches ${this.n} step${this.n > 1 ? 's' : ''} ago.`;
    this.schedule(1200, () => this.step());
  }

  private isMatch(i: number) {
    return i >= this.n && this.seq[i] === this.seq[i - this.n];
  }

  private step() {
    if (this.pos >= 0 && this.isMatch(this.pos) && !this.responded) this.misses++;
    this.pos++;
    if (this.pos >= this.seq.length) return this.endBlock();
    this.responded = false;
    this.lit = this.seq[this.pos]!;
    this.sfx.beep(300 + this.lit * 40, 0.06, 'sine', 0.04);
    this.render();
    this.schedule(STEP_MS * 0.4, () => {
      this.lit = -1;
      this.render();
    });
    this.schedule(STEP_MS, () => this.step());
  }

  private endBlock() {
    const targets = this.hits + this.misses;
    const accuracy = targets ? this.hits / targets : 1;
    this.addScore(Math.max(0, (this.hits * 50 - this.falseAlarms * 30) * this.n));
    if (this.block >= BLOCKS) {
      this.message = `Done! Last block accuracy ${Math.round(accuracy * 100)}%.`;
      this.end('completed', { n: this.n });
      return;
    }
    this.block++;
    if (accuracy >= 0.8 && this.falseAlarms <= 2) this.n++;
    else if (accuracy < 0.5 && this.n > 1) this.n--;
    this.startBlock();
    this.render();
  }

  private respond() {
    if (this.pos < 0 || this.responded) return;
    this.responded = true;
    if (this.isMatch(this.pos)) {
      this.hits++;
      this.sfx.good();
      this.message = 'Match!';
    } else {
      this.falseAlarms++;
      this.sfx.bad();
      this.message = 'Not a match.';
    }
    this.render();
  }

  protected override onAction(action: string) {
    if (action === 'match') this.respond();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'm') {
      this.respond();
      return true;
    }
    return false;
  }

  protected view() {
    const cells = Array.from({ length: 9 }, (_, i) => `<div class="pv-cell" style="background:${i === this.lit ? '#22d3ee' : '#11183a'};${i === this.lit ? 'box-shadow:0 0 24px #22d3ee' : ''}"></div>`).join('');
    return `
      <div class="pv-hud"><span>Block <b>${this.block}/${BLOCKS}</b></span><span>N <b>${this.n}</b></span><span>Trial <b>${Math.max(0, this.pos + 1)}/${this.seq.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:3;--gap:10px;--w:300px">${cells}</div>
      <button type="button" class="pv-btn primary" style="min-width:220px;min-height:56px;font-size:20px" data-action="match" data-value="">MATCH (Space)</button>
      <p class="pv-muted">Hits ${this.hits} · Missed ${this.misses} · False alarms ${this.falseAlarms}</p>`;
  }
}

export default defineGame(
  { key: 'n-back', engine: 'DOM', aspectRatio: 0.8, maxScore: 3 * 20 * 50 * 4, controls: [{ action: 'Match', keys: 'Space / M / button' }] },
  (host) => new NBack(host),
);
