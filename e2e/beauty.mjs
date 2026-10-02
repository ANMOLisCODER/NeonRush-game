import { chromium } from 'playwright';
const SHOTS = process.env.SHOTS_DIR || 'docs/screenshots';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
await page.waitForSelector('#screen-menu.screen--visible', { timeout: 120000 });
await sleep(2500);
await page.screenshot({ path: `${SHOTS}/01-menu.png` });
await page.click('#btn-play');
await page.waitForFunction(() => window.nmrGame.getState() === 'playing', { timeout: 30000 });
// Let the sim reach a populated stretch (obstacles after 60 m grace).
await page.waitForFunction(() => window.nmrGame.debugSnapshot().distance > 95, { timeout: 300000, pollTimeout: 500 }).catch(() => {});
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/02-gameplay.png` });
await page.keyboard.press('F3');
await page.waitForFunction(() => (document.querySelector('#debug-overlay').textContent || '').includes('Seed'), { timeout: 30000 }).catch(() => {});
await sleep(600);
await page.screenshot({ path: `${SHOTS}/04-debug.png` });
await browser.close();
console.log('beauty shots done');
