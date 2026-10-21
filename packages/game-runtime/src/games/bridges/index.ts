import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { crosses, generateBridges, key, neighbour, solvedBridges, type Bridges, type Island } from './logic';

const N = 9;

class BridgesGame extends DomGame {
  private islands: Island[] = [];
  private bridges: Bridges = new Map();
  private selected = -1;
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.islands = generateBridges(N, 12, this.random).islands;
    this.bridges = new Map();
    this.selected = -1;
    this.message = 'Click an island, then a neighbour in the same row or column to add a bridge (click again for double, again to remove).';
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private toggle(a: number, b: number) {
    if (!neighbour(this.islands, a, b)) {
      this.message = 'Bridges must run straight to the nearest island in a row or column.';
      this.sfx.bad();
      return;
    }
    const k = key(a, b);
    const current = this.bridges.get(k) ?? 0;
    if (current === 0 && crosses(this.islands, this.bridges, a, b)) {
      this.message = 'Bridges cannot cross.';
      this.sfx.bad();
      return;
    }
    if (current === 2) this.bridges.delete(k);
    else this.bridges.set(k, current + 1);
    this.sfx.click();
    this.message = '';
    if (solvedBridges(this.islands, this.bridges)) {
      this.setScore(2000 + Math.max(0, 600 - Math.floor(this.elapsed)) * 3);
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'island') {
      const i = Number(value);
      if (this.selected < 0 || this.selected === i) this.selected = this.selected === i ? -1 : i;
      else {
        this.toggle(this.selected, i);
        this.selected = -1;
      }
    }
    if (!this.finished) this.render();
  }

  protected view() {
    const count = this.islands.map(() => 0);
    for (const [k, v] of this.bridges) {
      const [a, b] = k.split('-').map(Number) as [number, number];
      count[a]! += v;
      count[b]! += v;
    }
    const cell = 100 / N;
    const lines = [...this.bridges]
      .map(([k, v]) => {
        const [a, b] = k.split('-').map(Number) as [number, number];
        const A = this.islands[a]!;
        const B = this.islands[b]!;
        const x1 = (A.c + 0.5) * cell;
        const y1 = (A.r + 0.5) * cell;
        const x2 = (B.c + 0.5) * cell;
        const y2 = (B.r + 0.5) * cell;
        const off = v === 2 ? 1 : 0;
        const horizontal = A.r === B.r;
        const seg = (o: number) => `<line x1="${x1 + (horizontal ? 0 : o)}" y1="${y1 + (horizontal ? o : 0)}" x2="${x2 + (horizontal ? 0 : o)}" y2="${y2 + (horizontal ? o : 0)}" stroke="#a5b4fc" stroke-width="0.9"/>`;
        return off ? seg(-off) + seg(off) : seg(0);
      })
      .join('');
    const islands = this.islands
      .map((I, i) => {
        const done = count[i] === I.need;
        const over = count[i]! > I.need;
        return `<button type="button" data-action="island" data-value="${i}" aria-label="Island needing ${I.need} bridges, has ${count[i]}" style="all:unset;cursor:pointer;position:absolute;left:${I.c * cell}%;top:${I.r * cell}%;width:${cell}%;height:${cell}%;display:flex;align-items:center;justify-content:center">
          <span style="width:82%;height:82%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(12px,3vmin,20px);background:${i === this.selected ? '#22d3ee' : done ? '#15803d' : over ? '#be123c' : '#1b2350'};border:2px solid #a5b4fc;color:#fff">${I.need}</span></button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div style="position:relative;width:min(100%,460px);aspect-ratio:1;background:#0e1430;border-radius:12px">
        <svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">${lines}</svg>${islands}
      </div>
      <p class="pv-muted">Each number is how many bridges touch that island. All islands must link into one network; at most two bridges between a pair.</p>`;
  }
}

export default defineGame(
  { key: 'bridges', engine: 'DOM', aspectRatio: 0.85, maxScore: 3_800, controls: [{ action: 'Bridge', keys: 'Click two islands' }] },
  (host) => new BridgesGame(host),
);
