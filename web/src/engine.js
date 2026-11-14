import { Random, FP, fix, num, clamp, dist2 } from './math.js';
import {
  WIDTH, RIM_Y, HOOPS, COURTS, BALLS, JERSEYS, SKIN_TONES, HAIR_COLORS, VARIANTS,
  SHOT_CHARGE_TICKS, makePlayer, stepPlayer, collidePlayers, collideBall,
  particle, ballVelocity, setBallPosition
} from './physics.js';

const GRAVITIES = [
  { scale: 0.78, name: 'LOW GRAVITY' },
  { scale: 1, name: '' },
  { scale: 1.22, name: 'HEAVY GRAVITY' }
];

export const EMPTY = Object.freeze({ jump: false, dunk: false });
export const TARGET_SCORE = 5;
const handDistance = (p, b, i) => dist2(p.pts[i], b);
const particleSpeed = q => ({ x: (q.x - q.px) * 60 / FP, y: (q.y - q.py) * 60 / FP });

export class Game {
  constructor(seed = 1, names = ['PLAYER 1', 'PLAYER 2'], teamSize = 2) {
    this.seed = seed >>> 0;
    this.random = new Random(this.seed);
    this.names = names;
    this.teamSize = teamSize === 1 ? 1 : 2;
    this.scores = [0, 0];
    this.round = 0;
    this.tick = 0;
    this.bounces = 0;
    this.pickupCD = 0;
    this.stealCD = 0;
    this.staleTicks = 0;
    this.deadTicks = 0;
    this.lastScorer = -1;
    this.lastShot = null;
    this.winner = -1;
    this.resetRound(true);
  }

  resetRound(first = false) {
    this.round++;
    this.court = first ? 0 : this.random.int(COURTS.length);
    this.ballType = first ? 0 : this.random.int(BALLS.length);
    const offset = first ? 0 : [-10, 0, 10][this.random.int(3)];
    const width = first ? 28 : [24, 28, 32][this.random.int(3)];
    this.hoopSway = first ? 0 : this.random.int(4) === 0 ? 6 : 0;
    this.hoops = HOOPS.map(h => ({ ...h, y: RIM_Y + offset, baseY: RIM_Y + offset, width, left: h.x - width / 2, right: h.x + width / 2 }));
    this.hoopLabel = this.hoopSway ? 'MOVING HOOP' : offset < 0 ? 'HIGH HOOP' : offset > 0 ? 'LOW HOOP' : width < 28 ? 'NARROW HOOP' : width > 28 ? 'WIDE HOOP' : 'NORMAL HOOP';
    const gravity = first ? GRAVITIES[1] : GRAVITIES[this.random.int(GRAVITIES.length)];
    this.gravity = gravity.scale;
    this.roundLabel = gravity.name || this.hoopLabel;
    const kit0 = this.random.int(JERSEYS.length);
    const kit1 = (kit0 + 1 + this.random.int(JERSEYS.length - 1)) % JERSEYS.length;
    this.players = [];
    for (const side of [0, 1]) for (let slot = 0; slot < this.teamSize; slot++) {
      this.players.push(makePlayer(side, this.random.int(VARIANTS.length), slot, {
        skin: this.random.int(SKIN_TONES.length),
        hair: this.random.int(HAIR_COLORS.length),
        kit: side ? kit1 : kit0
      }, this.teamSize));
    }
    this.ball = particle(WIDTH / 2, 94, BALLS[this.ballType].radius);
    this.ball.owner = -1;
    this.ball.holdTicks = 0;
    this.ball.spin = 0;
    this.ball.lastPower = 0;
    this.ball.ignore = -1;
    this.ball.ignoreTicks = 0;
    this.phase = 'countdown';
    this.timer = first ? 100 : 75;
    this.pickupCD = 0;
    this.stealCD = 0;
    this.staleTicks = 0;
    this.deadTicks = 0;
  }

  get condition() {
    const gravity = GRAVITIES.find(g => g.scale === this.gravity);
    return `${COURTS[this.court].name} · ${BALLS[this.ballType].name}${gravity && gravity.name ? ' · ' + gravity.name : ''}`;
  }

