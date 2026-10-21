import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { WORDS_BY_LENGTH } from '../../kit/words';

const W = 640;
const H = 480;

interface Meteor { word: string; typed: number; x: number; y: number; speed: number }

class TypingDefense extends CanvasGame {
  private meteors: Meteor[] = [];
  private target: Meteor | null = null;
  private shield = 3;
  private wave = 1;
  private spawnTimer = 0;
  private destroyed = 0;
  private keystrokes = 0;
  private misses = 0;
  private flashes: { x: number; y: number; t: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#060a1c' });
  }

  protected reset() {
    this.meteors = [];
    this.target = null;
    this.shield = 3;
    this.wave = 1;
    this.spawnTimer = 0.5;
    this.destroyed = 0;
    this.keystrokes = 0;
    this.misses = 0;
    this.flashes = [];
  }

  private spawn() {
    const len = Math.min(8, 3 + Math.floor(this.wave / 2) + Math.floor(this.random() * 3));
    const pool = WORDS_BY_LENGTH[len] ?? WORDS_BY_LENGTH[5]!;
    let word = pool[Math.floor(this.random() * pool.length)]!;
    // Avoid two meteors starting with the same letter (keeps targeting unambiguous).
    for (let k = 0; k < 10 && this.meteors.some((m) => m.word[0] === word[0]); k++) word = pool[Math.floor(this.random() * pool.length)]!;
    this.meteors.push({ word, typed: 0, x: 60 + this.random() * (W - 120), y: -10, speed: 18 + this.wave * 4 + this.random() * 10 });
  }

  protected update(dt: number) {
    // Letters arrive as key codes; map KeyA..KeyZ to letters.
    for (let c = 0; c < 26; c++) {
      const code = `Key${String.fromCharCode(65 + c)}`;
      if (!this.input.hit(code)) continue;
      const ch = String.fromCharCode(97 + c);
      this.keystrokes++;
      if (!this.target) this.target = this.meteors.find((m) => m.word[0] === ch) ?? null;
      if (this.target && this.target.word[this.target.typed] === ch) {
        this.target.typed++;
        this.sfx.beep(600 + this.target.typed * 30, 0.03, 'square', 0.03);
        if (this.target.typed === this.target.word.length) {
          this.addScore(this.target.word.length * 10 * this.wave);
          this.flashes.push({ x: this.target.x, y: this.target.y, t: 0.4 });
          this.meteors = this.meteors.filter((m) => m !== this.target);
          this.target = null;
          this.destroyed++;
          if (this.destroyed % 8 === 0) this.wave++;
        }
      } else {
        this.misses++;
        this.sfx.beep(150, 0.04, 'sawtooth', 0.03);
      }
    }
    if (this.input.hit('Escape') || this.input.hit('Backspace')) {
      if (this.target) this.target.typed = 0;
      this.target = null;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(0.9, 2.6 - this.wave * 0.18);
    }
    for (const m of this.meteors) m.y += m.speed * dt;
    const hit = this.meteors.filter((m) => m.y > H - 50);
    if (hit.length) {
      this.shield -= hit.length;
      this.sfx.bad();
      if (hit.includes(this.target!)) this.target = null;
      this.meteors = this.meteors.filter((m) => m.y <= H - 50);
      if (this.shield <= 0) {
        this.end('lost', { destroyed: this.destroyed, accuracy: Math.round((1 - this.misses / Math.max(1, this.keystrokes)) * 100) });
        return;
      }
    }
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0e7490';
    ctx.fillRect(0, H - 40, W, 40);
    for (let k = 0; k < this.shield; k++) this.text(ctx, '⬢', W / 2 - 30 + k * 30, H - 12, { size: 22, color: '#22d3ee', align: 'center' });
    for (const m of this.meteors) {
      const active = m === this.target;
      this.glow(ctx, active ? '#f472b6' : '#fb923c', 14);
      this.circle(ctx, m.x, m.y, 12, active ? '#f472b6' : '#fb923c');
      this.noGlow(ctx);
      ctx.font = "700 18px ui-monospace, Consolas, monospace";
      const width = ctx.measureText(m.word).width;
      const x0 = m.x - width / 2;
      this.roundRect(ctx, x0 - 6, m.y + 16, width + 12, 24, 6, 'rgba(11,16,34,0.85)');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#4ade80';
      ctx.fillText(m.word.slice(0, m.typed), x0, m.y + 34);
      ctx.fillStyle = active ? '#fff' : '#cbd5e1';
      ctx.fillText(m.word.slice(m.typed), x0 + ctx.measureText(m.word.slice(0, m.typed)).width, m.y + 34);
    }
    for (const f of this.flashes) this.circle(ctx, f.x, f.y, (0.4 - f.t) * 120, `rgba(250,204,21,${f.t * 2})`);
    this.hud(ctx, `Score ${this.score}`, `Wave ${this.wave}`);
    if (this.time < 3) this.text(ctx, 'Type the words on the meteors!', W / 2, H / 2, { size: 20, align: 'center', color: '#c7d2fe' });
  }
}

export default defineGame(
  {
    key: 'typing-defense',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'landscape',
    input: { keyboard: true, touch: false, pointer: false },
    maxScore: 2_000_000,
    controls: [
      { action: 'Destroy meteor', keys: 'Type its word' },
      { action: 'Switch target', keys: 'Esc / Backspace' },
    ],
  },
  (host) => new TypingDefense(host),
);
