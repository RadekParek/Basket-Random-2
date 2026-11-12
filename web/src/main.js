import { Game, EMPTY } from './engine.js';
import { Bot, DIFFICULTIES } from './bot.js';
import { Renderer, paintIcons } from './render.js';
import { Sound } from './audio.js';
import { MatchClient, normalizeEndpoint } from './net.js';
import { cleanName, num, clamp } from './math.js';
import { STEP } from './physics.js';

const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) { try { return localStorage.getItem(`br2:${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`br2:${key}`, value); } catch {} }
};
const native = location.protocol === 'file:' || location.hostname === 'appassets.androidplatform.net';
let nickname = cleanName(store.get('name', 'PLAYER'));
let endpoint = store.get('server', '');
let screen = 'menu', mode = null, game = null, bots = [], mySide = 0, paused = false;
let lastTick = -1, lastFrame = 0, queueSince = 0, queueSecond = -1, resultKind = 'local';
let accumulator = 0, lastTime = performance.now(), toastTimer = 0, modalReturnFocus = null;
const demo = new Game(7);
const renderer = new Renderer($('court'));
const sound = new Sound(store.get('sound', '1') === '1');
const inputs = [{ jump: false, dunk: false }, { jump: false, dunk: false }];
const previous = new Float64Array(46);
const controlButtons = [...document.querySelectorAll('.control')];
const keyMap = new Map();
let activeModal = null;

function capture(g) {
  for (let side = 0; side < 2; side++) for (let i = 0; i < 11; i++) {
    const p = g.players[side].pts[i], offset = side * 22 + i * 2;
    previous[offset] = p.x; previous[offset + 1] = p.y;
  }
  previous[44] = g.ball.x; previous[45] = g.ball.y;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function clearInputs() {
  for (const input of inputs) { input.jump = false; input.dunk = false; }
  keyMap.clear();
  for (const button of controlButtons) button.classList.remove('active');
  if (mode === 'online') net.input(false, false);
}
function setScreen(next) {
  screen = next;
  $('menu').hidden = next !== 'menu';
  $('difficulty').hidden = next !== 'difficulty';
  $('queue').hidden = next !== 'queue';
  $('hud').hidden = !['game', 'result'].includes(next);
  $('controls').hidden = next !== 'game';
  $('pause-panel').hidden = true;
  $('result').hidden = next !== 'result';
  accumulator = 0;
}
function returnMenu() {
  net.close(); clearInputs(); paused = false; mode = null; game = null;
  $('menu-name').textContent = nickname;
  setScreen('menu');
}
function configureControls() {
  const local = mode === 'local';
  for (const button of controlButtons) button.hidden = !local && Number(button.dataset.side) !== mySide;
  $('single-hint').hidden = local;
  $('single-hint').textContent = mode === 'online' ? `YOU ARE ${mySide ? 'RED' : 'GOLD'} · W / ↑ JUMP` : 'W / ↑ JUMP · S / ↓ DUNK';
  $('name0').textContent = game.names[0]; $('name1').textContent = game.names[1];
  $('tag0').textContent = mode === 'online' && mySide === 0 ? 'GOLD · YOU' : 'GOLD';
  $('tag1').textContent = mode === 'online' && mySide === 1 ? 'RED · YOU' : 'RED';
}
function begin(modeKind, seed, names, level = 0) {
  clearInputs(); mode = modeKind; paused = false; resultKind = 'local';
  game = new Game(seed, names);
  bots = modeKind === 'bot' ? [null, new Bot(1, level, seed ^ 0x51ed270b)] : [];
  capture(game); configureControls(); setScreen('game'); updateHud(); sound.unlock();
}
function localStart(kind, level = 1) {
  net.close(); mySide = 0;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  begin(kind, seed, [nickname, kind === 'bot' ? DIFFICULTIES[level].name : 'PLAYER 2'], level);
}
function updateHud() {
  if (!game) return;
  $('score').textContent = `${game.scores[0]} : ${game.scores[1]}`;
  $('condition').textContent = game.condition;
  for (const button of controlButtons) {
    const side = Number(button.dataset.side), p = game.players[side];
    button.classList.toggle('active', inputs[side][button.dataset.action]);
    if (button.dataset.action === 'dunk') button.classList.toggle('cooling', p.dunkCD > 0);
    if (button.dataset.action === 'jump') {
      const held = game.ball.owner === side;
      const label = held ? 'RELEASE' : side === 0 ? 'W' : '↑';
      if (button.lastElementChild.textContent !== label) button.lastElementChild.textContent = label;
    }
  }
}
function pauseGame() {
  if (screen !== 'game' || paused) return;
  paused = true; clearInputs(); $('pause-panel').hidden = false;
  $('pause-note').textContent = mode === 'online' ? 'The online match keeps running while this menu is open.' : 'Take a breath. Find your timing.';
  $('resume').focus();
}
function resumeGame() { paused = false; $('pause-panel').hidden = true; accumulator = 0; sound.unlock(); }
function showResult(kind = 'local', title = '', detail = '') {
  clearInputs(); resultKind = kind; setScreen('result'); paused = false;
  $('result-eyebrow').textContent = kind === 'local' ? 'FINAL SCORE' : 'MATCH ENDED';
  $('result-title').textContent = title || `${game.names[game.winner]} WINS`;
  $('result-score').textContent = `${game.scores[0]} : ${game.scores[1]}`;
  $('result-detail').textContent = detail || (mode === 'online' ? 'Both players must accept a rematch.' : 'Different court. Different chaos. One more?');
  $('rematch').textContent = kind === 'left' ? 'FIND NEW OPPONENT' : mode === 'online' && kind === 'local' ? 'CONFIRMING RESULT' : 'REMATCH';
  $('rematch').disabled = mode === 'online' && kind === 'local';
  if (mode === 'online' && kind === 'local') net.send({ type: 'result', scores: game.scores });
  $('rematch').focus();
}
function disconnected(title, detail) {
  if (mode !== 'online') return;
  net.close();
  if (!game) { returnMenu(); toast(detail); return; }
  showResult('disconnect', title, detail);
}
function joinQueue() {
  if (native && !endpoint) { openModal('settings-modal'); toast('Add your deployed match server to play online.'); return; }
  setScreen('queue'); $('queue-status').textContent = 'CONNECTING';
  $('queue-detail').textContent = 'Looking for another player in the queue.';
  $('queue-server').textContent = endpoint ? new URL(endpoint).host : 'THIS HOST';
  queueSince = performance.now(); queueSecond = -1;
  net.connect(endpoint, nickname);
}
const net = new MatchClient({
  status(value) {
    if (screen === 'queue') $('queue-status').textContent = value;
    if (value === 'WAITING FOR REMATCH') { $('rematch').textContent = 'WAITING FOR OPPONENT'; $('rematch').disabled = true; }
  },
  error(message) { net.close(); returnMenu(); toast(message); },
  start(message) {
    if (![0, 1].includes(message.side) || !Number.isInteger(message.seed)) return;
    mySide = message.side; lastTick = -1; lastFrame = performance.now();
    const opponent = cleanName(message.opponent), names = mySide ? [opponent, nickname] : [nickname, opponent];
    begin('online', message.seed, names);
  },
  frame(message) {
    if (mode !== 'online' || !game || screen !== 'game') return;
    if (message.tick !== lastTick + 1) { disconnected('CONNECTION INTERRUPTED', 'Match frames arrived out of order. Please start a new match.'); return; }
    lastTick = message.tick; lastFrame = performance.now();
    const decoded = [0, 1].map(side => ({ jump: !!(message.inputs[side] & 1), dunk: !!(message.inputs[side] & 2) }));
    for (let i = 0; i < 3 && game.phase !== 'over'; i++) { capture(game); game.step(decoded); }
    if (game.phase === 'over') showResult();
  },
  over() { if (screen === 'result' && resultKind === 'local') { $('rematch').disabled = false; $('rematch').textContent = 'REMATCH'; } },
  left() { disconnected('OPPONENT LEFT', 'The other player disconnected. No result was recorded.'); },
  closed() {
    if (mode === 'online') disconnected('CONNECTION LOST', 'Could not stay connected to the match server. Your nickname and settings are saved.');
    else if (screen === 'queue') { returnMenu(); toast('Could not connect to the match server. Check the server address.'); }
  }
});

function setInput(side, action, value) {
  if (screen !== 'game' || paused || activeModal) return;
  if (mode !== 'local' && side !== mySide) return;
  inputs[side][action] = value;
  if (mode === 'online') net.input(inputs[side].jump, inputs[side].dunk);
}
for (const button of controlButtons) {
  const side = Number(button.dataset.side), action = button.dataset.action;
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); sound.unlock(); button.setPointerCapture(event.pointerId); setInput(side, action, true);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => setInput(side, action, false));
}
function keyboardSide(code) {
  if (mode === 'local') return ['KeyW', 'KeyS'].includes(code) ? 0 : 1;
  return mySide;
}
document.addEventListener('keydown', event => {
  if (activeModal) {
    if (event.code === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.code === 'Tab') {
      const items = [...$(activeModal).querySelectorAll('button:not([disabled]),input')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    if (screen === 'game') paused ? resumeGame() : pauseGame();
    else if (screen !== 'menu') returnMenu();
    return;
  }
  const action = ['KeyW', 'ArrowUp', 'Space'].includes(event.code) ? 'jump' : ['KeyS', 'ArrowDown'].includes(event.code) ? 'dunk' : null;
  if (!action || screen !== 'game' || paused) return;
  event.preventDefault(); if (event.repeat) return;
  const side = keyboardSide(event.code); keyMap.set(event.code, [side, action]); setInput(side, action, true); sound.unlock();
});
document.addEventListener('keyup', event => {
  const binding = keyMap.get(event.code);
  if (binding) { event.preventDefault(); setInput(...binding, false); keyMap.delete(event.code); }
});
window.addEventListener('blur', () => { if (screen === 'game') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'game') pauseGame(); });
document.addEventListener('contextmenu', event => event.preventDefault());

function openModal(id) {
  if (activeModal) closeModal();
  modalReturnFocus = document.activeElement; activeModal = id; $(id).hidden = false;
  if (id === 'name-modal') { $('name-input').value = nickname; $('name-input').focus(); $('name-input').select(); }
  else if (id === 'settings-modal') { $('server-input').value = endpoint; $('server-error').textContent = ''; $('server-input').focus(); }
  else $(id).querySelector('button').focus();
}
function closeModal() {
  if (!activeModal) return;
  $(activeModal).hidden = true; activeModal = null; modalReturnFocus?.focus();
}
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', closeModal);
$('nickname').onclick = () => openModal('name-modal');
$('pause-name').onclick = () => openModal('name-modal');
$('name-form').onsubmit = event => {
  event.preventDefault(); nickname = cleanName($('name-input').value); store.set('name', nickname);
  $('menu-name').textContent = nickname;
  if (game) { game.names[mySide] = nickname; $('name' + mySide).textContent = nickname; }
  closeModal(); toast('Nickname saved.');
};
$('settings').onclick = $('queue-settings').onclick = () => openModal('settings-modal');
$('settings-form').onsubmit = event => {
  event.preventDefault();
  try {
    const value = normalizeEndpoint($('server-input').value);
    if (native && value.startsWith('ws:')) throw new Error('The Android app requires a secure https:// server.');
    endpoint = value; store.set('server', endpoint); closeModal(); toast('Server address saved.');
    if (screen === 'queue') $('queue-server').textContent = endpoint ? new URL(endpoint).host : 'THIS HOST';
  } catch (error) { $('server-error').textContent = error.message || 'Enter a valid server address.'; }
};
$('help').onclick = () => openModal('help-modal');
function updateSound() { $('sound').textContent = `SOUND: ${sound.enabled ? 'ON' : 'OFF'}`; $('sound').setAttribute('aria-pressed', String(sound.enabled)); }
$('sound').onclick = () => { sound.enabled = !sound.enabled; store.set('sound', sound.enabled ? '1' : '0'); updateSound(); sound.unlock(); sound.click(); };
for (const button of document.querySelectorAll('[data-mode]')) button.onclick = () => {
  sound.unlock(); sound.click();
  if (button.dataset.mode === 'local') localStart('local');
  else if (button.dataset.mode === 'bot') setScreen('difficulty');
  else joinQueue();
};
for (const button of document.querySelectorAll('[data-level]')) button.onclick = () => { sound.click(); localStart('bot', Number(button.dataset.level)); };
document.querySelector('[data-back]').onclick = returnMenu;
$('cancel-queue').onclick = returnMenu;
$('pause').onclick = pauseGame;
$('resume').onclick = resumeGame;
$('quit').onclick = $('result-menu').onclick = returnMenu;
$('rematch').onclick = () => {
  sound.click();
  if (resultKind === 'left') { returnMenu(); joinQueue(); }
  else if (mode === 'online') { net.send({ type: 'rematch' }); $('rematch').textContent = 'WAITING FOR OPPONENT'; $('rematch').disabled = true; }
  else localStart(mode, bots[1] ? DIFFICULTIES.indexOf(bots[1].config) : 1);
};
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.__pause = pauseGame;
window.__back = () => {
  if (activeModal) { closeModal(); return true; }
  if (screen === 'menu') return false;
  if (screen === 'game') { paused ? resumeGame() : pauseGame(); return true; }
  returnMenu(); return true;
};

let lastPhase = '', lastBounces = 0, lastHudTick = -1;
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
  if (screen === 'game' && game && !paused && !document.hidden) {
    if (mode !== 'online') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps++ < 6 && game.phase !== 'over') {
        accumulator -= STEP; capture(game);
        const round = game.round;
        game.step([bots[0]?.input(game) || inputs[0], bots[1]?.input(game) || inputs[1]]);
        if (game.round !== round) capture(game);
      }
      if (game.phase === 'over') showResult();
    }
    if (game.phase !== lastPhase) { if (game.phase === 'score') sound.score(); lastPhase = game.phase; }
    if (game.bounces > lastBounces) sound.bounce();
    lastBounces = game.bounces;
    if (game.tick - lastHudTick >= 6) { updateHud(); lastHudTick = game.tick; }
  }
  if (game && ['game', 'result'].includes(screen)) renderer.draw(game, previous, mode === 'online' ? clamp((now - lastFrame) / 50, 0, 1) : paused ? 1 : clamp(accumulator / STEP, 0, 1));
  else renderer.draw(demo, previous, 1, true);
  if (screen === 'queue') {
    const second = Math.floor((now - queueSince) / 1000);
    if (second !== queueSecond && $('queue-status').textContent === 'IN QUEUE') {
      queueSecond = second; $('queue-detail').textContent = `Searching for an opponent · ${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`;
    }
  }
  requestAnimationFrame(frame);
}
$('menu-name').textContent = nickname; updateSound(); paintIcons(); capture(demo); setScreen('menu'); requestAnimationFrame(frame);
