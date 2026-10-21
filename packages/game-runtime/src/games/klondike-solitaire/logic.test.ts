import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { canStackOnFoundation, canStackOnTableau, deal, draw, move, type Klondike } from './logic';

describe('klondike', () => {
  it('deals 28 tableau cards (top face up) and 24 in stock', () => {
    const g = deal(createRng('k'));
    expect(g.tableau.map((t) => t.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.tableau.every((t) => t.at(-1)!.up && t.slice(0, -1).every((c) => !c.up))).toBe(true);
    expect(g.stock).toHaveLength(24);
  });

  it('enforces alternating colours, descending ranks and kings on empty columns', () => {
    expect(canStackOnTableau({ rank: 6, suit: 1 }, { rank: 7, suit: 0 })).toBe(true);
    expect(canStackOnTableau({ rank: 6, suit: 0 }, { rank: 7, suit: 3 })).toBe(false);
    expect(canStackOnTableau({ rank: 13, suit: 0 }, undefined)).toBe(true);
    expect(canStackOnTableau({ rank: 12, suit: 0 }, undefined)).toBe(false);
    expect(canStackOnFoundation({ rank: 1, suit: 2 }, [])).toBe(true);
    expect(canStackOnFoundation({ rank: 2, suit: 2 }, [{ rank: 1, suit: 2 }])).toBe(true);
    expect(canStackOnFoundation({ rank: 2, suit: 1 }, [{ rank: 1, suit: 2 }])).toBe(false);
  });

  it('moving a card flips the newly exposed card', () => {
    const g: Klondike = {
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [[{ rank: 3, suit: 0, up: false }, { rank: 1, suit: 1, up: true }], [], [], [], [], [], []],
    };
    const res = move(g, { kind: 'tableau', index: 0, from: 1 }, { kind: 'foundation', index: 0 })!;
    expect(res.game.foundations[0]).toHaveLength(1);
    expect(res.game.tableau[0]![0]!.up).toBe(true);
    expect(res.points).toBe(15);
  });

  it('draws three and recycles the waste', () => {
    let g = deal(createRng('d'));
    g = draw(g, 3);
    expect(g.waste).toHaveLength(3);
    for (let i = 0; i < 7; i++) g = draw(g, 3);
    expect(g.stock).toHaveLength(0);
    g = draw(g, 3);
    expect(g.stock).toHaveLength(24);
    expect(g.waste).toHaveLength(0);
  });
});
