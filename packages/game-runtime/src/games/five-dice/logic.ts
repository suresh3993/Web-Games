import { counts } from '../../kit/dice';

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'fiveKind', 'chance',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LABELS: Record<Category, string> = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  threeKind: 'Three of a kind', fourKind: 'Four of a kind', fullHouse: 'Full house (25)',
  smallStraight: 'Small straight (30)', largeStraight: 'Large straight (40)', fiveKind: 'Five of a kind (50)', chance: 'Chance',
};

const hasRun = (c: number[], len: number) => {
  let run = 0;
  for (let v = 1; v <= 6; v++) {
    run = c[v]! ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
};

export function scoreCategory(cat: Category, dice: number[]): number {
  const c = counts(dice);
  const total = dice.reduce((a, b) => a + b, 0);
  const upper = CATEGORIES.indexOf(cat);
  if (upper < 6) return c[upper + 1]! * (upper + 1);
  const max = Math.max(...c);
  switch (cat) {
    case 'threeKind':
      return max >= 3 ? total : 0;
    case 'fourKind':
      return max >= 4 ? total : 0;
    case 'fullHouse':
      return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'smallStraight':
      return hasRun(c, 4) ? 30 : 0;
    case 'largeStraight':
      return hasRun(c, 5) ? 40 : 0;
    case 'fiveKind':
      return max === 5 ? 50 : 0;
    default:
      return total;
  }
}

/** Card total including the 35-point upper bonus (upper section ≥ 63). */
export function cardTotal(card: Partial<Record<Category, number>>): { upper: number; bonus: number; total: number } {
  const upper = CATEGORIES.slice(0, 6).reduce((s, k) => s + (card[k] ?? 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = CATEGORIES.slice(6).reduce((s, k) => s + (card[k] ?? 0), 0);
  return { upper, bonus, total: upper + bonus + lower };
}
