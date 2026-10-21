/**
 * Backgammon rules. Player 0 (human) moves from point 23 → 0 and bears off below 0;
 * player 1 moves 0 → 23 and bears off above 23. points[i] > 0 = player-0 checkers,
 * < 0 = player-1 checkers. No doubling cube.
 */
export interface BgState {
  points: number[];
  bar: [number, number];
  off: [number, number];
}
/** from: 0..23 or 'bar'; to: 0..23 or 'off'. */
export interface BgMove {
  from: number | 'bar';
  to: number | 'off';
  die: number;
  hit: boolean;
}

export function initial(): BgState {
  const points = Array(24).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: [0, 0], off: [0, 0] };
}

const sign = (p: 0 | 1) => (p === 0 ? 1 : -1);
const mine = (s: BgState, p: 0 | 1, i: number) => s.points[i]! * sign(p) > 0;
const count = (s: BgState, p: 0 | 1, i: number) => Math.max(0, s.points[i]! * sign(p));
const opponentCount = (s: BgState, p: 0 | 1, i: number) => Math.max(0, -s.points[i]! * sign(p));

export function allHome(s: BgState, p: 0 | 1): boolean {
  if (s.bar[p]) return false;
  for (let i = 0; i < 24; i++) {
    const home = p === 0 ? i <= 5 : i >= 18;
    if (!home && mine(s, p, i)) return false;
  }
  return true;
}

/** Single-checker moves for one die value. */
export function singleMoves(s: BgState, p: 0 | 1, die: number): BgMove[] {
  const moves: BgMove[] = [];
  const target = (from: number) => (p === 0 ? from - die : from + die);
  const open = (to: number) => opponentCount(s, p, to) < 2;
  if (s.bar[p]) {
    const to = p === 0 ? 24 - die : die - 1;
    if (open(to)) moves.push({ from: 'bar', to, die, hit: opponentCount(s, p, to) === 1 });
    return moves;
  }
  const home = allHome(s, p);
  for (let i = 0; i < 24; i++) {
    if (!mine(s, p, i)) continue;
    const to = target(i);
    if (to >= 0 && to <= 23) {
      if (open(to)) moves.push({ from: i, to, die, hit: opponentCount(s, p, to) === 1 });
    } else if (home) {
      const exact = p === 0 ? to === -1 : to === 24;
      // A higher die may bear off only if no checker sits further from home.
      const furthest = p === 0 ? [...Array(6).keys()].reverse().find((k) => mine(s, p, k)) : [...Array(6).keys()].map((k) => 18 + k).find((k) => mine(s, p, k));
      if (exact || i === furthest) moves.push({ from: i, to: 'off', die, hit: false });
    }
  }
  return moves;
}

export function applyMove(s: BgState, p: 0 | 1, m: BgMove): BgState {
  const points = [...s.points];
  const bar: [number, number] = [...s.bar];
  const off: [number, number] = [...s.off];
  if (m.from === 'bar') bar[p]--;
  else points[m.from] = points[m.from]! - sign(p);
  if (m.to === 'off') off[p]++;
  else {
    if (m.hit) {
      points[m.to] = 0;
      bar[p === 0 ? 1 : 0]++;
    }
    points[m.to] = points[m.to]! + sign(p);
  }
  return { points, bar, off };
}

export interface Sequence {
  moves: BgMove[];
  state: BgState;
}

const key = (s: BgState) => `${s.points.join(',')}|${s.bar}|${s.off}`;

/** All legal full-turn sequences: maximise dice used; if only one die is usable, the higher must be used when possible. */
export function legalSequences(s: BgState, p: 0 | 1, dice: [number, number]): Sequence[] {
  const orders = dice[0] === dice[1] ? [[dice[0], dice[0], dice[0], dice[0]]] : [[dice[0], dice[1]], [dice[1], dice[0]]];
  const results = new Map<string, Sequence>();
  let maxLen = 0;
  const walk = (state: BgState, remaining: number[], moves: BgMove[]) => {
    const next = remaining.length ? singleMoves(state, p, remaining[0]!) : [];
    if (!next.length) {
      if (moves.length > maxLen) {
        maxLen = moves.length;
        results.clear();
      }
      if (moves.length === maxLen) results.set(key(state) + moves.map((m) => m.die).join(''), { moves, state });
      return;
    }
    for (const m of next) walk(applyMove(state, p, m), remaining.slice(1), [...moves, m]);
  };
  for (const order of orders) walk(s, order, []);
  let seqs = [...results.values()].filter((q) => q.moves.length === maxLen);
  if (dice[0] !== dice[1] && maxLen === 1) {
    const high = Math.max(...dice);
    if (seqs.some((q) => q.moves[0]!.die === high)) seqs = seqs.filter((q) => q.moves[0]!.die === high);
  }
  return seqs;
}

export const pipCount = (s: BgState, p: 0 | 1) => {
  let pips = s.bar[p] * 25;
  for (let i = 0; i < 24; i++) pips += count(s, p, i) * (p === 0 ? i + 1 : 24 - i);
  return pips;
};

/** Heuristic for the computer (player 1's perspective when p = 1). */
export function evaluate(s: BgState, p: 0 | 1): number {
  const o: 0 | 1 = p === 0 ? 1 : 0;
  let score = (pipCount(s, o) - pipCount(s, p)) * 1.0 + (s.off[p] - s.off[o]) * 12 + s.bar[o] * 15 - s.bar[p] * 15;
  for (let i = 0; i < 24; i++) {
    const n = count(s, p, i);
    if (n === 1) score -= 9; // blot
    if (n >= 2) score += (p === 1 ? i >= 18 : i <= 5) ? 8 : 4; // made point (home board worth more)
  }
  return score;
}

export const winner = (s: BgState): 0 | 1 | null => (s.off[0] === 15 ? 0 : s.off[1] === 15 ? 1 : null);
