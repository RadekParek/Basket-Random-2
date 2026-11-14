import { FP, fix, num, mul, div, root, sin, cos, clamp } from './math.js';

export const WIDTH = 480, HEIGHT = 270, FLOOR = 222, RIM_Y = 126;
export const STEP = 1 / 60;
export const SHOT_CHARGE_TICKS = 24;
export const DUNK_COOLDOWN = 150;
export const HOOPS = [
  { x: 42, left: 28, right: 56, board: 18, dir: 1, y: RIM_Y, width: 28 },
  { x: 438, left: 424, right: 452, board: 462, dir: -1, y: RIM_Y, width: 28 }
];
export const COURTS = [
  { name: 'CITY', friction: 0.82, bounce: 0.68 },
  { name: 'BEACH', friction: 0.72, bounce: 0.59 },
  { name: 'SNOW', friction: 0.97, bounce: 0.72 },
  { name: 'GYM', friction: 0.85, bounce: 0.7 }
];
export const BALLS = [
  { name: 'NORMAL BALL', radius: 7, gravity: 700, bounce: 1 },
  { name: 'HEAVY BALL', radius: 8, gravity: 850, bounce: 0.78 },
  { name: 'LIGHT BALL', radius: 6, gravity: 620, bounce: 1.16 },
  { name: 'COLORFUL BALL · 2 PTS', radius: 7, gravity: 700, bounce: 1 }
];
export const VARIANTS = ['NORMAL', 'LONG ARMS', 'BIG HEAD', 'SHORT ARMS', 'TALL', 'SHORT'];
export const SKIN_TONES = ['#f0c8a0', '#dba87e', '#bb8058', '#9c684c', '#7a4b35', '#5c3826'];
export const HAIR_COLORS = ['#25252b', '#34302b', '#583b2c', '#8a5a30', '#d4ae48', '#b9b9bd'];
export const JERSEYS = [
  { jersey: '#e34f43', trim: '#fff2df', shorts: '#25252b' },
  { jersey: '#f2c342', trim: '#754a91', shorts: '#25252b' },
  { jersey: '#3f78c6', trim: '#f4d351', shorts: '#20232a' },
  { jersey: '#f3f0e6', trim: '#e34f43', shorts: '#25252b' },
  { jersey: '#7b52a1', trim: '#f2c342', shorts: '#20232a' },
  { jersey: '#3f9a63', trim: '#fff2df', shorts: '#25252b' },
  { jersey: '#e87fb0', trim: '#25252b', shorts: '#20232a' },
  { jersey: '#2b2f38', trim: '#e34f43', shorts: '#15171c' }
];
const CORE = [0, 1, 2, 7, 8, 9, 10];
const RADII = [5, 5, 6, 2, 3, 2, 3, 2, 3, 2, 4];
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

export function makePlayer(side, variant = 0, slot = 0, look = {}, teamSize = 2) {
  const x = teamSize === 1 ? (side ? 306 : 174) : side ? (slot ? 306 : 354) : (slot ? 174 : 126);
  const d = side ? -1 : 1;
  const leg = variant === 4 ? 15 : variant === 5 ? 9 : 12;
  const arm = variant === 1 ? 15 : variant === 3 ? 8 : 11;
  const torso1 = variant === 4 ? 22 : variant === 5 ? 14 : 18;
  const torso2 = variant === 4 ? 38 : variant === 5 ? 26 : 32;
  const hip = FLOOR - leg * 2 - 2;
  const pts = [
    [x, hip], [x, hip - torso1], [x, hip - torso2],
    [x - 4, hip - torso1 + arm], [x - 5, hip - torso1 + arm * 2],
    [x + 4, hip - torso1 + arm], [x + 5, hip - torso1 + arm * 2],
    [x - 2, hip + leg], [x - 4, hip + leg * 2],
    [x + 2, hip + leg], [x + 4, hip + leg * 2]
  ].map(([a, b], i) => particle(a, b, i === 2 ? (variant === 2 ? 8 : 6) : RADII[i], 1));
  const links = [[1, 3], [3, 4], [1, 5], [5, 6]].map(([a, b]) => ({ a, b, len: fix(arm) }));
  return {
    side, d, variant, slot, pts, links, leg, arm, torso1, torso2,
    skin: look.skin || 0, hair: look.hair || 0, kit: look.kit || 0, number: slot + 1,
    angle: 0, av: 0, legAngle: 0, legV: 0, swing: 0, swingV: 0,
    jumpCD: 0, jumpCount: 0, coyote: 0, dunkCD: 0, dunkTime: 0, charge: 0,
    lastShotPower: 0, wasJump: false, wasDunk: false, grounded: true,
    target: side ? 0 : 1, lead: side ? 4 : 6
  };
}

