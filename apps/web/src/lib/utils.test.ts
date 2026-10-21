import { describe, expect, it } from 'vitest';
import { safeRedirect } from './utils';

describe('safeRedirect', () => {
  it('allows same-site relative paths', () => {
    expect(safeRedirect('/games/snake?x=1')).toBe('/games/snake?x=1');
  });

  it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'falls back for unsafe target %s',
    (target) => {
      expect(safeRedirect(target)).toBe('/');
    },
  );
});