  moveHoops() {
    if (!this.hoopSway) return;
    const y = Math.round(Math.sin(this.tick / 28) * this.hoopSway);
    for (const h of this.hoops) h.y = h.baseY + y;
  }

  release(index, dunk = false) {
    const b = this.ball, p = this.players[index];
    if (b.owner !== index) return;
    const side = p.side, hand = p.pts[p.lead], target = this.hoops[p.target];
    const x = num(hand.x) + p.d * 3, y = num(hand.y) - 4;
    const power = clamp(p.charge / SHOT_CHARGE_TICKS, 0, 1);
    const hv = particleSpeed(hand), bv = particleSpeed(p.pts[0]);
    b.owner = -1;
    b.holdTicks = 0;
    b.lastPower = power;
    b.ignore = index;
    b.ignoreTicks = 10;
    this.pickupCD = dunk ? 35 : 12;
    p.charge = 0;
    p.lastShotPower = power;
    if (dunk && Math.abs(x - target.x) < 30 && y < target.y + 2 && y > target.y - 36) {
      // Slam: drive the ball down through the hoop, aimed at its center.
      const vx = clamp((target.x - x) * 2.5 + hv.x * 0.2 + this.random.range(-25, 25), -140, 140);
      const vy = clamp(200 + hv.y * 0.1 + this.random.range(0, 40), 170, 280);
      setBallPosition(b, x, y, vx, vy);
      this.lastShot = { side, power: 1, dunk: true, speed: Math.hypot(vx, vy) };
      p.dunkTime = 0;
      return;
    }
    const distance = target.x - x;
    const loft = dunk ? 46 : 72 + Math.abs(distance) * 0.36 + (1 - power) * 10;
    let dx = distance + hv.x * 0.045 + bv.x * 0.035;
    let dy = target.y - y - loft + hv.y * 0.045;
    if (dunk) dx += p.d * 18;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = dunk ? 250 + 170 * power : 222 + 196 * power;
    const vx = clamp(speed * dx / length, -380, 380);
    const vy = clamp(speed * dy / length, -420, 160);
    setBallPosition(b, x, y, vx, vy);
    this.lastShot = { side, power, dunk, speed: Math.hypot(vx, vy) };
    p.dunkTime = 0;
  }

