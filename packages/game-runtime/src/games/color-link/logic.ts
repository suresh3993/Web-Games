import type { Rng } from '../../kit/util';

/** Random Hamiltonian path on an n×n grid: serpentine start + many "backbite" moves. */
export function hamiltonianPath(n: number, random: Rng, iterations = n * n * 40): number[] {
  let path: number[] = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) path.push(r * n + (r % 2 ? n - 1 - k : k));
  const neighbours = (i: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const out: number[] = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  };
  for (let it = 0; it < iterations; it++) {
    if (random() < 0.5) path.reverse();
    const end = path[path.length - 1]!;
    const options = neighbours(end).filter((x) => x !== path[path.length - 2]);
    const target = options[Math.floor(random() * options.length)]!;
    const k = path.indexOf(target);
    // Connect end → target, reversing the tail after target.
    path = [...path.slice(0, k + 1), ...path.slice(k + 1).reverse()];
  }
  return path;
}

/** Cuts the path into `pairs` segments of length ≥ 3; returns endpoint pairs and segments. */
export function makeFlows(n: number, pairs: number, random: Rng): number[][] {
  const path = hamiltonianPath(n, random);
  const cuts = new Set<number>();
  const total = path.length;
  while (cuts.size < pairs - 1) {
    const c = 3 + Math.floor(random() * (total - 5));
    if ([...cuts].every((x) => Math.abs(x - c) >= 3) && c >= 3 && total - c >= 3) cuts.add(c);
  }
  const points = [0, ...[...cuts].sort((a, b) => a - b), total];
  return points.slice(0, -1).map((start, i) => path.slice(start, points[i + 1]));
}

export const adjacent = (a: number, b: number, n: number) => (Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(a - b) === n;
