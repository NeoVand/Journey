// True frame cost with the browser's frame cap removed: node scripts/gpu.mjs
// Times real animation frames at fixed points in the story, for each sharpness.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true', null, { timeout: 90000 });
await page.waitForTimeout(1000);
const cost = (y, dpr) =>
	page.evaluate(
		async ([y, dpr]) => {
			window.__world.resize(innerWidth, innerHeight, dpr);
			scrollTo(0, document.documentElement.scrollHeight * y);
			await new Promise((r) => setTimeout(r, 1200));
			const t = [];
			let last = performance.now();
			await new Promise((res) => {
				const f = (n) => {
					t.push(n - last);
					last = n;
					if (t.length < 80) requestAnimationFrame(f);
					else res();
				};
				requestAnimationFrame(f);
			});
			t.sort((a, b) => a - b);
			return t[40];
		},
		[y, dpr]
	);
for (const [label, y] of [['hero', 0.005], ['tokens', 0.1], ['node', 0.2], ['tray', 0.27], ['stack', 0.47], ['wheel', 0.58], ['gates', 0.68], ['tools', 0.74], ['press', 0.86], ['end', 0.995]]) {
	console.log(`${label.padEnd(8)} 2x ${(await cost(y, 2)).toFixed(1).padStart(5)} ms   1.5x ${(await cost(y, 1.5)).toFixed(1).padStart(5)} ms   1x ${(await cost(y, 1)).toFixed(1).padStart(5)} ms`);
}
await browser.close();
