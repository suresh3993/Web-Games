import type { Card } from './cards';

export type HandRank =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-kind'
  | 'two-pair'
  | 'jacks-or-better'
  | 'nothing';

/** Evaluates a 5-card hand for Jacks-or-Better video poker. */
export function evaluatePoker(cards: Card[]): HandRank {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const unique = [...counts.keys()].sort((a, b) => a - b);
  const wheel = unique.join() === '1,2,3,4,5';
  const broadway = unique.join() === '1,10,11,12,13';
  const straight = unique.length === 5 && (unique[4]! - unique[0]! === 4 || wheel || broadway);
  if (straight && flush) return broadway ? 'royal-flush' : 'straight-flush';
  if (groups[0] === 4) return 'four-kind';
  if (groups[0] === 3 && groups[1] === 2) return 'full-house';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'three-kind';
  if (groups[0] === 2 && groups[1] === 2) return 'two-pair';
  if (groups[0] === 2) {
    const pair = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pair === 1 || pair >= 11) return 'jacks-or-better';
  }
  return 'nothing';
}

/** 9/6 Jacks-or-Better pay table (per credit bet). */
export const PAYTABLE: Record<HandRank, number> = {
  'royal-flush': 250,
  'straight-flush': 50,
  'four-kind': 25,
  'full-house': 9,
  flush: 6,
  straight: 4,
  'three-kind': 3,
  'two-pair': 2,
  'jacks-or-better': 1,
  nothing: 0,
};

export const HAND_LABELS: Record<HandRank, string> = {
  'royal-flush': 'Royal Flush',
  'straight-flush': 'Straight Flush',
  'four-kind': 'Four of a Kind',
  'full-house': 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  'three-kind': 'Three of a Kind',
  'two-pair': 'Two Pair',
  'jacks-or-better': 'Jacks or Better',
  nothing: 'No win',
};
