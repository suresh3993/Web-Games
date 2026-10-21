import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { findTiles } from '../../kit/platformer';
import { generateLevel } from '../../kit/platformer-gen';
import { PlatformerGame, VIEW_H, VIEW_W } from '../../kit/platformer-game';

class CaveExplorer extends PlatformerGame {
  private relics = 0;
  private relicTotal = 0;
  private gems = 0;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    // No wall-jump: the cliff gate must require the double-jump ability.
    this.abilities = { wallJump: false, doubleJump: false, dash: false };
    this.relics = 0;
    this.gems = 0;
    this.deaths = 0;
    this.loadMap(generateLevel(this.random, { segments: 16, difficulty: 0.5, gates: true }));
    this.relicTotal = findTiles(this.map, 'R').length;
    this.say('Find the relics. Abilities unlock deeper caves.');
  }

  protected onPickup(ch: string) {
    if (ch === 'D') {
      this.abilities.doubleJump = true;
      this.say('Double jump unlocked! Jump again in mid-air.');
      this.sfx.win();
    } else if (ch === 'S') {
      this.abilities.dash = true;
      this.say('Dash unlocked! Press Shift / X (or tap top-right).');
      this.sfx.win();
    } else if (ch === 'R') {
      this.relics++;
      this.addScore(400);
      this.say(`Relic ${this.relics}/${this.relicTotal}`);
      this.sfx.good();
    } else if (ch === '*') {
      this.gems++;
      this.addScore(25);
      this.sfx.good();
    } else if (ch === 'C') this.say('Checkpoint saved');
    else if (ch === 'E') {
      if (this.relics < this.relicTotal) {
        this.say(`The gate needs all ${this.relicTotal} relics (${this.relics} found).`);
        return;
      }
      this.addScore(1000 + Math.max(0, 900 - Math.floor(this.time)) * 2 - this.deaths * 20);
      this.sfx.win();
      this.end('won', { relics: this.relics, deaths: this.deaths });
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    this.drawWorld(ctx);
    const powers = [this.abilities.doubleJump ? '⇈ double jump' : '', this.abilities.dash ? '» dash' : ''].filter(Boolean).join(' · ') || 'no abilities yet';
    this.hud(ctx, `Relics ${this.relics}/${this.relicTotal}  ·  Score ${this.score}`, powers);
    if (this.time < 5) this.text(ctx, '← → move · Space jump · Shift/X dash (once unlocked)', VIEW_W / 2, VIEW_H - 10, { size: 12, align: 'center', color: '#c7d2fe', font: 'body' });
  }
}

export default defineGame(
  { key: 'cave-explorer', engine: 'CANVAS', aspectRatio: VIEW_W / VIEW_H, orientation: 'landscape', maxScore: 20_000, controls: [{ action: 'Move', keys: '← → / A D' }, { action: 'Jump / double jump', keys: 'Space / ↑' }, { action: 'Dash', keys: 'Shift / X' }] },
  (host) => new CaveExplorer(host),
);
