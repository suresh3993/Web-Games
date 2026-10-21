/**
 * Standard ten-pin scoring. `rolls` is the list of pins knocked down per roll.
 * Returns cumulative frame totals (null when a frame cannot be scored yet).
 */
export function frameTotals(rolls: number[]): (number | null)[] {
  const totals: (number | null)[] = [];
  let total = 0;
  let i = 0;
  for (let frame = 0; frame < 10; frame++) {
    const r1 = rolls[i];
    if (r1 === undefined) break;
    if (r1 === 10) {
      const b1 = rolls[i + 1];
      const b2 = rolls[i + 2];
      if (b1 === undefined || b2 === undefined) {
        totals.push(null);
        break;
      }
      total += 10 + b1 + b2;
      totals.push(total);
      i += 1;
      continue;
    }
    const r2 = rolls[i + 1];
    if (r2 === undefined) {
      totals.push(null);
      break;
    }
    if (r1 + r2 === 10) {
      const b = rolls[i + 2];
      if (b === undefined) {
        totals.push(null);
        break;
      }
      total += 10 + b;
    } else total += r1 + r2;
    totals.push(total);
    i += 2;
  }
  return totals;
}

/** Splits rolls into display frames (handles the 10th-frame bonus balls). */
export function framesOf(rolls: number[]): number[][] {
  const frames: number[][] = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (f === 9) {
      frames.push(rolls.slice(i, i + 3));
      break;
    }
    if (rolls[i] === 10) {
      frames.push([10]);
      i++;
    } else {
      frames.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  return frames;
}

/** Is the game complete after these rolls? */
export function gameComplete(rolls: number[]): boolean {
  const frames = framesOf(rolls);
  if (frames.length < 10) return false;
  const last = frames[9]!;
  if (last.length === 3) return true;
  if (last.length === 2) return last[0]! + last[1]! < 10;
  return false;
}
