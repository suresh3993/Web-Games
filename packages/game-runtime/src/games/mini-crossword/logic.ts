import { shuffle, type Rng } from '../../kit/util';

/** Original clues written for PLAYVERSE. */
export const CLUES: [string, string][] = [
  ['orbit', 'Path a moon follows'], ['piano', 'Instrument with 88 keys'], ['tiger', 'Striped big cat'], ['ocean', 'The Pacific, for one'],
  ['lemon', 'Sour yellow citrus'], ['eagle', 'Bird on many emblems'], ['robot', 'Machine helper in sci-fi'], ['pixel', 'Tiny dot on a screen'],
  ['river', 'It flows to the sea'], ['crown', 'Royal headwear'], ['bread', 'Baker’s loaf'], ['storm', 'Thunder and lightning event'],
  ['tower', 'Tall narrow building'], ['chess', 'Game with knights and bishops'], ['honey', 'Sweet bee product'], ['music', 'Melody and rhythm'],
  ['cloud', 'Puffy sky formation'], ['plant', 'Grows in a pot'], ['smile', 'Happy expression'], ['zebra', 'Striped grazer'],
  ['arena', 'Stadium floor'], ['radio', 'Broadcast receiver'], ['laser', 'Focused beam of light'], ['dream', 'Night-time story in your head'],
  ['map', 'Guide for travellers'], ['owl', 'Night bird that hoots'], ['ice', 'Frozen water'], ['sun', 'Our nearest star'],
  ['egg', 'Breakfast item in a shell'], ['ant', 'Tiny colony insect'], ['key', 'Opens a lock'], ['tea', 'Brewed leaf drink'],
  ['art', 'Painting or sculpture'], ['ore', 'Raw mined metal rock'], ['era', 'Long period of history'], ['ink', 'Pen fluid'],
  ['nest', 'Bird’s home'], ['moon', 'It has phases'], ['game', 'Something to play'], ['star', 'Twinkler in the night'],
  ['rain', 'Falling water drops'], ['sail', 'Catches wind on a boat'], ['note', 'Short written message'], ['snow', 'Winter flakes'],
  ['team', 'Group of players'], ['iron', 'Metal used in steel'], ['echo', 'Sound bouncing back'], ['door', 'Way into a room'],
  ['seed', 'Start of a plant'], ['road', 'Way for cars'], ['tree', 'Has a trunk and leaves'], ['idea', 'A bright thought'],
  ['oasis', 'Desert water spot'], ['apron', 'Kitchen garment'], ['alarm', 'Wake-up sound'], ['angle', 'Corner measure in degrees'],
  ['rocket', 'Launches into space'], ['planet', 'Mars or Venus'], ['garden', 'Place for flowers'], ['puzzle', 'Brain teaser'],
  ['castle', 'Medieval fortress'], ['island', 'Land surrounded by water'], ['winter', 'Coldest season'], ['silver', 'Second-place metal'],
];

export interface Entry {
  word: string;
  clue: string;
  r: number;
  c: number;
  across: boolean;
  number: number;
}

/** Places 6–8 words with intersections on a small grid; returns entries and the grid size. */
export function buildCrossword(random: Rng): { entries: Entry[]; rows: number; cols: number } {
  const S = 13;
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid: (string | null)[][] = Array.from({ length: S }, () => Array(S).fill(null));
    const placed: Omit<Entry, 'number'>[] = [];
    const words = shuffle(random, CLUES);
    const put = (word: string, r: number, c: number, across: boolean, clue: string) => {
      [...word].forEach((ch, k) => (grid[r + (across ? 0 : k)]![c + (across ? k : 0)] = ch));
      placed.push({ word, clue, r, c, across });
    };
    const [first, firstClue] = words[0]!;
    put(first, 6, Math.floor((S - first.length) / 2), true, firstClue);
    for (const [word, clue] of words.slice(1)) {
      if (placed.length >= 7) break;
      let best: { r: number; c: number; across: boolean; hits: number } | null = null;
      for (let r = 0; r < S; r++)
        for (let c = 0; c < S; c++)
          for (const across of [true, false]) {
            const fit = canPlace(grid, word, r, c, across, S);
            if (fit > 0 && (!best || fit > best.hits || (fit === best.hits && random() < 0.3))) best = { r, c, across, hits: fit };
          }
      if (best) put(word, best.r, best.c, best.across, clue);
    }
    if (placed.length < 6) continue;
    const minR = Math.min(...placed.map((p) => p.r));
    const minC = Math.min(...placed.map((p) => p.c));
    const maxR = Math.max(...placed.map((p) => p.r + (p.across ? 0 : p.word.length - 1)));
    const maxC = Math.max(...placed.map((p) => p.c + (p.across ? p.word.length - 1 : 0)));
    const shifted = placed.map((p) => ({ ...p, r: p.r - minR, c: p.c - minC }));
    // Standard numbering: reading order of starting cells.
    const starts = [...new Set(shifted.map((p) => p.r * 100 + p.c))].sort((a, b) => a - b);
    const entries = shifted.map((p) => ({ ...p, number: starts.indexOf(p.r * 100 + p.c) + 1 }));
    return { entries, rows: maxR - minR + 1, cols: maxC - minC + 1 };
  }
  throw new Error('crossword generation failed');
}

/** Number of intersections if the word fits (0 = no valid placement). */
function canPlace(grid: (string | null)[][], word: string, r: number, c: number, across: boolean, S: number): number {
  const dr = across ? 0 : 1;
  const dc = across ? 1 : 0;
  const endR = r + dr * (word.length - 1);
  const endC = c + dc * (word.length - 1);
  if (endR >= S || endC >= S) return 0;
  const at = (rr: number, cc: number) => (rr >= 0 && cc >= 0 && rr < S && cc < S ? grid[rr]![cc] : null);
  if (at(r - dr, c - dc) || at(endR + dr, endC + dc)) return 0;
  let hits = 0;
  for (let k = 0; k < word.length; k++) {
    const rr = r + dr * k;
    const cc = c + dc * k;
    const cur = at(rr, cc);
    if (cur) {
      if (cur !== word[k]) return 0;
      hits++;
    } else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return 0; // no side-by-side letters
  }
  return hits;
}
