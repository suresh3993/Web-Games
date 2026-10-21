import type { Card } from '../../kit/cards';

export const pegValue = (c: Card) => Math.min(10, c.rank);

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first!, ...c]), ...combinations(rest, k)];
}

/** Scores a hand (4 cards) with the starter. `crib` requires a 5-card flush. */
export function scoreHand(hand: Card[], starter: Card | null, crib = false): { total: number; parts: Record<string, number> } {
  const all = starter ? [...hand, starter] : [...hand];
  const parts: Record<string, number> = { fifteens: 0, pairs: 0, runs: 0, flush: 0, nobs: 0 };
  for (let k = 2; k <= all.length; k++)
    for (const combo of combinations(all, k)) if (combo.reduce((n, c) => n + pegValue(c), 0) === 15) parts.fifteens! += 2;
  for (const [a, b] of combinations(all, 2)) if (a!.rank === b!.rank) parts.pairs! += 2;
  // Runs: longest length with multiplicity.
  for (let len = all.length; len >= 3 && !parts.runs; len--) {
    for (const combo of combinations(all, len)) {
      const ranks = combo.map((c) => c.rank).sort((a, b) => a - b);
      if (ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1)) parts.runs! += len;
    }
  }
  if (hand.length === 4 && hand.every((c) => c.suit === hand[0]!.suit)) {
    if (starter && starter.suit === hand[0]!.suit) parts.flush = 5;
    else if (!crib) parts.flush = 4;
  }
  if (starter && hand.some((c) => c.rank === 11 && c.suit === starter.suit)) parts.nobs = 1;
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/** Points for playing the last card of `pile` during pegging (count already includes it). */
export function pegPoints(pile: Card[]): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const count = pile.reduce((n, c) => n + pegValue(c), 0);
  if (count === 15) {
    points += 2;
    reasons.push('fifteen');
  }
  if (count === 31) {
    points += 2;
    reasons.push('thirty-one');
  }
  // Pairs: consecutive same ranks at the end.
  let same = 1;
  for (let i = pile.length - 2; i >= 0 && pile[i]!.rank === pile.at(-1)!.rank; i--) same++;
  if (same >= 2) {
    const p = { 2: 2, 3: 6, 4: 12 }[Math.min(same, 4) as 2 | 3 | 4];
    points += p;
    reasons.push(same === 2 ? 'pair' : same === 3 ? 'three of a kind' : 'four of a kind');
  }
  // Runs: the longest tail of ≥3 cards forming a sequence in any order.
  for (let len = pile.length; len >= 3; len--) {
    const ranks = pile.slice(-len).map((c) => c.rank).sort((a, b) => a - b);
    if (ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1)) {
      points += len;
      reasons.push(`run of ${len}`);
      break;
    }
  }
  return { points, reasons };
}

/** Chooses which 2 cards to discard: maximise expected own-hand value (plus crib value when dealing). */
export function chooseDiscard(hand: Card[], isDealer: boolean): Card[] {
  let best: Card[] = hand.slice(0, 2);
  let bestScore = -Infinity;
  for (const keep of combinations(hand, 4)) {
    const toss = hand.filter((c) => !keep.includes(c));
    const own = scoreHand(keep, null).total;
    const crib = scoreHand(toss, null, true).total;
    const v = own + (isDealer ? crib : -crib) + keep.filter((c) => c.rank === 5).length * 0.5;
    if (v > bestScore) {
      bestScore = v;
      best = toss;
    }
  }
  return best;
}

/** Chooses a pegging card: immediate points first, avoid leaving 5 or 21. */
export function choosePeg(hand: Card[], pile: Card[]): Card | null {
  const count = pile.reduce((n, c) => n + pegValue(c), 0);
  const playable = hand.filter((c) => count + pegValue(c) <= 31);
  if (!playable.length) return null;
  let best = playable[0]!;
  let bestScore = -Infinity;
  for (const c of playable) {
    const next = count + pegValue(c);
    let v = pegPoints([...pile, c]).points * 10;
    if (next === 5 || next === 21) v -= 6;
    if (next < 15 && next + 10 >= 15) v -= 1;
    v += pegValue(c) * 0.1;
    if (v > bestScore) {
      bestScore = v;
      best = c;
    }
  }
  return best;
}
