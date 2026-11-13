// Takes screenshots of every part of the game (phone + desktop).
//   1) npm run dev           (in one terminal)
//   2) npm i -D playwright && npx playwright install chromium   (once)
//   3) npm run snapshots     -> ./snapshots/*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SCENES = [
  ['menu', 'menu', 3000],
  ['l1-street', 'l1', 9000],
  ['l2-basement', 'l2', 9000],
  ['l3-bears', 'l3', 9000],
  ['l4-race', 'l4', 12000],
  ['l5-duel', 'l5', 9000],
  ['survival', 'survival', 12000],
];
const VIEWS = [
  ['phone', { width: 390, height: 844 }, 2, true],
  ['desktop', { width: 1280, height: 720 }, 1, false],
];

mkdirSync('snapshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [vname, viewport, dsf, touch] of VIEWS) {
  for (const [name, shot, wait] of SCENES) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?shot=${shot}${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `snapshots/${name}-${vname}.png` });
    console.log('saved', `snapshots/${name}-${vname}.png`);
    await ctx.close();
  }
}
await browser.close();
