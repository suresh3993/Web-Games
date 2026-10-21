import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const RADIUS = 4;
const MAX_TURNS = 30;
const MOVES_PER_TURN = 3;
const FACTIONS = [
  { name: 'You', color: '#22d3ee' },
  { name: 'Crimson', color: '#f43f5e' },
  { name: 'Amber', color: '#f59e0b' },
];

interface Hex { q: number; r: number; owner: number; armies: number; capital: boolean }

const key = (q: number, r: number) => `${q},${r}`;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;

/**
 * Deterministic battle: the attacker wins if it brings more armies than the
 * defender holds; the survivors are the difference. No dice involved.
 */
export function battle(attackers: number, defenders: number): { won: boolean; remaining: number } {
  return attackers > defenders ? { won: true, remaining: attackers - defenders } : { won: false, remaining: defenders - Math.floor(attackers / 2) };
}

class HexConquest extends DomGame {
  private hexes = new Map<string, Hex>();
  private turn = 1;
  private movesLeft = MOVES_PER_TURN;
  private selected: string | null = null;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.hexes.clear();
    for (let q = -RADIUS; q <= RADIUS; q++)
      for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++)
        this.hexes.set(key(q, r), { q, r, owner: -1, armies: 1 + Math.floor(this.random() * 3), capital: false });
    const capitals: [number, number][] = [[-RADIUS, RADIUS], [RADIUS, -RADIUS], [0, -RADIUS]];
    capitals.forEach(([q, r], f) => {
      const h = this.hexes.get(key(q, r))!;
      Object.assign(h, { owner: f, armies: 6, capital: true });
    });
    this.turn = 1;
    this.movesLeft = MOVES_PER_TURN;
    this.selected = null;
    this.message = 'Select one of your hexes, then a neighbour to move or attack. 3 moves per turn.';
  }

  private neighbours(h: Hex) {
    return DIRS.map(([dq, dr]) => this.hexes.get(key(h.q + dq, h.r + dr))).filter((x): x is Hex => !!x);
  }

  private act(from: Hex, to: Hex): boolean {
    if (from.armies < 2) return false;
    const moving = from.armies - 1;
    if (to.owner === from.owner) {
      to.armies += moving;
      from.armies = 1;
      return true;
    }
    const res = battle(moving, to.armies);
    from.armies = 1;
    if (res.won) {
      to.owner = from.owner;
      to.armies = res.remaining;
    } else to.armies = Math.max(1, res.remaining);
    return true;
  }

  private income(f: number) {
    for (const h of this.hexes.values()) if (h.owner === f) h.armies += h.capital ? 3 : 1;
  }

  private cpuTurn(f: number) {
    for (let m = 0; m < MOVES_PER_TURN; m++) {
      let best: { from: Hex; to: Hex; value: number } | null = null;
      for (const h of this.hexes.values()) {
        if (h.owner !== f || h.armies < 2) continue;
        for (const n of this.neighbours(h)) {
          if (n.owner === f) continue;
          const margin = h.armies - 1 - n.armies;
          if (margin <= 0) continue;
          const value = margin + (n.capital ? 20 : 0) + (n.owner === 0 ? 4 : n.owner === -1 ? 2 : 3);
          if (!best || value > best.value) best = { from: h, to: n, value };
        }
      }
      if (!best) break;
      this.act(best.from, best.to);
    }
  }

  private endTurn() {
    for (const f of [1, 2]) if (this.alive(f)) this.cpuTurn(f);
    for (const f of [0, 1, 2]) if (this.alive(f)) this.income(f);
    this.turn++;
    this.movesLeft = MOVES_PER_TURN;
    this.selected = null;
    if (!this.alive(0)) {
      this.message = 'Your empire has fallen.';
      this.end('lost', { turns: this.turn });
      return;
    }
    const capitals = [...this.hexes.values()].filter((h) => h.capital);
    if (capitals.every((c) => c.owner === 0)) {
      this.setScore(2000 + (MAX_TURNS - this.turn) * 50 + this.owned(0) * 10);
      this.sfx.win();
      this.message = 'All capitals are yours — victory!';
      this.end('won', { turns: this.turn });
      return;
    }
    if (this.turn > MAX_TURNS) {
      this.setScore(this.owned(0) * 20);
      this.message = `Time's up — you hold ${this.owned(0)} hexes.`;
      this.end('completed', { hexes: this.owned(0) });
      return;
    }
    this.setScore(this.owned(0) * 20);
    this.message = `Turn ${this.turn}. You have ${MOVES_PER_TURN} moves.`;
    this.render();
  }

  private owned(f: number) {
    return [...this.hexes.values()].filter((h) => h.owner === f).length;
  }

  private alive(f: number) {
    return this.owned(f) > 0;
  }

  protected override onAction(action: string, value: string) {
    if (action === 'end') return this.endTurn();
    if (action !== 'hex') return;
    const h = this.hexes.get(value)!;
    if (this.selected) {
      const from = this.hexes.get(this.selected)!;
      if (from !== h && this.neighbours(from).includes(h) && this.movesLeft > 0) {
        const wasEnemy = h.owner !== 0;
        if (this.act(from, h)) {
          this.movesLeft--;
          this.message = wasEnemy ? (h.owner === 0 ? 'Captured!' : 'The attack was repelled.') : 'Armies moved.';
          this.sfx[wasEnemy && h.owner === 0 ? 'good' : 'click']();
          this.selected = null;
          this.setScore(this.owned(0) * 20);
          if (this.movesLeft === 0) this.message += ' No moves left — end your turn.';
          return this.render();
        }
      }
    }
    this.selected = h.owner === 0 && h.armies > 1 ? value : null;
    this.render();
  }

  protected view() {
    const size = 34;
    const cells = [...this.hexes.values()]
      .map((h) => {
        const x = size * 1.5 * h.q + 250;
        const y = size * Math.sqrt(3) * (h.r + h.q / 2) + 250;
        const color = h.owner >= 0 ? FACTIONS[h.owner]!.color : '#334155';
        const k = key(h.q, h.r);
        const target = this.selected && this.neighbours(this.hexes.get(this.selected)!).includes(h);
        return `<button type="button" data-action="hex" data-value="${k}" aria-label="${h.owner >= 0 ? FACTIONS[h.owner]!.name : 'Neutral'} hex with ${h.armies} armies${h.capital ? ', capital' : ''}" style="all:unset;cursor:pointer;position:absolute;left:${((x - size) / 500) * 100}%;top:${((y - size * 0.87) / 500) * 100}%;width:${((size * 2) / 500) * 100}%;height:${((size * 1.74) / 500) * 100}%;font-size:clamp(9px,2.6vmin,15px);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);background:${k === this.selected ? '#fde047' : target ? '#4ade80' : color};display:flex;align-items:center;justify-content:center;font-weight:800;color:#0b1022">${h.capital ? '♛' : ''}${h.armies}</button>`;
      })
      .join('');
    const legend = FACTIONS.map((f, i) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${f.color}"></i> ${f.name} <b>${this.owned(i)}</b></span>`).join('');
    return `
      <div class="pv-hud"><span>Turn <b>${this.turn}/${MAX_TURNS}</b></span><span>Moves <b>${this.movesLeft}</b></span>${legend}</div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div style="position:relative;width:min(100%,500px);aspect-ratio:1">${cells}</div>
      <button type="button" class="pv-btn primary" data-action="end" data-value="">End turn ⏭</button>
      <p class="pv-muted">Battles are deterministic: bring more armies than the defender. Capitals (♛) earn +3 per turn. Capture all three to win.</p>`;
  }
}

export default defineGame(
  { key: 'hex-conquest', engine: 'DOM', aspectRatio: 0.85, maxScore: 2000 + MAX_TURNS * 50 + 61 * 20, controls: [{ action: 'Move / attack', keys: 'Click your hex, then a neighbour' }, { action: 'End turn', keys: 'Button' }] },
  (host) => new HexConquest(host),
);
