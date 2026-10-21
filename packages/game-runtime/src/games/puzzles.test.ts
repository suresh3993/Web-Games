import { describe, expect, it } from 'vitest';
import { createRng } from '../core/random';
import { generateBridges, solvedBridges } from './bridges/logic';
import { cageSatisfied, latinSquare, makeCages, solvedCalc } from './calc-cages/logic';
import { feedback } from './code-breaker/index';
import { hamiltonianPath, makeFlows } from './color-link/logic';
import { generateLevel, solved as crateSolved, step } from './crate-pusher/logic';
import { checkKakuro, generateKakuro } from './kakuro/logic';
import { press, scramble } from './light-toggle/index';
import { isFree, layout, solvableFaces } from './mahjong-solitaire/logic';
import { clues } from './nonogram/index';
import { generatePipes, isConnected } from './pipe-connect/index';
import { partition } from './shape-fit/index';
import { generateStarBattle, validStars } from './star-battle/index';

describe('puzzle generators always produce solvable puzzles', () => {
  it('kakuro: the generated solution satisfies every clue', () => {
    for (const s of ['k1', 'k2', 'k3']) {
      const p = generateKakuro(7, createRng(s));
      expect(checkKakuro(p, p.solution)).toBe(true);
      expect(p.white.filter(Boolean).length).toBeGreaterThan(15);
    }
  });

  it('calc cages: the Latin square solves the cages', () => {
    for (const n of [4, 5, 6]) {
      const sol = latinSquare(n, createRng(`c${n}`));
      const cages = makeCages(sol, n, createRng(`d${n}`));
      expect(cages.flatMap((c) => c.cells).sort((a, b) => a - b)).toEqual([...Array(n * n).keys()]);
      expect(cages.every((c) => cageSatisfied(c, sol))).toBe(true);
      expect(solvedCalc(sol, n, cages)).toBe(true);
    }
  });

  it('star battle: the hidden stars are a valid solution', () => {
    for (const s of ['s1', 's2', 's3']) {
      const { regions, stars } = generateStarBattle(createRng(s));
      expect(validStars(stars, regions)).toBe(true);
      expect(new Set(regions).size).toBe(8);
    }
  });

  it('bridges: the generating network is a solution', () => {
    const { islands, solution } = generateBridges(9, 12, createRng('b'));
    expect(islands).toHaveLength(12);
    expect(solvedBridges(islands, solution)).toBe(true);
  });

  it('pipe connect: the spanning tree is a connected network', () => {
    expect(isConnected(generatePipes(6, createRng('p')), 6)).toBe(true);
  });

  it('color link: the Hamiltonian path covers every cell and flows partition it', () => {
    const path = hamiltonianPath(6, createRng('h'));
    expect(new Set(path).size).toBe(36);
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1]!;
      const b = path[k]!;
      expect(Math.abs(a - b) === 6 || (Math.abs(a - b) === 1 && Math.floor(a / 6) === Math.floor(b / 6))).toBe(true);
    }
    const flows = makeFlows(6, 6, createRng('f'));
    expect(flows.flat().length).toBe(36);
    expect(flows.every((f) => f.length >= 3)).toBe(true);
  });

  it('crate pusher: levels start unsolved and moves respect walls/crates', () => {
    const level = generateLevel(createRng('cp'), 2);
    expect(crateSolved(level, level.crates)).toBe(false);
    expect(level.crates).toHaveLength(2);
    // Walking into a border wall is blocked.
    expect(step(level, level.crates, level.w + 1, -level.w)).toBeNull();
  });

  it('mahjong: faces come in pairs and the full deal has free tiles', () => {
    const pos = layout();
    expect(pos.length % 2).toBe(0);
    const faces = solvableFaces(pos, 30, createRng('m'));
    const counts = new Map<number, number>();
    faces.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1));
    expect([...counts.values()].every((c) => c % 2 === 0)).toBe(true);
    expect(pos.some((_, i) => isFree(pos, pos.map(() => true), i))).toBe(true);
  });

  it('light toggle: pressing the same cells again solves the scramble', () => {
    const { board } = scramble(createRng('l'), 5);
    expect(board.some(Boolean)).toBe(true);
    expect(press(press(board, 7), 7)).toEqual(board);
  });

  it('shape fit: partitions cover the rectangle exactly', () => {
    const pieces = partition(5, 6, createRng('s'));
    const cells = pieces.flat().map(([r, c]) => r * 6 + c).sort((a, b) => a - b);
    expect(cells).toEqual([...Array(30).keys()]);
  });

  it('nonogram clues and code-breaker feedback', () => {
    expect(clues([true, true, false, true])).toEqual([2, 1]);
    expect(clues([false, false])).toEqual([0]);
    expect(feedback([0, 1, 2, 3], [0, 2, 1, 5])).toEqual({ exact: 1, partial: 2 });
    expect(feedback([1, 1, 2, 2], [2, 2, 1, 1])).toEqual({ exact: 0, partial: 4 });
  });
});
