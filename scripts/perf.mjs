// Real-time check: scrolls the live page and reports frame times and console problems.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(process.env.URL ?? 'http://localhost:5199/', { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true', null, { timeout: 60000 });
await page.waitForTimeout(2000);
const result = await page.evaluate(async () => {
	const max = document.documentElement.scrollHeight - innerHeight;
	const times = [];
	let last = performance.now();
	const start = last;
	return await new Promise((resolve) => {
		const tick = (now) => {
			times.push(now - last);
			last = now;
			const k = (now - start) / 75000;
			scrollTo(0, max * Math.min(1, k));
			if (k < 1) requestAnimationFrame(tick);
			else {
				const s = [...times].sort((a, b) => a - b);
				resolve({ frames: s.length, avg: s.reduce((a, b) => a + b, 0) / s.length, p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], worst: s[s.length - 1], dpr: devicePixelRatio, canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height], max });
			}
		};
		requestAnimationFrame(tick);
	});
});
console.log(result);
console.log([...new Set(problems)].slice(0, 15).join('\n') || 'no console problems');
await browser.close();
