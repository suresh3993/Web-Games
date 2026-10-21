import { isRed, shuffledDeck, type Card } from '../../kit/cards';
import type { Rng } from '../../kit/util';

export interface TCard extends Card {
  up: boolean;
}
export interface Klondike {
  stock: TCard[];
  waste: TCard[];
  foundations: TCard[][]; // 4
  tableau: TCard[][]; // 7
}
export type PileRef = { kind: 'waste' } | { kind: 'tableau'; index: number; from: number } | { kind: 'foundation'; index: number };

export function deal(random: Rng): Klondike {
  const deck = shuffledDeck(random).map((c) => ({ ...c, up: false }));
  const tableau: TCard[][] = [];
  for (let i = 0; i < 7; i++) {
    const pile = deck.splice(0, i + 1);
    pile[pile.length - 1]!.up = true;
    tableau.push(pile);
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau };
}

export const canStackOnTableau = (moving: Card, target: Card | undefined) =>
  target ? isRed(moving) !== isRed(target) && moving.rank === target.rank - 1 : moving.rank === 13;

export const canStackOnFoundation = (moving: Card, foundation: Card[]) =>
  foundation.length ? foundation[foundation.length - 1]!.suit === moving.suit && moving.rank === foundation[foundation.length - 1]!.rank + 1 : moving.rank === 1;

/** Cards that would move from a source (a run for tableau sources). */
export function cardsAt(g: Klondike, src: PileRef): TCard[] {
  if (src.kind === 'waste') return g.waste.length ? [g.waste[g.waste.length - 1]!] : [];
  if (src.kind === 'foundation') return g.foundations[src.index]!.length ? [g.foundations[src.index]!.at(-1)!] : [];
  const pile = g.tableau[src.index]!;
  if (src.from < 0 || src.from >= pile.length || !pile[src.from]!.up) return [];
  return pile.slice(src.from);
}

function clone(g: Klondike): Klondike {
  return { stock: [...g.stock], waste: [...g.waste], foundations: g.foundations.map((f) => [...f]), tableau: g.tableau.map((t) => t.map((c) => ({ ...c }))) };
}

/** Attempts a move; returns the new game (and points) or null if illegal. */
export function move(g: Klondike, src: PileRef, dest: { kind: 'tableau' | 'foundation'; index: number }): { game: Klondike; points: number } | null {
  const cards = cardsAt(g, src);
  if (!cards.length) return null;
  if (src.kind === dest.kind && 'index' in src && src.index === dest.index) return null;
  if (dest.kind === 'foundation') {
    if (cards.length !== 1 || !canStackOnFoundation(cards[0]!, g.foundations[dest.index]!)) return null;
  } else if (!canStackOnTableau(cards[0]!, g.tableau[dest.index]!.at(-1))) return null;
  const next = clone(g);
  let points = 0;
  if (src.kind === 'waste') next.waste.pop();
  else if (src.kind === 'foundation') {
    next.foundations[src.index]!.pop();
    points -= 15;
  } else {
    next.tableau[src.index]!.splice(src.from);
    const exposed = next.tableau[src.index]!.at(-1);
    if (exposed && !exposed.up) {
      exposed.up = true;
      points += 5;
    }
  }
  if (dest.kind === 'foundation') {
    next.foundations[dest.index]!.push(...cards.map((c) => ({ ...c, up: true })));
    points += 10;
  } else {
    next.tableau[dest.index]!.push(...cards.map((c) => ({ ...c, up: true })));
    if (src.kind === 'waste') points += 5;
  }
  return { game: next, points };
}

/** Draws 1 or 3 cards from the stock, or recycles the waste when the stock is empty. */
export function draw(g: Klondike, count: 1 | 3): Klondike {
  const next = clone(g);
  if (!next.stock.length) {
    next.stock = next.waste.reverse().map((c) => ({ ...c, up: false }));
    next.waste = [];
    return next;
  }
  for (let i = 0; i < count && next.stock.length; i++) next.waste.push({ ...next.stock.pop()!, up: true });
  return next;
}

export const won = (g: Klondike) => g.foundations.every((f) => f.length === 13);

/** Finds a single safe move to a foundation (used by auto-complete). */
export function autoMove(g: Klondike): { game: Klondike; points: number } | null {
  for (let f = 0; f < 4; f++) {
    const fromWaste = move(g, { kind: 'waste' }, { kind: 'foundation', index: f });
    if (fromWaste) return fromWaste;
    for (let t = 0; t < 7; t++) {
      const pile = g.tableau[t]!;
      if (!pile.length) continue;
      const res = move(g, { kind: 'tableau', index: t, from: pile.length - 1 }, { kind: 'foundation', index: f });
      if (res) return res;
    }
  }
  return null;
}
