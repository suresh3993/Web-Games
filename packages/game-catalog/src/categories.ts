export interface CatalogCategory {
  slug: string;
  name: string;
  description: string;
  /** lucide-react icon name rendered by the web app. */
  icon: string;
  accentColor: string;
  sortOrder: number;
}

export const CATEGORIES = ([
  { slug: 'arcade', name: 'Arcade', description: 'Fast reflexes, high scores and one-more-try action.', icon: 'Joystick', accentColor: '#7c5cff' },
  { slug: 'puzzle', name: 'Puzzle', description: 'Satisfying problems to untangle at your own pace.', icon: 'Puzzle', accentColor: '#22d3ee' },
  { slug: 'logic', name: 'Logic & Brain Training', description: 'Deduction, focus and pattern recognition workouts.', icon: 'Brain', accentColor: '#a78bfa' },
  { slug: 'racing', name: 'Racing', description: 'Speed, drifting and split-second lane changes.', icon: 'CarFront', accentColor: '#f97316' },
  { slug: 'sports', name: 'Sports', description: 'Quick-play takes on classic sports.', icon: 'Trophy', accentColor: '#22c55e' },
  { slug: 'strategy', name: 'Strategy', description: 'Plan ahead, outthink opponents and manage resources.', icon: 'Castle', accentColor: '#eab308' },
  { slug: 'board', name: 'Board Games', description: 'Timeless tabletop classics, digitised.', icon: 'Grid3x3', accentColor: '#38bdf8' },
  { slug: 'card', name: 'Card Games', description: 'Solitaire variants and table favourites — no real money, ever.', icon: 'Spade', accentColor: '#f43f5e' },
  { slug: 'casual', name: 'Casual', description: 'Relaxed games for a quick break.', icon: 'Sparkles', accentColor: '#ec4899' },
  { slug: 'platformer', name: 'Platformer', description: 'Run, jump and climb through handcrafted levels.', icon: 'Footprints', accentColor: '#14b8a6' },
  { slug: 'memory', name: 'Memory', description: 'Train recall with sequences, pairs and patterns.', icon: 'Layers', accentColor: '#818cf8' },
  { slug: 'word', name: 'Word Games', description: 'Spell, guess, unscramble and type.', icon: 'Type', accentColor: '#06b6d4' },
  { slug: 'math', name: 'Math Games', description: 'Arithmetic and number puzzles that make maths fun.', icon: 'Sigma', accentColor: '#84cc16' },
  { slug: 'multiplayer', name: 'Multiplayer', description: 'Play against a friend on the same device (online play is on the roadmap).', icon: 'Users', accentColor: '#fb7185' },
] as const).map((c, i) => ({ ...c, sortOrder: i + 1 })) satisfies CatalogCategory[];

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];
