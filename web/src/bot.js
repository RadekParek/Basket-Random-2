import { Random, num, clamp } from './math.js';
import { HOOPS, FLOOR } from './physics.js';

export const DIFFICULTIES = [
  { id: 'noob', name: 'NOOB', reaction: 30, hold: 55, chance: 0.4, dunk: 0.05, range: 82, dunkRange: 70 },
  { id: 'casual', name: 'CASUAL', reaction: 18, hold: 36, chance: 0.68, dunk: 0.18, range: 112, dunkRange: 90 },
  { id: 'pro', name: 'PRO', reaction: 9, hold: 28, chance: 0.88, dunk: 0.38, range: 145, dunkRange: 115 },
  { id: 'lebron', name: 'LEBRON JAMES', reaction: 3, hold: 26, chance: 0.98, dunk: 0.65, range: 190, dunkRange: 135 }
];

export class Bot {
  constructor(side, level = 1, seed = 7) {
    this.side = side;
    this.config = DIFFICULTIES[clamp(level, 0, 3)];
    this.random = new Random(seed ^ 0x6a09e667);
    this.jump = false;
    this.dunk = false;
    this.wait = 0;
  }

  input(game) {
    this.dunk = false;
    if (game.phase !== 'play') { this.jump = false; return { jump: false, dunk: false }; }
    const p = game.players[this.side], b = game.ball;
    const x = num(p.pts[0].x), bx = num(b.x), by = num(b.y);
    if (b.owner === this.side && b.holdTicks >= this.config.hold) this.jump = false;
    if (this.wait-- > 0) return { jump: this.jump, dunk: false };
    this.wait = this.config.reaction + this.random.int(4);
    const c = this.config, roll = this.random.unit();
    if (b.owner === this.side) {
      const distance = Math.abs(HOOPS[p.target].x - x);
      if (p.dunkCD === 0 && distance < c.dunkRange && roll < c.dunk) {
        this.dunk = true; this.jump = false;
      } else this.jump = b.holdTicks < c.hold;
    } else if (b.owner === 1 - this.side) {
      const opponent = num(game.players[1 - this.side].pts[0].x);
      this.jump = Math.abs(opponent - x) < c.range && roll < c.chance;
      if (c.id === 'lebron' && by < 175 && Math.abs(bx - x) < 50) this.jump = true;
    } else {
      const vy = (b.y - b.py) * 60 / 65536;
      const t = clamp((175 - by) / Math.max(90, vy + 200), 0, 0.7);
      const predicted = bx + (b.x - b.px) * 60 / 65536 * t;
      const ownHalf = this.side ? predicted > 235 : predicted < 245;
      const stranded = by > FLOOR - 22 && ownHalf;
      this.jump = ownHalf && (stranded || (Math.abs(predicted - x) < c.range && by < FLOOR - 15)) && roll < c.chance;
      if (c.id === 'noob' && this.random.unit() < 0.12) this.jump = true;
    }
    return { jump: this.jump, dunk: this.dunk };
  }
}
