import { ORTHO, shuffle, type Rng } from '../../kit/util';

export type Op = '+' | '−' | '×' | '÷' | '';
export interface Cage {
  cells: number[];
  op: Op;
  target: number;
}

export function latinSquare(n: number, random: Rng): number[] {
  const rows = shuffle(random, [...Array(n).keys()]);
  const cols = shuffle(random, [...Array(n).keys()]);
  const syms = shuffle(random, [...Array(n).keys()].map((k) => k + 1));
  const grid: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid.push(syms[(rows[r]! + cols[c]!) % n]!);
  return grid;
}

export function makeCages(solution: number[], n: number, random: Rng): Cage[] {
  const owner = Array(n * n).fill(-1);
  const cages: Cage[] = [];
  for (const start of shuffle(random, [...Array(n * n).keys()])) {
    if (owner[start] >= 0) continue;
    const size = random() < 0.1 ? 1 : random() < 0.55 ? 2 : 3;
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < size) {
      const options = cells.flatMap((i) =>
        ORTHO.map(([dr, dc]) => [Math.floor(i / n) + dr, (i % n) + dc]).filter(([r, c]) => r! >= 0 && c! >= 0 && r! < n && c! < n && owner[r! * n + c!] < 0).map(([r, c]) => r! * n + c!),
      );
      if (!options.length) break;
      const next = options[Math.floor(random() * options.length)]!;
      owner[next] = cages.length;
      cells.push(next);
    }
    const vals = cells.map((i) => solution[i]!);
    let op: Op = '';
    let target = vals[0]!;
    if (cells.length === 2) {
      const [a, b] = [Math.max(...vals), Math.min(...vals)];
      const ops: Op[] = ['+', '−', '×'];
      if (a % b === 0) ops.push('÷', '÷');
      op = ops[Math.floor(random() * ops.length)]!;
      target = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
    } else if (cells.length >= 3) {
      op = random() < 0.5 ? '+' : '×';
      target = op === '+' ? vals.reduce((x, y) => x + y, 0) : vals.reduce((x, y) => x * y, 1);
    }
    cages.push({ cells, op, target });
  }
  return cages;
}

export function cageSatisfied(cage: Cage, values: number[]): boolean {
  const v = cage.cells.map((i) => values[i]!);
  if (v.some((x) => !x)) return false;
  switch (cage.op) {
    case '':
      return v[0] === cage.target;
    case '+':
      return v.reduce((a, b) => a + b, 0) === cage.target;
    case '×':
      return v.reduce((a, b) => a * b, 1) === cage.target;
    case '−':
      return Math.abs(v[0]! - v[1]!) === cage.target;
    case '÷':
      return Math.max(v[0]!, v[1]!) / Math.min(v[0]!, v[1]!) === cage.target;
  }
}

/** Latin rows/columns + all cages → solved (any valid solution counts). */
export function solvedCalc(values: number[], n: number, cages: Cage[]) {
  for (let k = 0; k < n; k++) {
    const row = new Set(values.slice(k * n, k * n + n));
    const col = new Set([...Array(n).keys()].map((r) => values[r * n + k]));
    if (row.size !== n || col.size !== n || row.has(0) || col.has(0)) return false;
  }
  return cages.every((c) => cageSatisfied(c, values));
}
