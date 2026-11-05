// The trackpad test: a real wheel flick, then how long the scene takes to play what it asked for.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/?debug', { waitUntil: 'load' });
await page.waitForFunction(() => window.__head, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.mouse.move(700, 450);
const flick = async (label, px) => {
	const t0 = Date.now();
	for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, px / 8); await page.waitForTimeout(16); }
	const start = await page.evaluate(() => window.__head.T);
	const samples = [];
	let settled = 0;
	for (let i = 0; i < 150; i++) {
		await page.waitForTimeout(100);
		const [T, v] = await page.evaluate(() => [window.__head.T, window.__head.v]);
		samples.push(T);
		if (Math.abs(v) < 0.001 && i > 3) { settled = Date.now() - t0; break; }
	}
	const T = samples.at(-1);
	console.log(`${label.padEnd(22)} ${px}px  T ${start.toFixed(2)} -> ${T.toFixed(2)}  took ${(settled / 1000).toFixed(1)}s`);
};
await flick('flick from the hero', 1500);
await flick('second flick', 1500);
await flick('third flick', 1500);
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(100);
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
const t0 = Date.now();
await page.waitForFunction(() => window.__head.T > 33.95, null, { timeout: 40000 });
console.log(`jump to the very end took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
