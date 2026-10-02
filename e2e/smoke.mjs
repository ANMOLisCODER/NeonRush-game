/* End-to-end smoke test for Neon Metro Rush (headless Chromium + SwiftShader). */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const SHOTS = process.env.SHOTS_DIR || 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const warnings = [];
let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name} ${extra}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  if (m.type() === 'warning') warnings.push(m.text());
});

console.log('== boot ==');
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#screen-loading.screen--visible', { timeout: 10000 }).catch(() => {});
await page.waitForSelector('#screen-menu.screen--visible', { timeout: 120000 });
check('loading completes -> main menu visible', true);
const hasGame = await page.evaluate(() => Boolean(window.nmrGame));
check('game instance exposed', hasGame);

await page.screenshot({ path: `${SHOTS}/01-menu.png` });

console.log('== menu navigation ==');
for (const [btn, screen] of [
  ['#btn-howto', '#screen-howto'],
  ['#btn-concepts', '#screen-concepts'],
  ['#btn-credits', '#screen-credits'],
]) {
  await page.click(btn);
  await page.waitForSelector(`${screen}.screen--visible`, { timeout: 5000 });
  check(`${screen} opens`, true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-menu.screen--visible', { timeout: 5000 });
}
await page.click('#btn-settings');
await page.waitForSelector('#screen-settings.screen--visible', { timeout: 5000 });
check('settings opens', true);
await page.screenshot({ path: `${SHOTS}/05-settings.png` });
await page.click('#set-quality button[data-quality="low"]');
await sleep(500);
const q = await page.evaluate(() => JSON.parse(localStorage.getItem('nmr.settings.v1') ?? '{}').quality);
check('quality setting persists to localStorage', q === 'low', `got ${q}`);
await page.click('#btn-settings-back');
await page.waitForSelector('#screen-menu.screen--visible', { timeout: 5000 });

console.log('== start run ==');
await page.click('#btn-play');
await page.waitForFunction(() => window.nmrGame.getState() === 'playing', { timeout: 20000 });
check('Play starts the game', true);
await sleep(2500);
await page.screenshot({ path: `${SHOTS}/02-gameplay.png` });

console.log('== controls ==');
const lane0 = await page.evaluate(() => window.nmrGame.debugLane());
await page.keyboard.press('ArrowLeft');
await sleep(500);
const laneL = await page.evaluate(() => window.nmrGame.debugLane());
check('lane left works', laneL === lane0 - 1, `${lane0} -> ${laneL}`);
await page.keyboard.press('ArrowRight');
await sleep(350);
await page.keyboard.press('d');
await sleep(500);
const laneR = await page.evaluate(() => window.nmrGame.debugLane());
check('lane right works (D key)', laneR === lane0 + 1, `${lane0} -> ${laneR}`);
await page.keyboard.press('ArrowLeft');
await sleep(450);

// Poll-based: software rendering runs the sim slower than wall-clock.
const jumpOk = await page.evaluate(async () => {
  const g = window.nmrGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Ensure grounded first.
  for (let i = 0; i < 200 && g.debugPlayerY() > 0.06; i++) await wait(150);
  await wait(400);
  const before = g.debugPlayerY();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  let apex = before;
  for (let i = 0; i < 200; i++) {
    await wait(150);
    apex = Math.max(apex, g.debugPlayerY());
    if (apex > before + 0.5 && i > 10) break;
  }
  let after = apex;
  for (let i = 0; i < 240; i++) {
    await wait(150);
    after = g.debugPlayerY();
    if (after <= before + 0.15) break;
  }
  return { before, apex, after };
});
check('jump raises the player and lands back', jumpOk.apex > jumpOk.before + 0.5 && jumpOk.after <= jumpOk.before + 0.15, JSON.stringify(jumpOk));

const slideOk = await page.evaluate(async () => {
  const g = window.nmrGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && g.debugPlayerY() > 0.06; i++) await wait(150);
  await wait(400);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
  for (let i = 0; i < 80; i++) {
    await wait(150);
    if (g.debugSliding()) return true;
  }
  return false;
});
check('slide engages', slideOk === true);
await sleep(800);

console.log('== gameplay progression ==');
let maxObstacles = 0;
let maxCoinsActive = 0;
let hitSeen = false;
let livesBefore = 3;
const t0 = Date.now();
let finalState = 'playing';
let prog = null;
while (Date.now() - t0 < 240000) {
  prog = await page.evaluate(() => window.nmrGame.debugSnapshot());
  maxObstacles = Math.max(maxObstacles, prog.obstacles);
  maxCoinsActive = Math.max(maxCoinsActive, prog.coinsActive);
  if (prog.lives < livesBefore) hitSeen = true;
  livesBefore = Math.min(livesBefore, prog.lives);
  finalState = prog.state;
  if (prog.state === 'gameover') break;
  await sleep(900);
}
check('distance accumulates', prog.distance > 60, `distance=${prog.distance}`);
check('score accumulates', prog.score > 50, `score=${prog.score}`);
check('obstacles spawn over time', maxObstacles >= 2, `max=${maxObstacles}`);
check('coins spawn over time', maxCoinsActive >= 3, `max=${maxCoinsActive}`);
check('difficulty ramps speed', prog.speed > 13.2, `speed=${prog.speed}`);

