import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import {
  clearLines,
  COLS,
  collides,
  emptyBoard,
  gravityInterval,
  hardDropDistance,
  LINE_POINTS,
  lock,
  makeBag,
  move,
  rotate,
  ROWS,
  spawn,
  cells,
  type Board,
  type Piece,
} from './logic';

const COLORS = ['', '#22d3ee', '#3b82f6', '#f97316', '#facc15', '#4ade80', '#a78bfa', '#f43f5e'];
const CELL = 26;
const BX = 20;
const BY = 50;
const REPEAT_DELAY = 0.17;
const REPEAT_RATE = 0.05;

class BlockPuzzle extends CanvasGame {
  private board: Board = emptyBoard();
  private piece!: Piece;
  private queue: number[] = [];
  private fall = 0;
  private lines = 0;
  private level = 1;
  private moveTimer = 0;
  private flash = 0;

  constructor(host: ConstructorParameters<typeof CanvasGame>[0]) {
    super(host, { width: 420, height: 580 });
  }

  protected reset() {
    this.board = emptyBoard();
    this.queue = [...makeBag(this.random), ...makeBag(this.random)];
    this.lines = 0;
    this.level = 1;
    this.fall = 0;
    this.flash = 0;
    this.nextPiece();
  }

  private nextPiece() {
    if (this.queue.length < 7) this.queue.push(...makeBag(this.random));
    this.piece = spawn(this.queue.shift()!);
    if (collides(this.board, this.piece)) this.end('lost', { lines: this.lines, level: this.level });
  }

  private lockPiece() {
    this.board = lock(this.board, this.piece);
    const { board, cleared } = clearLines(this.board);
    this.board = board;
    if (cleared) {
      this.lines += cleared;
      this.addScore(LINE_POINTS[cleared]! * this.level);
      this.level = 1 + Math.floor(this.lines / 10);
      this.flash = 0.15;
      this.sfx.beep(440 + cleared * 120, 0.12, 'triangle');
    } else {
      this.sfx.click();
    }
    this.nextPiece();
  }

  protected update(dt: number) {
    const i = this.input;
    this.flash = Math.max(0, this.flash - dt);

    if (i.anyHit('ArrowUp', 'KeyW', 'KeyX') || i.taps.length || i.swipe === 'up') this.piece = rotate(this.board, this.piece, 1);
    if (i.anyHit('KeyZ')) this.piece = rotate(this.board, this.piece, -1);
    if (i.hit('Space') || i.swipe === 'down') {
      const d = hardDropDistance(this.board, this.piece);
      this.piece = { ...this.piece, y: this.piece.y + d };
      this.addScore(d * 2);
      this.lockPiece();
      return;
    }

    let dx = 0;
    if (i.swipe === 'left') dx = -1;
    if (i.swipe === 'right') dx = 1;
    const leftHit = i.anyHit('ArrowLeft', 'KeyA');
    const rightHit = i.anyHit('ArrowRight', 'KeyD');
    if (leftHit || rightHit) {
      dx = leftHit ? -1 : 1;
      this.moveTimer = REPEAT_DELAY;
    } else if (i.left || i.right) {
      this.moveTimer -= dt;
      if (this.moveTimer <= 0) {
        dx = i.left ? -1 : 1;
        this.moveTimer = REPEAT_RATE;
      }
    }
    if (dx) this.piece = move(this.board, this.piece, dx, 0) ?? this.piece;

    const soft = i.down;
    this.fall += dt * (soft ? 12 : 1);
    if (this.fall >= gravityInterval(this.level)) {
      this.fall = 0;
      const down = move(this.board, this.piece, 0, 1);
      if (down) {
        this.piece = down;
        if (soft) this.addScore(1);
      } else {
        this.lockPiece();
      }
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1, size = CELL) {
    ctx.globalAlpha = alpha;
    this.roundRect(ctx, x + 1, y + 1, size - 2, size - 2, 4, color);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 3, y + 3, size - 6, 3);
    ctx.globalAlpha = 1;
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    // Board
    this.roundRect(ctx, BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8, 8, this.flash > 0 ? '#1e2a66' : '#11183a');
    ctx.strokeStyle = 'rgba(148,163,255,0.06)';
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(BX + x * CELL, BY);
      ctx.lineTo(BX + x * CELL, BY + ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = this.board[y]![x]!;
      if (c) this.drawCell(ctx, BX + x * CELL, BY + y * CELL, COLORS[c]!);
    }
    if (!this.finished && this.piece) {
      const ghostY = hardDropDistance(this.board, this.piece);
      for (const [x, y] of cells({ ...this.piece, y: this.piece.y + ghostY })) if (y >= 0) this.drawCell(ctx, BX + x * CELL, BY + y * CELL, COLORS[this.piece.type + 1]!, 0.2);
      this.glow(ctx, COLORS[this.piece.type + 1]!, 10);
      for (const [x, y] of cells(this.piece)) if (y >= 0) this.drawCell(ctx, BX + x * CELL, BY + y * CELL, COLORS[this.piece.type + 1]!);
      this.noGlow(ctx);
    }

    // Side panel
    const px = BX + COLS * CELL + 20;
    this.text(ctx, 'NEXT', px, BY + 10, { size: 13, color: '#9aa0c0' });
    this.queue.slice(0, 3).forEach((type, n) => {
      for (const [x, y] of cells({ type, rot: 0, x: 0, y: 0 })) this.drawCell(ctx, px + x * 16, BY + 22 + n * 52 + y * 16, COLORS[type + 1]!, 1, 16);
    });
    const stats: [string, number][] = [
      ['SCORE', this.score],
      ['LINES', this.lines],
      ['LEVEL', this.level],
    ];
    stats.forEach(([label, value], n) => {
      this.text(ctx, label, px, BY + 210 + n * 56, { size: 13, color: '#9aa0c0' });
      this.text(ctx, String(value), px, BY + 234 + n * 56, { size: 22 });
    });
    this.text(ctx, '←→ move  ↑ rotate', px, BY + 400, { size: 11, color: '#9aa0c0', font: 'body' });
    this.text(ctx, '↓ soft  space drop', px, BY + 416, { size: 11, color: '#9aa0c0', font: 'body' });
    this.text(ctx, 'Touch: tap rotate,', px, BY + 440, { size: 11, color: '#9aa0c0', font: 'body' });
    this.text(ctx, 'swipe move / drop', px, BY + 456, { size: 11, color: '#9aa0c0', font: 'body' });
    this.text(ctx, 'BLOCK PUZZLE', BX, 32, { size: 18, color: '#a78bfa' });
  }
}

export default defineGame(
  {
    key: 'block-puzzle',
    engine: 'CANVAS',
    aspectRatio: 420 / 580,
    orientation: 'portrait',
    maxScore: 5_000_000,
    controls: [
      { action: 'Move', keys: '← → / swipe' },
      { action: 'Rotate', keys: '↑ / Z / tap' },
      { action: 'Soft drop', keys: '↓' },
      { action: 'Hard drop', keys: 'Space / swipe down' },
    ],
  },
  (host) => new BlockPuzzle(host),
);
