import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, EMPTY } from '../web/src/engine.js';
import { Bot, DIFFICULTIES } from '../web/src/bot.js';
import { Random, FP, fix, num, sin, cos, cleanName } from '../web/src/math.js';
import { HOOPS, RIM_Y, FLOOR } from '../web/src/physics.js';
import { ballVelocity, setBallPosition, shiftPlayer } from '../web/src/physics.js';

const idle = () => [EMPTY, EMPTY];
function play(seed, ticks, inputs = idle) {
  const game = new Game(seed);
  for (let i = 0; i < ticks; i++) game.step(inputs(game, i));
  return game;
}

test('fixed-point trigonometry and seeded random are stable', () => {
  for (let x = -10; x <= 10; x += .1) {
    assert.ok(Math.abs(num(sin(fix(x))) - Math.sin(x)) < .0001);
    assert.ok(Math.abs(num(cos(fix(x))) - Math.cos(x)) < .0001);
  }
  const a = new Random(0), b = new Random(0);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('two seeded simulations remain bit-identical through round changes', () => {
  const inputs = (g, i) => [{ jump: i % 47 < 24, dunk: i % 173 === 0 }, { jump: i % 61 < 29, dunk: i % 211 === 0 }];
  const a = play(0xdeadbeef, 15000, inputs), b = play(0xdeadbeef, 15000, inputs);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.ok(a.round > 1);
  assert.notDeepEqual(a.snapshot(), play(42, 15000, inputs).snapshot());
});

test('a downward crossing of the right rim scores for gold', () => {
  const g = new Game(1); g.phase = 'play';
  setBallPosition(g.ball, HOOPS[1].x, RIM_Y - 1, 0, 120);
  g.step(); assert.deepEqual(g.scores, [1, 0]); assert.equal(g.phase, 'score');
  const before = g.scores.slice(); g.step(); assert.deepEqual(g.scores, before);
});

test('left rim awards red and rainbow baskets award two', () => {
  const g = new Game(1); g.phase = 'play'; g.ballType = 3;
  setBallPosition(g.ball, HOOPS[0].x, RIM_Y - 1, 0, 120);
  g.step(); assert.deepEqual(g.scores, [0, 2]);
});

test('first to five ends the match after the score celebration', () => {
  const g = new Game(1); g.scores = [4, 2]; g.phase = 'play'; g.score(0);
  for (let i = 0; i < 106; i++) g.step();
  assert.equal(g.phase, 'over'); assert.equal(g.winner, 0);
  const tick = g.tick; g.step(); assert.equal(g.phase, 'over'); assert.ok(g.tick > tick);
});

test('dunk carries the ball, moves physically, releases, and respects cooldown', () => {
  const g = new Game(9); g.phase = 'play'; g.ball.owner = 0; g.ball.holdTicks = 10;
  const start = num(g.players[0].pts[0].x);
  g.step([{ jump: false, dunk: true }, EMPTY]);
  assert.equal(g.ball.owner, 0); assert.ok(g.players[0].dunkCD > 0);
  for (let i = 0; i < 44; i++) g.step([{ jump: false, dunk: true }, EMPTY]);
  assert.equal(g.ball.owner, -1);
  assert.ok(num(g.players[0].pts[0].x) - start > 80);
  const cooldown = g.players[0].dunkCD;
  g.step([{ jump: false, dunk: false }, EMPTY]); g.step([{ jump: false, dunk: true }, EMPTY]);
  assert.ok(g.players[0].dunkCD < cooldown);
});

test('dunks are not guaranteed baskets', () => {
  let baskets = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const g = new Game(seed); g.phase = 'play'; shiftPlayer(g.players[0], 190, 0); g.ball.owner = 0;
    for (let i = 0; i < 180; i++) g.step([{ jump: false, dunk: i < 2 }, EMPTY]);
    baskets += g.scores[0] > 0;
  }
  assert.ok(baskets > 0 && baskets < 24, `dunk results were ${baskets}/24`);
});

test('ragdolls stay finite and inside the court under chaotic input', () => {
  const random = new Random(77);
  const g = play(88, 18000, () => [0, 1].map(() => ({ jump: random.int(3) !== 0, dunk: random.int(41) === 0 })));
  for (const p of g.players) for (const q of p.pts) {
    for (const value of [q.x, q.y, q.px, q.py]) assert.ok(Number.isSafeInteger(value));
    assert.ok(num(q.x) >= -5 && num(q.x) <= 485);
    assert.ok(num(q.y) >= 0 && num(q.y) <= FLOOR + 1);
  }
  assert.ok(num(g.ball.x) >= 0 && num(g.ball.x) <= 480);
  assert.ok(num(g.ball.y) >= 0 && num(g.ball.y) <= FLOOR);
});

test('all four bots can play complete 2v2 and 1v1 matches without a stalemate', () => {
  assert.deepEqual(DIFFICULTIES.map(d => d.name), ['NOOB', 'CASUAL', 'PRO', 'LEBRON JAMES']);
  for (const size of [1, 2]) for (let level = 0; level < 4; level++) {
    let completed = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const g = new Game(seed, ['A', 'B'], size), a = new Bot(0, level, seed), b = new Bot(1, level, seed + 10);
      for (let i = 0; i < 24000 && g.phase !== 'over'; i++) g.step([a.input(g), b.input(g)]);
      completed += g.phase === 'over';
    }
    assert.ok(completed >= 4, `${DIFFICULTIES[level].name} ${size}v${size} completed only ${completed}/5 matches`);
  }
});