export function shiftPlayer(p, x, y) { for (const q of p.pts) move(q, fix(x), fix(y)); }
function impulsePlayer(p, x, y) { for (const q of p.pts) impulse(q, x, y); }
function integrate(p, gravity, damping) {
  const vx = mul(p.x - p.px, damping), vy = mul(p.y - p.py, damping) + gravity;
  p.px = p.x; p.py = p.y; p.x += vx; p.y += vy;
}
function rotate(x, y, s, c) { return [mul(x, c) - mul(y, s), mul(x, s) + mul(y, c)]; }

function placeCore(p) {
  const hip = p.pts[0], leg = p.leg;
  const ts = sin(p.angle), tc = cos(p.angle), ls = sin(p.legAngle), lc = cos(p.legAngle);
  const torso = [[1, 0, -p.torso1], [2, 0, -p.torso2]];
  for (const [id, ox, oy] of torso) {
    const [x, y] = rotate(fix(ox), fix(oy), ts, tc);
    p.pts[id].x = hip.x + x; p.pts[id].y = hip.y + y;
  }
  const legs = [[7, -2, leg], [8, -4, leg * 2], [9, 2, leg], [10, 4, leg * 2]];
  for (const [id, ox, oy] of legs) {
    const [x, y] = rotate(fix(ox), fix(oy), ls, lc);
    p.pts[id].x = hip.x + x; p.pts[id].y = hip.y + y;
  }
}

function solveArm(chest, elbow, hand, len) {
  for (let pass = 0; pass < 7; pass++) {
    let dx = hand.x - elbow.x, dy = hand.y - elbow.y;
    let d = root(dx * dx + dy * dy) || 1;
    let f = div(d - len, d), cx = mul(dx, f), cy = mul(dy, f);
    elbow.x += cx >> 1; elbow.y += cy >> 1;
    hand.x -= cx - (cx >> 1); hand.y -= cy - (cy >> 1);
    dx = elbow.x - chest.x; dy = elbow.y - chest.y;
    d = root(dx * dx + dy * dy) || 1; f = div(d - len, d);
    elbow.x -= mul(dx, f); elbow.y -= mul(dy, f);
  }
  const dx = hand.x - elbow.x, dy = hand.y - elbow.y;
  const d = root(dx * dx + dy * dy) || 1, f = div(d - len, d);
  hand.x -= mul(dx, f); hand.y -= mul(dy, f);
}

function poseArms(p, active) {
  const chest = p.pts[1], s = sin(p.angle), c = cos(p.angle), d = p.d;
  const swing = clamp(p.swing, 0, FP), reach = p.arm * 2;
  const phi = mul(swing, fix(2.55)), sx = sin(phi), cy = cos(phi);
  const lead = p.lead, other = lead === 6 ? 4 : 6;
  const elbow = lead === 6 ? 5 : 3, otherElbow = other === 6 ? 5 : 3;
  const bend = mul(fix(1) - swing, fix(3));
  const targets = new Array(11);
  const lx = mul(mul(sx, fix(reach)), fix(d)), ly = mul(cy, fix(reach));
  const ex = mul(lx, fix(0.52)) + mul(bend, fix(d)), ey = mul(ly, fix(0.52)) + bend;
  targets[elbow] = rotate(ex, ey, s, c); targets[lead] = rotate(lx, ly, s, c);
  const ox = mul(mul(sx, fix(Math.floor(reach * 0.78))), fix(-d)), oy = mul(cy, fix(Math.floor(reach * 0.78)));
  targets[otherElbow] = rotate(mul(ox, fix(0.5)) - bend, mul(oy, fix(0.5)) + bend, s, c);
  targets[other] = rotate(ox, oy, s, c);
  for (const i of [3, 4, 5, 6]) {
    const q = p.pts[i], t = targets[i];
    const strength = fix(active ? (i === lead ? 0.2 : 0.12) : 0.035);
    q.x += mul(chest.x + t[0] - q.x, strength);
    q.y += mul(chest.y + t[1] - q.y, strength);
  }
  solveArm(chest, p.pts[3], p.pts[4], p.links[0].len);
  solveArm(chest, p.pts[5], p.pts[6], p.links[2].len);
}

