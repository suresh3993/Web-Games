import { counts } from '../../kit/dice';

/**
 * Scores a set-aside selection. Returns null if any die in the selection does not
 * contribute (every kept die must score).
 */
export function scoreSelection(dice: number[]): number | null {
  if (!dice.length) return null;
  const c = counts(dice);
  if (dice.length === 6 && c.slice(1).every((n) => n === 1)) return 1500; // straight
  if (dice.length === 6 && c.slice(1).filter((n) => n === 2).length === 3) return 1500; // three pairs
  let points = 0;
  for (let face = 1; face <= 6; face++) {
    let n = c[face]!;
    if (n >= 3) {
      const base = face === 1 ? 1000 : face * 100;
      points += base * 2 ** (n - 3);
      n = 0;
    }
    if (face === 1) points += n * 100;
    else if (face === 5) points += n * 50;
    else if (n > 0) return null; // non-scoring dice in the selection
  }
  return points;
}

/** Best possible score using any subset of the roll (0 = farkle). */
export function bestScore(dice: number[]): { points: number; keep: number[] } {
  let best = { points: 0, keep: [] as number[] };
  const n = dice.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const sel = dice.filter((_, i) => mask & (1 << i));
    const pts = scoreSelection(sel);
    if (pts !== null && (pts > best.points || (pts === best.points && sel.length > best.keep.length))) {
      best = { points: pts, keep: [...Array(n).keys()].filter((i) => mask & (1 << i)) };
    }
  }
  return best;
}
