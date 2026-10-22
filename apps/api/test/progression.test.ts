import { describe, expect, it } from 'vitest';
import { levelForXp, xpForLevel, xpForRound } from '@suresh/shared-types';
import { checkRound } from '../src/modules/gameplay/plausibility';

describe('XP and levels', () => {
  it('awards 10 XP plus 4 per active minute, capped at 30, from 10 seconds of play', () => {
    expect(xpForRound(9_999)).toBe(0);
    expect(xpForRound(10_000)).toBe(10);
    expect(xpForRound(59_999)).toBe(13);
    expect(xpForRound(60_000)).toBe(14);
    expect(xpForRound(5 * 60_000)).toBe(30);
    expect(xpForRound(60 * 60_000)).toBe(30);
    expect(xpForRound(Number.NaN)).toBe(0);
  });

  it('needs 100 × n × (n − 1) / 2 XP for level n, exactly at the thresholds', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect([0, 99, 100, 299, 300, 599, 600, 1000].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 3, 4, 5]);
    for (let level = 1; level < 200; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level + 1) - 1)).toBe(level);
    }
  });
});

describe('round plausibility', () => {
  const ok = { score: 100, claimedMs: 60_000, wallMs: 61_000, maxScore: 1000 };

  it('accepts realistic rounds and keeps the client duration', () => {
    expect(checkRound(ok)).toEqual({ durationMs: 60_000, flags: [] });
    expect(checkRound({ ...ok, maxScore: null, score: 10 ** 9 }).flags).toEqual([]);
    // A 0-point round can end instantly (e.g. the player quits).
    expect(checkRound({ ...ok, score: 0, claimedMs: 0, wallMs: 200 }).flags).toEqual([]);
  });

  it('flags scores above the ceiling, impossible durations and instant scores', () => {
    expect(checkRound({ ...ok, score: 1001 }).flags).toEqual(['score_above_max']);
    expect(checkRound({ ...ok, claimedMs: 70_000 })).toEqual({ durationMs: 61_000, flags: ['duration_exceeds_wall_clock'] });
    // Within the clock tolerance: clamped, not flagged.
    expect(checkRound({ ...ok, claimedMs: 64_000 })).toEqual({ durationMs: 61_000, flags: [] });
    expect(checkRound({ ...ok, claimedMs: 300, wallMs: 400 }).flags).toEqual(['round_too_short']);
  });
});
