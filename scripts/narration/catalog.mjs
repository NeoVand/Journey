// What a conversation's cue sheet can point at: for every card of the story, the named things in the world at that
// moment, whether or not the card's shot frames them. node scripts/narration/catalog.mjs > narration-lab/catalog.json
// Needs the dev server on 5199 (pnpm dev --port 5199). Side trips follow, card by card, as a reader takes them.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { timeout: 300000 });
await page.waitForFunction(() => window.__journey && window.__world && document.querySelector('main.driven'), null, { timeout: 300000 });
const cards = await page.evaluate(() =>
	[...document.querySelectorAll('[data-beat]')].flatMap((s, i) =>
		[...s.querySelectorAll('.pin')].map((el) => ({ title: el.querySelector('h1, h2')?.textContent?.trim() ?? '', T: +(i + (Number(el.dataset.in ?? 0.03) + Math.min(0.97, Number(el.dataset.out ?? 0.92))) / 2).toFixed(3) }))
	)
);
const out = [];
for (const card of cards) {
	await page.evaluate((T) => window.__journey.seek(T, 3.1), card.T);
	await page.waitForTimeout(400);
	await page.evaluate((T) => window.__journey.seek(T, 3.1), card.T);
	const things = await page.evaluate(() => {
		const w = window.__world;
		const names = new Set();
		const skip = /^(batch|machine|sign|island|.*-(stand|base|feet|legs|mount|bolts|collars|gland))$/;
		for (const scene of [w.root, w.cluster.group]) {
			scene.traverseVisible((o) => {
				if (!o.name || skip.test(o.name)) return;
				names.add(o.name);
			});
		}
		const onScreen = [...names].filter((n) => w.whereIs([n]));
		return { all: [...names].sort(), onScreen: onScreen.sort() };
	});
	out.push({ ...card, ...things });
	console.error(`${card.T.toFixed(2)} ${card.title}: ${things.onScreen.length} in shot, ${things.all.length} in the world`);
}
// The side trips, card by card, as a reader takes them: each is set off from the chapter that offers it.
const TRIPS = { harness: ['Inside the harness', 'the-harness-wakes-up'], mcp: ['How MCP connects', 'the-harness-wakes-up'], sandbox: ['Permission and the sandbox', 'intent-is-not-authority'], memory: ['Memory, forks and rewinds', 'seven-things-called-memory'], plans: ['Plans and to-do lists', 'around-the-loop'] };
for (const [id, [name, from]] of Object.entries(TRIPS)) {
	await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug&trip=${id}#${from}`, { timeout: 300000 });
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 300000 });
	await page.getByRole('button', { name }).first().click();
	await page.waitForSelector('[data-trip]');
	const n = await page.locator('[data-trip] .pin').count();
	for (let i = 0; i < n; i++) {
		const stop = i === n - 1 ? n : i + 0.848;
		if (i > 0) await page.keyboard.press('ArrowRight');
		await page.waitForFunction((s) => Math.abs(window.__world.trackT - s) < 0.01, stop, { timeout: 120000 }).catch(() => {});
		await page.waitForTimeout(300);
		const title = (await page.locator('[data-trip] .pin').nth(i).locator('h2').first().textContent())?.trim() ?? '';
		const things = await page.evaluate(() => {
			const w = window.__world;
			const scenes = w.trackIn && w.trackId ? [w.places[w.trackId]?.group] : [w.root, w.cluster.group];
			const names = new Set();
			const skip = /^(batch|machine|sign|island|.*-(stand|base|feet|legs|mount|bolts|collars|gland))$/;
			for (const scene of scenes) scene?.traverseVisible((o) => o.name && !skip.test(o.name) && names.add(o.name));
			return { all: [...names].sort(), onScreen: [...names].filter((x) => w.whereIs([x])).sort() };
		});
		out.push({ trip: id, title, ...things });
		console.error(`${id} ${i + 1} ${title}: ${things.onScreen.length} in shot, ${things.all.length} in the place`);
	}
}
console.log(JSON.stringify(out, null, '\t'));
await browser.close();
