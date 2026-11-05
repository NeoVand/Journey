// Dense review of a transition: node scripts/strip.mjs <out.png> <WxH> <from> <to> <count> [cols] [harness]
// Captures evenly spaced T values through the real page, cards included, then lays them out as one sheet.
// PHONE=1 emulates a touch phone, so the page runs its phone tier (bigger signs, lighter rendering).
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [out, size = '1440x900', from = '0', to = '1', count = '12', cols = '4', harness] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const n = +count;
const dir = join(dirname(out), `.strip-${process.pid}`);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
	headless: true,
	channel: 'chromium',
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
});
const phone = !!process.env.PHONE;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
const errors = [];
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey, null, { timeout: 120000 });
if (harness) await page.evaluate((h) => window.__journey.seek(0, 0, h), harness);

const cells = [];
for (let i = 0; i < n; i++) {
	const T = +from + ((+to - +from) * i) / Math.max(1, n - 1);
	await page.evaluate((t) => window.__journey.seek(t, 3.1), T);
	await page.waitForTimeout(90);
	await page.evaluate((t) => window.__journey.seek(t, 3.1), T);
	await page.waitForTimeout(40);
	const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
	cells.push(`<figure><img src="data:image/jpeg;base64,${buf.toString('base64')}"><figcaption>${T.toFixed(3)}</figcaption></figure>`);
}
const c = +cols;
const cell = Math.floor(Math.min(1980, c * 660) / c);
const sheet = await browser.newPage({ viewport: { width: cell * c + (c - 1) * 4, height: 100 } });
await sheet.setContent(
	`<style>body{margin:0;display:grid;grid-template-columns:repeat(${c},1fr);gap:4px;background:#fff}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:4px;bottom:4px;font:13px monospace;background:#000;color:#fff;padding:1px 5px}</style>${cells.join('')}`
);
await sheet.waitForTimeout(150);
await sheet.screenshot({ path: out, fullPage: true });
rmSync(dir, { recursive: true, force: true });
if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'));
console.log(out);
await browser.close();
