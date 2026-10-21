import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { esc, shuffle } from '../../kit/util';
import { PASSAGES } from '../../kit/words';

const DURATION = 60;

/** Words-per-minute uses the standard 5 characters = 1 word. */
export function typingStats(correctChars: number, typedChars: number, seconds: number) {
  const minutes = Math.max(seconds, 1) / 60;
  const wpm = Math.round(correctChars / 5 / minutes);
  const accuracy = typedChars ? correctChars / typedChars : 1;
  return { wpm, accuracy, score: Math.round(wpm * accuracy * accuracy * 10) };
}

class TypingChallenge extends DomGame {
  private text = '';
  private typed = '';
  private keystrokes = 0;
  private correctStrokes = 0;
  private begun = false;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.text = shuffle(this.random, PASSAGES).slice(0, 6).join(' ');
    this.typed = '';
    this.keystrokes = 0;
    this.correctStrokes = 0;
    this.begun = false;
    this.startedAt = 0;
  }

  private startedAt = 0;

  private get remaining() {
    return this.begun ? Math.max(0, DURATION - (this.elapsed - this.startedAt)) : DURATION;
  }

  protected override onTick() {
    if (!this.begun) return;
    if (this.remaining <= 0) {
      this.finishRun();
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private finishRun() {
    const correct = [...this.typed].filter((ch, i) => ch === this.text[i]).length;
    const stats = typingStats(correct, this.keystrokes, DURATION - this.remaining || DURATION);
    this.setScore(stats.score);
    this.end('completed', { wpm: stats.wpm, accuracy: Math.round(stats.accuracy * 100) });
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      this.render();
      return true;
    }
    if (e.key.length !== 1) return false;
    if (!this.begun) {
      this.begun = true;
      this.startedAt = this.elapsed;
    }
    const expected = this.text[this.typed.length];
    this.keystrokes++;
    if (e.key === expected) this.correctStrokes++;
    else this.sfx.beep(180, 0.03, 'square', 0.03);
    this.typed += e.key;
    if (this.typed.length >= this.text.length) {
      this.finishRun();
      return true;
    }
    this.render();
    return true;
  }

  protected view() {
    const chars = [...this.text]
      .map((ch, i) => {
        if (i < this.typed.length) {
          const ok = this.typed[i] === ch;
          return `<span style="color:${ok ? '#4ade80' : '#fb7185'};${ok ? '' : 'background:rgba(244,63,94,.18)'}">${esc(ch === ' ' && !ok ? '·' : ch)}</span>`;
        }
        if (i === this.typed.length) return `<span style="border-left:2px solid #22d3ee;margin-left:-2px">${esc(ch)}</span>`;
        return `<span style="color:#7d84a8">${esc(ch)}</span>`;
      })
      .join('');
    const correct = [...this.typed].filter((ch, i) => ch === this.text[i]).length;
    const live = typingStats(correct, this.keystrokes, this.begun ? DURATION - this.remaining : 1);
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>WPM <b>${this.begun ? live.wpm : 0}</b></span><span>Accuracy <b>${Math.round(live.accuracy * 100)}%</b></span></div>
      <div class="pv-meter" aria-hidden="true"><i style="width:${(this.remaining / DURATION) * 100}%"></i></div>
      <div class="pv-panel" style="max-width:760px;font-size:clamp(16px,2.6vmin,22px);line-height:1.7;font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap" aria-live="off">${chars}</div>
      <p class="pv-muted">${this.begun ? 'Keep going! Backspace fixes mistakes.' : 'Start typing to begin the 60-second timer.'}</p>`;
  }
}

export default defineGame(
  {
    key: 'typing-challenge',
    engine: 'DOM',
    aspectRatio: 1.6,
    maxScore: 2_500,
    input: { keyboard: true, touch: false, pointer: false },
    controls: [{ action: 'Type', keys: 'Keyboard' }],
  },
  (host) => new TypingChallenge(host),
);
