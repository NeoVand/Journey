// Finds the slow frames and says why: node scripts/hitch.mjs [seconds] [worst]
// Each slow frame is listed with its time in JS and in the render call, and with what the GPU was given for the first time.
import { chromium } from 'playwright';

const seconds = Number(process.argv[2] ?? 75);
const worst = Number(process.argv[3] ?? 22);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const t0 = Date.now();
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true', null, { timeout: 90000 });
console.log(`ready after ${Date.now() - t0} ms`);
await page.waitForTimeout(1500);
const r = await page.evaluate(async (seconds) => {
	const world = window.__world;
	const renderer = world.stage.renderer;
	const info = renderer.info;
	const snap = () => ({ programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
	const frames = [];
	const realUpdate = world.update.bind(world);
	const realRender = world.stage.render.bind(world.stage);
	let renderMs = 0;
	world.stage.render = () => {
		const a = performance.now();
		realRender();
		renderMs = performance.now() - a;
	};
	let current = null;
	world.update = (T, ...rest) => {
		const before = snap();
		const a = performance.now();
		realUpdate(T, ...rest);
		const total = performance.now() - a;
		const after = snap();
		current = { T: +T.toFixed(3), total: +total.toFixed(1), render: +renderMs.toFixed(1), programs: after.programs - before.programs, textures: after.textures - before.textures, geometries: after.geometries - before.geometries };
	};
	const max = document.documentElement.scrollHeight - innerHeight;
	let last = performance.now();
	const start = last;
	const start0 = snap();
	return await new Promise((resolve) => {
		const tick = (now) => {
			if (current) {
				frames.push({ dt: +(now - last).toFixed(1), ...current });
				current = null;
			}
			last = now;
			const k = (now - start) / (seconds * 1000);
			scrollTo(0, max * Math.min(1, k));
			if (k < 1) requestAnimationFrame(tick);
			else {
				const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
				resolve({
					start: start0,
					end: snap(),
					n: frames.length,
					p50: dts[dts.length >> 1],
					p95: dts[Math.floor(dts.length * 0.95)],
					p99: dts[Math.floor(dts.length * 0.99)],
					max: dts[dts.length - 1],
					over50: dts.filter((d) => d > 50).length,
					over100: dts.filter((d) => d > 100).length,
					slow: [...frames].sort((a, b) => b.dt - a.dt).slice(0, 60)
				});
			}
		};
		requestAnimationFrame(tick);
	});
}, seconds);
console.log(`frames ${r.n}  p50 ${r.p50}  p95 ${r.p95}  p99 ${r.p99}  max ${r.max}  over 50ms: ${r.over50}  over 100ms: ${r.over100}`);
console.log('GPU at start', r.start, 'at end', r.end);
console.log('   dt    js  render   T      new programs/textures/geometries');
for (const f of r.slow.slice(0, worst)) console.log(`${String(f.dt).padStart(6)} ${String(f.total).padStart(6)} ${String(f.render).padStart(6)} ${String(f.T).padStart(7)}   ${f.programs}/${f.textures}/${f.geometries}`);
const mem = await page.evaluate(() => {
	const seen = new Set();
	let bytes = 0;
	const big = [];
	window.__world.stage.scene.traverse((o) => {
		const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
		for (const m of ms) {
			for (const v of Object.values(m)) {
				if (v?.isTexture && !seen.has(v)) {
					seen.add(v);
					const i = v.image;
					const w = i?.width ?? 0, h = i?.height ?? 0;
					const b = w * h * 4 * (v.generateMipmaps ? 1.33 : 1);
					bytes += b;
					big.push([w, h]);
				}
			}
		}
	});
	let tris = 0;
	let verts = 0;
	const geos = new Set();
	window.__world.stage.scene.traverse((o) => {
		if (o.geometry && !geos.has(o.geometry)) {
			geos.add(o.geometry);
			verts += o.geometry.attributes.position?.count ?? 0;
			tris += (o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count ?? 0)) / 3;
		}
	});
	big.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
	return { textures: seen.size, mb: Math.round(bytes / 1048576), biggest: big.slice(0, 10), geometries: geos.size, verts, tris: Math.round(tris), jsHeap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
});
console.log('memory', JSON.stringify(mem));
await browser.close();
