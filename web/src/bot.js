import { Random, num, clamp } from './math.js';
import { FLOOR, SHOT_CHARGE_TICKS } from './physics.js';

export const DIFFICULTIES = [
  { id: 'noob', name: 'NOOB', reaction: 26, hold: 18, chance: 0.7, dunk: 0.04, range: 120, dunkRange: 62 },
  { id: 'casual', name: 'CASUAL', reaction: 15, hold: 19, chance: 0.82, dunk: 0.16, range: 150, dunkRange: 82 },
  { id: 'pro', name: 'PRO', reaction: 8, hold: 20, chance: 0.95, dunk: 0.32, range: 185, dunkRange: 104 },
  { id: 'lebron', name: 'LEBRON JAMES', reaction: 3, hold: 20, chance: 0.99, dunk: 0.52, range: 230, dunkRange: 122 }
];

export class Bot {
  constructor(side, level = 1, seed = 7) {
    this.side = side;
    this.config = DIFFICULTIES[clamp(level, 0, 3)];
    this.random = new Random(seed ^ 0x6a09e667);
    this.jump = false;
    this.dunk = false;
    this.wait = 0;
    this.lockedCarrier = null;
    this.lockedHold = 0;
  }

  input(game) {
    this.dunk = false;
    if (game.phase !== 'play') { this.jump = false; return { jump: false, dunk: false }; }
    const team = game.players.filter(p => p.side === this.side);
    const b = game.ball;
    const owner = b.owner !== -1 ? game.players[b.owner] : null;
    const carrier = owner && owner.side === this.side ? owner : null;
    const p = carrier || team.reduce((best, q) => Math.abs(num(q.pts[0].x) - num(b.x)) < Math.abs(num(best.pts[0].x) - num(b.x)) ? q : best, team[0]);
    const x = num(p.pts[0].x), bx = num(b.x), by = num(b.y);
    if (carrier !== this.lockedCarrier) {
      this.lockedCarrier = carrier;
      if (carrier) {
        const slotBias = game.teamSize === 2 && carrier.slot === 0 ? 6 : 2;
        this.lockedHold = clamp(Math.round(Math.abs(game.hoops[carrier.target].x - x) / 14) + slotBias + this.config.hold - SHOT_CHARGE_TICKS, 16, 28);
      }
    }
    const shotHold = this.lockedHold;
    if (carrier && p.charge >= shotHold) this.jump = false;
    if (this.wait-- > 0) return { jump: this.jump, dunk: false };
    this.wait = this.config.reaction + this.random.int(4);
    const c = this.config, roll = this.random.unit();
    if (carrier) {
      const distance = Math.abs(game.hoops[p.target].x - x);
      if (p.dunkCD === 0 && distance < c.dunkRange && roll < c.dunk) {
        this.dunk = true; this.jump = false;
      } else this.jump = p.charge < shotHold;
    } else if (owner) {
      const opponent = num(owner.pts[0].x);
      this.jump = Math.abs(opponent - x) < c.range && roll < c.chance;
      if (c.id === 'lebron' && by < 175 && Math.abs(bx - x) < 50) this.jump = true;
    } else {
      const vy = (b.y - b.py) * 60 / 65536;
      const t = clamp((175 - by) / Math.max(90, vy + 200), 0, 0.7);
      const predicted = bx + (b.x - b.px) * 60 / 65536 * t;
      const ownHalf = this.side ? predicted > 210 : predicted < 270;
      const stranded = by > FLOOR - 30 && ownHalf;
      this.jump = (stranded || (ownHalf && Math.abs(predicted - x) < c.range && by < FLOOR - 8)) && roll < c.chance;
      if (c.id === 'noob' && this.random.unit() < 0.15) this.jump = true;
    }
    return { jump: this.jump, dunk: this.dunk };
  }
}
