import { describe, expect, it } from 'vitest';
import { cardTotal, scoreCategory } from './five-dice/logic';
import { bestScore, scoreSelection } from './hot-dice/logic';

describe('five dice scoring', () => {
  it.each([
    ['fives', [5, 5, 2, 5, 1], 15],
    ['threeKind', [3, 3, 3, 4, 6], 19],
    ['threeKind', [3, 3, 2, 4, 6], 0],
    ['fourKind', [6, 6, 6, 6, 1], 25],
    ['fullHouse', [2, 2, 5, 5, 5], 25],
    ['fullHouse', [5, 5, 5, 5, 5], 0],
    ['smallStraight', [1, 2, 3, 4, 6], 30],
    ['smallStraight', [3, 4, 5, 6, 6], 30],
    ['largeStraight', [2, 3, 4, 5, 6], 40],
    ['largeStraight', [1, 2, 3, 4, 6], 0],
    ['fiveKind', [4, 4, 4, 4, 4], 50],
    ['chance', [1, 2, 3, 4, 6], 16],
  ] as const)('%s %j = %i', (cat, dice, expected) => {
    expect(scoreCategory(cat, [...dice])).toBe(expected);
  });

  it('awards the upper bonus at 63', () => {
    expect(cardTotal({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 })).toEqual({ upper: 63, bonus: 35, total: 98 });
  });
});

describe('hot dice scoring', () => {
  it('scores singles, triples and doubling', () => {
    expect(scoreSelection([1])).toBe(100);
    expect(scoreSelection([5, 5])).toBe(100);
    expect(scoreSelection([2, 2, 2])).toBe(200);
    expect(scoreSelection([1, 1, 1])).toBe(1000);
    expect(scoreSelection([4, 4, 4, 4])).toBe(800);
    expect(scoreSelection([1, 2, 3, 4, 5, 6])).toBe(1500);
    expect(scoreSelection([2, 2, 3, 3, 6, 6])).toBe(1500);
  });

  it('rejects selections containing non-scoring dice', () => {
    expect(scoreSelection([1, 2])).toBeNull();
    expect(scoreSelection([3, 3])).toBeNull();
  });

  it('finds the best keep and detects a farkle', () => {
    expect(bestScore([1, 5, 2, 3, 4, 6]).points).toBe(1500);
    expect(bestScore([2, 3, 4, 6, 6, 2]).points).toBe(0);
    expect(bestScore([5, 5, 5, 1, 3, 4]).points).toBe(600);
  });
});