console.log('== debug overlay ==');
if (finalState === 'playing' || finalState === 'paused') {
  await page.keyboard.press('F3');
  let debugText = '';
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    debugText = (await page.evaluate(() => document.querySelector('#debug-overlay').textContent)) ?? '';
    if (/FPS/.test(debugText) && /Seed/.test(debugText)) break;
  }
  const debugVisible = await page.evaluate(() => !document.querySelector('#debug-overlay').classList.contains('hidden'));
  check('F3 toggles debug overlay', debugVisible);
  check('debug shows FPS/speed/lane/chunk/seed', /FPS/.test(debugText) && /Speed/.test(debugText) && /Lane/.test(debugText) && /Chunk/.test(debugText) && /Seed/.test(debugText), (debugText ?? '').slice(0, 80));
  await page.screenshot({ path: `${SHOTS}/04-debug.png` });
  await page.keyboard.press('F3');
}

console.log('== pause / resume ==');
if (finalState === 'playing') {
  await page.keyboard.press('KeyP');
  await sleep(500);
  const st1 = await page.evaluate(() => window.nmrGame.getState());
  check('P pauses', st1 === 'paused', st1);
  await page.screenshot({ path: `${SHOTS}/06-pause.png` });
  const dPaused1 = (await page.evaluate(() => window.nmrGame.debugSnapshot())).distance;
  await sleep(1400);
  const dPaused2 = (await page.evaluate(() => window.nmrGame.debugSnapshot())).distance;
  check('simulation frozen while paused', dPaused1 === dPaused2);
  await page.click('#btn-resume');
  await sleep(600);
  const st2 = await page.evaluate(() => window.nmrGame.getState());
  check('Resume returns to playing', st2 === 'playing', st2);
}

console.log('== touch swipe ==');
if ((await page.evaluate(() => window.nmrGame.getState())) === 'playing') {
  // Path A: browser-level touch injection via CDP.
  const cdp = await page.context().newCDPSession(page);
  const laneBefore = await page.evaluate(() => window.nmrGame.debugLane());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260, y: 305 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  let laneAfterSwipe = await page.evaluate(() => window.nmrGame.debugLane());
  let path = 'cdp';
  if (laneAfterSwipe === laneBefore) {
    // Path B (headless fallback): synthetic TouchEvents through our handler.
    path = 'synthetic';
    laneAfterSwipe = await page.evaluate(async () => {
      const canvas = document.querySelector('#game-canvas');
      const mk = (type, x, y, id) => {
        const t = new Touch({ identifier: id, target: canvas, clientX: x, clientY: y });
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        });
      };
      canvas.dispatchEvent(mk('touchstart', 400, 300, 7));
      await new Promise((r) => setTimeout(r, 60));
      canvas.dispatchEvent(mk('touchmove', 260, 305, 7));
      await new Promise((r) => setTimeout(r, 60));
      canvas.dispatchEvent(mk('touchend', 260, 305, 7));
      await new Promise((r) => setTimeout(r, 600));
      return window.nmrGame.debugLane();
    });
  }
  check(`swipe left changes lane (${path} path)`, laneAfterSwipe === laneBefore - 1, `${laneBefore} -> ${laneAfterSwipe}`);
}

console.log('== game over flow ==');
const t1 = Date.now();
let st = await page.evaluate(() => window.nmrGame.getState());
while (st !== 'gameover' && st !== 'menu' && Date.now() - t1 < 300000) {
  await sleep(1500);
  const snapNow = await page.evaluate(() => window.nmrGame.debugSnapshot());
  if (snapNow.lives < livesBefore) hitSeen = true;
  livesBefore = Math.min(livesBefore, snapNow.lives);
  st = snapNow.state;
}
check('collision hits the player eventually', hitSeen || st === 'gameover', `hitSeen=${hitSeen}`);
check('game over eventually triggers', st === 'gameover', st);
if (st === 'gameover') {
  await page.waitForSelector('#screen-gameover.screen--visible', { timeout: 5000 });
  const goScore = await page.textContent('#go-score');
  check('game over shows score', goScore && goScore.length > 0, goScore);
  await page.screenshot({ path: `${SHOTS}/03-gameover.png` });
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('nmr.profile.v1') ?? '{}'));
  check('profile persisted (highScore/runs)', profile.highScore > 0 && profile.runs >= 1, JSON.stringify(profile));

  console.log('== restart ==');
  await page.click('#btn-restart');
  await page.waitForFunction(() => window.nmrGame.getState() === 'playing', { timeout: 15000 });
  const fresh = await page.evaluate(() => window.nmrGame.debugSnapshot());
  check('restart resets run (score/distance/lives)', fresh.score === 0 && fresh.distance < 5 && fresh.lives === 3, JSON.stringify(fresh));
  check('power-ups do not persist across restart', fresh.activePowerups === 0);

  console.log('== back to menu ==');
  await page.keyboard.press('KeyP');
  await sleep(400);
  await page.click('#btn-pause-menu');
  await page.waitForSelector('#screen-menu.screen--visible', { timeout: 5000 });
  check('pause -> main menu works', true);
  const menuHigh = await page.textContent('#menu-highscore');
  check('menu shows persisted high score', menuHigh && menuHigh.trim() !== '0', menuHigh);
}

console.log('== resize / orientation ==');
await page.setViewportSize({ width: 420, height: 860 });
await sleep(900);
const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
check('mobile viewport: no horizontal overflow', noOverflow);
await page.screenshot({ path: `${SHOTS}/07-mobile-menu.png` });
await page.setViewportSize({ width: 1280, height: 760 });

console.log('== console hygiene ==');
const realErrors = errors.filter(
  (e) => !/favicon|Failed to load resource|net::ERR|AudioContext/i.test(e),
);
check('no uncaught page errors / console errors', realErrors.length === 0, JSON.stringify(realErrors.slice(0, 5)));
if (warnings.length) console.log(`  (warnings: ${warnings.length}) e.g. ${warnings[0].slice(0, 120)}`);

await browser.close();
console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
