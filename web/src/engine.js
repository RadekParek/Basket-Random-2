import { Random, fix, num, clamp, dist2 } from './math.js';
import {
  WIDTH, RIM_Y, HOOPS, COURTS, BALLS, makePlayer,
  stepPlayer, collidePlayers, collideBall, particle, ballVelocity, setBallPosition
} from './physics.js';

export const EMPTY = Object.freeze({ jump: false, dunk: false });
export const TARGET_SCORE = 5;
const handDistance = (p, b, i) => dist2(p.pts[i], b);

export class Game {
  constructor(seed = 1, names = ['PLAYER 1', 'PLAYER 2']) {
    this.seed = seed >>> 0;
    this.random = new Random(this.seed);
    this.names = names;
    this.scores = [0, 0];
    this.round = 0;
    this.tick = 0;
    this.bounces = 0;
    this.pickupCD = 0;
    this.stealCD = 0;
    this.staleTicks = 0;
    this.lastScorer = -1;
    this.winner = -1;
    this.resetRound(true);
  }

  resetRound(first = false) {
    this.round++;
    this.court = first ? 0 : this.random.int(COURTS.length);
    this.ballType = first ? 0 : this.random.int(BALLS.length);
    this.players = [makePlayer(0, first ? 0 : this.random.int(4)), makePlayer(1, first ? 0 : this.random.int(4))];
    this.ball = particle(WIDTH / 2, 94, BALLS[this.ballType].radius);
    this.ball.owner = -1;
    this.ball.holdTicks = 0;
    this.ball.spin = 0;
    this.phase = 'countdown';
    this.timer = first ? 100 : 75;
    this.pickupCD = 0;
    this.stealCD = 0;
    this.staleTicks = 0;
  }

  get condition() {
    return `${COURTS[this.court].name} · ${BALLS[this.ballType].name}`;
  }

  release(side, dunk = false) {
    const b = this.ball, p = this.players[side];
    if (b.owner !== side) return;
    const hand = p.pts[p.lead], target = HOOPS[p.target];
    const x = num(hand.x) + p.d * 3, y = num(hand.y) - 4;
    const error = dunk ? 23 : 9 + Math.abs(p.charge - 26) * 0.65 + Math.abs(num(hand.x) - target.x) * 0.025;
    const aim = target.x + this.random.range(-error, error);
    b.owner = -1;
    b.holdTicks = 0;
    this.pickupCD = 15;
    p.charge = 0;
    if (dunk && Math.abs(x - target.x) < 31 && y < RIM_Y + 5 && y > RIM_Y - 48) {
      setBallPosition(b, clamp(x, target.left - 7, target.right + 7), Math.min(y, RIM_Y - 9), this.random.range(-32, 32), this.random.range(145, 205));
      p.dunkTime = 0;
      return;
    }
    const spec = BALLS[this.ballType];
    const seconds = clamp(0.72 + Math.abs(aim - x) / 650, 0.72, 1.16);
    const vx = clamp((aim - x) / seconds + this.random.range(-10, 10), -440, 440);
    const vy = clamp((RIM_Y - 5 - y - 0.5 * spec.gravity * seconds * seconds) / seconds, -560, -160);
    setBallPosition(b, x, y, vx, vy);
    p.dunkTime = 0;
  }

  pickup() {
    const b = this.ball;
    if (b.owner !== -1) {
      const owner = this.players[b.owner], defender = this.players[1 - b.owner];
      if (b.holdTicks > 22 && this.stealCD === 0) {
        const reach = fix(BALLS[this.ballType].radius + 5) ** 2;
        if (handDistance(defender, b, 4) < reach || handDistance(defender, b, 6) < reach) {
          b.owner = defender.side; b.holdTicks = 0; owner.charge = 0;
          this.stealCD = 35;
        }
      }
      return;
    }
    if (this.pickupCD > 0) return;
    let best = -1, bestDistance = Infinity;
    for (const p of this.players) {
      const reach = fix(BALLS[this.ballType].radius + 8) ** 2;
      for (const i of [4, 6]) {
        const d = handDistance(p, b, i);
        if (d < reach && d < bestDistance) { best = p.side; bestDistance = d; }
      }
    }
    if (best !== -1) { b.owner = best; b.holdTicks = 0; this.players[best].charge = 0; }
  }

