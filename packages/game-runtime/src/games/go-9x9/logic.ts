/** Go on a 9x9 board: captures, suicide prevention, simple ko, area scoring. */
export const N = 9;
export const KOMI = 6.5;

export interface GoState {
  board: number[]; // 0 empty, 1 black, 2 white
  turn: 1 | 2;
  previous: string; // board key before the last move (simple ko)
  passes: number;
  captures: [number, number];
}

export const initial = (): GoState => ({ board: Array(N * N).fill(0), turn: 1, previous: '', passes: 0, captures: [0, 0] });

export function neighbours(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

/** The group containing `i` and its liberties. */
export function group(board: number[], i: number): { stones: number[]; liberties: Set<number> } {
  const color = board[i];
  const stones: number[] = [];
  const liberties = new Set<number>();
  const seen = new Set([i]);
  const stack = [i];
  while (stack.length) {
    const s = stack.pop()!;
    stones.push(s);
    for (const n of neighbours(s)) {
      if (board[n] === 0) liberties.add(n);
      else if (board[n] === color && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return { stones, liberties };
}

/** Returns the next state or null if the move is illegal (occupied, suicide or ko). */
export function play(s: GoState, i: number): GoState | null {
  if (i < 0) return { ...s, turn: s.turn === 1 ? 2 : 1, passes: s.passes + 1, previous: s.board.join('') };
  if (s.board[i]) return null;
  const board = [...s.board];
  board[i] = s.turn;
  const enemy = s.turn === 1 ? 2 : 1;
  let captured = 0;
  for (const n of neighbours(i)) {
    if (board[n] !== enemy) continue;
    const g = group(board, n);
    if (g.liberties.size === 0) {
      for (const st of g.stones) board[st] = 0;
      captured += g.stones.length;
    }
  }
  if (group(board, i).liberties.size === 0) return null; // suicide
  const key = board.join('');
  if (key === s.previous) return null; // ko
  const captures: [number, number] = [...s.captures];
  captures[s.turn - 1] = captures[s.turn - 1]! + captured;
  return { board, turn: enemy as 1 | 2, previous: s.board.join(''), passes: 0, captures };
}

/** Area scoring: stones + empty regions bordered by a single colour. White gets komi. */
export function score(board: number[]): { black: number; white: number; territory: number[] } {
  const territory = Array(N * N).fill(0);
  let black = 0;
  let white = 0;
  const seen = new Set<number>();
  for (let i = 0; i < N * N; i++) {
    if (board[i] === 1) black++;
    else if (board[i] === 2) white++;
    else if (!seen.has(i)) {
      const region: number[] = [];
      const borders = new Set<number>();
      const stack = [i];
      seen.add(i);
      while (stack.length) {
        const s = stack.pop()!;
        region.push(s);
        for (const n of neighbours(s)) {
          if (board[n] === 0 && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          } else if (board[n]) borders.add(board[n]!);
        }
      }
      if (borders.size === 1) {
        const owner = [...borders][0]!;
        for (const s of region) territory[s] = owner;
        if (owner === 1) black += region.length;
        else white += region.length;
      }
    }
  }
  return { black, white: white + KOMI, territory };
}

/**
 * Heuristic move for a casual computer opponent: captures, escapes from atari,
 * ataris, avoids self-atari and filling own eyes, prefers influence; passes when
 * nothing is worth playing.
 */
export function aiMove(s: GoState, random: () => number, noise = 1): number {
  const me = s.turn;
  const enemy = me === 1 ? 2 : 1;
  let best = -1;
  let bestScore = 0.5; // below this, pass
  for (let i = 0; i < N * N; i++) {
    const next = play(s, i);
    if (!next) continue;
    const ns = neighbours(i);
    // Don't fill a single-point eye.
    if (ns.every((n) => s.board[n] === me) && ns.length >= 3) continue;
    let v = random() * noise;
    v += (next.captures[me - 1]! - s.captures[me - 1]!) * 12;
    const mine = group(next.board, i);
    if (mine.liberties.size === 1) v -= 15;
    else v += Math.min(mine.liberties.size, 4) * 0.6;
    for (const n of ns) {
      if (s.board[n] === me && group(s.board, n).liberties.size === 1) v += 10; // saving
      if (s.board[n] === enemy) {
        const g = group(next.board, n);
        if (g.liberties.size === 1) v += 5; // atari
      }
    }
    // Influence: prefer points near the centre early and near own stones, away from the edge.
    const r = Math.floor(i / N);
    const c = i % N;
    const edge = Math.min(r, c, N - 1 - r, N - 1 - c);
    v += edge === 0 ? -1.5 : edge === 1 ? 0.5 : 1;
    const terr = score(next.board).territory;
    v += (terr.filter((t) => t === me).length - score(s.board).territory.filter((t) => t === me).length) * 0.3;
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  }
  return best;
}
