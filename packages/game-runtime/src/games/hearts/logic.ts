import type { Card } from '../../kit/cards';

/** Ace high for trick-taking. */
export const power = (c: Card) => (c.rank === 1 ? 14 : c.rank);
export const isQS = (c: Card) => c.suit === 0 && c.rank === 12;
export const penalty = (c: Card) => (c.suit === 1 ? 1 : isQS(c) ? 13 : 0);
const TWO_CLUBS = (c: Card) => c.suit === 3 && c.rank === 2;

export interface TrickContext {
  hand: Card[];
  trick: Card[]; // cards played so far this trick (in order)
  heartsBroken: boolean;
  firstTrick: boolean;
}

export function legalPlays({ hand, trick, heartsBroken, firstTrick }: TrickContext): Card[] {
  if (firstTrick && trick.length === 0) return hand.filter(TWO_CLUBS);
  if (trick.length) {
    const follow = hand.filter((c) => c.suit === trick[0]!.suit);
    if (follow.length) return follow;
    if (firstTrick) {
      const clean = hand.filter((c) => penalty(c) === 0);
      if (clean.length) return clean;
    }
    return hand;
  }
  if (!heartsBroken) {
    const nonHearts = hand.filter((c) => c.suit !== 1);
    if (nonHearts.length) return nonHearts;
  }
  return hand;
}

/** Index (0-based within trick) of the winning card. */
export function trickWinner(trick: Card[]): number {
  const lead = trick[0]!.suit;
  let best = 0;
  trick.forEach((c, i) => {
    if (c.suit === lead && power(c) > power(trick[best]!)) best = i;
  });
  return best;
}

/** Heuristic play for computer players. */
export function aiPlay(ctx: TrickContext): Card {
  const legal = legalPlays(ctx);
  const byPower = [...legal].sort((a, b) => power(a) - power(b));
  if (!ctx.trick.length) {
    // Lead low, preferring suits other than hearts / spades-with-queen risk.
    const safe = byPower.filter((c) => c.suit !== 1 && !(c.suit === 0 && power(c) >= 12));
    return (safe[0] ?? byPower[0])!;
  }
  const lead = ctx.trick[0]!.suit;
  const following = legal[0]!.suit === lead;
  if (following) {
    const winning = ctx.trick[trickWinner(ctx.trick)]!;
    const under = byPower.filter((c) => power(c) < power(winning));
    const trickHasPoints = ctx.trick.some((c) => penalty(c) > 0);
    if (under.length) return under[under.length - 1]!; // highest card that still loses
    // Must win: if last to play and no points, win with the highest; otherwise lowest.
    if (ctx.trick.length === 3 && !trickHasPoints) {
      // Last to play on a clean trick: win it with the highest card (but never with the Q♠).
      const high = byPower.filter((c) => !isQS(c));
      return (high[high.length - 1] ?? byPower[0])!;
    }
    return byPower[0]!;
  }
  // Void: dump the queen of spades, then high hearts, then the highest card.
  const qs = legal.find(isQS);
  if (qs) return qs;
  const hearts = byPower.filter((c) => c.suit === 1);
  if (hearts.length) return hearts[hearts.length - 1]!;
  return byPower[byPower.length - 1]!;
}

/** Three cards a computer passes: Q♠, high spades, then highest hearts/cards. */
export function aiPass(hand: Card[]): Card[] {
  const score = (c: Card) => (isQS(c) ? 100 : c.suit === 0 && power(c) > 12 ? 90 : 0) + power(c) + (c.suit === 1 ? 5 : 0);
  return [...hand].sort((a, b) => score(b) - score(a)).slice(0, 3);
}

/** Applies "shooting the moon" to a round's points. */
export function settleRound(points: number[]): number[] {
  const moon = points.findIndex((p) => p === 26);
  if (moon >= 0) return points.map((_, i) => (i === moon ? 0 : 26));
  return points;
}
