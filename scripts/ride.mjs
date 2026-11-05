// Sends a token round the finale's whole route and reports anywhere it's inside something solid: node scripts/ride.mjs
// The lap runs on the clock rather than the scroll, so the timeline scan in collide.mjs can't see it.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
const out = await page.evaluate(() => {
	const w = window.__world;
	window.__journey.seek(32.95, 3.1);
	w.stage.scene.updateMatrixWorld(true);
	const f = w.finale;
	const token = f.tokens[1];
	const ray = w.poker.ray;
	ray.camera = w.stage.camera;
	ray.far = 200;
	const V = w.root.position.constructor;
	const solids = [];
	w.stage.scene.traverseVisible((o) => {
		if (!o.isMesh || o.isInstancedMesh || f.tokens.includes(o)) return;
		const mat = Array.isArray(o.material) ? o.material[0] : o.material;
		const type = o.geometry?.type;
		if (mat.transparent || type === 'PlaneGeometry' || type === 'CircleGeometry' || type === 'TubeGeometry') return;
		if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
		solids.push(o);
	});
	const corners = [[0, 0, 0], ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * 0.62, y * 0.17, z * 0.38])))];
	const report = {};
	const steps = 1400;
	for (let i = 1; i < steps; i++) {
		const u = i / steps;
		const leg = f.place(token, u);
		token.updateMatrixWorld(true);
		if (!token.visible) continue;
		const legNo = f.legs.indexOf(leg);
		for (const c of corners) {
			const p = new V(...c).applyMatrix4(token.matrixWorld);
			for (const s of solids) {
				const centre = s.geometry.boundingSphere.center.clone().applyMatrix4(s.matrixWorld);
				if (centre.distanceTo(p) > s.geometry.boundingSphere.radius * s.matrixWorld.getMaxScaleOnAxis() * 1.05) continue;
				ray.set(p, new V(0, 1, 0));
				const was = s.material.side;
				s.material.side = 2;
				const hits = ray.intersectObject(s, false).length;
				s.material.side = was;
				if (hits % 2 === 1) {
					const key = `leg ${legNo} step ${leg.step} in ${s.parent?.name || s.name || s.geometry.type}`;
					report[key] ??= { n: 0, first: u.toFixed(3), scale: token.scale.x.toFixed(2), at: p.toArray().map((v) => +v.toFixed(1)).join(',') };
					report[key].n++;
				}
			}
		}
	}
	f.tokens[1].visible = false;
	return report;
});
for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.n} corners, from u ${v.first}, scale ${v.scale}, at ${v.at}`);
console.log(Object.keys(out).length ? 'the token touches things' : 'clear all the way round');
await browser.close();
