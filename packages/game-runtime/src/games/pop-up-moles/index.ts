import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const SECONDS = 30;
type Critter = { kind: 'mole' | 'gold' | 'bunny'; until: number } | null;

class PopUpMoles extends DomGame {
  private holes: Critter[] = [];
  private hits = 0;
  private misses = 0;
  private flash = new Map<number, 'hit' | 'bad'>();
  private nextPop = 0;
  private shownTenth = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.holes = Array(9).fill(null);
    this.hits = 0;
    this.misses = 0;
    this.flash.clear();
    this.nextPop = 0.6;
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.end('completed', { hits: this.hits });
      return;
    }
    let changed = false;
    this.holes = this.holes.map((h) => {
      if (h && h.until <= this.elapsed) {
        changed = true;
        return null;
      }
      return h;
    });
    if (this.elapsed >= this.nextPop) {
      // Pops get faster and shorter as time runs down.
      const progress = this.elapsed / SECONDS;
      this.nextPop = this.elapsed + Math.max(0.3, 0.8 - progress * 0.5) * (0.6 + this.random() * 0.6);
      const empty = this.holes.flatMap((h, i) => (h ? [] : [i]));
      if (empty.length) {
        const roll = this.random();
        const i = empty[Math.floor(this.random() * empty.length)]!;
        this.holes[i] = { kind: roll < 0.1 ? 'gold' : roll < 0.28 ? 'bunny' : 'mole', until: this.elapsed + Math.max(0.55, 1.3 - progress * 0.7) };
        changed = true;
      }
    }
    const tenth = Math.floor(this.remaining * 10);
    if (changed || tenth !== this.shownTenth) {
      this.shownTenth = tenth;
      this.render();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'hole') return;
    const i = Number(value);
    const c = this.holes[i];
    if (!c) {
      this.misses++;
      return;
    }
    this.holes[i] = null;
    if (c.kind === 'bunny') {
      this.setScore(this.score - 30);
      this.flash.set(i, 'bad');
      this.sfx.bad();
    } else {
      this.hits++;
      this.addScore(c.kind === 'gold' ? 30 : 10);
      this.flash.set(i, 'hit');
      this.sfx.beep(c.kind === 'gold' ? 1000 : 700, 0.05, 'square', 0.04);
    }
    this.schedule(200, () => {
      this.flash.delete(i);
      this.render();
    });
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    // Number pad layout: 7 8 9 / 4 5 6 / 1 2 3
    const map: Record<string, number> = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8 };
    const i = map[e.key];
    if (i === undefined) return false;
    this.onAction('hole', String(i));
    return true;
  }

  protected view() {
    const holes = this.holes
      .map((h, i) => {
        const glyph = h ? (h.kind === 'bunny' ? '🐰' : h.kind === 'gold' ? '🌟' : '🐹') : '';
        const f = this.flash.get(i);
        return `<button type="button" class="pv-cell" style="border-radius:50%;background:radial-gradient(circle at 50% 70%,#1c1917 0 45%,#3f2a14 46%);font-size:clamp(28px,9vmin,54px);${f === 'hit' ? 'box-shadow:0 0 0 4px #4ade80' : f === 'bad' ? 'box-shadow:0 0 0 4px #f43f5e' : ''}" data-action="hole" data-value="${i}" aria-label="Hole ${i + 1}${h ? `: ${h.kind}` : ''}">${glyph}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Hits <b>${this.hits}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-meter" aria-hidden="true"><i style="width:${(this.remaining / SECONDS) * 100}%"></i></div>
      <p class="pv-msg">Bop the critters 🐹 (stars 🌟 are worth triple) — but never the bunnies 🐰!</p>
      <div class="pv-grid" style="--cols:3;--gap:14px;--w:420px">${holes}</div>
      <p class="pv-muted">Keyboard: number pad 7–9 / 4–6 / 1–3.</p>`;
  }
}

export default defineGame(
  { key: 'pop-up-moles', engine: 'DOM', aspectRatio: 0.9, maxScore: 3_000, controls: [{ action: 'Bop', keys: 'Click / tap / number pad' }] },
  (host) => new PopUpMoles(host),
);
