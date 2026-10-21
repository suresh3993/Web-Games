import { describe, expect, it } from 'vitest';
import { frameTotals, gameComplete } from './scoring';

describe('ten-pin scoring', () => {
  it('perfect game is 300', () => {
    const rolls = Array(12).fill(10);
    expect(frameTotals(rolls).at(-1)).toBe(300);
    expect(gameComplete(rolls)).toBe(true);
  });

  it('all spares with a final 5 bonus', () => {
    const rolls = [...Array(21).fill(5)];
    expect(frameTotals(rolls).at(-1)).toBe(150);
  });

  it('open frames simply add up; gutter game is zero', () => {
    expect(frameTotals(Array(20).fill(0)).at(-1)).toBe(0);
    expect(frameTotals(Array(20).fill(4)).at(-1)).toBe(80);
    expect(gameComplete(Array(20).fill(4))).toBe(true);
  });

  it('strike and spare bonuses wait for later rolls', () => {
    expect(frameTotals([10, 3])).toEqual([null]);
    expect(frameTotals([10, 3, 4])).toEqual([17, 24]);
    expect(frameTotals([7, 3, 5, 2])).toEqual([15, 22]);
  });

  it('tenth frame gives bonus balls only after a strike or spare', () => {
    const nine = Array(18).fill(0);
    expect(gameComplete([...nine, 3, 4])).toBe(true);
    expect(gameComplete([...nine, 7, 3])).toBe(false);
    expect(gameComplete([...nine, 7, 3, 5])).toBe(true);
  });
});
