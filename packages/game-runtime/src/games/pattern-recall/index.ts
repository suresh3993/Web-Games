import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';

class PatternRecall extends DomGame {
  private level = 1;
  private lives = 3;
  private n = 3;
  private pattern = new Set<number>();
  private chosen = new Set<number>();
  private wrong = new Set<number>();
  private phase: 'show' | 'input' | 'wait' = 'wait';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.lives = 3;
    this.newPattern();
  }

  private newPattern() {
    this.n = Math.min(7, 3 + Math.floor((this.level - 1) / 3));
    const count = Math.min(this.n * this.n - 2, 2 + this.level);
    this.pattern = new Set(shuffle(this.random, [...Array(this.n * this.n).keys()]).slice(0, count));
    this.chosen = new Set();
    this.wrong = new Set();
    this.phase = 'wait';
    this.schedule(500, () => {
      this.phase = 'show';
      this.render();
      this.schedule(900 + count * 120, () => {
        this.phase = 'input';
        this.render();
      });
    });
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'tile' || this.phase !== 'input') return;
    const i = Number(value);
    if (this.chosen.has(i) || this.wrong.has(i)) return;
    if (this.pattern.has(i)) {
      this.chosen.add(i);
      this.sfx.click();
      if (this.chosen.size === this.pattern.size) {
        this.addScore(this.pattern.size * 20);
        this.sfx.good();
        this.level++;
        this.newPattern();
      }
    } else {
      this.wrong.add(i);
      this.sfx.bad();
      if (this.wrong.size >= 3) {
        this.lives--;
        if (this.lives <= 0) {
          this.end('completed', { level: this.level });
          return;
        }
        this.newPattern();
      }
    }
    this.render();
  }

  protected view() {
    const cells = Array.from({ length: this.n * this.n }, (_, i) => {
      const show = (this.phase === 'show' && this.pattern.has(i)) || this.chosen.has(i) || (this.finished && this.pattern.has(i));
      const bg = this.wrong.has(i) ? '#7f1d1d' : show ? '#a78bfa' : '#11183a';
      return `<button type="button" class="pv-cell" style="background:${bg}" data-action="tile" data-value="${i}" aria-label="Tile ${i + 1}" ${this.phase === 'input' ? '' : 'disabled'}></button>`;
    }).join('');
    const status = this.phase === 'show' ? 'Memorise the highlighted tiles…' : this.phase === 'input' ? `Tap the ${this.pattern.size} tiles (3 wrong taps lose a life)` : 'Get ready…';
    return `
      <div class="pv-hud"><span>Level <b>${this.level}</b></span><span>Lives <b>${'♥'.repeat(this.lives)}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${status}</p>
      <div class="pv-grid" style="--cols:${this.n};--gap:8px;--w:400px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'pattern-recall', engine: 'DOM', aspectRatio: 0.85, maxScore: 100_000, controls: [{ action: 'Recall', keys: 'Click tiles' }] },
  (host) => new PatternRecall(host),
);
