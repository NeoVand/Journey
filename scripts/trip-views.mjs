// The stills inside the title page's side-trip clouds: node scripts/trip-views.mjs [harness|mcp|sandbox|memory|plans]
// Each is the trip's best view, taken from the real 3D scene at a chosen card the way scripts/trips.mjs reaches it: the
// trip is opened from its card and stepped with the arrow key, waiting for each card's scene to finish. Then the words
// and the header are hidden, the scene is cropped around its subject, and Chromium itself writes the WebP, so nothing
// else needs installing. Run it again whenever one of those scenes changes.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const only = process.argv[2];
const out = new URL('../static/trips/', import.meta.url);
mkdirSync(out, { recursive: true });
/** The size each still is written at: twice the largest a cloud shows it, on a big monitor. */
const W = 360;
const H = 248;

/**
 * Which card shows the trip best, and the crop around its subject, in pixels of a 1440 by 900 screen.
 * from: the chapter that offers the trip, where it's set off from.
 */
const VIEWS = {
	harness: { name: 'Inside the harness', from: 'the-harness-wakes-up', card: 1, clip: { x: 600, y: 240, width: 800, height: 550 } },
	mcp: { name: 'How MCP connects', from: 'the-harness-wakes-up', card: 5, clip: { x: 560, y: 60, width: 880, height: 607 } },
	sandbox: { name: 'Permission and the sandbox', from: 'intent-is-not-authority', card: 4, clip: { x: 560, y: 130, width: 860, height: 590 } },
	memory: { name: 'Memory, forks and rewinds', from: 'seven-things-called-memory', card: 4, clip: { x: 600, y: 270, width: 760, height: 524 } },
	plans: { name: 'Plans and to-do lists', from: 'around-the-loop', card: 4, clip: { x: 870, y: 240, width: 580, height: 400 } }
};

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
const encoder = await ctx.newPage();

/** A PNG made smaller in halves, for a clean result, then written as WebP by the browser's own encoder. */
async function webp(png) {
	const data = await encoder.evaluate(
		async ({ b64, w, h }) => {
			const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
			let src = await createImageBitmap(blob);
			let sw = src.width;
			let sh = src.height;
			while (sw / 2 >= w * 1.5) {
				const half = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2));
				const g = half.getContext('2d');
				g.imageSmoothingQuality = 'high';
				g.drawImage(src, 0, 0, half.width, half.height);
				src = half;
				sw = half.width;
				sh = half.height;
			}
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const g = canvas.getContext('2d');
			g.imageSmoothingQuality = 'high';
			g.drawImage(src, 0, 0, w, h);
			return canvas.toDataURL('image/webp', 0.82).split(',')[1];
		},
		{ b64: png.toString('base64'), w: W, h: H }
	);
	return Buffer.from(data, 'base64');
}

for (const [id, view] of Object.entries(VIEWS)) {
	if (only && only !== id) continue;
	// A query of its own, so a second trip loads a fresh page rather than only changing the hash.
	await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug&trip=${id}#${view.from}`, { waitUntil: 'load' });
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 120000 });
	await page.getByRole('button', { name: view.name }).first().click();
	await page.waitForSelector('[data-trip]');
	const cards = await page.locator('[data-trip] .pin').count();
	for (let i = 0; i < view.card; i++) {
		// Each step stops where its card's scene has finished; the last card plays to the end, and then the trip is over,
		// so the picture is taken the moment the scene settles.
		const stop = i === cards - 1 ? cards : i + 0.848;
		// Only the world: the words, the header and every key go before the chosen card's scene plays.
		if (i === view.card - 1) await page.addStyleTag({ content: '.journey, .tip { visibility: hidden !important; }' });
		if (i > 0) await page.keyboard.press('ArrowRight');
		await page.waitForFunction((s) => Math.abs(window.__world.trackT - s) < 0.01, stop, { timeout: 90000, polling: 'raf' }).catch(() => console.log(`${id} card ${i + 1}: did not settle`));
	}
	const file = new URL(`${id}.webp`, out);
	const bytes = await webp(await page.screenshot({ clip: view.clip }));
	writeFileSync(file, bytes);
	console.log(`${id}: card ${view.card}, ${Math.round(bytes.length / 1024)} KB`);
}
await browser.close();
