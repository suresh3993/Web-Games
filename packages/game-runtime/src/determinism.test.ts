import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Games must draw randomness only from the host's seeded RNG so rounds can be
 * replayed and verified, and must never touch storage, cookies or the network.
 */
const root = join(__dirname);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
const sources = [...files(join(root, 'games')), ...files(join(root, 'kit'))].map((p) => ({ p, src: readFileSync(p, 'utf8') }));

describe('game module rules', () => {
  it.each([
    ['Math.random', /Math\.random\(/],
    ['localStorage', /localStorage|sessionStorage|indexedDB/],
    ['cookies', /document\.cookie/],
    ['network', /\bfetch\(|XMLHttpRequest|WebSocket\(/],
    ['navigation', /location\.(href|assign|replace)|window\.open\(/],
    ['eval', /\beval\(|new Function\(/],
    // Inline handlers are blocked by the site's Content Security Policy (script-src 'self').
    ['inline event handlers', /\son[a-z]+=["']/],
  ])('no %s in game code', (_name, pattern) => {
    const offenders = sources.filter(({ src }) => pattern.test(src)).map(({ p }) => p.replace(root, ''));
    expect(offenders).toEqual([]);
  });
});
