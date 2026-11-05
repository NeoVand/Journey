// Every frame should depend only on where you are in the story. This goes to a point fresh, then again after
// visiting somewhere else, and reports any pixels that differ: node scripts/leaks.mjs <outDir> [T,T,...] [harness]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [dir, list = '0.3,1.3,2.5,3.5,4.4,5.3,6.1,6.7,7.6,8.4,9.5,10.5,11.2,12.5,13.3,14.2,15.4,16.4,17.5,18.4,19.5,20.3,21.5,22.5,23.5,24.5,25.5,26.5,27.4,28.5,29.5,30.5,31.5', harness] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
const compare = await browser.newPage();

const shot = async (T) => {
	// Twice, because a few things settle on the frame after they're told, and the second frame is the true one.
	for (let i = 0; i < 2; i++) {
		await page.evaluate((T) => window.__journey.seek(T, 3.1), T);
		await page.waitForTimeout(90);
	}
	return page.screenshot();
};
const differs = (a, b) =>
	compare.evaluate(
		async ([a, b]) => {
			const load = async (data) => {
				const i = new Image();
				i.src = `data:image/png;base64,${data}`;
				await i.decode();
				const c = document.createElement('canvas');
				c.width = i.width;
				c.height = i.height;
				const x = c.getContext('2d');
				x.drawImage(i, 0, 0);
				return x.getImageData(0, 0, i.width, i.height);
			};
			const A = await load(a);
			const B = await load(b);
			let count = 0;
			let box = [1e9, 1e9, -1, -1];
			for (let y = 0; y < A.height; y++) {
				for (let x = 0; x < A.width; x++) {
					const i = (y * A.width + x) * 4;
					if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) {
						count++;
						box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
					}
				}
			}
			return { count, box };
		},
		[a.toString('base64'), b.toString('base64')]
	);

await page.evaluate((h) => {
	if (h) window.__journey.seek(0, 0, h);
	// The scene only: the page's own words and dots have transitions of their own, which look like changes.
	document.querySelector('.journey').style.visibility = 'hidden';
}, harness);
let bad = 0;
for (const T of list.split(',').map(Number)) {
	await shot(T);
	const first = await shot(T);
	for (const [label, away] of [['end', 32.95], ['next', Math.min(32.5, T + 1.3)], ['start', 0]]) {
		await page.evaluate((a) => window.__journey.seek(a, 3.1), away);
		await page.waitForTimeout(60);
		const again = await shot(T);
		const { count, box } = await differs(first, again);
		if (count > 12) {
			bad++;
			const name = `T${T}-after-${label}`.replace('.', '_');
			writeFileSync(`${dir}/${name}-a.png`, first);
			writeFileSync(`${dir}/${name}-b.png`, again);
			console.log(`T ${T} after ${label}: ${count} pixels differ, in ${box.join(',')}`);
		}
	}
}
console.log(bad ? `${bad} leaks` : 'no leaks');
await browser.close();
