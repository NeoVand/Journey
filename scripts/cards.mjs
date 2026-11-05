// Checks that every card fits on screen: node scripts/cards.mjs [WxH,WxH,...]
// A card fits when none of its text runs under the header or off the bottom of the screen, for any agent.
import { chromium } from 'playwright';

const sizes = (process.argv[2] ?? '1440x900,1280x720,1024x768,390x844,360x640').split(',');
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const size of sizes) {
	const [width, height] = size.split('x').map(Number);
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__journey, null, { timeout: 90000 });
	for (const harness of ['claude', 'codex', 'copilot']) {
		await page.evaluate((h) => window.__journey.seek(0.1, 0, h), harness);
		const report = await page.evaluate(async () => {
			const pad = 6;
			const head = document.querySelector('.bar')?.getBoundingClientRect().bottom ?? 0;
			const beats = [...document.querySelectorAll('[data-beat]')];
			const out = [];
			for (const [i, beat] of beats.entries()) {
				for (const pin of beat.querySelectorAll('.pin')) {
					const from = Number(pin.dataset.in ?? 0.03);
					const to = Math.min(0.98, Number(pin.dataset.out ?? 0.92));
					window.__journey.seek(i + (from + to) / 2, 0);
					await new Promise((r) => requestAnimationFrame(r));
					const kids = [...pin.children].filter((k) => getComputedStyle(k).display !== 'none');
					const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
					const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
					const left = Math.min(...kids.map((k) => k.getBoundingClientRect().left));
					const right = Math.max(...kids.map((k) => k.getBoundingClientRect().right));
					const problems = [];
					if (top < head + pad) problems.push(`under header by ${Math.round(head + pad - top)}px`);
					if (bottom > innerHeight - pad) problems.push(`off bottom by ${Math.round(bottom - innerHeight + pad)}px`);
					if (left < 0 || right > innerWidth) problems.push('off the side');
					if (problems.length) out.push(`${pin.querySelector('h1,h2')?.textContent}: ${problems.join(', ')}`);
				}
			}
			return out;
		});
		for (const line of report) {
			console.log(`${size} ${harness}  ${line}`);
			bad++;
		}
	}
	await page.close();
}
console.log(bad ? `${bad} problems` : 'every card fits');
await browser.close();
