import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const SECONDS = 300;
const BUILDINGS = [
  { id: 'pick', name: 'Laser pick', base: 15, rate: 0.5 },
  { id: 'drone', name: 'Mining drone', base: 100, rate: 4 },
  { id: 'drill', name: 'Deep drill', base: 600, rate: 20 },
  { id: 'reactor', name: 'Crystal reactor', base: 4000, rate: 110 },
] as const;
const CLICK_UPGRADES = [50, 400, 3000, 20000];

/** Cost of the next building (15% more each). */
export const costOf = (base: number, owned: number) => Math.ceil(base * 1.15 ** owned);

class CrystalClicker extends DomGame {
  private crystals = 0;
  private totalMined = 0;
  private owned: number[] = [0, 0, 0, 0];
  private clickPower = 1;
  private clickTier = 0;
  private pulses = 0;
  private shownTenth = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.crystals = 0;
    this.totalMined = 0;
    this.owned = [0, 0, 0, 0];
    this.clickPower = 1;
    this.clickTier = 0;
    this.pulses = 0;
  }

  private get rate() {
    return BUILDINGS.reduce((s, b, i) => s + b.rate * this.owned[i]!, 0);
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  private gain(n: number) {
    this.crystals += n;
    this.totalMined += n;
    this.setScore(this.totalMined);
  }

  protected override onTick(dt: number) {
    if (this.remaining <= 0) {
      this.end('completed', { mined: Math.floor(this.totalMined) });
      return;
    }
    this.gain(this.rate * dt);
    const tenth = Math.floor(this.elapsed * 4);
    if (tenth !== this.shownTenth) {
      this.shownTenth = tenth;
      this.render();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'mine') {
      this.gain(this.clickPower);
      this.pulses++;
      if (this.pulses % 5 === 0) this.sfx.beep(700 + (this.pulses % 20) * 10, 0.03, 'sine', 0.03);
    } else if (action === 'build') {
      const i = Number(value);
      const cost = costOf(BUILDINGS[i]!.base, this.owned[i]!);
      if (this.crystals >= cost) {
        this.crystals -= cost;
        this.owned[i]!++;
        this.sfx.good();
      }
    } else if (action === 'click-up') {
      const cost = CLICK_UPGRADES[this.clickTier];
      if (cost !== undefined && this.crystals >= cost) {
        this.crystals -= cost;
        this.clickTier++;
        this.clickPower *= 3;
        this.sfx.good();
      }
    }
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      this.onAction('mine', '');
      return true;
    }
    return false;
  }

  protected view() {
    const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.floor(n).toString());
    const nextClick = CLICK_UPGRADES[this.clickTier];
    const shop = BUILDINGS.map((b, i) => {
      const cost = costOf(b.base, this.owned[i]!);
      return `<button type="button" class="pv-btn" style="display:flex;justify-content:space-between;gap:12px;min-width:260px" data-action="build" data-value="${i}" ${this.crystals >= cost ? '' : 'disabled'}><span>${b.name} ×${this.owned[i]}</span><span>💎 ${fmt(cost)} · +${b.rate}/s</span></button>`;
    }).join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.floor(this.remaining / 60)}:${String(Math.floor(this.remaining % 60)).padStart(2, '0')}</b></span><span>Rate <b>${fmt(this.rate)}/s</b></span><span>Total mined <b>${fmt(this.totalMined)}</b></span></div>
      <div class="pv-big">💎 ${fmt(this.crystals)}</div>
      <button type="button" data-action="mine" data-value="" aria-label="Mine the crystal (+${this.clickPower})" class="pv-press" style="all:unset;cursor:pointer;width:min(46vw,190px);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:min(30vw,120px);border-radius:50%;background:radial-gradient(circle,#4c1d95,#0b1022 70%);transition:transform .05s">💠</button>
      <p class="pv-muted">Click (or Space) for +${fmt(this.clickPower)} · a 5-minute mining sprint</p>
      <div class="pv-col">${shop}
        <button type="button" class="pv-btn primary" style="min-width:260px" data-action="click-up" data-value="" ${nextClick !== undefined && this.crystals >= nextClick ? '' : 'disabled'}>${nextClick !== undefined ? `Triple click power — 💎 ${fmt(nextClick)}` : 'Click power maxed'}</button></div>`;
  }
}

export default defineGame(
  { key: 'crystal-clicker', engine: 'DOM', aspectRatio: 0.75, maxScore: 50_000_000, scoreLabel: 'Crystals', controls: [{ action: 'Mine', keys: 'Click / Space' }, { action: 'Buy upgrades', keys: 'Click the shop' }] },
  (host) => new CrystalClicker(host),
);
