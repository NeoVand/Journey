// Close-ups of both ends of every cable, so none of them can hide: node scripts/cables.mjs <outDir> [T,T,...] [harness]
// Finds every tube that's in the scene at each moment, however it was built, and takes a picture of where it stops.
// Thin threads inside the transformer are left out: they're drawn in the air on purpose.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [dir, list = '3.5,5,6.5,9.5,10.5,11.2,12.5,13.2,18.5,19.5,20.3,21.5,22.5,24.5,25.5,26.5,28.5,30.5,32.9', harness] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
await page.evaluate((h) => {
	document.querySelector('.journey').style.visibility = 'hidden';
	document.querySelector('[data-dive]').style.visibility = 'hidden';
	if (h) window.__journey.seek(0, 0, h);
}, harness);

const seen = new Set();
const ends = [];
for (const T of list.split(',').map(Number)) {
	const found = await page.evaluate((T) => {
		const w = window.__world;
		w.update(T, 3.1, 1, 0, 0, true);
		w.stage.scene.updateMatrixWorld(true);
		const out = [];
		w.stage.scene.traverseVisible((o) => {
			const p = o.geometry?.parameters;
			if (o.geometry?.type !== 'TubeGeometry' || !p?.path || p.radius < 0.03) return;
			if (o.material?.transparent && o.material.opacity < 0.5) return;
			const a = p.path.getPointAt(0).applyMatrix4(o.matrixWorld);
			const b = p.path.getPointAt(1).applyMatrix4(o.matrixWorld);
			const ta = p.path.getTangentAt(0).transformDirection(o.matrixWorld);
			const tb = p.path.getTangentAt(1).transformDirection(o.matrixWorld);
			const hex = o.material?.color?.getHexString?.() ?? 'none';
			out.push({ hex, r: p.radius, at: [a.x, a.y, a.z], dir: [-ta.x, -ta.y, -ta.z], end: 'start' });
			out.push({ hex, r: p.radius, at: [b.x, b.y, b.z], dir: [tb.x, tb.y, tb.z], end: 'end' });
		});
		return out;
	}, T);
	for (const e of found) {
		const key = `${e.hex}|${e.at.map((v) => v.toFixed(1)).join(',')}`;
		if (seen.has(key)) continue;
		seen.add(key);
		ends.push({ ...e, T });
	}
}

// Does any cable run through something solid? Counts surfaces straight up from points along it: odd means it's inside.
for (const T of list.split(',').map(Number)) {
	const clashes = await page.evaluate((T) => {
		const w = window.__world;
		w.update(T, 3.1, 1, 0, 0, true);
		w.stage.scene.updateMatrixWorld(true);
		const ray = w.poker.ray;
		ray.camera = w.stage.camera;
		ray.far = 200;
		const V = w.root.position.constructor;
		const solids = [];
		const tubes = [];
		w.stage.scene.traverseVisible((o) => {
			if (!o.isMesh) return;
			if (o.geometry?.type === 'TubeGeometry') {
				if (o.geometry.parameters?.path && o.geometry.parameters.radius >= 0.03 && !(o.material?.transparent && o.material.opacity < 0.5)) tubes.push(o);
			} else if (!o.material?.transparent && o.geometry?.type !== 'PlaneGeometry' && !o.isInstancedMesh) solids.push(o);
		});
		const out = {};
		for (const t of tubes) {
			const path = t.geometry.parameters.path;
			const steps = Math.ceil(path.getLength() / 0.12);
			for (let i = 0; i <= steps; i++) {
				const p = path.getPointAt(i / steps).applyMatrix4(t.matrixWorld);
				for (const s of solids) {
					if (s.geometry.boundingSphere === null) s.geometry.computeBoundingSphere();
					const c = s.geometry.boundingSphere.center.clone().applyMatrix4(s.matrixWorld);
					if (c.distanceTo(p) > s.geometry.boundingSphere.radius * 1.05) continue;
					ray.set(p, new V(0, 1, 0));
					const was = s.material.side;
					s.material.side = 2;
					const hits = ray.intersectObject(s, false).length;
					s.material.side = was;
					if (hits % 2 === 1) {
						const key = `#${t.material.color.getHexString()} r${t.geometry.parameters.radius} in ${s.parent?.name || s.name || s.geometry.type}`;
						out[key] ??= { n: 0, at: p.toArray().map((v) => +v.toFixed(2)) };
						out[key].n++;
					}
				}
			}
		}
		return out;
	}, T);
	for (const [k, v] of Object.entries(clashes)) console.log(`CLASH T ${T}  ${k}  ${v.n} points, first at [${v.at}]`);
}

let n = 0;
for (const e of ends) {
	const name = `${String(n++).padStart(3, '0')}.png`;
	await page.evaluate((e) => {
		const w = window.__world;
		// Looking back at the end from where the cable comes from, off to one side, and from a little above.
		const away = Math.atan2(-e.dir[0], -e.dir[2]);
		const az = ((away * 180) / Math.PI + 35) % 360;
		const region = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
		const shot = { az, el: 24, target: e.at, radius: 1.5, ry: 1.5, wide: region, tall: region };
		w.rig.shots = [{ T: -1, ...shot }, { T: 100, ...shot }];
		w.update(e.T, 3.1, 1, 0, 0, true);
	}, e);
	await page.waitForTimeout(70);
	await page.evaluate((T) => window.__world.update(T, 3.1, 1, 0, 0, true), e.T);
	await page.waitForTimeout(30);
	await page.screenshot({ path: `${dir}/${name}` });
	console.log(`${name} T ${e.T}  #${e.hex}  r ${e.r}  ${e.end}  [${e.at.map((v) => v.toFixed(2)).join(', ')}]`);
}
await browser.close();
