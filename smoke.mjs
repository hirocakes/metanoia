// Runtime smoke test: boots the game in headless Chromium, fails on any
// console/page error, plays a few seconds of input and captures a screenshot.
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:3000/';
const errors = [];

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('requestfailed', (req) => errors.push('requestfailed: ' + req.url() + ' ' + (req.failure()?.errorText || '')));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);

const boot = await page.evaluate(() => ({
  hasApi: !!window.__METANOIA__,
  mode: window.__METANOIA__?.game?.mode,
  renderer: !!window.__METANOIA__?.renderer,
  canvasSize: (() => {
    const c = document.getElementById('game');
    return c ? { w: c.width, h: c.height } : null;
  })()
}));
console.log('BOOT', JSON.stringify(boot));

await page.screenshot({ path: 'artifacts/01-title.png' });

// Start a run and play: move, swing, dash.
await page.click('#btn-new');
await page.waitForTimeout(800);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(500);
await page.keyboard.press('ShiftLeft');
await page.waitForTimeout(700);
await page.keyboard.press('KeyK');
await page.waitForTimeout(900);

const play = await page.evaluate(() => {
  const g = window.__METANOIA__.game;
  const ctx = window.__METANOIA__.ctx;
  return {
    mode: g.mode,
    hp: g.hp,
    level: g.level,
    kills: g.kills,
    elapsed: Math.round(g.elapsed * 10) / 10,
    enemies: ctx.enemies.list.length,
    playerY: Math.round(ctx.player.position.y * 100) / 100,
    hudVisible: !document.getElementById('hud').classList.contains('hidden')
  };
});
console.log('PLAY', JSON.stringify(play));

await page.screenshot({ path: 'artifacts/02-gameplay.png' });

// Pause / resume path
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const paused = await page.evaluate(() => window.__METANOIA__.game.mode);
console.log('PAUSE_MODE', paused);
await page.screenshot({ path: 'artifacts/03-pause.png' });

// Mobile-sized pass: portrait phone viewport
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});
mobile.on('pageerror', (err) => errors.push('mobile pageerror: ' + err.message));
mobile.on('console', (msg) => { if (msg.type() === 'error') errors.push('mobile console.error: ' + msg.text()); });
await mobile.goto(URL, { waitUntil: 'load', timeout: 30000 });
await mobile.waitForTimeout(2000);
await mobile.tap('#btn-new');
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: 'artifacts/04-mobile.png' });

await browser.close();

if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE_OK');
