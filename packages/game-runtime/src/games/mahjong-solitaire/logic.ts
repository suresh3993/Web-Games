import type { Rng } from '../../kit/util';

export interface Pos {
  x: number; // column (integer grid)
  y: number; // row
  z: number; // layer
}

/** A 4-layer pyramid layout: 8x6, 6x4, 4x2, 2x1 = 82 tiles (41 pairs). */
export function layout(): Pos[] {
  const out: Pos[] = [];
  const layers = [
    { w: 8, h: 6, ox: 0, oy: 0 },
    { w: 6, h: 4, ox: 1, oy: 1 },
    { w: 4, h: 2, ox: 2, oy: 2 },
    { w: 2, h: 1, ox: 3, oy: 2 },
  ];
  layers.forEach((l, z) => {
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) out.push({ x: l.ox + x, y: l.oy + y, z });
  });
  return out;
}

/** A tile is free when nothing sits on it and its left or right side is open. */
export function isFree(positions: Pos[], present: boolean[], i: number): boolean {
  if (!present[i]) return false;
  const p = positions[i]!;
  const at = (x: number, y: number, z: number) => positions.some((q, j) => present[j] && q.x === x && q.y === y && q.z === z);
  if (at(p.x, p.y, p.z + 1)) return false;
  return !at(p.x - 1, p.y, p.z) || !at(p.x + 1, p.y, p.z);
}

/**
 * Assigns tile faces so the deal is solvable: simulate removing random free
 * pairs from the full layout and give each removed pair the same face.
 */
export function solvableFaces(positions: Pos[], kinds: number, random: Rng): number[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const present = positions.map(() => true);
    const faces = positions.map(() => -1);
    let ok = true;
    let pairNo = 0;
    while (present.some(Boolean)) {
      const free = positions.flatMap((_, i) => (isFree(positions, present, i) ? [i] : []));
      if (free.length < 2) {
        ok = false;
        break;
      }
      const a = free.splice(Math.floor(random() * free.length), 1)[0]!;
      const b = free[Math.floor(random() * free.length)]!;
      const face = (pairNo++ * 7 + Math.floor(random() * kinds)) % kinds;
      faces[a] = faces[b] = face;
      present[a] = present[b] = false;
    }
    if (ok) return faces;
  }
  throw new Error('Could not build a solvable deal');
}
