import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { cells, clearLines, collides, COLS, emptyBoard, hardDropDistance, lock, makeBag, rotate, ROWS, spawn } from './logic';

describe('block puzzle logic', () => {
  it('7-bag contains each piece exactly once', () => {
    expect(makeBag(createRng('x')).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('every piece has 4 cells in every rotation and the O piece does not rotate', () => {
    for (let type = 0; type < 7; type++) for (let rot = 0; rot < 4; rot++) expect(cells({ type, rot, x: 0, y: 0 })).toHaveLength(4);
    expect(cells({ type: 3, rot: 1, x: 0, y: 0 })).toEqual(cells({ type: 3, rot: 0, x: 0, y: 0 }));
  });

  it('four rotations return to the original orientation', () => {
    const p = { type: 5, rot: 0, x: 4, y: 5 };
    expect(cells({ ...p, rot: 4 })).toEqual(cells(p));
  });

  it('detects walls, floor and occupied cells', () => {
    const board = emptyBoard();
    expect(collides(board, { type: 0, rot: 0, x: -1, y: 0 })).toBe(true);
    expect(collides(board, { type: 0, rot: 0, x: COLS - 3, y: 0 })).toBe(true);
    expect(collides(board, { type: 3, rot: 0, x: 0, y: ROWS - 1 })).toBe(true);
    board[5]![4] = 1;
    expect(collides(board, { type: 3, rot: 0, x: 3, y: 4 })).toBe(true);
  });

  it('hard drop lands on the floor', () => {
    const board = emptyBoard();
    const piece = spawn(3);
    const d = hardDropDistance(board, piece);
    const landed = lock(board, { ...piece, y: piece.y + d });
    expect(landed[ROWS - 1]!.filter(Boolean)).toHaveLength(2);
    expect(landed[ROWS - 2]!.filter(Boolean)).toHaveLength(2);
  });

  it('clears full lines and shifts rows down', () => {
    const board = emptyBoard();
    board[ROWS - 1] = Array(COLS).fill(2);
    board[ROWS - 2] = Array(COLS).fill(3);
    board[ROWS - 3]![0] = 5;
    const { board: next, cleared } = clearLines(board);
    expect(cleared).toBe(2);
    expect(next[ROWS - 1]![0]).toBe(5);
    expect(next).toHaveLength(ROWS);
  });

  it('wall kicks let a vertical I piece rotate next to the wall', () => {
    const board = emptyBoard();
    const vertical = { type: 0, rot: 1, x: -2, y: 5 };
    expect(collides(board, vertical)).toBe(false);
    const rotated = rotate(board, vertical);
    expect(collides(board, rotated)).toBe(false);
    expect(rotated.rot).toBe(2);
  });
});
