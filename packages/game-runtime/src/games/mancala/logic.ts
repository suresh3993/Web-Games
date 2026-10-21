/**
 * Kalah (6 pits, 4 seeds). pits[0..5] player 1, [6] player-1 store,
 * [7..12] player 2, [13] player-2 store. Sowing is counter-clockwise.
 */
export interface MState {
  pits: number[];
  turn: 1 | 2;
}

export const STORE = { 1: 6, 2: 13 } as const;
export const initial = (seeds = 4): MState => ({ pits: [...Array(6).fill(seeds), 0, ...Array(6).fill(seeds), 0], turn: 1 });
export const ownPits = (p: 1 | 2) => (p === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
export const legal = (s: MState) => ownPits(s.turn).filter((i) => s.pits[i]! > 0);
export const isOver = (s: MState) => ownPits(1).every((i) => !s.pits[i]) || ownPits(2).every((i) => !s.pits[i]);

/** Sows from pit `i`. Returns the new state; turn stays the same on an extra turn. */
export function sow(s: MState, i: number): MState {
  const pits = [...s.pits];
  let seeds = pits[i]!;
  pits[i] = 0;
  let at = i;
  const skip = s.turn === 1 ? 13 : 6;
  while (seeds > 0) {
    at = (at + 1) % 14;
    if (at === skip) continue;
    pits[at]!++;
    seeds--;
  }
  const store = STORE[s.turn];
  // Capture: last seed in an empty own pit with seeds opposite.
  if (ownPits(s.turn).includes(at) && pits[at] === 1 && pits[12 - at]! > 0) {
    pits[store] = pits[store]! + pits[12 - at]! + 1;
    pits[at] = 0;
    pits[12 - at] = 0;
  }
  let next: MState = { pits, turn: at === store ? s.turn : s.turn === 1 ? 2 : 1 };
  if (isOver(next)) {
    // Remaining seeds go to their owner's store.
    const final = [...next.pits];
    for (const p of [1, 2] as const) for (const k of ownPits(p)) {
      final[STORE[p]] = final[STORE[p]]! + final[k]!;
      final[k] = 0;
    }
    next = { pits: final, turn: next.turn };
  }
  return next;
}

function search(s: MState, depth: number, alpha: number, beta: number, me: 1 | 2): number {
  if (depth === 0 || isOver(s)) {
    const diff = s.pits[STORE[me]]! - s.pits[STORE[me === 1 ? 2 : 1]]!;
    return isOver(s) ? diff * 100 : diff;
  }
  const maximizing = s.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of legal(s)) {
    const v = search(sow(s, m), depth - 1, alpha, beta, me);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function bestPit(s: MState, depth: number, random: () => number, blunder = 0): number {
  const moves = legal(s);
  if (random() < blunder) return moves[Math.floor(random() * moves.length)]!;
  let best = -Infinity;
  let picks: number[] = [];
  for (const m of moves) {
    const v = search(sow(s, m), depth - 1, -Infinity, Infinity, s.turn);
    if (v > best) {
      best = v;
      picks = [m];
    } else if (v === best) picks.push(m);
  }
  return picks[Math.floor(random() * picks.length)]!;
}
