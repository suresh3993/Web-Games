/** Shared helpers for game modules. All randomness must come from the host's seeded RNG. */

export type Rng = () => number;

export const randInt = (random: Rng, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
export const randFloat = (random: Rng, min: number, max: number) => min + random() * (max - min);
export const pick = <T>(random: Rng, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
export const chance = (random: Rng, p: number) => random() < p;

export function shuffle<T>(random: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function grid<T>(rows: number, cols: number, fill: (r: number, c: number) => T): T[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fill(r, c)));
}

export const ORTHO: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
export const ALL8: readonly [number, number][] = [...ORTHO, [-1, -1], [-1, 1], [1, -1], [1, 1]];

export const inBounds = (r: number, c: number, rows: number, cols: number) => r >= 0 && c >= 0 && r < rows && c < cols;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for safe interpolation into HTML strings. */
export const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** Axis-aligned rectangle overlap. */
export const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Circle vs rectangle overlap. */
export function circleRect(cx: number, cy: number, r: number, rect: { x: number; y: number; w: number; h: number }) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
