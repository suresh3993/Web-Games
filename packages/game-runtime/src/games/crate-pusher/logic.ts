import { ORTHO, type Rng } from '../../kit/util';

export interface Level {
  w: number;
  h: number;
  walls: boolean[];
  goals: number[];
  crates: number[];
  player: number;
}

/**
 * Generates a level that is solvable by construction: crates start on their goals
 * and the generator only performs reverse moves ("pulls"). Replaying the pulls
 * backwards as pushes solves the level.
 */
export function generateLevel(random: Rng, crates: number, w = 9, h = 8, pulls = 140): Level {
  for (let attempt = 0; attempt < 60; attempt++) {
    const walls = Array.from({ length: w * h }, (_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return x === 0 || y === 0 || x === w - 1 || y === h - 1 || random() < 0.12;
    });
    const floor = walls.flatMap((wall, i) => (wall ? [] : [i]));
    if (floor.length < crates * 3 + 8) continue;
    const pickFloor = () => floor[Math.floor(random() * floor.length)]!;
    const goals = new Set<number>();
    while (goals.size < crates) goals.add(pickFloor());
    let boxes = [...goals];
    let player = pickFloor();
    if (boxes.includes(player)) continue;
    const dirs = ORTHO.map(([dy, dx]) => dy * w + dx);
    for (let k = 0; k < pulls; k++) {
      const d = dirs[Math.floor(random() * 4)]!;
      const next = player + d;
      if (walls[next] || boxes.includes(next)) continue;
      // Pull: a crate directly behind the player follows (with probability).
      const behind = player - d;
      const bi = boxes.indexOf(behind);
      if (bi >= 0 && random() < 0.75) boxes = boxes.map((b, i) => (i === bi ? player : b));
      player = next;
    }
    const offGoal = boxes.filter((b) => !goals.has(b)).length;
    if (offGoal < Math.min(crates, 2)) continue;
    return { w, h, walls, goals: [...goals], crates: boxes, player };
  }
  // Fallback trivial level (should never be needed).
  const walls = Array.from({ length: w * h }, (_, i) => i % w === 0 || i < w || i % w === w - 1 || i >= w * (h - 1));
  return { w, h, walls, goals: [w + 3], crates: [w + 2], player: w + 1 };
}

/** Moves the player; pushes a crate if possible. Returns null if blocked. */
export function step(level: Level, crates: number[], player: number, d: number): { crates: number[]; player: number; pushed: boolean } | null {
  const next = player + d;
  if (level.walls[next]) return null;
  const ci = crates.indexOf(next);
  if (ci < 0) return { crates, player: next, pushed: false };
  const beyond = next + d;
  if (level.walls[beyond] || crates.includes(beyond)) return null;
  return { crates: crates.map((c, i) => (i === ci ? beyond : c)), player: next, pushed: true };
}

export const solved = (level: Level, crates: number[]) => crates.every((c) => level.goals.includes(c));
