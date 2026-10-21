import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const SECONDS = 60;
const COLORS = [
  { name: 'RED', hex: '#ef4444' },
  { name: 'BLUE', hex: '#3b82f6' },
  { name: 'GREEN', hex: '#22c55e' },
  { name: 'YELLOW', hex: '#eab308' },
];

class ColorClash extends DomGame {
  private word = 0;
  private ink = 0;
  private correct = 0;
  private wrong = 0;
  private streak = 0;
  private feedback = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.correct = this.wrong = this.streak = 0;
    this.feedback = '';
    this.next();
  }

  private next() {
    this.word = Math.floor(this.random() * 4);
    // Mostly incongruent (word ≠ ink) — the hard case.
    do this.ink = Math.floor(this.random() * 4);
    while (this.ink === this.word && this.random() < 0.8);
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.end('completed', { correct: this.correct, wrong: this.wrong });
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private answer(i: number) {
    if (i === this.ink) {
      this.correct++;
      this.streak++;
      this.addScore(10 + Math.min(20, this.streak * 2));
      this.feedback = '✓';
      this.sfx.good();
    } else {
      this.wrong++;
      this.streak = 0;
      this.feedback = '✗ Pick the INK colour';
      this.sfx.bad();
    }
    this.next();
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'pick') this.answer(Number(value));
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-4]$/.test(e.key)) {
      this.answer(Number(e.key) - 1);
      return true;
    }
    return false;
  }

  protected view() {
    const buttons = COLORS.map((c, i) => `<button type="button" class="pv-btn pv-choice" style="font-size:18px;min-height:52px" data-action="pick" data-value="${i}"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c.hex};margin-right:8px"></span>${c.name} <span class="pv-muted">(${i + 1})</span></button>`).join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Correct <b>${this.correct}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-meter" aria-hidden="true"><i style="width:${(this.remaining / SECONDS) * 100}%"></i></div>
      <p class="pv-muted">Choose the colour of the ink — ignore what the word says.</p>
      <div class="pv-big" style="font-size:clamp(40px,12vmin,88px);color:${COLORS[this.ink]!.hex}" aria-label="The word ${COLORS[this.word]!.name} printed in ${COLORS[this.ink]!.name.toLowerCase()} ink">${COLORS[this.word]!.name}</div>
      <p class="pv-msg" role="status">${this.feedback}</p>
      <div class="pv-row">${buttons}</div>`;
  }
}

export default defineGame(
  { key: 'color-clash', engine: 'DOM', aspectRatio: 1, maxScore: 10_000, controls: [{ action: 'Pick ink colour', keys: 'Click / 1–4' }] },
  (host) => new ColorClash(host),
);
