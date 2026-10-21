import { describe, expect, it, vi } from 'vitest';
import type { GameHost, GameInstance, GameModule } from '../interfaces/game-module';
import { GameController, type ControllerEvent } from './game-controller';
import { createRng } from './random';

function fakeModule(overrides: Partial<GameModule['manifest']> = {}) {
  let host!: GameHost;
  const instance: GameInstance = {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
    finish: vi.fn(() => host.emit({ type: 'finished', result: { score: 7, outcome: 'quit', stats: {} } })),
    resize: vi.fn(),
    destroy: vi.fn(),
  };
  const module: GameModule = {
    manifest: {
      key: 'fake',
      version: '1.0.0',
      engine: 'CANVAS',
      input: { keyboard: true, touch: false, pointer: false },
      supportsPause: true,
      supportsSound: false,
      orientation: 'any',
      aspectRatio: 1,
      scoring: null,
      controls: [],
      ...overrides,
    },
    create: (h) => {
      host = h;
      return instance;
    },
  };
  return { module, instance, host: () => host };
}

function setup(overrides?: Partial<GameModule['manifest']>) {
  let time = 0;
  const fake = fakeModule(overrides);
  const visibility = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  visibility.visibilityState = 'visible';
  const controller = new GameController(fake.module, {
    container: {} as HTMLElement,
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    settings: { soundEnabled: true, reducedMotion: false },
    seed: 'fixed',
    visibilityTarget: visibility,
    now: () => time,
  });
  const events: ControllerEvent[] = [];
  controller.subscribe((e) => events.push(e));
  return { controller, ...fake, events, advance: (ms: number) => (time += ms), visibility };
}

describe('GameController lifecycle', () => {
  it('initializes idle and starts exactly once', () => {
    const { controller, instance } = setup();
    expect(controller.state).toBe('idle');
    expect(controller.start()).toBe(true);
    expect(controller.start()).toBe(false);
    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(controller.state).toBe('running');
  });

  it('pauses and resumes, excluding paused time from the duration', () => {
    const { controller, advance, host } = setup();
    controller.start();
    advance(1000);
    controller.pause();
    advance(5000);
    controller.resume();
    advance(500);
    host().emit({ type: 'finished', result: { score: 3, outcome: 'lost', stats: {} } });
    expect(controller.state).toBe('finished');
    expect(controller.elapsedMs).toBe(1500);
  });

  it('rejects invalid transitions', () => {
    const { controller } = setup();
    expect(controller.pause()).toBe(false);
    expect(controller.resume()).toBe(false);
    expect(controller.restart()).toBe(false);
    expect(controller.finish()).toBe(false);
  });

  it('does not pause games that do not support it', () => {
    const { controller } = setup({ supportsPause: false });
    controller.start();
    expect(controller.pause()).toBe(false);
    expect(controller.state).toBe('running');
  });

  it('sanitises scores and reports the finished round with host-measured duration', () => {
    const { controller, events, advance, host } = setup();
    controller.start();
    host().emit({ type: 'score', score: 12.9 });
    host().emit({ type: 'score', score: Number.NaN });
    host().emit({ type: 'score', score: 40 });
    advance(2000);
    host().emit({ type: 'finished', result: { score: -5, outcome: 'lost', stats: { foo: 1 } } });
    const finished = events.find((e) => e.type === 'finished');
    expect(events.filter((e) => e.type === 'score').map((e) => (e as { score: number }).score)).toEqual([12, 0, 40]);
    expect(finished).toEqual({
      type: 'finished',
      round: { score: 0, outcome: 'lost', stats: { foo: 1 }, durationMs: 2000, seed: 'fixed' },
    });
  });

  it('ignores game events after the round has finished', () => {
    const { controller, events, host } = setup();
    controller.start();
    host().emit({ type: 'finished', result: { score: 1, outcome: 'won', stats: {} } });
    host().emit({ type: 'score', score: 999 });
    host().emit({ type: 'finished', result: { score: 999, outcome: 'won', stats: {} } });
    expect(events.filter((e) => e.type === 'finished')).toHaveLength(1);
    expect(controller.score).toBe(1);
  });

  it('finish() ends the round via the game and restart() begins a fresh one', () => {
    const { controller, instance, advance } = setup();
    controller.start();
    advance(300);
    expect(controller.finish()).toBe(true);
    expect(controller.state).toBe('finished');
    expect(controller.score).toBe(7);
    expect(controller.restart()).toBe(true);
    expect(instance.restart).toHaveBeenCalledOnce();
    expect(controller.state).toBe('running');
    expect(controller.score).toBe(0);
    expect(controller.elapsedMs).toBe(0);
  });

  it('restart() while running restarts the clock', () => {
    const { controller, advance } = setup();
    controller.start();
    advance(1000);
    controller.restart();
    advance(250);
    expect(controller.elapsedMs).toBe(250);
  });

  it('auto-pauses when the page becomes hidden', () => {
    const { controller, visibility } = setup();
    controller.start();
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(controller.state).toBe('paused');
  });

  it('destroy() cleans up once, detaches listeners and blocks further use', () => {
    const { controller, instance, visibility } = setup();
    controller.start();
    controller.destroy();
    controller.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(controller.state).toBe('destroyed');
    expect(controller.start()).toBe(false);
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(controller.state).toBe('destroyed');
  });

  it('surfaces exceptions thrown by a module as error events instead of crashing the host', () => {
    const { controller, instance, events } = setup();
    vi.mocked(instance.start).mockImplementation(() => {
      throw new Error('boom');
    });
    controller.start();
    expect(events).toContainEqual({ type: 'error', message: 'boom' });
  });
});

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    const values = Array.from({ length: 1000 }, () => a());
    expect(values.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng('other')()).not.toBe(values[0]);
  });
});
