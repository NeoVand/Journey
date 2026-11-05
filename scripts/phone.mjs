// node scripts/phone.mjs <outDir> [WxH]: one frame of every card, on an emulated phone, at the middle of the card's life.
import { chromium } from 'playwright';
const [out, size = '390x844'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey, null, { timeout: 120000 });
const cards = await page.evaluate(() =>
	[...document.querySelectorAll('[data-beat]')].flatMap((s, i) =>
		[...s.querySelectorAll('.pin')].map((el) => ({
			i,
			title: el.querySelector('h1, h2')?.textContent ?? '',
			from: Number(el.dataset.in ?? 0.03),
			end: Math.min(0.97, Number(el.dataset.out ?? 0.92))
		}))
	)
);
let n = 0;
for (const c of cards) {
	const T = c.i === 0 ? 0.2 : c.i + (c.from + c.end) / 2 + (c.end - c.from) * 0.2;
	await page.evaluate((T) => window.__journey.seek(T, 3.1), T);
	await page.waitForTimeout(280);
	await page.evaluate((T) => window.__journey.seek(T, 3.1), T);
	await page.waitForTimeout(120);
	const fit = await page.evaluate((title) => {
		const pin = [...document.querySelectorAll('.pin')].find((p) => (p.querySelector('h1, h2')?.textContent ?? '') === title);
		const kids = [...pin.querySelectorAll('h1, h2, p, ol, ul, dl, .dial, .ticket')].filter((e) => e.offsetParent);
		const rects = kids.map((k) => k.getBoundingClientRect());
		return Math.round(Math.min(...rects.map((r) => r.top)));
	}, c.title);
	const name = `${String(n++).padStart(2, '0')}`;
	await page.screenshot({ path: `${out}/${name}.png` });
	console.log(name, T.toFixed(3), `card top ${fit}px`, c.title);
}
await browser.close();
