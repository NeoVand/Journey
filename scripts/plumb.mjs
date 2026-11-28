// Piers that pass through something on their way down: node scripts/plumb.mjs [T]
// Every pier in the sky goes down into the haze. A round pier's bottom cap has its centre vertex repeated once per
// side, so those repeats find every pier's axis. From there a line goes straight
// up: whatever it crosses before it reaches the pier's own head is something the pier runs through, a deck it pierces
// or a span it stands inside. The overlap scan misses these, since only a sliver of a tall pier is ever inside a slab.
import { chromium } from 'playwright';

const T = +(process.argv[2] ?? 7.5);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
const found = await page.evaluate(async (T) => {
	const THREE = await import('/node_modules/three/build/three.module.js');
	// Anything whose foot is this far down is a pier going into the haze.
	const LOW = -6;
	const world = window.__world;
	const scene = world.stage.scene;
	world.stage.render = () => {};
	window.__journey.seek(T, 0);
	scene.updateMatrixWorld(true);
	const named = (o) => {
		const parts = [];
		for (let p = o; p && parts.length < 3; p = p.parent) if (p.name) parts.push(p.name);
		return parts.join(' < ') || o.geometry.type;
	};
	const meshes = [];
	scene.traverseVisible((o) => {
		if (!o.isMesh || o.isInstancedMesh) return;
		const m = Array.isArray(o.material) ? o.material[0] : o.material;
		if (!m || m.colorWrite === false || (m.transparent && m.opacity < 0.6)) return;
		meshes.push(o);
	});
	// Pier feet: a point low in the haze that the mesh repeats at least eight times, a round cap's centre. Most stand
	// at the common foot; a few of the islands' own go less deep.
	const feet = [];
	const v = new THREE.Vector3();
	for (const o of meshes) {
		const pos = o.geometry.attributes.position;
		const count = new Map();
		for (let i = 0; i < pos.count; i++) {
			v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
			if (v.y > LOW) continue;
			const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
			count.set(key, (count.get(key) ?? 0) + 1);
		}
		for (const [key, n] of count) {
			const [x, y, z] = key.split(',').map(Number);
			if (n < 8) continue;
			// Its radius: the cap's rim, the nearest ring of points at its height (a neighbour's are farther).
			let r = Infinity;
			for (let i = 0; i < pos.count; i++) {
				v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
				const d = Math.hypot(v.x - x, v.z - z);
				if (Math.abs(v.y - y) < 0.01 && d > 0.01) r = Math.min(r, d);
			}
			if (!(r < 3)) r = 0;
			feet.push({ o, x, y, z, r });
		}
	}
	// Up each axis, both faces of everything counted.
	const sides = new Map();
	for (const o of meshes) for (const m of [o.material].flat()) if (!sides.has(m)) { sides.set(m, m.side); m.side = THREE.DoubleSide; }
	const ray = new THREE.Raycaster();
	const out = [];
	for (const f of feet) {
		ray.far = 200;
		// A batch builds one mesh per material, all under one name: the pier's band and cap are its own. Its head is the
		// first face of the pier's own mesh the line up its axis meets; lines just inside its skin, all round, go as high.
		const own = named(f.o);
		const up = new THREE.Vector3(0, 1, 0);
		ray.set(new THREE.Vector3(f.x, f.y + 0.05, f.z), up);
		const head = ray.intersectObjects(meshes, false).find((h) => h.object === f.o);
		const through = [];
		for (let k = -1; k < 8; k++) {
			const a = (k * Math.PI) / 4;
			const d = k < 0 ? 0 : f.r * 0.9;
			ray.set(new THREE.Vector3(f.x + d * Math.cos(a), f.y + 0.05, f.z + d * Math.sin(a)), up);
			for (const h of ray.intersectObjects(meshes, false)) if (named(h.object) !== own && (!head || h.distance < head.distance - 0.05)) through.push(h);
		}
		if (through.length)
			out.push({
				pier: named(f.o),
				at: [f.x, f.z, f.r].map((n) => +n.toFixed(2)),
				head: head ? +head.point.y.toFixed(2) : null,
				through: [...new Set(through.map((h) => `${named(h.object)} at y ${h.point.y.toFixed(2)}`))]
			});
	}
	for (const [m, s] of sides) m.side = s;
	return { piers: feet.length, out };
}, T);
console.log(`${found.piers} piers at T ${T}; ${found.out.length} pass through something`);
for (const f of found.out) console.log(`  ${f.pier} at ${JSON.stringify(f.at)} (head ${f.head})\n      ${f.through.join('\n      ')}`);
await browser.close();