test('one button controls both teammates and 1v1 uses a single player per side', () => {
  const duo = new Game(4, ['A', 'B'], 2), solo = new Game(4, ['A', 'B'], 1);
  assert.equal(duo.players.length, 4); assert.equal(solo.players.length, 2);
  assert.deepEqual(duo.players.map(p => [p.side, p.slot]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.deepEqual(solo.players.map(p => [p.side, p.slot]), [[0, 0], [1, 0]]);
  duo.phase = 'play'; duo.step([{ jump: true, dunk: false }, EMPTY]);
  assert.ok(duo.players[0].jumpCount > 0 && duo.players[1].jumpCount > 0);
  assert.equal(duo.players[2].jumpCount, 0); assert.equal(duo.players[3].jumpCount, 0);
  assert.equal(duo.snapshot().teamSize, 2); assert.equal(solo.snapshot().teamSize, 1);
});

test('jerseys, skin tones, and hair are seeded and reshuffled every round', () => {
  const a = new Game(12), b = new Game(12);
  const looks = g => g.players.map(p => [p.skin, p.hair, p.kit]);
  assert.deepEqual(looks(a), looks(b));
  const first = looks(a);
  a.phase = 'play'; a.score(0);
  for (let i = 0; i < 106; i++) a.step();
  assert.equal(a.round, 2);
  assert.notDeepEqual(looks(a), first);
  assert.ok(a.players.every(p => p.skin >= 0 && p.skin < 6 && p.hair >= 0 && p.hair < 6 && p.kit >= 0 && p.kit < 8));
});

test('round modifiers reshuffle gravity, moving hoops, and body types', () => {
  const g = new Game(1);
  const gravities = new Set(), sways = new Set(), variants = new Set();
  for (let i = 0; i < 30; i++) {
    g.resetRound(false);
    gravities.add(g.gravity); sways.add(g.hoopSway);
    for (const p of g.players) variants.add(p.variant);
  }
  assert.ok(gravities.has(0.78) && gravities.has(1.22));
  assert.ok(sways.has(6));
  assert.ok(variants.size >= 5);
  assert.match(g.condition, /CITY|BEACH|SNOW|GYM/);
});

test('nicknames are bounded and never interpreted as markup', () => {
  assert.equal(cleanName('  LeBron_23  '), 'LeBron_23');
  assert.equal(cleanName('<script>'), 'script');
  assert.equal(cleanName(''), 'PLAYER');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName('Žlaťo  7'), 'Žlaťo 7');
});
