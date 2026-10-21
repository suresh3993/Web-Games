import { describe, expect, it } from 'vitest';
import { applyFriction, bounceOffSegment, collideBodies, type Body } from './physics';

describe('physics kit', () => {
  it('equal-mass head-on elastic collision swaps velocities', () => {
    const a: Body = { x: 0, y: 0, vx: 10, vy: 0, r: 5 };
    const b: Body = { x: 9, y: 0, vx: 0, vy: 0, r: 5 };
    expect(collideBodies(a, b, 1)).toBe(true);
    expect(a.vx).toBeCloseTo(0);
    expect(b.vx).toBeCloseTo(10);
  });

  it('conserves momentum with unequal masses', () => {
    const a: Body = { x: 0, y: 0, vx: 6, vy: 0, r: 5, m: 2 };
    const b: Body = { x: 9, y: 0, vx: -3, vy: 0, r: 5, m: 1 };
    const before = 2 * 6 + 1 * -3;
    collideBodies(a, b, 0.8);
    expect(2 * a.vx + 1 * b.vx).toBeCloseTo(before);
  });

  it('an immovable body reflects the other', () => {
    const wall: Body = { x: 0, y: 0, vx: 0, vy: 0, r: 10, m: Infinity };
    const ball: Body = { x: 0, y: 14, vx: 0, vy: -10, r: 5 };
    collideBodies(wall, ball, 1);
    expect(ball.vy).toBeCloseTo(10);
    expect(wall.x).toBe(0);
  });

  it('bounces off a wall segment and pushes the ball out', () => {
    const b: Body = { x: 5, y: 3, vx: 0, vy: -20, r: 5 };
    expect(bounceOffSegment(b, { x1: 0, y1: 0, x2: 10, y2: 0 }, 1)).toBe(true);
    expect(b.vy).toBeCloseTo(20);
    expect(b.y).toBeCloseTo(5);
  });

  it('friction eventually stops a body', () => {
    const b: Body = { x: 0, y: 0, vx: 100, vy: 0, r: 5 };
    for (let k = 0; k < 600; k++) applyFriction(b, 0.4, 1 / 60);
    expect(b.vx).toBe(0);
  });
});
