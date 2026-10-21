import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, RANK_LABELS, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const PLAYERS = ['You', 'Pip', 'Juno'];
const rankName = (r: number) => RANK_LABELS[r];

class GoFish extends DomGame {
  private hands: Card[][] = [];
  private stock: Card[] = [];
  private books: number[][] = [];
  private turn = 0;
  private askRank = 0;
  private memory: Set<number>[] = [];
  private log: string[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.hands = PLAYERS.map((_, p) => deck.slice(p * 7, p * 7 + 7));
    this.stock = deck.slice(21);
    this.books = PLAYERS.map(() => []);
    this.memory = PLAYERS.map(() => new Set());
    this.turn = 0;
    this.askRank = 0;
    this.log = ['Ask another player for a rank you hold. Collect books of four.'];
    PLAYERS.forEach((_, p) => this.layBooks(p));
  }

  private say(line: string) {
    this.log = [line, ...this.log].slice(0, 5);
  }

  private layBooks(p: number) {
    for (let r = 1; r <= 13; r++) {
      const same = this.hands[p]!.filter((c) => c.rank === r);
      if (same.length === 4) {
        this.hands[p] = this.hands[p]!.filter((c) => c.rank !== r);
        this.books[p]!.push(r);
        this.say(`${PLAYERS[p]} completed a book of ${rankName(r)}s!`);
        if (p === 0) {
          this.addScore(50);
          this.sfx.good();
        }
      }
    }
    if (!this.hands[p]!.length && this.stock.length) this.hands[p]!.push(this.stock.pop()!);
  }

  private get totalBooks() {
    return this.books.reduce((n, b) => n + b.length, 0);
  }

  private ask(p: number, target: number, rank: number) {
    this.memory[p]!.add(rank); // everyone hears the question
    const given = this.hands[target]!.filter((c) => c.rank === rank);
    let again = false;
    if (given.length) {
      this.hands[target] = this.hands[target]!.filter((c) => c.rank !== rank);
      this.hands[p]!.push(...given);
      this.say(`${PLAYERS[p]} asked ${PLAYERS[target]} for ${rankName(rank)}s and got ${given.length}.`);
      again = true;
    } else {
      const drawn = this.stock.pop();
      if (drawn) this.hands[p]!.push(drawn);
      again = !!drawn && drawn.rank === rank;
      this.say(`${PLAYERS[p]} asked ${PLAYERS[target]} for ${rankName(rank)}s — Go fish!${again ? ' Fished the right card!' : ''}`);
    }
    this.sfx.click();
    this.layBooks(p);
    if (this.totalBooks === 13 || PLAYERS.every((_, k) => !this.hands[k]!.length)) return this.gameOver();
    if (!again || !this.hands[p]!.length) this.turn = this.nextActive(p);
    this.afterTurn();
  }

  private nextActive(from: number) {
    for (let k = 1; k <= PLAYERS.length; k++) {
      const p = (from + k) % PLAYERS.length;
      if (this.hands[p]!.length) return p;
    }
    return from;
  }

  private afterTurn() {
    if (this.turn !== 0) {
      this.render();
      this.schedule(900, () => this.aiTurn(this.turn));
    } else {
      if (!this.hands[0]!.some((c) => c.rank === this.askRank)) this.askRank = 0;
      this.render();
    }
  }

  private aiTurn(p: number) {
    const hand = this.hands[p]!;
    if (!hand.length) return this.afterTurn();
    // Prefer ranks another player has asked for (they hold it), then the rank we hold most of.
    const others = PLAYERS.map((_, k) => k).filter((k) => k !== p && this.hands[k]!.length);
    let target = others[Math.floor(this.random() * others.length)]!;
    let rank = 0;
    for (const k of others) for (const r of this.memory[k]!) if (hand.some((c) => c.rank === r)) {
      target = k;
      rank = r;
    }
    if (!rank) {
      const counts = new Map<number, number>();
      for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
      rank = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
    this.ask(p, target, rank);
  }

  private gameOver() {
    const counts = this.books.map((b) => b.length);
    const best = Math.max(...counts);
    const won = counts[0] === best;
    if (won) {
      this.addScore(200);
      this.sfx.win();
    }
    this.say(won ? `You win with ${counts[0]} books! 🎉` : `${PLAYERS[counts.indexOf(best)]} wins with ${best} books.`);
    this.end(won ? 'won' : 'lost', { books: counts[0]! });
  }

  protected override onAction(action: string, value: string) {
    if (this.turn !== 0) return;
    if (action === 'rank') this.askRank = Number(value);
    else if (action === 'ask' && this.askRank) this.ask(0, Number(value), this.askRank);
    if (!this.finished) this.render();
  }

  protected view() {
    const sorted = [...this.hands[0]!].sort((a, b) => a.rank - b.rank);
    const hand = sorted.map((c) => cardHtml(c, { action: 'rank', value: c.rank, selected: c.rank === this.askRank, label: `${rankName(c.rank)} — select to ask` })).join('');
    const players = [1, 2]
      .map((p) => `<div class="pv-panel pv-col"><b>${PLAYERS[p]}</b><span class="pv-muted">${this.hands[p]!.length} cards · ${this.books[p]!.length} books</span>
        <button type="button" class="pv-btn small${this.askRank ? ' primary' : ''}" data-action="ask" data-value="${p}" ${this.turn === 0 && this.askRank && this.hands[p]!.length ? '' : 'disabled'}>Ask for ${this.askRank ? rankName(this.askRank) + 's' : '…'}</button></div>`)
      .join('');
    return `
      <div class="pv-hud"><span>Your books <b>${this.books[0]!.length}</b></span><span>Stock <b>${this.stock.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-row">${players}</div>
      <div class="pv-panel" style="width:min(100%,520px);font-size:14px" role="log">${this.log.map((l, i) => `<div style="opacity:${1 - i * 0.17}">${l}</div>`).join('')}</div>
      <p class="pv-msg">${this.turn === 0 ? 'Your turn: pick a card, then the player to ask.' : `${PLAYERS[this.turn]} is asking…`}</p>
      <div class="pv-row" style="--cw:clamp(40px,10vw,60px);gap:4px">${hand || '<span class="pv-muted">No cards</span>'}</div>`;
  }
}

export default defineGame(
  { key: 'go-fish', engine: 'DOM', aspectRatio: 0.9, maxScore: 13 * 50 + 200, controls: [{ action: 'Ask', keys: 'Pick a rank, then a player' }] },
  (host) => new GoFish(host),
);
