import { describe, expect, it } from 'vitest';
import type { Card } from '../kit/cards';
import { evaluatePoker } from '../kit/poker';
import { handValue, isBlackjack } from './blackjack/index';
import { pegPoints, scoreHand } from './cribbage/logic';
import { canPlay, cardPoints } from './crazy-eights/index';
import { capacity, isTableauRun } from './freecell/index';
import { aiPlay, legalPlays, settleRound, trickWinner } from './hearts/logic';
import { isRun } from './spider-solitaire/index';
import { adjacentRank } from './tri-peaks/index';

const c = (rank: number, suit: number): Card => ({ rank, suit });

describe('blackjack', () => {
  it('counts aces as 1 or 11', () => {
    expect(handValue([c(1, 0), c(13, 1)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(1, 0), c(1, 1), c(9, 2)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(1, 0), c(9, 1), c(5, 2)]).total).toBe(15);
    expect(isBlackjack([c(1, 0), c(12, 0)])).toBe(true);
    expect(isBlackjack([c(7, 0), c(7, 1), c(7, 2)])).toBe(false);
  });
});

describe('video poker evaluation', () => {
  it.each([
    [[c(1, 0), c(13, 0), c(12, 0), c(11, 0), c(10, 0)], 'royal-flush'],
    [[c(5, 1), c(6, 1), c(7, 1), c(8, 1), c(9, 1)], 'straight-flush'],
    [[c(9, 0), c(9, 1), c(9, 2), c(9, 3), c(2, 0)], 'four-kind'],
    [[c(3, 0), c(3, 1), c(3, 2), c(8, 3), c(8, 0)], 'full-house'],
    [[c(2, 2), c(7, 2), c(9, 2), c(11, 2), c(4, 2)], 'flush'],
    [[c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)], 'straight'],
    [[c(4, 0), c(4, 1), c(4, 2), c(9, 3), c(12, 0)], 'three-kind'],
    [[c(4, 0), c(4, 1), c(9, 2), c(9, 3), c(12, 0)], 'two-pair'],
    [[c(11, 0), c(11, 1), c(2, 2), c(5, 3), c(8, 0)], 'jacks-or-better'],
    [[c(10, 0), c(10, 1), c(2, 2), c(5, 3), c(8, 0)], 'nothing'],
  ] as const)('%#: %s', (hand, expected) => {
    expect(evaluatePoker([...hand])).toBe(expected);
  });
});

describe('cribbage scoring', () => {
  it('scores the perfect 29 hand', () => {
    expect(scoreHand([c(5, 3), c(5, 2), c(5, 1), c(11, 0)], c(5, 0)).total).toBe(29);
  });
  it('scores runs with multiplicity and fifteens', () => {
    // 4-5-5-6 + 9: fifteens 4+5+6 (×2) and 6+9 = 6 points; double run of three = 6; pair = 2
    const s = scoreHand([c(4, 0), c(5, 1), c(5, 2), c(6, 3)], c(9, 0));
    expect(s.parts.runs).toBe(6);
    expect(s.parts.pairs).toBe(2);
    expect(s.parts.fifteens).toBe(6);
    expect(s.total).toBe(14);
  });
  it('crib flush needs five cards', () => {
    const hand = [c(2, 1), c(4, 1), c(8, 1), c(12, 1)];
    expect(scoreHand(hand, c(7, 0), false).parts.flush).toBe(4);
    expect(scoreHand(hand, c(7, 0), true).parts.flush).toBe(0);
    expect(scoreHand(hand, c(7, 1), true).parts.flush).toBe(5);
  });
  it('pegs fifteens, pairs and out-of-order runs', () => {
    expect(pegPoints([c(7, 0), c(8, 1)]).points).toBe(2);
    expect(pegPoints([c(4, 0), c(4, 1), c(4, 2)]).points).toBe(6);
    expect(pegPoints([c(3, 0), c(5, 1), c(4, 2)]).points).toBe(3);
  });
});

describe('hearts', () => {
  it('requires the 2♣ to lead the first trick and following suit', () => {
    const hand = [c(2, 3), c(9, 3), c(5, 1)];
    expect(legalPlays({ hand, trick: [], heartsBroken: false, firstTrick: true })).toEqual([c(2, 3)]);
    expect(legalPlays({ hand, trick: [c(10, 3)], heartsBroken: false, firstTrick: false })).toEqual([c(2, 3), c(9, 3)]);
  });
  it('picks the highest card of the led suit as the winner (ace high)', () => {
    expect(trickWinner([c(10, 2), c(1, 2), c(13, 0), c(12, 2)])).toBe(1);
  });
  it('shooting the moon gives 26 to everyone else', () => {
    expect(settleRound([26, 0, 0, 0])).toEqual([0, 26, 26, 26]);
  });
  it('dumps the queen of spades when void', () => {
    const play = aiPlay({ hand: [c(12, 0), c(3, 1)], trick: [c(5, 2)], heartsBroken: true, firstTrick: false });
    expect(play).toEqual(c(12, 0));
  });
});

describe('solitaire helpers', () => {
  it('freecell supermove capacity', () => {
    expect(capacity(4, 0)).toBe(5);
    expect(capacity(2, 1)).toBe(6);
    expect(isTableauRun([c(9, 0), c(8, 1), c(7, 3)])).toBe(true);
    expect(isTableauRun([c(9, 0), c(8, 0)])).toBe(false);
  });
  it('spider runs must be same-suit and descending', () => {
    const up = (cs: Card[]) => cs.map((x) => ({ ...x, up: true }));
    expect(isRun(up([c(9, 0), c(8, 0), c(7, 0)]), 0)).toBe(true);
    expect(isRun(up([c(9, 0), c(8, 1)]), 0)).toBe(false);
  });
  it('tri peaks wraps King and Ace', () => {
    expect(adjacentRank(13, 1)).toBe(true);
    expect(adjacentRank(5, 7)).toBe(false);
  });
  it('crazy eights matching and scoring', () => {
    expect(canPlay(c(8, 0), c(3, 1), 1)).toBe(true);
    expect(canPlay(c(3, 0), c(3, 1), 1)).toBe(true);
    expect(canPlay(c(4, 0), c(3, 1), 1)).toBe(false);
    expect(cardPoints(c(8, 2))).toBe(50);
    expect(cardPoints(c(12, 2))).toBe(10);
  });
});
