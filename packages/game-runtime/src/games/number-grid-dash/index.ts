import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';

const N = 5;
const ROUNDS = 3;
const PENALTY = 2;

class NumberGridDash extends DomGame {
  private grid: number[] = [];
  private nextNumber = 1;
  private round = 1;
  private roundStart = 0;
  private penalties = 0;
  private times: number[] = [];
  private flash = -1;
  private shownTenth = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.round = 1;
    this.times = [];
    this.newRound();
  }

  private newRound() {
    this.grid = shuffle(this.random, [...Array(N * N).keys()].map((k) => k + 1));
    this.nextNumber = 1;
    this.penalties = 0;
    this.roundStart = this.elapsed;
  }

  private get roundTime() {
    return this.elapsed - this.roundStart + this.penalties * PENALTY;
  }

  protected override onTick() {
    const t = Math.floor(this.roundTime * 10);
    if (t !== this.shownTenth) {
      this.shownTenth = t;
      this.render();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'num') return;
    const n = Number(value);
    if (n === this.nextNumber) {
      this.nextNumber++;
      this.sfx.click();
      if (this.nextNumber > N * N) {
        this.times.push(this.roundTime);
        // 25 numbers in ~20 s is good; faster scores more.
        this.addScore(Math.max(50, Math.round(1500 - this.roundTime * 30)));
        this.sfx.good();
        if (this.round >= ROUNDS) {
          this.end('completed', { bestSeconds: Math.round(Math.min(...this.times)) });
          return;
        }
        this.round++;
        this.newRound();
      }
    } else {
      this.penalties++;
      this.flash = n;
      this.sfx.bad();
      this.schedule(250, () => {
        this.flash = -1;
        this.render();
      });
    }
    this.render();
  }

  protected view() {
    const cells = this.grid
      .map((n) => {
        const done = n < this.nextNumber;
        return `<button type="button" class="pv-cell" style="font-size:clamp(18px,5vmin,30px);${done ? 'opacity:.25;' : ''}${n === this.flash ? 'background:#7f1d1d' : ''}" data-action="num" data-value="${n}" aria-label="${n}">${n}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Round <b>${this.round}/${ROUNDS}</b></span><span>Find <b>${Math.min(this.nextNumber, N * N)}</b></span><span>Time <b>${this.roundTime.toFixed(1)}s</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Tap 1 → 25 in order as fast as you can. Wrong taps add ${PENALTY} s.</p>
      <div class="pv-grid" style="--cols:${N};--gap:6px;--w:420px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'number-grid-dash', engine: 'DOM', aspectRatio: 0.9, maxScore: ROUNDS * 1500, controls: [{ action: 'Tap number', keys: 'Click / tap' }] },
  (host) => new NumberGridDash(host),
);
