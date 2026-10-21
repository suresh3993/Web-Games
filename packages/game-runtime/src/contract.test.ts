// @vitest-environment jsdom
/**
 * Contract test run against EVERY registered game module:
 * create → start → fuzzed input (keys, pointer, buttons) → pause/resume → restart →
 * more input → finish → destroy, asserting no exceptions, exactly one `finished`
 * event per round, a clean container and no leaked window listeners.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameController, type ControllerEvent } from './core/game-controller';
import { createRng } from './core/random';
import { loadGameModule, RUNTIME_KEYS } from './registry';

/** A permissive CanvasRenderingContext2D stand-in that accepts any call. */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { canvas, globalAlpha: 1, lineWidth: 1, font: '10px sans-serif' };
  const gradient = { addColorStop: () => undefined };
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop in store) return store[prop];
      if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (prop === 'getImageData' || prop === 'createImageData') return (_x: number, _y: number, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (prop === 'isPointInPath') return () => false;
      return () => gradient;
    },
    set(_t, prop, value) {
      store[prop] = value;
      return true;
    },
  };
  return new Proxy({}, handler) as CanvasRenderingContext2D;
}

const KEY_CODES = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Backspace', 'Escape',
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyR', 'KeyF', 'KeyH', 'KeyN', 'KeyT', 'KeyO', 'KeyU',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit7', 'Digit9', 'ShiftLeft',
];

function keyFor(code: string) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return ' ';
  if (code === 'ShiftLeft') return 'Shift';
  return code;
}

function pointer(target: EventTarget, type: string, x: number, y: number) {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  target.dispatchEvent(new Ctor(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
}

function fuzz(container: HTMLElement, rnd: () => number, steps: number) {
  for (let i = 0; i < steps; i++) {
    const r = rnd();
    if (r < 0.35) {
      const code = KEY_CODES[Math.floor(rnd() * KEY_CODES.length)]!;
      const init = { code, key: keyFor(code), bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      vi.advanceTimersByTime(Math.floor(rnd() * 60));
      window.dispatchEvent(new KeyboardEvent('keyup', init));
    } else if (r < 0.6) {
      const canvas = container.querySelector('canvas') ?? container.firstElementChild;
      if (canvas) {
        const x = rnd() * 800;
        const y = rnd() * 600;
        pointer(canvas, 'pointerdown', x, y);
        pointer(canvas, 'pointermove', x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200);
        vi.advanceTimersByTime(Math.floor(rnd() * 80));
        pointer(canvas, 'pointerup', x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200);
      }
    } else {
      const buttons = [...container.querySelectorAll<HTMLElement>('[data-action]:not([disabled])')];
      const el = buttons[Math.floor(rnd() * buttons.length)];
      if (el) {
        if (rnd() < 0.1) el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        else el.click();
      }
    }
    vi.advanceTimersByTime(Math.floor(rnd() * 120));
  }
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return fakeContext(this);
  } as unknown as HTMLCanvasElement['getContext'];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('game module contract', () => {
  it('has a registry entry for every module (sanity)', () => {
    expect(RUNTIME_KEYS.length).toBeGreaterThan(0);
  });

  it.each(RUNTIME_KEYS)('%s survives a full lifecycle with fuzzed input', async (key) => {
    const module = await loadGameModule(key);
    expect(module.manifest.key).toBe(key);
    if (module.manifest.scoring) expect(module.manifest.scoring.maxScore).toBeGreaterThan(0);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });

    // Track window listeners so leaks are detected after destroy().
    const live = new Map<string, number>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    const ids = new WeakMap<object, number>();
    let next = 0;
    const id = (fn: unknown) => {
      if (typeof fn !== 'function' && (typeof fn !== 'object' || fn === null)) return -1;
      if (!ids.has(fn as object)) ids.set(fn as object, next++);
      return ids.get(fn as object)!;
    };
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      const k = `${type}#${id(fn)}`;
      live.set(k, (live.get(k) ?? 0) + 1);
      add(type, fn, opts);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      const k = `${type}#${id(fn)}`;
      const n = (live.get(k) ?? 0) - 1;
      if (n <= 0) live.delete(k);
      else live.set(k, n);
      remove(type, fn, opts);
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const controller = new GameController(module, {
      container,
      viewport: { width: 800, height: 600, devicePixelRatio: 1 },
      settings: { soundEnabled: true, reducedMotion: false },
      seed: `contract-${key}`,
    });
    const events: ControllerEvent[] = [];
    controller.subscribe((e) => events.push(e));
    const rnd = createRng(`fuzz-${key}`);

    expect(controller.start()).toBe(true);
    expect(container.childElementCount).toBeGreaterThan(0);
    vi.advanceTimersByTime(500);
    // Typed text must never reach the DOM as markup (DOM games render HTML strings).
    for (const key of '<pv-xss>') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(30);
    }
    fuzz(container, rnd, 60);
    expect(container.querySelector('pv-xss'), 'typed input injected as HTML').toBeNull();

    // Sustained input: hold each direction for a while (edge cases such as reversing off the map).
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) {
      const init = { code, key: keyFor(code), bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      vi.advanceTimersByTime(3000);
      window.dispatchEvent(new KeyboardEvent('keyup', init));
    }

    controller.pause();
    vi.advanceTimersByTime(1000);
    controller.resume();
    controller.resize({ width: 390, height: 700, devicePixelRatio: 2 });
    fuzz(container, rnd, 40);

    // Restart is allowed while running, paused or finished.
    expect(controller.restart()).toBe(true);
    vi.advanceTimersByTime(300);
    fuzz(container, rnd, 60);

    if (controller.state === 'running' || controller.state === 'paused') controller.finish();
    expect(controller.state).toBe('finished');

    const errors = events.filter((e) => e.type === 'error');
    expect(errors, JSON.stringify(errors)).toEqual([]);
    const finished = events.filter((e): e is Extract<ControllerEvent, { type: 'finished' }> => e.type === 'finished');
    expect(finished.length).toBeGreaterThanOrEqual(1);
    // At most one `finished` per round: rounds = initial + 1 restart.
    expect(finished.length).toBeLessThanOrEqual(2);
    for (const f of finished) {
      expect(Number.isInteger(f.round.score)).toBe(true);
      if (module.manifest.scoring) expect(f.round.score).toBeLessThanOrEqual(module.manifest.scoring.maxScore);
      // Same limits the API applies to submitted stats (finishGameSessionSchema).
      const stats = Object.entries(f.round.stats);
      expect(stats.length).toBeLessThanOrEqual(24);
      for (const [name, value] of stats) {
        expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
        expect(Number.isFinite(value), `${name}=${value}`).toBe(true);
      }
    }
    // Leaderboards and personal bests assume higher scores are better.
    if (module.manifest.scoring) expect(module.manifest.scoring.order).toBe('higher-is-better');

    controller.destroy();
    expect(container.childElementCount).toBe(0);
    expect([...live.keys()], 'window listeners leaked after destroy()').toEqual([]);
    // Nothing keeps running after destroy.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    // Simulating ~20 s of play (AI opponents included) is CPU-bound: up to ~3 s on a fast machine,
    // so give slower CI runners room instead of the 5 s default.
  }, 30_000);
});
