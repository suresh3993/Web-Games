/**
 * Server-side plausibility checks for client-reported rounds.
 *
 * Browser games run on the player's machine, so a determined cheater can always
 * forge a request. These checks catch the obvious cases; rounds that fail are stored
 * with `flagged = true` (kept for review, hidden from leaderboards and personal
 * bests, worth no XP). The server-issued seed leaves room for replay verification later.
 */

/** A positive score in less active time than this is not humanly possible in any catalog game. */
export const MIN_SCORED_ROUND_MS = 1_000;
/** Allowed drift between the client's active-time measurement and the server's wall clock. */
export const CLOCK_TOLERANCE_MS = 5_000;

export type PlausibilityFlag = 'score_above_max' | 'duration_exceeds_wall_clock' | 'round_too_short';

export interface RoundClaim {
  score: number;
  /** Active play time reported by the client. */
  claimedMs: number;
  /** Server time between session start and submission. */
  wallMs: number;
  /** Per-game ceiling from the runtime manifest (null = no ceiling). */
  maxScore: number | null;
}

export function checkRound(claim: RoundClaim): { durationMs: number; flags: PlausibilityFlag[] } {
  const flags: PlausibilityFlag[] = [];
  if (claim.maxScore !== null && claim.score > claim.maxScore) flags.push('score_above_max');
  if (claim.claimedMs > claim.wallMs + CLOCK_TOLERANCE_MS) flags.push('duration_exceeds_wall_clock');
  // Active time can never exceed the time the session has existed.
  const durationMs = Math.max(0, Math.min(claim.claimedMs, claim.wallMs));
  if (claim.score > 0 && durationMs < MIN_SCORED_ROUND_MS) flags.push('round_too_short');
  return { durationMs, flags };
}
