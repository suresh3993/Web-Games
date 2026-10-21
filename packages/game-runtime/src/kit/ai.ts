import type { Rng } from './util';

/** A two-player, zero-sum, turn-based game for the generic search below. */
export interface TurnGame<S, M> {
  moves(state: S): M[];
  play(state: S, move: M): S;
  /** Static evaluation from the perspective of the player to move. */
  evaluate(state: S): number;
  isOver(state: S): boolean;
}

const WIN = 1_000_000;

/** Negamax with alpha-beta pruning. Returns the score for the player to move. */
export function negamax<S, M>(game: TurnGame<S, M>, state: S, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isOver(state)) return game.evaluate(state);
  const moves = game.moves(state);
  if (!moves.length) return game.evaluate(state);
  let best = -Infinity;
  for (const move of moves) {
    const value = -negamax(game, game.play(state, move), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Picks the best move at `depth`, breaking ties randomly so the computer does not
 * always play identically. `blunder` (0–1) occasionally picks a random move for
 * easier difficulty levels.
 */
export function bestMove<S, M>(game: TurnGame<S, M>, state: S, depth: number, random: Rng, blunder = 0): M | null {
  const moves = game.moves(state);
  if (!moves.length) return null;
  if (blunder > 0 && random() < blunder) return moves[Math.floor(random() * moves.length)]!;
  let best = -Infinity;
  let candidates: M[] = [];
  for (const move of moves) {
    const value = -negamax(game, game.play(state, move), depth - 1, -Infinity, Infinity);
    if (value > best + 1e-9) {
      best = value;
      candidates = [move];
    } else if (Math.abs(value - best) <= 1e-9) {
      candidates.push(move);
    }
  }
  return candidates[Math.floor(random() * candidates.length)]!;
}

export { WIN };
