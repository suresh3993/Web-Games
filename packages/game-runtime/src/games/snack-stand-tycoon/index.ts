import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { pick } from '../../kit/util';

const DAYS = 30;
const WEATHER = [
  { name: 'Sunny', icon: '☀️', demand: 1.3 },
  { name: 'Hot', icon: '🔥', demand: 1.6 },
  { name: 'Cloudy', icon: '☁️', demand: 0.9 },
  { name: 'Rainy', icon: '🌧️', demand: 0.5 },
];
const UPGRADES = [
  { id: 'sign', name: 'Neon sign', cost: 60, desc: '+20% customers' },
  { id: 'grill', name: 'Second grill', cost: 120, desc: 'Serve up to 80/day (from 40)' },
  { id: 'recipe', name: 'Secret recipe', cost: 150, desc: 'Customers accept higher prices' },
] as const;
type UpgradeId = (typeof UPGRADES)[number]['id'];

/** Customers who would buy today: weather × price sensitivity × reputation. */
export function demand(weather: number, price: number, reputation: number, sign: boolean, recipe: boolean) {
  const fair = recipe ? 4.5 : 3;
  const priceFactor = Math.max(0, 1.6 - price / fair);
  return Math.round(50 * weather * priceFactor * reputation * (sign ? 1.2 : 1));
}

class SnackStandTycoon extends DomGame {
  private day = 1;
  private cash = 50;
  private stock = 0;
  private price = 3;
  private reputation = 1;
  private weather = WEATHER[0]!;
  private owned = new Set<UpgradeId>();
  private report = '';
  private history: number[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.day = 1;
    this.cash = 50;
    this.stock = 0;
    this.price = 3;
    this.reputation = 1;
    this.owned.clear();
    this.history = [];
    this.weather = pick(this.random, WEATHER);
    this.report = 'Buy ingredients, set a price and open the stand. Unsold snacks spoil overnight!';
    this.setScore(50);
  }

  private get capacity() {
    return this.owned.has('grill') ? 80 : 40;
  }

  private openStand() {
    const wanted = demand(this.weather.demand, this.price, this.reputation, this.owned.has('sign'), this.owned.has('recipe'));
    const served = Math.min(wanted, this.stock, this.capacity);
    const revenue = served * this.price;
    this.cash += revenue;
    const spoiled = this.stock - served;
    this.stock = 0;
    // Reputation grows when demand is met at a fair price and drops when people are turned away.
    const turnedAway = Math.max(0, Math.min(wanted, this.capacity) - served);
    this.reputation = Math.max(0.5, Math.min(2, this.reputation + (served > 0 ? 0.03 : 0) - turnedAway * 0.004 - (this.price > (this.owned.has('recipe') ? 6 : 4.5) ? 0.05 : 0)));
    this.history.push(revenue);
    this.report = `Day ${this.day}: ${this.weather.icon} ${this.weather.name}. ${served} sold for $${revenue.toFixed(2)}${spoiled ? `, ${spoiled} spoiled` : ''}${turnedAway ? `, ${turnedAway} customers turned away` : ''}.`;
    this.sfx[served ? 'good' : 'bad']();
    this.setScore(Math.floor(this.cash * 10) / 10);
    if (this.day >= DAYS) {
      this.setScore(Math.floor(this.cash));
      this.report += ` Season over — you finished with $${this.cash.toFixed(2)}!`;
      this.end(this.cash > 50 ? 'won' : 'completed', { cash: Math.floor(this.cash) });
      return;
    }
    this.day++;
    this.weather = pick(this.random, WEATHER);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'buy') {
      const qty = Number(value);
      const cost = qty * 1.2;
      if (this.cash >= cost) {
        this.cash -= cost;
        this.stock += qty;
        this.sfx.click();
      }
    } else if (action === 'price') this.price = Math.max(1, Math.min(9, Math.round((this.price + Number(value)) * 2) / 2));
    else if (action === 'upgrade') {
      const u = UPGRADES.find((x) => x.id === value)!;
      if (!this.owned.has(u.id) && this.cash >= u.cost) {
        this.cash -= u.cost;
        this.owned.add(u.id);
        this.sfx.good();
      }
    } else if (action === 'open') this.openStand();
    if (!this.finished) this.render();
  }

  protected view() {
    const forecast = demand(this.weather.demand, this.price, this.reputation, this.owned.has('sign'), this.owned.has('recipe'));
    const bars = this.history.slice(-15).map((v) => `<i title="$${v.toFixed(0)}" style="display:inline-block;width:10px;margin:0 1px;background:#22d3ee;height:${Math.min(60, v / 4)}px;vertical-align:bottom"></i>`).join('');
    return `
      <div class="pv-hud"><span>Day <b>${this.day}/${DAYS}</b></span><span>Cash <b>$${this.cash.toFixed(2)}</b></span><span>Reputation <b>${Math.round(this.reputation * 100)}%</b></span></div>
      <div class="pv-panel" style="text-align:center;font-size:18px">Forecast: ${this.weather.icon} <b>${this.weather.name}</b> · expect about <b>${Math.min(forecast, this.capacity)}</b> customers at $${this.price.toFixed(2)}</div>
      <p class="pv-msg" role="status">${this.report}</p>
      <div class="pv-row">
        <div class="pv-panel pv-col"><b>Ingredients</b><span class="pv-muted">$1.20 per snack · in stock ${this.stock}</span>
          <div class="pv-row">${[10, 25, 50].map((q) => `<button type="button" class="pv-btn small" data-action="buy" data-value="${q}" ${this.cash >= q * 1.2 ? '' : 'disabled'}>+${q}</button>`).join('')}</div></div>
        <div class="pv-panel pv-col"><b>Price</b><span class="pv-big">$${this.price.toFixed(2)}</span>
          <div class="pv-row"><button type="button" class="pv-btn small" data-action="price" data-value="-0.5">−</button><button type="button" class="pv-btn small" data-action="price" data-value="0.5">+</button></div></div>
      </div>
      <div class="pv-row">${UPGRADES.map((u) => `<button type="button" class="pv-btn small" data-action="upgrade" data-value="${u.id}" ${this.owned.has(u.id) || this.cash < u.cost ? 'disabled' : ''} title="${u.desc}">${this.owned.has(u.id) ? '✓ ' : ''}${u.name} ($${u.cost})</button>`).join('')}</div>
      <button type="button" class="pv-btn primary" style="min-width:220px;min-height:48px" data-action="open" data-value="">Open the stand for day ${this.day} →</button>
      <div style="height:64px;display:flex;align-items:flex-end" aria-label="Recent daily revenue">${bars}</div>
      <p class="pv-muted">No real money — this is a simulation. Max ${this.capacity} customers per day.</p>`;
  }
}

export default defineGame(
  { key: 'snack-stand-tycoon', engine: 'DOM', aspectRatio: 0.9, maxScore: 20_000, scoreLabel: 'Cash', controls: [{ action: 'Run the stand', keys: 'Buy, price, upgrade, then open' }] },
  (host) => new SnackStandTycoon(host),
);
