import type { Rng } from './util';

const H = 16;
const PIT = 14; // spikes row; row 15 is solid bedrock

export interface GenOptions {
  segments: number;
  difficulty: number; // 0..1
  /** Insert ability gates: a tall cliff (needs double jump) and a wide chasm (needs dash). */
  gates?: boolean;
}

/**
 * Generates a platformer level that is completable by construction: every
 * platform lies inside the previous one's jump envelope (gap ≤ 3 tiles, rise ≤ 2).
 * Legend: '#' solid, '^' spikes, 'P' start, 'E' exit, '*' gem, 'C' checkpoint,
 * 'D' double-jump orb, 'S' dash orb, 'R' relic.
 */
export function generateLevel(random: Rng, opts: GenOptions): string[] {
  const cols: string[][] = [];
  const column = (top: number, items: Record<number, string> = {}) => {
    const col = Array<string>(H).fill('.');
    for (let r = top; r < H; r++) col[r] = '#';
    if (top > PIT) col[PIT] = '^';
    col[0] = '#';
    for (const [r, ch] of Object.entries(items)) col[Number(r)] = ch;
    cols.push(col);
  };
  const pit = () => column(H, {});
  const randInt = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));

  // Left wall + start platform.
  cols.push(Array<string>(H).fill('#'));
  let y = 11;
  for (let k = 0; k < 4; k++) column(y, k === 1 ? { [y - 1]: 'P' } : {});
  const total = opts.segments;
  let gateDouble = opts.gates ? Math.floor(total / 3) : -1;
  let gateDash = opts.gates ? Math.floor((total * 2) / 3) : -1;
  for (let s = 0; s < total; s++) {
    const maxGap = 1 + Math.round(opts.difficulty * 2); // 1..3
    if (s === gateDouble) {
      // Double-jump orb on this platform, then a 5-tile cliff ahead.
      column(y, { [y - 1]: 'D' });
      column(y);
      const cliffTop = Math.max(4, y - 5);
      for (let k = 0; k < 3; k++) column(cliffTop);
      y = cliffTop;
      gateDouble = -1;
      continue;
    }
    if (s === gateDash) {
      column(y, { [y - 1]: 'S' });
      column(y);
      for (let k = 0; k < 7; k++) pit(); // 7-tile chasm: only reachable with dash
      for (let k = 0; k < 3; k++) column(y);
      gateDash = -1;
      continue;
    }
    const gap = randInt(1, maxGap);
    for (let k = 0; k < gap; k++) pit();
    const dy = randInt(-2, 2);
    y = Math.min(12, Math.max(4, y + dy));
    const width = randInt(2, Math.max(2, 6 - Math.round(opts.difficulty * 3)));
    for (let k = 0; k < width; k++) {
      const items: Record<number, string> = {};
      if (k === Math.floor(width / 2) && random() < 0.6) items[y - 2] = '*';
      if (s === Math.floor(total / 2) && k === 0) items[y - 1] = 'C';
      if (opts.gates && (s === Math.floor(total / 4) || s === Math.floor((total * 3) / 4)) && k === width - 1) items[y - 1] = 'R';
      column(y, items);
    }
  }
  // Exit platform + right wall.
  for (let k = 0; k < 2; k++) pit();
  for (let k = 0; k < 4; k++) column(y, k === 2 ? { [y - 1]: opts.gates ? 'R' : 'E' } : {});
  if (opts.gates) column(y, { [y - 1]: 'E' });
  cols.push(Array<string>(H).fill('#'));
  // Transpose columns → row strings.
  return Array.from({ length: H }, (_, r) => cols.map((c) => c[r]).join(''));
}
