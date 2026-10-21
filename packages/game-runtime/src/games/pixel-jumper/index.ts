import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { findTiles } from '../../kit/platformer';
import { generateLevel } from '../../kit/platformer-gen';
import { PlatformerGame, VIEW_H, VIEW_W } from '../../kit/platformer-game';

const LEVELS = 8;

class PixelJumper extends PlatformerGame {
  private level = 1;
  private gems = 0;
  private levelGems = 0;

  constructor(host: GameHost) {
    super(host);
    this.abilities = { wallJump: true, doubleJump: false, dash: false };
  }

  protected reset() {
    this.level = 1;
    this.gems = 0;
    this.deaths = 0;
    this.load();
  }

  private load() {
    const rows = generateLevel(this.random, { segments: 8 + this.level, difficulty: Math.min(1, (this.level - 1) / 6) });
    this.loadMap(rows);
    this.levelGems = findTiles(this.map, '*').length;
    this.say(`Level ${this.level}`);
  }

  protected onPickup(ch: string) {
    if (ch === '*') {
      this.gems++;
      this.addScore(25);
      this.sfx.good();
    } else if (ch === 'C') {
      this.say('Checkpoint!');
      this.sfx.beep(660, 0.1, 'triangle');
    } else if (ch === 'E') {
      const got = [...this.collected].filter((k) => {
        const [c, r] = k.split(',').map(Number) as [number, number];
        return this.map.rows[r]![c] === '*';
      }).length;
      this.addScore(250 * this.level + (got === this.levelGems ? 200 : 0));
      this.sfx.win();
      if (this.level >= LEVELS) {
        this.end('won', { gems: this.gems, deaths: this.deaths });
        return;
      }
      this.level++;
      this.load();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    this.drawWorld(ctx);
    this.hud(ctx, `Level ${this.level}/${LEVELS}  ·  Gems ${this.gems}  ·  Score ${this.score}`, `Falls ${this.deaths}`);
    if (this.time < 5) this.text(ctx, '← → move · Space / ↑ jump · jump at walls to wall-jump · touch: left/right zones + tap right side', VIEW_W / 2, VIEW_H - 10, { size: 11, align: 'center', color: '#c7d2fe', font: 'body' });
  }
}

export default defineGame(
  { key: 'pixel-jumper', engine: 'CANVAS', aspectRatio: VIEW_W / VIEW_H, orientation: 'landscape', maxScore: 8 * 250 * 8 + 8 * 200 + 200 * 25, controls: [{ action: 'Move', keys: '← → / A D' }, { action: 'Jump / wall-jump', keys: 'Space / ↑ / W' }] },
  (host) => new PixelJumper(host),
);
