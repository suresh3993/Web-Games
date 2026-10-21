/**
 * Layout helpers for "pyramid-style" solitaires where a card is playable only
 * when the cards covering it have been removed.
 */
export interface Slot {
  row: number;
  col: number;
  /** Indices of slots that cover (sit on top of) this slot. */
  coveredBy: number[];
}

/** Classic 7-row pyramid: row r has r+1 cards; card (r,c) is covered by (r+1,c) and (r+1,c+1). */
export function pyramidSlots(rows = 7): Slot[] {
  const slots: Slot[] = [];
  const index = (r: number, c: number) => (r * (r + 1)) / 2 + c;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c <= r; c++) slots.push({ row: r, col: c, coveredBy: r + 1 < rows ? [index(r + 1, c), index(r + 1, c + 1)] : [] });
  return slots;
}

/** Three peaks of 4 rows (3 + 6 + 9 + 10 = 28 cards). Positions in half-card units. */
export function triPeakSlots(): (Slot & { x: number })[] {
  const slots: (Slot & { x: number })[] = [];
  const rows = [
    [3, 9, 15],
    [2, 4, 8, 10, 14, 16],
    [1, 3, 5, 7, 9, 11, 13, 15, 17],
    [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
  ];
  rows.forEach((xs, r) => xs.forEach((x, c) => slots.push({ row: r, col: c, x, coveredBy: [] })));
  // A card is covered by cards in the next row at x-1 and x+1.
  for (const s of slots) {
    s.coveredBy = slots.flatMap((o, j) => (o.row === s.row + 1 && Math.abs(o.x - s.x) === 1 ? [j] : []));
  }
  return slots;
}

export const exposed = (slots: Slot[], removed: boolean[], i: number) => !removed[i] && slots[i]!.coveredBy.every((j) => removed[j]);
