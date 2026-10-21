import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { createSnakeState, placeFood, POINTS_PER_FOOD, queueDirection, tick, tickInterval, type SnakeState } from './logic';

const rng = () => createRng('test-seed');

/** Builds a state with an explicit snake and food for precise scenarios. */
function stateWith(partial: Partial<SnakeState>): SnakeState {
  return { ...createSnakeState(10, 10, rng()), queue: [], ...partial };
}

describe('snake logic', () => {
  it('creates a 3-segment snake heading right with food on a free cell', () => {
    const s = createSnakeState(24, 16, rng());
    expect(s.snake).toHaveLength(3);
    expect(s.direction).toBe('right');
    expect(s.food).not.toBeNull();
    expect(s.snake.some((p) => p.x === s.food!.x && p.y === s.food!.y)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    expect(createSnakeState(24, 16, createRng('abc')).food).toEqual(createSnakeState(24, 16, createRng('abc')).food);
  });

  it('moves one cell per tick without growing', () => {
    const s = stateWith({ snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], food: { x: 0, y: 0 } });
    const next = tick(s, rng());
    expect(next.snake).toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);
    expect(next.score).toBe(0);
  });

  it('grows and scores when eating, and respawns food elsewhere', () => {
    const s = stateWith({ snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], food: { x: 6, y: 5 } });
    const next = tick(s, rng());
    expect(next.snake).toHaveLength(4);
    expect(next.score).toBe(POINTS_PER_FOOD);
    expect(next.foodEaten).toBe(1);
    expect(next.food).not.toEqual({ x: 6, y: 5 });
  });

  it('ignores 180° reversals and duplicate turns', () => {
    const s = stateWith({ direction: 'right' });
    expect(queueDirection(s, 'left').queue).toEqual([]);
    expect(queueDirection(s, 'right').queue).toEqual([]);
    expect(queueDirection(queueDirection(s, 'up'), 'down').queue).toEqual(['up']);
  });

  it('buffers at most two quick turns', () => {
    let s = stateWith({ direction: 'right' });
    s = queueDirection(s, 'up');
    s = queueDirection(s, 'left');
    s = queueDirection(s, 'down');
    expect(s.queue).toEqual(['up', 'left']);
  });

  it('dies when hitting a wall', () => {
    const s = stateWith({ snake: [{ x: 9, y: 0 }, { x: 8, y: 0 }, { x: 7, y: 0 }], direction: 'right', food: { x: 0, y: 9 } });
    const next = tick(s, rng());
    expect(next.alive).toBe(false);
    expect(next.won).toBe(false);
  });

  it('dies when running into its own body', () => {
    // A 5-long snake curled so that turning down hits segment 3.
    const snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
    ];
    const s = stateWith({ snake, direction: 'left', queue: ['down'], food: { x: 0, y: 0 } });
    expect(tick(s, rng()).alive).toBe(false);
  });

  it('may move into the cell its tail is vacating', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    const s = stateWith({ snake, direction: 'left', queue: ['down'], food: { x: 0, y: 0 } });
    const next = tick(s, rng());
    expect(next.alive).toBe(true);
    expect(next.snake[0]).toEqual({ x: 5, y: 6 });
  });

  it('placeFood never returns an occupied cell and returns null on a full board', () => {
    const random = rng();
    const snake = Array.from({ length: 20 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
    for (let i = 0; i < 50; i++) {
      const food = placeFood(snake, 5, 5, random)!;
      expect(food.y).toBe(4);
    }
    const full = Array.from({ length: 25 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
    expect(placeFood(full, 5, 5, random)).toBeNull();
  });

  it('speeds up as food is eaten but never below the floor', () => {
    expect(tickInterval(0)).toBe(150);
    expect(tickInterval(10)).toBeLessThan(150);
    expect(tickInterval(1000)).toBe(65);
  });
});
