import { FP, fix, num, mul, div, root, sin, cos, clamp, dist2 } from './math.js';

export const WIDTH = 480, HEIGHT = 270, FLOOR = 222, RIM_Y = 126;
export const STEP = 1 / 60;
export const HOOPS = [
  { x: 42, left: 28, right: 56, board: 18, dir: 1 },
  { x: 438, left: 424, right: 452, board: 462, dir: -1 }
];
export const COURTS = [
  { name: 'BACKYARD', friction: 0.82, bounce: 0.68 },
  { name: 'BEACH', friction: 0.72, bounce: 0.59 },
  { name: 'SNOW', friction: 0.97, bounce: 0.72 },
  { name: 'NIGHT COURT', friction: 0.85, bounce: 0.7 }
];
export const BALLS = [
  { name: 'NORMAL BALL', radius: 7, gravity: 700, bounce: 1 },
  { name: 'HEAVY BALL', radius: 8, gravity: 850, bounce: 0.78 },
  { name: 'BOUNCY BALL', radius: 6, gravity: 650, bounce: 1.18 },
  { name: 'RAINBOW BALL · 2 PTS', radius: 7, gravity: 700, bounce: 1 }
];
export const VARIANTS = ['NORMAL', 'LONG ARMS', 'BIG HEAD', 'SHORT LEGS'];
const LINKS = [[0,1],[1,2],[1,3],[3,4],[1,5],[5,6],[0,7],[7,8],[0,9],[9,10],[7,9]];
const RADII = [5, 5, 6, 2, 3, 2, 3, 2, 3, 2, 4];
const WEIGHTS = [1, 1, 1, 2, 3, 2, 3, 2, 3, 2, 3];
const gStep = gravity => Math.floor(gravity * FP / 3600);

export function particle(x, y, r, w = 1) {
  x = fix(x); y = fix(y);
  return { x, y, px: x, py: y, r: fix(r), w };
}
const velocity = p => ({ x: p.x - p.px, y: p.y - p.py });
export function impulse(p, x, y) { p.px -= fix(x); p.py -= fix(y); }
function place(p, x, y, vx = 0, vy = 0) {
  p.x = fix(x); p.y = fix(y);
  p.px = p.x - fix(vx * STEP); p.py = p.y - fix(vy * STEP);
}
function move(p, x, y) { p.x += x; p.y += y; p.px += x; p.py += y; }

export function makePlayer(side, variant = 0) {
  const x = side ? 326 : 154, d = side ? -1 : 1;
  const leg = variant === 3 ? 9 : 12, arm = variant === 1 ? 16 : 10;
  const hip = FLOOR - leg * 2 - 1;
  const pts = [
    [x, hip], [x, hip - 17], [x, hip - 30],
    [x - 5, hip - 17 + arm], [x - 7, hip - 17 + arm * 2],
    [x + 5, hip - 17 + arm], [x + 7, hip - 17 + arm * 2],
    [x - 4, hip + leg], [x - 6, FLOOR - 3],
    [x + 4, hip + leg], [x + 6, FLOOR - 3]
  ].map(([a, b], i) => particle(a, b, i === 2 ? (variant === 2 ? 9 : 6) : RADII[i], WEIGHTS[i]));
  const links = LINKS.map(([a, b]) => ({ a, b, len: root(dist2(pts[a], pts[b])) }));
  return {
    side, d, variant, pts, links, leg, arm, angle: 0, av: 0,
    jumpCD: 0, dunkCD: 0, dunkTime: 0, charge: 0, wasJump: false, wasDunk: false,
    grounded: true, target: side ? 0 : 1, lead: side ? 4 : 6
  };
}

export function shiftPlayer(p, x, y) {
  for (const q of p.pts) move(q, fix(x), fix(y));
}

function integrate(p, gravity, damping) {
  const vx = mul(p.x - p.px, damping), vy = mul(p.y - p.py, damping) + gravity;
  p.px = p.x; p.py = p.y;
  p.x += vx; p.y += vy;
}