function groundPlayer(p, friction) {
  let lowest = -Infinity;
  for (const i of CORE) lowest = Math.max(lowest, p.pts[i].y + p.pts[i].r);
  const floor = fix(FLOOR);
  let contact = lowest >= floor - fix(1);
  if (lowest > floor) {
    const overlap = lowest - floor;
    for (const q of p.pts) move(q, 0, -overlap);
    const rootP = p.pts[0], vx = rootP.x - rootP.px, vy = rootP.y - rootP.py;
    if (vy > 0) {
      const bounce = mul(vy, fix(0.08)), slide = mul(vx, friction);
      for (const i of CORE) { const q = p.pts[i]; q.py = q.y + bounce; q.px = q.x - slide; }
      p.av = mul(p.av, fix(0.55)); p.legV = mul(p.legV, fix(0.5));
    }
  }
  for (const i of [3, 4, 5, 6]) {
    const q = p.pts[i], lim = floor - q.r;
    if (q.y > lim) { const vy = q.y - q.py; q.y = lim; q.py = q.y + Math.max(0, mul(vy, fix(0.05))); }
  }
  return contact;
}

export function stepPlayer(p, input, court, holding, tick, moveDir = p.d, hoops = HOOPS, gravity = 1) {
  if (p.jumpCD > 0) p.jumpCD--;
  if (p.dunkCD > 0) p.dunkCD--;
  if (p.coyote > 0) p.coyote--;
  const jump = !!input.jump, dunk = !!input.dunk;
  const press = jump && !p.wasJump, dunkPress = dunk && !p.wasDunk;
  p.wasJump = jump; p.wasDunk = dunk;
  const hip = p.pts[0];
  const outside = p.side === 0 ? num(hip.x) > 240 : num(hip.x) < 240;
  const direction = outside ? -p.d : moveDir;
  if (p.dunkTime > 0) {
    p.dunkTime--;
  } else if (dunkPress && p.dunkCD === 0) {
    p.dunkCD = DUNK_COOLDOWN;
    const h = hoops[p.target], distance = Math.abs(h.x - num(hip.x));
    if (holding && distance < 170 && (p.grounded || p.coyote > 0)) {
      p.dunkTime = 40;
      const seconds = 0.65;
      const vx = clamp((h.x - p.d * 12 - num(hip.x)) / seconds, -260, 260) / 60;
      const vy = clamp((h.y + 24 - num(hip.y) - 0.5 * 700 * gravity * seconds * seconds) / seconds, -410, -260) / 60;
      impulsePlayer(p, vx, vy);
      p.av = fix(direction * 0.02); p.legV = fix(direction * 0.01);
    } else {
      p.dunkTime = 14;
      impulsePlayer(p, direction * 2.4, -4.6);
      p.av += fix(direction * 0.02);
    }
    p.grounded = false; p.coyote = 0;
  } else if (press && p.jumpCD === 0) {
    if (p.grounded || p.coyote > 0) {
      const vx = clamp(direction * (1.35 + Math.abs(num(sin(p.angle))) * 2.6 + Math.abs(num(sin(p.legAngle))) * 0.9), -3.6, 3.6);
      impulsePlayer(p, vx, -5.6);
      p.av = fix(direction * (0.07 + Math.abs(num(sin(fix(tick * 0.13)))) * 0.02)) + mul(p.av, fix(0.3));
      p.legV += fix(direction * 0.016);
      p.jumpCD = 12; p.jumpCount++; p.grounded = false; p.coyote = 0;
    } else {
      p.av += fix(direction * 0.032); p.jumpCD = 10;
    }
  }
  const active = jump || holding || dunk || p.dunkTime > 0;
  p.swingV += mul((active ? FP : 0) - p.swing, fix(0.12));
  p.swingV = mul(p.swingV, fix(0.72));
  p.swing = clamp(p.swing + p.swingV, 0, FP);
  const sway = num(sin(fix((p.side ? 1.7 : 0) + p.slot * 0.9 + tick / 60 * 2.2))) * 0.22;
  const target = p.grounded ? sway + (jump ? direction * 0.14 : 0) : p.dunkTime > 0 && holding ? direction * 0.3 : 0;
  p.av += mul(fix(target) - p.angle, fix(p.grounded ? 0.05 : 0.002));
  if (!p.grounded) p.av += mul(sin(p.angle), fix(0.004));
  p.av = mul(p.av, fix(p.grounded ? 0.78 : 0.996));
  p.angle += p.av;
  if (p.angle > fix(Math.PI)) p.angle -= fix(Math.PI * 2);
  if (p.angle < -fix(Math.PI)) p.angle += fix(Math.PI * 2);
  const legTarget = mul(p.angle, fix(p.grounded ? 0.25 : 0.55));
  p.legV += mul(legTarget - p.legAngle, fix(p.grounded ? 0.06 : 0.015));
  p.legV = mul(p.legV, fix(p.grounded ? 0.72 : 0.97));
  p.legAngle = clamp(p.legAngle + p.legV, -fix(1.35), fix(1.35));
  integrate(hip, gStep(700 * gravity), fix(0.999));
  for (const i of [3, 4, 5, 6]) integrate(p.pts[i], gStep(520 * gravity), fix(0.992));
  placeCore(p); poseArms(p, active); placeCore(p);
  p.grounded = groundPlayer(p, fix(COURTS[court].friction));
  if (p.grounded) p.coyote = 5;
  const x = num(hip.x);
  let lo = 25, hi = 455;
  if (p.dunkTime === 0 && !outside) { if (p.side === 0) hi = 236; else lo = 244; }
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
    shiftPlayer(a, -num(cx), -num(cy)); shiftPlayer(b, num(cx), num(cy));
    a.av -= fix(0.004); b.av += fix(0.004);
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

export function collideBall(ball, spec, court, players, onBounce, hoops = HOOPS, gravityScale = 1) {
  const r = fix(spec.radius), gravity = gStep(spec.gravity * gravityScale);
  integrate(ball, gravity, fix(0.999));
  let vx = ball.x - ball.px, vy = ball.y - ball.py;
  const max = fix(520 / 60);
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
  for (const h of hoops) {
    const bx = fix(h.board), rim = fix(h.y);
    if (ball.y > rim - fix(56) - r && ball.y < rim + fix(13) + r && Math.abs(ball.x - bx) < r + fix(2)) {
      const sign = ball.px < bx ? -1 : 1;
      ball.x = bx + sign * (r + fix(2));
      reflect(ball, fix(sign), 0, 0.66);
    }
    for (const x of [h.left, h.right]) {
      const dx = ball.x - fix(x), dy = ball.y - rim, rr = r + fix(2.5);
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0) {
        const d = root(d2), nx = div(dx, d), ny = div(dy, d);
        ball.x = fix(x) + mul(nx, rr); ball.y = rim + mul(ny, rr);
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
    const pushX = mul(nx, mul(overlap, fix(0.15))), pushY = mul(ny, mul(overlap, fix(0.15)));
    const pv = velocity(q);
    if (i === 0 || i === 1 || i === 2 || i >= 7) {
      shiftPlayer(p, -num(pushX), -num(pushY));
      p.av += mul(pushX, fix(0.00002));
    } else move(q, -pushX, -pushY);
    if (reflect(ball, nx, ny, 0.58, mul(pv.x, fix(0.65)), mul(pv.y, fix(0.65)))) onBounce();
  }
}

export function ballVelocity(ball, vx, vy) {
  ball.px = ball.x - fix(vx * STEP); ball.py = ball.y - fix(vy * STEP);
}
export function setBallPosition(ball, x, y, vx = 0, vy = 0) { place(ball, x, y, vx, vy); }
