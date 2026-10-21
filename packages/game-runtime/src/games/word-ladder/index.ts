import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc } from '../../kit/util';
import { WORDS_BY_LENGTH } from '../../kit/words';

const LADDERS = 3;
const FOUR = WORDS_BY_LENGTH[4]!;
const FOUR_SET = new Set(FOUR);

export const oneApart = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

/** Shortest ladder length between two words (BFS), or -1. */
export function ladderDistance(from: string, to: string): number {
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 0; frontier.length; d++) {
    if (frontier.includes(to)) return d;
    const next: string[] = [];
    for (const w of frontier) for (const x of FOUR) if (!seen.has(x) && oneApart(w, x)) {
      seen.add(x);
      next.push(x);
    }
    frontier = next;
  }
  return -1;
}

/** Picks a start/target pair 3–5 steps apart. */
export function pickLadder(random: () => number): { start: string; target: string; optimal: number } {
  for (;;) {
    const start = FOUR[Math.floor(random() * FOUR.length)]!;
    // BFS from start, collect words at distance 3–5.
    const dist = new Map([[start, 0]]);
    let frontier = [start];
    for (let d = 1; d <= 5 && frontier.length; d++) {
      const next: string[] = [];
      for (const w of frontier) for (const x of FOUR) if (!dist.has(x) && oneApart(w, x)) {
        dist.set(x, d);
        next.push(x);
      }
      frontier = next;
    }
    const candidates = [...dist].filter(([, d]) => d >= 3);
    if (candidates.length) {
      const [target, optimal] = candidates[Math.floor(random() * candidates.length)]!;
      return { start, target, optimal };
    }
  }
}

class WordLadder extends DomGame {
  private startWord = '';
  private target = '';
  private optimal = 0;
  private chain: string[] = [];
  private input = '';
  private ladder = 1;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.ladder = 1;
    this.load();
  }

  private load() {
    const l = pickLadder(this.random);
    this.startWord = l.start;
    this.target = l.target;
    this.optimal = l.optimal;
    this.chain = [l.start];
    this.input = '';
    this.message = `Change one letter at a time. Best possible: ${l.optimal} steps.`;
  }

  private submit() {
    const w = this.input;
    this.input = '';
    const last = this.chain.at(-1)!;
    if (w.length !== 4) this.message = 'Enter a 4-letter word.';
    else if (!oneApart(last, w)) this.message = `“${w.toUpperCase()}” must differ from ${last.toUpperCase()} by exactly one letter.`;
    else if (!FOUR_SET.has(w)) this.message = `“${w.toUpperCase()}” isn't in our word list.`;
    else if (this.chain.includes(w)) this.message = 'You already used that word.';
    else {
      this.chain.push(w);
      this.sfx.good();
      this.message = '';
      if (w === this.target) {
        const steps = this.chain.length - 1;
        this.addScore(300 + Math.max(0, (this.optimal + 4 - steps) * 60));
        this.sfx.win();
        if (this.ladder >= LADDERS) {
          this.end('won', { ladders: LADDERS });
          return;
        }
        this.ladder++;
        this.load();
      }
      return this.render();
    }
    this.sfx.bad();
    this.render();
  }

  private key(k: string) {
    if (k === 'enter') return this.submit();
    if (k === 'back') this.input = this.input.slice(0, -1);
    else if (this.input.length < 4) this.input += k;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'key') this.key(value);
    else if (action === 'undo' && this.chain.length > 1) {
      this.chain.pop();
      this.render();
    } else if (action === 'skip') {
      this.message = `Skipped. One route: ${this.startWord.toUpperCase()} → … → ${this.target.toUpperCase()}`;
      if (this.ladder >= LADDERS) return this.end('completed');
      this.ladder++;
      this.load();
      this.render();
    }
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    this.key(k);
    return true;
  }

  protected view() {
    const tile = (w: string, color: string) => `<div class="pv-row" style="gap:4px">${[...w.padEnd(4, ' ')].map((ch) => `<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:${color};font-weight:800;font-size:22px">${esc(ch.toUpperCase())}</span>`).join('')}</div>`;
    return `
      <div class="pv-hud"><span>Ladder <b>${this.ladder}/${LADDERS}</b></span><span>Steps <b>${this.chain.length - 1}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-col" style="gap:4px">${this.chain.map((w, i) => tile(w, i === 0 ? '#3730a3' : '#1e2a66')).join('')}
        ${tile(this.input, '#0e1430')}
        <span class="pv-muted">target</span>${tile(this.target, '#15803d')}</div>
      <div class="pv-row"><button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.chain.length > 1 ? '' : 'disabled'}>↶ Undo step</button><button type="button" class="pv-btn small" data-action="skip" data-value="">Skip ladder</button></div>
      ${keyboardHtml({}, { enter: true, back: true })}`;
  }
}

export default defineGame(
  { key: 'word-ladder', engine: 'DOM', aspectRatio: 0.65, orientation: 'portrait', maxScore: LADDERS * (300 + 9 * 60), controls: [{ action: 'Next word', keys: 'Type 4 letters + Enter' }] },
  (host) => new WordLadder(host),
);
