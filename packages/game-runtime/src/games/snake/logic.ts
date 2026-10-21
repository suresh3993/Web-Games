/**
 * Pure, deterministic Snake rules. No DOM access — fully unit-testable and
 * replayable server-side from (seed, input log) in a later milestone.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface SnakeState {
  cols: number;
  rows: number;
  /** Head first. */
  snake: Point[];
  direction: Direction;
  /** Buffered turns so quick key presses between ticks are not lost (max 2). */
  queue: Direction[];
  food: Point | null;
  score: number;
  foodEaten: number;
  alive: boolean;
  won: boolean;
  ticks: number;
}

export const POINTS_PER_FOOD = 10;
const MAX_QUEUED_TURNS = 2;

const DELTAS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Picks a uniformly random free cell, or null when the board is full. */
export function placeFood(snake: Point[], cols: number, rows: number, random: () => number): Point | null {
  const occupied = new Set(snake.map((p) => p.y * cols + p.x));
  const freeCount = cols * rows - occupied.size;
  if (freeCount <= 0) return null;
  let target = Math.floor(random() * freeCount);
  for (let i = 0; i < cols * rows; i++) {
    if (occupied.has(i)) continue;
    if (target === 0) return { x: i % cols, y: Math.floor(i / cols) };
    target--;
  }
  return null;
}

export function createSnakeState(cols: number, rows: number, random: () => number): SnakeState {
  if (cols < 5 || rows < 5) throw new Error('Snake board must be at least 5x5');
  const cy = Math.floor(rows / 2);
  const cx = Math.floor(cols / 4) + 2;
  const snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  return {
    cols,
    rows,
    snake,
    direction: 'right',
    queue: [],
    food: placeFood(snake, cols, rows, random),
    score: 0,
    foodEaten: 0,
    alive: true,
    won: false,
    ticks: 0,
  };
}

/** Buffers a turn; ignores reversals and duplicates relative to the last pending direction. */
export function queueDirection(state: SnakeState, next: Direction): SnakeState {
  if (!state.alive) return state;
  const last = state.queue.at(-1) ?? state.direction;
  if (next === last || next === OPPOSITE[last] || state.queue.length >= MAX_QUEUED_TURNS) return state;
  return { ...state, queue: [...state.queue, next] };
}

/** Advances the game by one step. */
export function tick(state: SnakeState, random: () => number): SnakeState {
  if (!state.alive) return state;
  const [nextDirection = state.direction, ...rest] = state.queue;
  const head = state.snake[0]!;
  const delta = DELTAS[nextDirection];
  const newHead = { x: head.x + delta.x, y: head.y + delta.y };
  const eats = state.food !== null && samePoint(newHead, state.food);

  const outOfBounds = newHead.x < 0 || newHead.y < 0 || newHead.x >= state.cols || newHead.y >= state.rows;
  // The tail cell is vacated this tick unless the snake grows, so moving into it is legal.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  const hitsSelf = body.some((p) => samePoint(p, newHead));

  if (outOfBounds || hitsSelf) {
    return { ...state, direction: nextDirection, queue: rest, alive: false, ticks: state.ticks + 1 };
  }

  const snake = [newHead, ...body];
  const food = eats ? placeFood(snake, state.cols, state.rows, random) : state.food;
  const won = eats && food === null;
  return {
    ...state,
    snake,
    direction: nextDirection,
    queue: rest,
    food,
    score: eats ? state.score + POINTS_PER_FOOD : state.score,
    foodEaten: eats ? state.foodEaten + 1 : state.foodEaten,
    alive: !won,
    won,
    ticks: state.ticks + 1,
  };
}

/** Milliseconds between ticks: the snake speeds up as it eats, down to a floor. */
export function tickInterval(foodEaten: number): number {
  return Math.max(65, 150 - foodEaten * 3);
}
