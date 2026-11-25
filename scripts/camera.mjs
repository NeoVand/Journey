// Finds what stands between the camera and what it's looking at: along the timeline, the line from the eye to the shot's
// subject against every solid mesh it passes. node scripts/camera.mjs [from] [to] [step] [harness]
// The camera stands far off with a long lens, so anything between it and the subject shows, and hides the subject.
// PHONE=1 runs the page as a touch phone, which frames every shot differently. TRACK=<id> scans a side trip.
// Only solid, closed meshes count: an open sheet has no inside.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [from = '0', to = '33', step = '0.005', harness = 'claude'] = process.argv.slice(2);
const DEEP = 0;
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const phone = !!process.env.PHONE;
const page = await browser.newPage({ viewport: phone ? { width: 402, height: 874 } : { width: 640, height: 400 }, hasTouch: phone, isMobile: phone });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 90000 });

await page.evaluate(async ([harness, signsOnly, track, trackAt, room, deep]) => {
	const THREE = await import('/node_modules/three/build/three.module.js');
	const world = window.__world;
	const scene = world.stage.scene;
	world.stage.render = () => {}; // geometry only: nothing needs drawing
	window.__journey.seek(0, 0, harness);
	window.__signsOnly = signsOnly;

	void deep;
	const GRID = 48;
	const grids = new Map();

	const seen = (mesh) => {
		const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		if (!m || m.depthWrite === false || m.colorWrite === false) return false;
		return !(m.transparent && m.opacity < 0.6);
	};
	const flat = (mesh) => ['PlaneGeometry', 'CircleGeometry', 'RingGeometry'].includes(mesh.geometry.type);
	const named = (mesh) => {
		const parts = [];
		for (let o = mesh; o && parts.length < 3; o = o.parent) if (o.name) parts.push(o.name);
		const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		const c = m?.color ? `#${m.color.getHexString()}` : '';
		return `${parts.join(' < ') || mesh.geometry.type}${c ? ` ${c}` : ''}`;
	};

	// A column grid over x,z: a vertical ray only has to look at the triangles in its column.
	const gridOf = (g) => {
		const pos = g.attributes.position;
		const key = `${g.uuid}/${pos.version}`;
		let grid = grids.get(key);
		if (grid) return grid;
		g.computeBoundingBox();
		const box = g.boundingBox;
		const index = g.index;
		const tris = (index ? index.count : pos.count) / 3;
		const sx = Math.max(1e-6, box.max.x - box.min.x);
		const sz = Math.max(1e-6, box.max.z - box.min.z);
		const cells = Array.from({ length: GRID * GRID }, () => []);
		const verts = new Float32Array(tris * 9);
		for (let t = 0; t < tris; t++) {
			for (let v = 0; v < 3; v++) {
				const i = index ? index.getX(t * 3 + v) : t * 3 + v;
				verts[t * 9 + v * 3] = pos.getX(i);
				verts[t * 9 + v * 3 + 1] = pos.getY(i);
				verts[t * 9 + v * 3 + 2] = pos.getZ(i);
			}
			const xs = [verts[t * 9], verts[t * 9 + 3], verts[t * 9 + 6]];
			const zs = [verts[t * 9 + 2], verts[t * 9 + 5], verts[t * 9 + 8]];
			const x0 = Math.floor(((Math.min(...xs) - box.min.x) / sx) * (GRID - 1));
			const x1 = Math.ceil(((Math.max(...xs) - box.min.x) / sx) * (GRID - 1));
			const z0 = Math.floor(((Math.min(...zs) - box.min.z) / sz) * (GRID - 1));
			const z1 = Math.ceil(((Math.max(...zs) - box.min.z) / sz) * (GRID - 1));
			for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[z * GRID + x].push(t);
		}
		grid = { box, sx, sz, cells, verts };
		grids.set(key, grid);
		return grid;
	};

	// Inside a closed shape means an odd number of crossings both upward and downward. An open sheet only gives one of them.
	const inside = (grid, x, y, z) => {
		const { box, sx, sz, cells, verts } = grid;
		if (x < box.min.x || x > box.max.x || y < box.min.y || y > box.max.y || z < box.min.z || z > box.max.z) return false;
		const cx = Math.min(GRID - 1, Math.round(((x - box.min.x) / sx) * (GRID - 1)));
		const cz = Math.min(GRID - 1, Math.round(((z - box.min.z) / sz) * (GRID - 1)));
		let up = 0, down = 0;
		for (const t of cells[cz * GRID + cx]) {
			if (t * 3 < grid.start || t * 3 >= grid.end) continue;
			const i = t * 9;
			const ax = verts[i], ay = verts[i + 1], az = verts[i + 2];
			const bx = verts[i + 3], by = verts[i + 4], bz = verts[i + 5];
			const qx = verts[i + 6], qy = verts[i + 7], qz = verts[i + 8];
			const d = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
			if (Math.abs(d) < 1e-12) continue;
			const l1 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / d;
			const l2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / d;
			const l3 = 1 - l1 - l2;
			if (l1 < 0 || l2 < 0 || l3 < 0) continue;
			if (l1 * ay + l2 * by + l3 * qy > y) up++;
			else down++;
		}
		return up % 2 === 1 && down % 2 === 1;
	};

	const wbox = new THREE.Box3();
	const inv = new THREE.Matrix4(), full = new THREE.Matrix4(), one = new THREE.Vector3();
	const hits = new Map();

	window.__scan = (T) => {
		// TRACK=<id> scans a side trip instead: T is the trip's own time, over the story posed where the trip borrows it.
		if (track) {
			world.setTrack(track);
			// A trip with a room of its own is scanned inside it.
			world.trackIn = room;
			world.trackArrive = 1;
			world.trackT = T;
			world.trackBlend = 1;
			world.update(trackAt, 0, 1 / 60, 0, 0, true);
		} else window.__journey.seek(T, 0);
		scene.updateMatrixWorld(true);
		const live = [];
		scene.traverseVisible((o) => {
			if (!o.isMesh || !seen(o)) return;
			const g = o.geometry;
			if (g.drawRange.count === 0) return;
			if (!g.boundingBox) g.computeBoundingBox();
			if (o.isInstancedMesh) {
				for (let id = 0; id < o.count; id++) {
					o.getMatrixAt(id, full);
					if (Math.abs(full.determinant()) < 1e-9) continue;
					const world = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, full);
					wbox.copy(g.boundingBox).applyMatrix4(world);
					live.push({ o, id, key: `${o.uuid}/${id}`, world, box: wbox.clone(), m: world.elements.slice(), v: g.attributes.position.version, flat: false });
				}
				return;
			}
			wbox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
			live.push({ o, id: -1, key: o.uuid, world: o.matrixWorld, box: wbox.clone(), m: o.matrixWorld.elements.slice(), v: g.attributes.position.version, flat: flat(o) });
		});
		// The eye, and the line from it to what the shot looks at: anything solid on that line, short of the subject
		// itself, stands in front of it. With LOOK=1 the eye's own spot is all that's tested.
		const eye = world.stage.camera.getWorldPosition(new THREE.Vector3());
		const focus = (world.trackBlend > 0 ? null : world.rig.focus) ?? eye;
		const probes = [];
		for (let k = 0; k <= 0.86; k += 0.02) probes.push(eye.clone().lerp(focus, k));
		for (const other of live) {
			if (other.flat) continue;
			let hit = null;
			for (const p of probes) {
				if (!other.box.containsPoint(p)) continue;
				const grid = gridOf(other.o.geometry);
				const range = other.o.geometry.drawRange;
				grid.start = range.start;
				grid.end = range.start + range.count;
				one.copy(p).applyMatrix4(inv.copy(other.world).invert());
				if (inside(grid, one.x + 1e-5, one.y, one.z + 2e-5)) {
					hit = p;
					break;
				}
			}
			if (!hit) continue;
			const key = `${named(other.o)}`;
			const h = hits.get(key) ?? { key, peak: 1, peakT: T, times: [], where: [+hit.x.toFixed(2), +hit.y.toFixed(2), +hit.z.toFixed(2)] };
			h.times.push(+T.toFixed(3));
			hits.set(key, h);
		}
		const map = new Map();
		for (const e of live) map.set(e.key, e);
		window.__prev = map;
		return live.length;
	};
	window.__report = () => [...hits.values()];
}, [harness, !!process.env.SIGNS, process.env.TRACK ?? null, +(process.env.TRACK_AT ?? 1.5), ['harness', 'sandbox', 'memory', 'plans'].includes(process.env.TRACK), DEEP]);

const A = +from, B = +to, S = +step;
let maxMovers = 0;
for (let T = A, n = 0; T <= B + 1e-9; T += S, n++) {
	const movers = await page.evaluate((t) => window.__scan(t), T);
	maxMovers = Math.max(maxMovers, movers);
	if (n % 400 === 0) console.error(`T ${T.toFixed(2)}`);
}
const report = await page.evaluate(() => window.__report());
report.sort((a, b) => b.times.length - a.times.length);
const ranges = (times) => {
	const out = [];
	for (const t of times) {
		const r = out[out.length - 1];
		if (r && t - r[1] <= S * 1.5) r[1] = t;
		else out.push([t, t]);
	}
	return out.map((r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`)).join(', ');
};
console.log(`${report.length} things stood in front of the subject.`);
for (const h of report) console.log(`[${ranges(h.times)}]  ${JSON.stringify(h.where)}\n      ${h.key}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 1));
await browser.close();
