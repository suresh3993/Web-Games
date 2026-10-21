/** Number-merge (2048-style) rules. Board is row-major `size*size`, 0 = empty. */
export type Dir = 'up' | 'down' | 'left' | 'right';

/** Slides one line toward index 0, merging equal neighbours once. */
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const values = line.filter(Boolean);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      out.push(values[i]! * 2);
      gained += values[i]! * 2;
      i++;
    } else out.push(values[i]!);
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained };
}

function lineIndices(size: number, dir: Dir, k: number): number[] {
  const idx: number[] = [];
  for (let j = 0; j < size; j++) {
    if (dir === 'left') idx.push(k * size + j);
    if (dir === 'right') idx.push(k * size + (size - 1 - j));
    if (dir === 'up') idx.push(j * size + k);
    if (dir === 'down') idx.push((size - 1 - j) * size + k);
  }
  return idx;
}

export function move(board: number[], size: number, dir: Dir): { board: number[]; gained: number; moved: boolean } {
  const next = [...board];
  let gained = 0;
  for (let k = 0; k < size; k++) {
    const idx = lineIndices(size, dir, k);
    const res = slideLine(idx.map((i) => board[i]!));
    gained += res.gained;
    idx.forEach((i, j) => (next[i] = res.line[j]!));
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) };
}

export function spawn(board: number[], random: () => number): number[] {
  const empty = board.flatMap((v, i) => (v ? [] : [i]));
  if (!empty.length) return board;
  const next = [...board];
  next[empty[Math.floor(random() * empty.length)]!] = random() < 0.9 ? 2 : 4;
  return next;
}

export const canMove = (board: number[], size: number) =>
  (['up', 'down', 'left', 'right'] as Dir[]).some((d) => move(board, size, d).moved);
