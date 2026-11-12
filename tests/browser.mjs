import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createGameServer } from '../server/index.mjs';

const app = createGameServer({ root: 'web' });
const address = await app.listen(0, '127.0.0.1');
const url = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 854, height: 480 }, hasTouch: true });
const watch = page => { page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); };
try {
  const page = await context.newPage(); watch(page); await page.goto(url);
  await page.locator('#menu').waitFor({ state: 'visible' });
  await page.click('#nickname'); await page.fill('#name-input', 'Court_23'); await page.click('#name-form button[type=submit]');
  assert.equal(await page.locator('#menu-name').textContent(), 'Court_23');
  await page.reload(); assert.equal(await page.locator('#menu-name').textContent(), 'Court_23');
  await page.click('[data-mode=bot]'); assert.equal(await page.locator('[data-level]').count(), 4);
  await page.click('[data-level="3"]'); await page.waitForTimeout(2100);
  assert.equal(await page.locator('#name1').textContent(), 'LEBRON JAMES');
  await page.click('#pause'); await page.locator('#pause-panel').waitFor({ state: 'visible' });
  const score = await page.locator('#score').textContent(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#score').textContent(), score);
  await page.click('#resume'); await page.click('#pause'); await page.click('#quit');
  await page.click('[data-mode=local]'); await page.waitForTimeout(1800);
  const left = await page.locator('.left-jump').boundingBox(), right = await page.locator('.right-jump').boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 },
    { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 }
  ] });
  await page.waitForFunction(() => document.querySelectorAll('.control.active').length === 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.querySelectorAll('.control.active').length === 0);
  await page.keyboard.press('Escape'); await page.click('#quit');
  await page.click('#settings'); await page.fill('#server-input', url); await page.click('#settings-form button[type=submit]');
  await page.click('[data-mode=online]');
  const opponent = await context.newPage(); watch(opponent); await opponent.goto(url);
  await opponent.click('#nickname'); await opponent.fill('#name-input', 'Rival'); await opponent.click('#name-form button[type=submit]');
  await opponent.click('[data-mode=online]');
  await page.locator('#hud').waitFor({ state: 'visible' }); await opponent.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForTimeout(2400);
  assert.equal(await page.locator('#name1').textContent(), 'Rival');
  assert.equal(await opponent.locator('#name0').textContent(), 'Court_23');
  const before = await page.locator('#court').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(250);
  const after = await page.locator('#court').evaluate(canvas => canvas.toDataURL());
  assert.notEqual(before, after);
  await opponent.close(); await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result-title').textContent(), 'OPPONENT LEFT');
  assert.deepEqual(errors, []);
  console.log('Browser passed: persistence, all difficulty choices, bot match, pause, multi-touch, real two-page queue, live frames, disconnect.');
} finally { await browser.close(); await app.close(); }
