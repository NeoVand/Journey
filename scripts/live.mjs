// Live capture: real-time frames from a normal page load, to see the intro as a reader does.
import { chromium } from 'playwright';
const [out, times = '300,700,1100,1500,2100,3000'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'commit' });
await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true', null, { timeout: 60000 });
const t0 = Date.now();
for (const t of times.split(',').map(Number)) {
	await page.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
	await page.screenshot({ path: `${out}/live-${String(t).padStart(4, '0')}.png` });
}
console.log(errs.join('\n') || 'no page errors');
await browser.close();