function solve(links, pts) {
  for (const l of links) {
    const a = pts[l.a], b = pts[l.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = root(dx * dx + dy * dy) || 1;
    const f = div(d - l.len, d), total = a.w + b.w;
    const cx = mul(dx, f), cy = mul(dy, f);
    a.x += Math.floor(cx * a.w / total); a.y += Math.floor(cy * a.w / total);
    b.x -= Math.floor(cx * b.w / total); b.y -= Math.floor(cy * b.w / total);
  }
}

function pose(p, holding, jump, dunk) {
  const hip = p.pts[0], s = sin(p.angle), c = cos(p.angle), d = p.d;
  const rotate = (x, y) => [mul(x, c) - mul(y, s), mul(x, s) + mul(y, c)];
  const armsUp = holding || jump || dunk;
  const idle = [[0,0],[0,-17],[0,-30],[-5,-17+p.arm],[-7,-17+p.arm*2],[5,-17+p.arm],[7,-17+p.arm*2]];
  const raised = [[0,0],[0,-17],[0,-30],[-d*7,-12],[-d*11,-23],[d*9,-21],[d*14,-32]];
  const a = armsUp ? raised : idle;
  const leg = p.leg, tuck = p.grounded ? 0 : 4;
  const targets = [...a, [-5,leg-tuck],[-7,leg*2-tuck*2],[5,leg-tuck],[7,leg*2-tuck*2]];
  for (let i = 1; i < p.pts.length; i++) {
    const [x, y] = rotate(fix(targets[i][0]), fix(targets[i][1]));
    const strength = fix(i === 1 ? 0.045 : i === 2 ? 0.018 : armsUp && i <= 6 ? 0.035 : 0.018);
    const q = p.pts[i];
    q.x += mul(hip.x + x - q.x, strength);
    q.y += mul(hip.y + y - q.y, strength);
  }
}

function ground(p, friction) {
  let contact = false;
  for (const q of p.pts) {
    const floor = fix(FLOOR) - q.r;
    if (q.y >= floor - fix(1.5)) contact = true;
    if (q.y > floor) {
      const vx = q.x - q.px, vy = q.y - q.py;
      q.y = floor;
      q.px = q.x - mul(vx, friction);
      q.py = q.y + Math.max(0, mul(vy, fix(0.08)));
    }
  }
  return contact;
}

export function stepPlayer(p, input, court, holding, tick, moveDir = p.d) {
  if (p.jumpCD > 0) p.jumpCD--;
  if (p.dunkCD > 0) p.dunkCD--;
  const jump = !!input.jump, dunk = !!input.dunk;
  const press = jump && !p.wasJump, dunkPress = dunk && !p.wasDunk;
  p.wasJump = jump; p.wasDunk = dunk;
  const hip = p.pts[0];
  const outside = p.side === 0 ? num(hip.x) > 240 : num(hip.x) < 240;
  const direction = outside ? -p.d : moveDir;
  if (p.dunkTime > 0) {
    p.dunkTime--;
  } else if (dunkPress && p.dunkCD === 0) {
    p.dunkCD = 100;
    p.dunkTime = holding ? 42 : 18;
    const target = HOOPS[p.target];
    const distance = target.x - num(hip.x) - p.d * 12;
    const vx = holding ? clamp(distance / 0.72 / 60, -5.5, 5.5) : direction * 3;
    for (const q of p.pts) impulse(q, vx, holding ? -6.1 : -4.6);
    p.av += fix(direction * 0.025);
  } else if (press && p.jumpCD === 0) {
    const nearFloor = p.grounded || num(hip.y) > FLOOR - 31;
    if (nearFloor) {
      const vx = direction * (1.55 + num(sin(p.angle)) * 1.4);
      for (const q of p.pts) impulse(q, vx, -5.3);
      p.av += fix(direction * 0.045);
      p.jumpCD = 18;
    } else {
      for (const q of p.pts) impulse(q, direction * 0.38, -0.22);
      p.av += fix(direction * 0.035);
      p.jumpCD = 14;
    }
  }
  const sway = num(sin(fix((p.side ? 1.7 : 0) + tick / 60 * 2.7))) * 0.24;
  const target = sway + (jump ? direction * 0.18 : 0);
  p.av += mul(fix(target) - p.angle, fix(p.grounded ? 0.025 : 0.0018));
  p.av = mul(p.av, fix(p.grounded ? 0.83 : 0.985));
  p.angle += p.av;
  if (p.angle > fix(Math.PI)) p.angle -= fix(Math.PI * 2);
  if (p.angle < -fix(Math.PI)) p.angle += fix(Math.PI * 2);
  for (const q of p.pts) integrate(q, gStep(700), fix(0.998));
  pose(p, holding, jump, dunk);
  for (let i = 0; i < 6; i++) solve(p.links, p.pts);
  p.grounded = ground(p, fix(COURTS[court].friction));
  const x = num(hip.x);
  let lo = 25, hi = 455;
  if (p.dunkTime === 0 && !outside) { if (p.side === 0) hi = 232; else lo = 248; }
  if (x < lo) shiftPlayer(p, lo - x, 0);
  if (x > hi) shiftPlayer(p, hi - x, 0);
  for (const q of p.pts) if (q.y < q.r) { q.y = q.r; q.py = q.y; }
  return { press, dunkPress };
}

export function collidePlayers(a, b) {
  for (const i of [0, 1, 2]) for (const j of [0, 1, 2]) {
    const p = a.pts[i], q = b.pts[j];
    const dx = q.x - p.x, dy = q.y - p.y, rr = p.r + q.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) continue;
    const d = root(d2), overlap = (rr - d) >> 1;
    const cx = Math.floor(dx * overlap / d), cy = Math.floor(dy * overlap / d);
    move(p, -cx, -cy); move(q, cx, cy);
  }
}

