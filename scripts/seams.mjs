// Every section boundary, frame by frame: node scripts/seams.mjs <outPrefix> <WxH> [perSheet] [harness]
// Reviewing held poses misses what goes wrong between them, so this is the sheet to read before calling anything done.
import { chromium } from 'playwright';

const [prefix, size = '1440x900', perSheet = '12', harness] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const OFFSETS = [-0.1, -0.05, -0.015, 0.015, 0.05, 0.1];
const browser = await chromium.launch({
	headless: true,
	channel: 'chromium',
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey, null, { timeout: 120000 });
if (harness) await page.evaluate((h) => window.__journey.seek(0, 0, h), harness);

const sheet = await browser.newPage({ viewport: { width: 2000, height: 100 } });
const flush = async (cells, n) => {
	await sheet.setContent(
		`<style>body{margin:0;display:grid;grid-template-columns:repeat(${OFFSETS.length},1fr);gap:3px;background:#fff}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:3px;bottom:3px;font:12px monospace;background:#000;color:#fff;padding:0 4px}</style>${cells.join('')}`
	);
	await sheet.waitForTimeout(120);
	const file = `${prefix}${String(n).padStart(2, '0')}.png`;
	await sheet.screenshot({ path: file, fullPage: true });
	console.log(file);
};

let cells = [];
let n = 0;
let inSheet = 0;
for (let b = 1; b <= 33; b++) {
	for (const o of OFFSETS) {
		const T = b + o;
		await page.evaluate((t) => window.__journey.seek(t, 3.1), T);
		await page.waitForTimeout(70);
		await page.evaluate((t) => window.__journey.seek(t, 3.1), T);
		await page.waitForTimeout(30);
		const buf = await page.screenshot({ type: 'jpeg', quality: 78 });
		cells.push(`<figure><img src="data:image/jpeg;base64,${buf.toString('base64')}"><figcaption>${T.toFixed(3)}</figcaption></figure>`);
	}
	if (++inSheet === +perSheet) {
		await flush(cells, n++);
		cells = [];
		inSheet = 0;
	}
}
if (cells.length) await flush(cells, n);
if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
