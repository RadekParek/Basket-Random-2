import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.mjs';

class Client {
  constructor(url) {
    this.messages = []; this.waiters = [];
    this.ws = new WebSocket(url);
    this.ws.on('message', data => {
      const message = JSON.parse(data.toString()); this.messages.push(message);
      for (const waiter of [...this.waiters]) if (waiter.match(message)) {
        clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(message);
      }
    });
    this.opened = new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
  }
  send(value) { this.ws.send(JSON.stringify(value)); }
  next(type, predicate = () => true, timeout = 4000) {
    const match = message => message.type === type && predicate(message);
    const existing = this.messages.find(match); if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(waiter), 1); reject(new Error(`Timed out waiting for ${type}`)); }, timeout) };
      this.waiters.push(waiter);
    });
  }
  close() { this.ws.close(); }
}
async function setup(t) {
  const app = createGameServer({ root: 'web', tickMs: 10 });
  const address = await app.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${address.port}/match`;
  const clients = [];
  t.after(async () => { for (const client of clients) client.close(); await app.close(); });
  return { app, url, http: `http://127.0.0.1:${address.port}`, async client(name) { const c = new Client(url); clients.push(c); await c.opened; if (name) c.send({ type: 'join', name }); return c; } };
}
async function pair(fixture) {
  const a = await fixture.client('Alice'), b = await fixture.client('<Bob>');
  const sa = await a.next('start'), sb = await b.next('start');
  a.send({ type: 'ready' }); b.send({ type: 'ready' });
  await a.next('frame'); await b.next('frame');
  return { a, b, sa, sb };
}

test('health, static files, compression and traversal protection', async t => {
  const { http } = await setup(t);
  const health = await fetch(http + '/health'); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  const page = await fetch(http + '/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Basket Random/);
  assert.equal((await fetch(http + '/%2e%2e%2fpackage.json')).status, 404);
  assert.equal((await fetch(http + '/health', { method: 'POST' })).status, 405);
});

test('queue pairs two real sockets, sanitizes names, relays inputs and rematches', async t => {
  const fixture = await setup(t);
  const { a, b, sa, sb } = await pair(fixture);
  assert.equal(sa.side, 0); assert.equal(sb.side, 1); assert.equal(sa.seed, sb.seed);
  assert.equal(sa.opponent, 'Bob'); assert.equal(sb.opponent, 'Alice');
  a.send({ type: 'input', jump: true, dunk: false });
  b.send({ type: 'input', jump: false, dunk: true });
  await a.next('frame', m => m.tick > 2 && m.inputs[0] === 1 && m.inputs[1] === 8);
  await b.next('frame', m => m.tick > 2 && m.inputs[0] === 1 && m.inputs[1] === 8);
  a.send({ type: 'result', scores: [5, 2] }); b.send({ type: 'result', scores: [5, 2] });
  await a.next('over'); await b.next('over');
  a.send({ type: 'rematch' }); await a.next('waiting_rematch'); b.send({ type: 'rematch' });
  const nextA = await a.next('start', m => m.seed !== sa.seed), nextB = await b.next('start', m => m.seed !== sb.seed);
  assert.equal(nextA.side, 0); assert.equal(nextB.side, 1); assert.equal(fixture.app.matches.size, 1);
});

test('third player remains queued until another player arrives', async t => {
  const fixture = await setup(t);
  await pair(fixture);
  const c = await fixture.client('Solo'); await c.next('queued');
  assert.equal(fixture.app.queue.length, 1);
  const d = await fixture.client('Duo');
  const sc = await c.next('start'), sd = await d.next('start');
  assert.equal(sc.opponent, 'Duo'); assert.equal(sd.opponent, 'Solo');
  assert.equal(fixture.app.queue.length, 0);
});

test('disconnect notifies the opponent and removes the match', async t => {
  const fixture = await setup(t); const { a, b } = await pair(fixture);
  a.close(); await b.next('opponent_left'); assert.equal(fixture.app.matches.size, 0);
});

test('conflicting results end a match instead of inventing a winner', async t => {
  const fixture = await setup(t); const { a, b } = await pair(fixture);
  a.send({ type: 'result', scores: [5, 1] }); b.send({ type: 'result', scores: [4, 5] });
  const error = await a.next('error'); assert.match(error.message, /disagreed/); await b.next('error');
});

test('invalid JSON and unjoined commands are rejected', async t => {
  const fixture = await setup(t); const c = await fixture.client();
  c.send({ type: 'input', jump: true, dunk: false });
  const code = await new Promise(resolve => c.ws.once('close', resolve)); assert.equal(code, 1008);
  const bad = new Client(fixture.url); await bad.opened; bad.ws.send('{');
  assert.equal(await new Promise(resolve => bad.ws.once('close', resolve)), 1007);
});