function reflect(ball, nx, ny, restitution, surfaceVX = 0, surfaceVY = 0) {
  const vx = ball.x - ball.px - surfaceVX, vy = ball.y - ball.py - surfaceVY;
  const dot = mul(vx, nx) + mul(vy, ny);
  if (dot >= 0) return false;
  const j = mul(dot, fix(1 + restitution));
  ball.px = ball.x - (vx - mul(j, nx) + surfaceVX);
  ball.py = ball.y - (vy - mul(j, ny) + surfaceVY);
  return true;
}

export function collideBall(ball, spec, court, players, onBounce) {
  const r = fix(spec.radius), gravity = gStep(spec.gravity);
  integrate(ball, gravity, fix(0.999));
  let vx = ball.x - ball.px, vy = ball.y - ball.py;
  const max = fix(650 / 60);
  vx = clamp(vx, -max, max); vy = clamp(vy, -max, max);
  ball.px = ball.x - vx; ball.py = ball.y - vy;
  if (ball.y > fix(FLOOR) - r) {
    ball.y = fix(FLOOR) - r;
    const bounce = clamp(COURTS[court].bounce * spec.bounce, 0.35, 0.88);
    ball.py = ball.y + mul(Math.max(0, vy), fix(bounce));
    ball.px = ball.x - mul(vx, fix(court === 2 ? 0.99 : 0.94));
    if (vy > fix(0.8)) onBounce();
  }
  if (ball.x < r || ball.x > fix(WIDTH) - r) {
    ball.x = clamp(ball.x, r, fix(WIDTH) - r);
    ball.px = ball.x + mul(vx, fix(0.7));
  }
  if (ball.y < r) { ball.y = r; ball.py = ball.y + mul(vy, fix(0.65)); }
  for (const h of HOOPS) {
    const bx = fix(h.board);
    if (ball.y > fix(70) - r && ball.y < fix(139) + r && Math.abs(ball.x - bx) < r + fix(2)) {
      const sign = ball.px < bx ? -1 : 1;
      ball.x = bx + sign * (r + fix(2));
      reflect(ball, fix(sign), 0, 0.66);
    }
    for (const x of [h.left, h.right]) {
      const dx = ball.x - fix(x), dy = ball.y - fix(RIM_Y), rr = r + fix(2.5);
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0) {
        const d = root(d2), nx = div(dx, d), ny = div(dy, d);
        ball.x = fix(x) + mul(nx, rr); ball.y = fix(RIM_Y) + mul(ny, rr);
        if (reflect(ball, nx, ny, 0.64)) onBounce();
      }
    }
  }
  for (const p of players) for (let i = 0; i < p.pts.length; i++) {
    if (i === 3 || i === 5 || i === 7 || i === 9) continue;
    const q = p.pts[i], dx = ball.x - q.x, dy = ball.y - q.y, rr = r + q.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) continue;
    const d = root(d2), nx = div(dx, d), ny = div(dy, d), overlap = rr - d;
    ball.x += mul(nx, mul(overlap, fix(0.85))); ball.y += mul(ny, mul(overlap, fix(0.85)));
    move(q, -mul(nx, mul(overlap, fix(0.15))), -mul(ny, mul(overlap, fix(0.15))));
    const pv = velocity(q);
    if (reflect(ball, nx, ny, 0.58, mul(pv.x, fix(0.65)), mul(pv.y, fix(0.65)))) onBounce();
  }
}

export function ballVelocity(ball, vx, vy) {
  ball.px = ball.x - fix(vx * STEP); ball.py = ball.y - fix(vy * STEP);
}
export function setBallPosition(ball, x, y, vx = 0, vy = 0) { place(ball, x, y, vx, vy); }