  pickup() {
    const b = this.ball;
    if (b.owner !== -1) {
      const owner = this.players[b.owner];
      if (b.holdTicks > 22 && this.stealCD === 0) {
        const reach = fix(BALLS[this.ballType].radius + 5) ** 2;
        for (let index = 0; index < this.players.length; index++) {
          const defender = this.players[index];
          if (defender.side === owner.side) continue;
          if (handDistance(defender, b, 4) < reach || handDistance(defender, b, 6) < reach) {
            b.owner = index; b.holdTicks = 0; owner.charge = 0;
            this.stealCD = 35;
            break;
          }
        }
      }
      return;
    }
    if (this.pickupCD > 0) return;
    let best = -1, bestDistance = Infinity;
    for (let index = 0; index < this.players.length; index++) {
      const p = this.players[index], reach = fix(BALLS[this.ballType].radius + 14) ** 2;
      for (const i of [4, 6]) {
        const d = handDistance(p, b, i);
        if (d < reach && d < bestDistance) { best = index; bestDistance = d; }
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
      this.moveHoops();
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
    this.moveHoops();
    for (let index = 0; index < this.players.length; index++) {
      const p = this.players[index], input = inputs[p.side] || EMPTY, held = b.owner === index;
      const moveDir = b.owner === -1 && Math.abs(b.x - p.pts[0].x) > fix(14) ? Math.sign(b.x - p.pts[0].x) : p.d;
      stepPlayer(p, input, this.court, held, this.tick, moveDir, this.hoops, this.gravity);
      if (held && input.jump) p.charge = Math.min(p.charge + 1, SHOT_CHARGE_TICKS);
    }
    for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) collidePlayers(this.players[i], this.players[j]);
    for (let index = 0; index < this.players.length; index++) {
      const p = this.players[index];
      if (b.owner !== index) continue;
      b.holdTicks++;
      const hand = p.pts[p.lead], input = inputs[p.side] || EMPTY;
      setBallPosition(b, num(hand.x) + p.d * 3, num(hand.y) - 4);
      if (p.dunkTime > 0) {
        const h = this.hoops[p.target];
        if (Math.abs(num(hand.x) - h.x) < 16 && num(hand.y) < h.y + 2 && num(hand.y) > h.y - 34) this.release(index, true);
        else if (p.dunkTime <= 8) this.release(index, true);
      } else if ((!input.jump && p.charge > 0) || b.holdTicks > 240) {
        this.release(index);
      }
    }
    if (b.owner === -1) {
      if (b.ignoreTicks > 0) b.ignoreTicks--;
      const colliders = b.ignoreTicks > 0 ? this.players.filter((_, i) => i !== b.ignore) : this.players;
      collideBall(b, BALLS[this.ballType], this.court, colliders, () => this.bounces++, this.hoops, this.gravity);
      b.spin += (b.x - b.px) / 12;
      this.staleTicks = Math.abs(b.x - b.px) + Math.abs(b.y - b.py) < fix(0.5) ? this.staleTicks + 1 : 0;
      if (this.staleTicks > 90) { ballVelocity(b, b.x < fix(WIDTH / 2) ? 70 : -70, -110); this.staleTicks = 0; }
      // Pinch rescue: ball squeezed against a body and barely moving pops free.
      if (Math.abs(b.x - b.px) + Math.abs(b.y - b.py) < fix(1.2)) {
        for (const p of this.players) {
          let hit = false;
          for (let i = 0; i < p.pts.length; i++) {
            if (i === 3 || i === 5 || i === 7 || i === 9) continue;
            const q = p.pts[i], rr = fix(BALLS[this.ballType].radius) + q.r;
            if (dist2(q, b) < rr * rr) { hit = true; break; }
          }
          if (hit) { ballVelocity(b, b.x < fix(WIDTH / 2) ? 60 : -60, -90); break; }
        }
      }
      const behindBoard = b.x < fix(this.hoops[0].board - 2) || b.x > fix(this.hoops[1].board + 2);
      this.deadTicks = behindBoard ? this.deadTicks + 1 : 0;
      if (this.deadTicks > 40) { ballVelocity(b, b.x < fix(WIDTH / 2) ? 150 : -150, -180); this.deadTicks = 0; }
      this.pickup();
      if (b.owner === -1) {
        for (const side of [0, 1]) {
          const h = this.hoops[side], rim = fix(h.y);
          if (oldY < rim && b.y >= rim && b.y > b.py && b.x > fix(h.left + 5) && b.x < fix(h.right - 5)) this.score(1 - side);
        }
      }
    }
  }

  snapshot() {
    return {
      tick: this.tick, seed: this.seed, rng: this.random.state, scores: [...this.scores],
      round: this.round, phase: this.phase, timer: this.timer, court: this.court,
      ballType: this.ballType, teamSize: this.teamSize, winner: this.winner, hoops: this.hoops,
      gravity: this.gravity, hoopSway: this.hoopSway, roundLabel: this.roundLabel,
      hoopLabel: this.hoopLabel, bounces: this.bounces, pickupCD: this.pickupCD, stealCD: this.stealCD,
      staleTicks: this.staleTicks, deadTicks: this.deadTicks, lastScorer: this.lastScorer, lastShot: this.lastShot,
      ball: [this.ball.x, this.ball.y, this.ball.px, this.ball.py, this.ball.owner, this.ball.holdTicks, this.ball.ignore, this.ball.ignoreTicks],
      players: this.players.map(p => [p.angle, p.av, p.legAngle, p.legV, p.swing, p.swingV, p.charge, p.jumpCD, p.jumpCount, p.coyote, p.dunkCD, p.dunkTime, p.wasJump, p.wasDunk, p.grounded, p.skin, p.hair, p.kit, p.pts.flatMap(q => [q.x, q.y, q.px, q.py])])
    };
  }
}
