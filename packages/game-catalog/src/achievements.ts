import type { AchievementCriteria, AchievementIcon } from '@playverse/shared-types';

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  xpReward: number;
  criteria: AchievementCriteria;
}

/**
 * Launch set of achievements. The seed creates any that are missing and never
 * overwrites existing ones, so changes made by admins survive re-seeding.
 * Game-specific thresholds follow each game's scoring rules (e.g. Snake: 10 points per food).
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: 'first-round', name: 'First Steps', description: 'Finish your first round of any game.', icon: 'Gamepad2', xpReward: 25, criteria: { type: 'rounds_played', count: 1 } },
  { key: 'regular', name: 'Regular', description: 'Finish 25 rounds.', icon: 'Flame', xpReward: 75, criteria: { type: 'rounds_played', count: 25 } },
  { key: 'devoted', name: 'Devoted', description: 'Finish 100 rounds.', icon: 'Crown', xpReward: 200, criteria: { type: 'rounds_played', count: 100 } },
  { key: 'explorer', name: 'Explorer', description: 'Play 5 different games.', icon: 'Compass', xpReward: 50, criteria: { type: 'distinct_games', count: 5 } },
  { key: 'globetrotter', name: 'Globetrotter', description: 'Play 25 different games.', icon: 'Map', xpReward: 150, criteria: { type: 'distinct_games', count: 25 } },
  { key: 'completionist', name: 'Completionist', description: 'Play 100 different games.', icon: 'Gem', xpReward: 500, criteria: { type: 'distinct_games', count: 100 } },
  { key: 'first-win', name: 'First Victory', description: 'Win a round of any game.', icon: 'Trophy', xpReward: 25, criteria: { type: 'wins', count: 1 } },
  { key: 'champion', name: 'Champion', description: 'Win 25 rounds.', icon: 'Medal', xpReward: 150, criteria: { type: 'wins', count: 25 } },
  { key: 'rising-star', name: 'Rising Star', description: 'Reach level 5.', icon: 'Star', xpReward: 50, criteria: { type: 'level_reached', level: 5 } },
  { key: 'veteran', name: 'Veteran', description: 'Reach level 10.', icon: 'Award', xpReward: 150, criteria: { type: 'level_reached', level: 10 } },
  { key: 'marathon', name: 'Marathon', description: 'Play for 60 minutes in total.', icon: 'Timer', xpReward: 75, criteria: { type: 'play_minutes', minutes: 60 } },
  { key: 'board-game-buff', name: 'Board Game Buff', description: 'Play 5 different board games.', icon: 'Swords', xpReward: 75, criteria: { type: 'category_games', category: 'board', count: 5 } },
  { key: 'card-shark', name: 'Card Shark', description: 'Play 5 different card games.', icon: 'Heart', xpReward: 75, criteria: { type: 'category_games', category: 'card', count: 5 } },
  { key: 'puzzler', name: 'Puzzler', description: 'Play 5 different puzzle games.', icon: 'Puzzle', xpReward: 75, criteria: { type: 'category_games', category: 'puzzle', count: 5 } },
  { key: 'daily-driver', name: 'Daily Driver', description: 'Complete a daily challenge.', icon: 'CalendarCheck', xpReward: 25, criteria: { type: 'daily_challenges', count: 1 } },
  { key: 'dedicated', name: 'Dedicated', description: 'Complete 10 daily challenges.', icon: 'Rocket', xpReward: 150, criteria: { type: 'daily_challenges', count: 10 } },
  { key: 'snake-charmer', name: 'Snake Charmer', description: 'Score 200 points in Snake.', icon: 'Target', xpReward: 50, criteria: { type: 'score_at_least', game: 'snake', value: 200 } },
  { key: 'line-clearer', name: 'Line Clearer', description: 'Score 2,000 points in Block Puzzle.', icon: 'Zap', xpReward: 50, criteria: { type: 'score_at_least', game: 'block-puzzle', value: 2000 } },
  { key: 'checkmate', name: 'Checkmate', description: 'Beat the computer at Chess.', icon: 'Brain', xpReward: 100, criteria: { type: 'wins', count: 1, game: 'chess' } },
  { key: 'defuser', name: 'Defuser', description: 'Clear a Minesweeper board.', icon: 'Sparkles', xpReward: 50, criteria: { type: 'wins', count: 1, game: 'minesweeper' } },
  { key: 'number-cruncher', name: 'Number Cruncher', description: 'Solve a Sudoku.', icon: 'Brain', xpReward: 50, criteria: { type: 'wins', count: 1, game: 'sudoku' } },
];
