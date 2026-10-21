/** Shared "who are you playing against" selector for board games. */
export type Opponent = 'easy' | 'medium' | 'hard' | '2p';

export const OPPONENTS: readonly Opponent[] = ['easy', 'medium', 'hard', '2p'];

const LABELS: Record<Opponent, string> = { easy: 'CPU · Easy', medium: 'CPU · Medium', hard: 'CPU · Hard', '2p': '2 Players' };

/** Points multiplier: games against a friend are just for fun (no leaderboard points). */
export const OPPONENT_MULTIPLIER: Record<Opponent, number> = { easy: 1, medium: 2, hard: 3, '2p': 0 };

export function opponentBar(current: Opponent, locked: boolean, only: readonly Opponent[] = OPPONENTS): string {
  return `<div class="pv-row" role="group" aria-label="Opponent">${only
    .map(
      (o) =>
        `<button type="button" class="pv-btn small${o === current ? ' primary' : ''}" data-action="opponent" data-value="${o}" aria-pressed="${o === current}" ${locked ? 'disabled' : ''}>${LABELS[o]}</button>`,
    )
    .join('')}</div>`;
}

/** Standard result scoring for a single game against the computer. */
export function versusScore(opponent: Opponent, result: 'won' | 'draw' | 'lost', bonus = 0): number {
  const m = OPPONENT_MULTIPLIER[opponent];
  if (result === 'won') return 100 * m + bonus * m;
  if (result === 'draw') return 30 * m;
  return 0;
}
