import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { cleanName } from '../web/src/math.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'";
const send = (ws, value) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };

export function createGameServer({ root = resolve('dist'), tickMs = 50, maxConnections = 500 } = {}) {
  root = resolve(root);
  const queue = [], matches = new Set(), ipCounts = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, queued: queue.length, matches: matches.size })); return;
    }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) || !TYPES[extname(file)]) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      let selected = file, size = info.size;
      if (gzip) {
        try { const compressed = await stat(file + '.gz'); selected += '.gz'; size = compressed.size; res.setHeader('Content-Encoding', 'gzip'); } catch {}
      }
      res.setHeader('Vary', 'Accept-Encoding'); res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Type', TYPES[extname(file)]); res.setHeader('Content-Length', size);
      res.writeHead(200);
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(selected);
      stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/match' || wss.clients.size >= maxConnections) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    const ip = req.socket.remoteAddress || 'unknown';
    if ((ipCounts.get(ip) || 0) >= 32) { socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    wss.handleUpgrade(req, socket, head, ws => {
      ws.ip = ip; ws.alive = true; ws.name = ''; ws.match = null; ws.joined = false; ws.teamSize = 2;
      ws.tokens = 80; ws.tokenTime = Date.now();
      ws.on('close', () => {
        const count = (ipCounts.get(ip) || 1) - 1;
        if (count) ipCounts.set(ip, count); else ipCounts.delete(ip);
        leave(ws);
      });
      ws.on('pong', () => { ws.alive = true; });
      ws.on('error', () => {});
      ws.on('message', (data, binary) => {
        if (binary) { ws.close(1003, 'JSON only'); return; }
        const now = Date.now(); ws.tokens = Math.min(80, ws.tokens + (now - ws.tokenTime) * .04); ws.tokenTime = now;
        if (--ws.tokens < 0) { ws.close(1008, 'Rate limit'); return; }
        let message;
        try { message = JSON.parse(data.toString()); } catch { ws.close(1007, 'Invalid JSON'); return; }
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') { ws.close(1008, 'Invalid message'); return; }
        handleMessage(ws, message);
      });
      wss.emit('connection', ws, req);
    });
  });
  function removeQueue(ws) { const index = queue.indexOf(ws); if (index !== -1) queue.splice(index, 1); }
  function clearMatch(match) {
    clearInterval(match.interval); clearTimeout(match.readyTimeout); clearTimeout(match.deadline);
    match.a.match = null; match.b.match = null; matches.delete(match);
  }
  function leave(ws) {
    removeQueue(ws);
    const match = ws.match;
    if (match) {
      const other = match.a === ws ? match.b : match.a;
      clearMatch(match); send(other, { type: 'opponent_left' });
    }
  }
  function fail(match, message) {
    const clients = [match.a, match.b]; clearMatch(match);
    for (const ws of clients) { send(ws, { type: 'error', message }); ws.close(1000, 'Match ended'); }
  }
  function frame(match) {
    const packet = JSON.stringify({ type: 'frame', tick: match.tick, inputs: match.masks });
    for (const ws of [match.a, match.b]) if (ws.readyState === WebSocket.OPEN) ws.send(packet);
  }
  function startMatch(a, b) {
    removeQueue(a); removeQueue(b);
    const match = { a, b, tick: 0, masks: [0, 0], ready: new Set(), votes: new Set(), results: [null, null], state: 'waiting', interval: null, teamSize: a.teamSize };
    a.match = b.match = match; matches.add(match);
    const seed = randomInt(0, 4294967296);
    send(a, { type: 'start', side: 0, seed, opponent: b.name, teamSize: match.teamSize });
    send(b, { type: 'start', side: 1, seed, opponent: a.name, teamSize: match.teamSize });
    match.readyTimeout = setTimeout(() => { if (match.state === 'waiting') fail(match, 'Opponent did not finish loading.'); }, 10000);
    match.deadline = setTimeout(() => fail(match, 'Eight-minute match limit reached.'), 480000);
  }
  function handleMessage(ws, message) {
    if (message.type === 'join') {
      if (ws.joined) { ws.close(1008, 'Already joined'); return; }
      if (queue.length >= 200) { send(ws, { type: 'error', message: 'Queue is full. Try again shortly.' }); ws.close(1013, 'Queue full'); return; }
      ws.name = cleanName(message.name); ws.joined = true;
      ws.teamSize = message.teamSize === 1 ? 1 : 2;
      queue.push(ws); send(ws, { type: 'queued', teamSize: ws.teamSize });
      for (;;) {
        let pair = null;
        for (let i = 0; i < queue.length && !pair; i++) for (let j = i + 1; j < queue.length; j++)
          if (queue[i].teamSize === queue[j].teamSize) { pair = [queue[i], queue[j]]; break; }
        if (!pair) break;
        startMatch(pair[0], pair[1]);
      }
      return;
    }
    if (!ws.joined) { ws.close(1008, 'Join first'); return; }
    const match = ws.match;
    if (!match) return;
    const side = match.a === ws ? 0 : 1;
    if (message.type === 'ready' && match.state === 'waiting') {
      match.ready.add(side);
      if (match.ready.size === 2) {
        match.state = 'live'; clearTimeout(match.readyTimeout);
        frame(match);
        match.interval = setInterval(() => { match.tick++; frame(match); }, tickMs);
      }
    } else if (message.type === 'input' && match.state === 'live') {
      if (typeof message.jump !== 'boolean' || typeof message.dunk !== 'boolean') { ws.close(1008, 'Invalid input'); return; }
      const bit = side * 2;
      match.masks[side] = (message.jump ? 1 << bit : 0) | (message.dunk ? 1 << (bit + 1) : 0);
    } else if (message.type === 'result' && match.state === 'live') {
      const scores = message.scores;
      if (!Array.isArray(scores) || scores.length !== 2 || !scores.every(n => Number.isInteger(n) && n >= 0 && n < 100) || Math.max(...scores) < 5 || scores[0] === scores[1]) { ws.close(1008, 'Invalid result'); return; }
      match.results[side] = scores.join(':');
      if (match.results[0] && match.results[1]) {
        if (match.results[0] !== match.results[1]) fail(match, 'Match results disagreed. Please play a new match.');
        else { match.state = 'over'; clearInterval(match.interval); for (const client of [match.a, match.b]) send(client, { type: 'over' }); }
      }
    } else if (message.type === 'rematch' && match.state === 'over') {
      match.votes.add(side);
      if (match.votes.size === 2) { const { a, b } = match; clearMatch(match); startMatch(a, b); }
      else send(ws, { type: 'waiting_rematch' });
    } else if (message.type === 'leave') { leave(ws); ws.close(1000, 'Left match'); }
  }
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  return {
    server, wss, queue, matches,
    listen(port = 8080, host = '0.0.0.0') { return new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolveListen(server.address()); }); }); },
    close() {
      clearInterval(heartbeat);
      for (const match of [...matches]) clearMatch(match);
      for (const ws of wss.clients) ws.terminate();
      return new Promise(resolveClose => { wss.close(() => server.close(resolveClose)); });
    }
  };
}
