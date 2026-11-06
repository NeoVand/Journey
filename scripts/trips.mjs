// One frame of every card of a side trip, at the end of its scene: node scripts/trips.mjs <outDir> [WxH] [mcp|harness] [harness]
// Side trips only play in real time, so this opens one from its card the way a reader does and steps it with the arrow
// key, waiting for each card's scene to finish. A width under 768 runs as a touch phone.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out, size = '1440x900', only, harness] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const [width, height] = size.split('x').map(Number);
const phone = width < 768;
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));

const TRIPS = { mcp: 'How MCP connects', harness: 'Inside the harness' };
for (const [id, name] of Object.entries(TRIPS)) {
	if (only && only !== id) continue;
	// A query of its own, so a second trip loads a fresh page rather than only changing the hash.
	await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug&trip=${id}#the-harness-wakes-up`, { waitUntil: 'load' });
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 120000 });
	if (harness) await page.getByRole('button', { name: new RegExp(`^${harness}`, 'i') }).first().click().catch(() => {});
	await page.getByRole('button', { name }).first().click();
	await page.waitForSelector('[data-trip]');
	const cards = await page.locator('[data-trip] .pin').count();
	// The way in: the flight, and for an inside trip the drop through the roof.
	await page.waitForTimeout(6000);
	for (let i = 0; i < cards; i++) {
		// A step stops where the card in view has finished its scene, with its words still up. The last one plays to the end.
		const stop = i === cards - 1 ? cards : i + 0.848;
		await page.keyboard.press('ArrowRight');
		await page.waitForFunction((s) => Math.abs(window.__world.trackT - s) < 0.01, stop, { timeout: 90000 }).catch(() => console.log(`${id} card ${i + 1}: did not settle`));
		await page.waitForTimeout(400);
		const title = await page.locator('[data-trip] .pin').nth(i).locator('h2, h3').first().textContent();
		const file = `${out}/${id}-${String(i + 1).padStart(2, '0')}-${width}.png`;
		await page.screenshot({ path: file });
		console.log(`${id} ${i + 1}/${cards} ${title?.trim()}`);
	}
}
await browser.close();
