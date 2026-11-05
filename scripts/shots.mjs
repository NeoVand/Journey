// Captures frames at chosen T values: node scripts/shots.mjs <outDir> <WxH> <T,T,T> [harness]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out, size = '1440x900', list = '0', harness] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch({
	headless: true,
	channel: 'chromium',
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: +(process.env.DPR ?? 1) });
const errors = [];
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey, null, { timeout: 120000 });
for (const T of list.split(',')) {
	await page.evaluate(
		([t, h]) => {
			window.__journey.seek(+t, 3.1, h);
		},
		[T, harness]
	);
	await page.waitForTimeout(350);
	await page.evaluate(([t]) => window.__journey.seek(+t, 3.1), [T]);
	await page.waitForTimeout(60);
	const name = `${out}/T${String(T).replace('.', '_')}${harness ? '-' + harness : ''}-${width}.png`;
	await page.screenshot({ path: name });
	console.log(name);
}
const info = await page.evaluate(() => {
	const gl = document.createElement('canvas').getContext('webgl2');
	const ext = gl?.getExtension('WEBGL_debug_renderer_info');
	return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('renderer:', info);
if (errors.length) console.log([...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
