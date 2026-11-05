// True render cost, independent of any browser frame cap: render and wait for the GPU to finish.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5199/?still&debug', { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 60000 });
const cost = (T, dpr) => page.evaluate(async ([T, dpr]) => {
	const w = window.__world;
	w.resize(innerWidth, innerHeight, dpr);
	const gl = w.stage.renderer.getContext();
	const px = new Uint8Array(4);
	const t = [];
	for (let i = 0; i < 24; i++) {
		const a = performance.now();
		window.__journey.seek(T, 3 + i * 0.03);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // blocks until the GPU has finished
		t.push(performance.now() - a);
		await new Promise((r) => setTimeout(r, 40));
	}
	t.sort((a, b) => a - b);
	return t[12];
}, [T, dpr]);
for (const [label, T] of [['hero', 0.2], ['tokens', 6.3], ['node', 8.4], ['kv', 9.7], ['lanes', 12.5], ['prefill', 14.5], ['wheel', 15.5], ['call', 17.6], ['ghost', 19.7], ['gates', 22.6], ['tools', 24.5], ['tests', 26.5], ['press', 28.5], ['ten', 31.8], ['end', 33.7]]) {
	console.log(`${label.padEnd(9)} 2x ${(await cost(T, 2)).toFixed(1).padStart(5)} ms   1.5x ${(await cost(T, 1.5)).toFixed(1).padStart(5)} ms   1x ${(await cost(T, 1)).toFixed(1).padStart(5)} ms`);
}
await browser.close();