  score(side) {
    if (this.phase !== 'play') return;
    const points = this.ballType === 3 ? 2 : 1;
    this.scores[side] += points;
    this.lastScorer = side;
    this.phase = 'score';
    this.timer = 105;
    this.ball.owner = -1;
    this.bounces++;
  }

  step(inputs = [EMPTY, EMPTY]) {
    this.tick++;
    if (this.pickupCD > 0) this.pickupCD--;
    if (this.stealCD > 0) this.stealCD--;
    if (this.phase === 'over') return;
    if (this.phase === 'countdown') {
      if (--this.timer <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'score') {
      if (--this.timer <= 0) {
        if (Math.max(...this.scores) >= TARGET_SCORE) {
          this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
          this.phase = 'over';
        } else this.resetRound();
      }
      return;
    }
    const b = this.ball, oldY = b.y;
    for (const p of this.players) {
      const held = b.owner === p.side;
      const towardBall = b.owner === -1 && Math.abs(b.x - p.pts[0].x) > fix(14) ? Math.sign(b.x - p.pts[0].x) : p.d;
      const events = stepPlayer(p, inputs[p.side] || EMPTY, this.court, held, this.tick, towardBall);
      if (held) {
        p.charge++;
        if (events.dunkPress && p.dunkTime > 0) {
          const target = HOOPS[p.target], hand = p.pts[p.lead];
          const seconds = 0.72;
          const vx = clamp((target.x - p.d * 12 - num(hand.x)) / seconds / 60, -5.5, 5.5);
          for (const q of p.pts) {
            q.px = q.x - fix(vx);
            q.py = q.y + fix(6.1);
          }
        }
      }
    }
    collidePlayers(this.players[0], this.players[1]);
    for (const p of this.players) {
      if (b.owner !== p.side) continue;
      b.holdTicks++;
      const hand = p.pts[p.lead];
      setBallPosition(b, num(hand.x) + p.d * 3, num(hand.y) - 4);
      if (p.dunkTime > 0) {
        const h = HOOPS[p.target];
        if (Math.abs(num(hand.x) - h.x) < 24 && num(hand.y) < RIM_Y - 5 && num(hand.y) > RIM_Y - 43) this.release(p.side, true);
        else if (p.dunkTime <= 8) this.release(p.side, true);
      } else if ((!inputs[p.side]?.jump && p.wasJump === false && p.charge > 4) || b.holdTicks > 165) {
        this.release(p.side);
      }
    }
    if (b.owner === -1) {
      collideBall(b, BALLS[this.ballType], this.court, this.players, () => this.bounces++);
      b.spin += (b.x - b.px) / 12;
      this.staleTicks = Math.abs(b.x - b.px) + Math.abs(b.y - b.py) < fix(0.35) ? this.staleTicks + 1 : 0;
      if (this.staleTicks > 120) { ballVelocity(b, b.x < fix(WIDTH / 2) ? 50 : -50, -80); this.staleTicks = 0; }
      this.pickup();
      if (b.owner === -1 && oldY < fix(RIM_Y) && b.y >= fix(RIM_Y) && b.y > b.py) {
        for (const side of [0, 1]) {
          const h = HOOPS[side];
          if (b.x > fix(h.left + 5) && b.x < fix(h.right - 5)) this.score(1 - side);
        }
      }
    }
  }

  snapshot() {
    return {
      tick: this.tick, seed: this.seed, rng: this.random.state, scores: [...this.scores],
      round: this.round, phase: this.phase, timer: this.timer, court: this.court,
      ballType: this.ballType, winner: this.winner,
      ball: [this.ball.x, this.ball.y, this.ball.px, this.ball.py, this.ball.owner],
      players: this.players.map(p => [p.angle, p.av, p.jumpCD, p.dunkCD, p.dunkTime, p.pts.flatMap(q => [q.x, q.y, q.px, q.py])])
    };
  }
}
