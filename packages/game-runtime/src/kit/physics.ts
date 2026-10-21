/** Minimal 2D physics helpers for ball games (pool, bowling, air hockey, golf). */

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Mass (defaults to 1). Infinity = immovable. */
  m?: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function closestPointOnSegment(px: number, py: number, s: Segment) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  return { x: s.x1 + t * dx, y: s.y1 + t * dy };
}

/** Resolves overlap and reflects velocity off a wall segment. Returns true on contact. */
export function bounceOffSegment(b: Body, s: Segment, restitution = 0.9): boolean {
  const c = closestPointOnSegment(b.x, b.y, s);
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d >= b.r || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  b.x = c.x + nx * b.r;
  b.y = c.y + ny * b.r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
  }
  return true;
}

/** Elastic collision between two circles (with optional restitution). Returns true on contact. */
export function collideBodies(a: Body, b: Body, restitution = 0.95): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  const ma = a.m ?? 1;
  const mb = b.m ?? 1;
  const invA = ma === Infinity ? 0 : 1 / ma;
  const invB = mb === Infinity ? 0 : 1 / mb;
  const overlap = minD - d;
  const total = invA + invB || 1;
  a.x -= nx * overlap * (invA / total);
  a.y -= ny * overlap * (invA / total);
  b.x += nx * overlap * (invB / total);
  b.y += ny * overlap * (invB / total);
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = (-(1 + restitution) * rel) / total;
    a.vx -= j * invA * nx;
    a.vy -= j * invA * ny;
    b.vx += j * invB * nx;
    b.vy += j * invB * ny;
  }
  return true;
}

/** Applies rolling friction; zeroes tiny velocities. */
export function applyFriction(b: Body, perSecond: number, dt: number, stopBelow = 4) {
  const f = Math.pow(perSecond, dt);
  b.vx *= f;
  b.vy *= f;
  if (Math.hypot(b.vx, b.vy) < stopBelow) b.vx = b.vy = 0;
}

export const speed = (b: Body) => Math.hypot(b.vx, b.vy);

/** Rectangle as four wall segments (inside-facing collisions). */
export function rectWalls(x: number, y: number, w: number, h: number): Segment[] {
  return [
    { x1: x, y1: y, x2: x + w, y2: y },
    { x1: x + w, y1: y, x2: x + w, y2: y + h },
    { x1: x + w, y1: y + h, x2: x, y2: y + h },
    { x1: x, y1: y + h, x2: x, y2: y },
  ];
}
