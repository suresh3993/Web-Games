import { useCallback, useEffect, useRef, useState } from 'react';
import { GameController, loadGameModule, type FinishedRound, type GameModule, type Viewport } from '@playverse/game-runtime';
import type { GameSessionResult, GameSessionStart } from '@playverse/shared-types';
import { MAX_ROUND_MS, SCORE_HARD_LIMIT, type FinishGameSessionInput } from '@playverse/validation';
import { isApiError } from '@/lib/api';
import { finishGameSession, sendHeartbeat, startGameSession, useInvalidateAfterRound } from './api';

export type PlayerPhase = 'loading' | 'load-error' | 'ready' | 'starting' | 'running' | 'paused' | 'submitting' | 'finished';

export interface RoundSummary {
  round: FinishedRound;
  preview: boolean;
  /** Null when the submission failed (see `error`). */
  result: GameSessionResult | null;
  error: string | null;
}

const HEARTBEAT_MS = 60_000;
const SOUND_KEY = 'pv:sound';

// Sound preference is a per-browser convenience; it must work without storage.
function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeSoundPreference(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable (private mode, blocked): keep the setting for this page only.
  }
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const STAT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** Shapes a finished round into a submission the API accepts (mirrors finishGameSessionSchema). */
export function toSubmission(round: FinishedRound): FinishGameSessionInput {
  const stats = Object.fromEntries(
    Object.entries(round.stats ?? {})
      .filter(([name, value]) => STAT_NAME.test(name) && Number.isFinite(value))
      .slice(0, 24),
  );
  return {
    score: Math.min(SCORE_HARD_LIMIT, Math.max(0, Math.floor(round.score))),
    outcome: round.outcome,
    durationMs: Math.min(MAX_ROUND_MS, Math.max(0, Math.round(round.durationMs))),
    stats,
  };
}

/**
 * Drives one game on the player page: lazy-loads its module, starts a server
 * session per round (seeded by the server), runs a `GameController`, keeps the
 * session alive, submits the result exactly once and cleans everything up.
 *
 * Rounds ended by restarting or leaving the page are submitted "silently" (as
 * `quit`) so the play still counts but no result screen is shown.
 */
export function useGameRunner(slug: string, runtimeKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const silentRef = useRef(false);
  const mountedRef = useRef(true);
  const [module, setModule] = useState<GameModule | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [score, setScore] = useState(0);
  const [session, setSession] = useState<GameSessionStart | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const soundRef = useRef(soundEnabled);
  const invalidate = useInvalidateAfterRound();

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    loadGameModule(runtimeKey).then(
      (loaded) => {
        if (cancelled) return;
        setModule(loaded);
        setPhase('ready');
      },
      () => {
        if (!cancelled) setPhase('load-error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runtimeKey, loadAttempt]);

  const viewport = useCallback((): Viewport => {
    const el = containerRef.current;
    return { width: el?.clientWidth || 1, height: el?.clientHeight || 1, devicePixelRatio: window.devicePixelRatio || 1 };
  }, []);

  /** Gives keyboard input back to the game after a page control was used. */
  const focusGame = useCallback(() => {
    const container = containerRef.current;
    const canvas = container?.querySelector('canvas');
    if (canvas) canvas.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement && !container?.contains(document.activeElement)) document.activeElement.blur();
  }, []);

  const submit = useCallback(
    async (s: GameSessionStart, round: FinishedRound, silent: boolean) => {
      if (!silent) setPhase('submitting');
      let result: GameSessionResult | null = null;
      let message: string | null = null;
      try {
        result = await finishGameSession(s.id, toSubmission(round));
        invalidate(slug);
      } catch (err) {
        message = isApiError(err) ? err.message : 'Your score could not be saved.';
      }
      if (silent || !mountedRef.current) return;
      setSummary({ round, preview: s.preview, result, error: message });
      setPhase('finished');
    },
    [invalidate, slug],
  );

  /** Ends the current round without showing the result screen (restart / leaving). */
  const endSilently = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || (controller.state !== 'running' && controller.state !== 'paused')) return;
    silentRef.current = true;
    try {
      controller.finish();
    } finally {
      silentRef.current = false;
    }
  }, []);

  const startRound = useCallback(async () => {
    const container = containerRef.current;
    if (!module || !container) return;
    endSilently();
    setPhase('starting');
    setError(null);
    setSummary(null);
    setScore(0);

    let s: GameSessionStart;
    try {
      s = await startGameSession(slug);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(isApiError(err) ? err.message : 'The game could not be started. Please try again.');
      setPhase('ready');
      return;
    }
    if (!mountedRef.current) return;

    controllerRef.current?.destroy();
    container.replaceChildren();
    const controller = new GameController(module, {
      container,
      viewport: viewport(),
      seed: s.seed,
      visibilityTarget: document,
      settings: { soundEnabled: soundRef.current, reducedMotion: prefersReducedMotion() },
    });
    controller.subscribe((event) => {
      if (controllerRef.current !== controller) return;
      switch (event.type) {
        case 'state':
          if (event.state === 'running' || event.state === 'paused') setPhase(event.state);
          break;
        case 'score':
          setScore(event.score);
          break;
        case 'finished':
          void submit(s, event.round, silentRef.current);
          break;
        case 'error':
          setError(`The game reported a problem: ${event.message}`);
          break;
      }
    });
    controllerRef.current = controller;
    setSession(s);
    controller.start();
    focusGame();
  }, [endSilently, focusGame, module, slug, submit, viewport]);

  const pause = useCallback(() => controllerRef.current?.pause(), []);
  const resume = useCallback(() => {
    if (controllerRef.current?.resume()) focusGame();
  }, [focusGame]);
  const endRound = useCallback(() => controllerRef.current?.finish(), []);
  const retryLoad = useCallback(() => setLoadAttempt((n) => n + 1), []);

  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundEnabled(next);
    writeSoundPreference(next);
    controllerRef.current?.updateSettings({ soundEnabled: next, reducedMotion: prefersReducedMotion() });
  }, []);

  // Keep the game sized to its container (window resize, orientation change, fullscreen).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => controllerRef.current?.resize(viewport()));
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewport]);

  const inProgress = phase === 'running' || phase === 'paused';

  useEffect(() => {
    if (!session || !inProgress) return;
    const id = window.setInterval(() => void sendHeartbeat(session.id).catch(() => undefined), HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [session, inProgress]);

  // Closing or reloading the tab mid-round: ask first, and submit the round if they go
  // (the submission uses fetch keepalive, so it survives the page going away).
  useEffect(() => {
    if (!inProgress) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', endSilently);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', endSilently);
    };
  }, [inProgress, endSilently]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      endSilently();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [endSilently]);

  return {
    containerRef,
    manifest: module?.manifest ?? null,
    phase,
    inProgress,
    score,
    session,
    summary,
    error,
    soundEnabled,
    startRound,
    pause,
    resume,
    endRound,
    endSilently,
    retryLoad,
    toggleSound,
    dismissError: () => setError(null),
  };
}

export type GameRunner = ReturnType<typeof useGameRunner>;
