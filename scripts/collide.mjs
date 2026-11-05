// Scans the whole timeline for moving things passing through solid things.
// node scripts/collide.mjs [from] [to] [step] [harness]
// SIGNS=1 instead tests every visible sign plate where it stands against everything except its own posts.
// PHONE=1 runs the page as a touch phone, where signs are printed larger.
// TRACK=mcp scans that side trip, with from and to in the trip's own time.
//
// At each moment it finds every mesh that moved relative to another, samples points on the mover's surface just
// under its skin, and asks whether those points are inside the other mesh. Anything rigidly attached is ignored,
// and so is contact shallower than the skin, so resting on a surface does not count.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [from = '0', to = '32', step = '0.01', harness = 'claude'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const phone = !!process.env.PHONE;
const page = await browser.newPage({ viewport: phone ? { width: 402, height: 874 } : { width: 640, height: 400 }, hasTouch: phone, isMobile: phone });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 90000 });

await page.evaluate(async ([harness, signsOnly, track, trackAt]) => {
	const THREE = await import('/node_modules/three/build/three.module.js');
	const world = window.__world;
	const scene = world.stage.scene;
	world.stage.render = () => {}; // geometry only: nothing needs drawing
	window.__journey.seek(0, 0, harness);
	window.__signsOnly = signsOnly;

	const SKIN = 0.018;
	const POINTS = 160;
	const GRID = 48;
	const samples = new Map();
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

	// Surface points in local space, pushed just under the skin along the normal.
	const pointsOf = (mesh) => {
		const g = mesh.geometry;
		const pos = g.attributes.position;
		const key = `${g.uuid}/${pos.version}`;
		let list = samples.get(key);
		if (list) return list;
		if (!g.attributes.normal) g.computeVertexNormals();
		const nor = g.attributes.normal;
		const index = g.index;
		const tris = (index ? index.count : pos.count) / 3;
		const at = (t, v) => (index ? index.getX(t * 3 + v) : t * 3 + v);
		const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
		const areas = new Float64Array(tris);
		let total = 0;
		for (let t = 0; t < tris; t++) {
			a.fromBufferAttribute(pos, at(t, 0));
			b.fromBufferAttribute(pos, at(t, 1));
			c.fromBufferAttribute(pos, at(t, 2));
			total += b.sub(a).cross(c.sub(a)).length();
			areas[t] = total;
		}
		list = [];
		let seed = 1;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		for (let i = 0; i < POINTS && total > 0; i++) {
			const r = rnd() * total;
			let lo = 0, hi = tris - 1;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (areas[mid] < r) lo = mid + 1;
				else hi = mid;
			}
			const u = Math.sqrt(rnd()), v = rnd();
			const ia = at(lo, 0), ib = at(lo, 1), ic = at(lo, 2);
			a.fromBufferAttribute(pos, ia);
			b.fromBufferAttribute(pos, ib);
			c.fromBufferAttribute(pos, ic);
			const p = a.clone().multiplyScalar(1 - u).add(b.clone().multiplyScalar(u * (1 - v))).add(c.clone().multiplyScalar(u * v));
			n.fromBufferAttribute(nor, ia);
			list.push(p.addScaledVector(n, -SKIN));
		}
		samples.set(key, list);
		return list;
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
	const rel = new THREE.Matrix4(), inv = new THREE.Matrix4(), full = new THREE.Matrix4(), one = new THREE.Vector3();
	const same = (a, b, eps = 1e-5) => {
		for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > eps) return false;
		return true;
	};
	const hits = new Map();

	window.__scan = (T) => {
		// TRACK=<id> scans a side trip instead: T is the trip's own time, over the story posed where the trip borrows it.
		if (track) {
			world.setTrack(track);
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
		const prev = window.__prev;
		// With SIGNS=1 every sign plate is tested where it stands, moving or not, against everything but its own parts.
		const signs = window.__signsOnly;
		const under = (o, root) => {
			for (let p = o; p; p = p.parent) if (p === root) return true;
			return false;
		};
		const movers = signs ? live.filter((e) => e.o.parent?.name === 'sign') : prev ? live.filter((e) => {
			const p = prev.get(e.key);
			return p && (!same(p.m, e.m) || p.v !== e.v);
		}) : [];
		for (const mover of movers) {
			const root = signs ? mover.o.parent.parent : null;
			for (const other of live) {
				if (other === mover || other.flat || !mover.box.intersectsBox(other.box)) continue;
				if (other.o === mover.o && mover.id < 0) continue;
				if (root && under(other.o, root)) continue;
				// Rigidly attached: the two moved together, so whatever is between them was built that way.
				const pm = prev?.get(mover.key), po = prev?.get(other.key);
				if (!signs && po && pm.v === mover.v) {
					full.fromArray(po.m);
					inv.copy(full).invert();
					const before = rel.fromArray(pm.m).premultiply(inv).elements.slice();
					inv.copy(other.world).invert();
					const after = rel.copy(mover.world).premultiply(inv).elements;
					if (same(before, after, 1e-4)) continue;
				}
				const list = pointsOf(mover.o);
				const grid = gridOf(other.o.geometry);
				const range = other.o.geometry.drawRange;
				grid.start = range.start;
				grid.end = range.start + range.count;
				let count = 0;
				let where = null;
				for (const p of list) {
					one.copy(p).applyMatrix4(mover.world);
					const wx = one.x, wy = one.y, wz = one.z;
					one.applyMatrix4(inv.copy(other.world).invert());
					if (inside(grid, one.x + 1e-5, one.y, one.z + 2e-5)) {
						count++;
						where = where ?? [+wx.toFixed(2), +wy.toFixed(2), +wz.toFixed(2)];
					}
				}
				if (!count) continue;
				const key = `${named(mover.o)}  THROUGH  ${named(other.o)}`;
				const h = hits.get(key) ?? { key, peak: 0, peakT: T, times: [], where };
				h.times.push(+T.toFixed(3));
				if (count > h.peak) {
					h.peak = count;
					h.peakT = +T.toFixed(3);
					h.where = where;
				}
				hits.set(key, h);
			}
		}
		const map = new Map();
		for (const e of live) map.set(e.key, e);
		window.__prev = map;
		return movers.length;
	};
	window.__report = () => [...hits.values()];
}, [harness, !!process.env.SIGNS, process.env.TRACK ?? null, +(process.env.TRACK_AT ?? 1.5)]);

const A = +from, B = +to, S = +step;
let maxMovers = 0;
const started = Date.now();
for (let T = A, n = 0; T <= B + 1e-9; T += S, n++) {
	const movers = await page.evaluate((t) => window.__scan(t), T);
	maxMovers = Math.max(maxMovers, movers);
	if (n % 200 === 0) console.error(`T ${T.toFixed(2)}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
const report = await page.evaluate(() => window.__report());
report.sort((a, b) => b.peak - a.peak);
const ranges = (times) => {
	const out = [];
	for (const t of times) {
		const r = out[out.length - 1];
		if (r && t - r[1] <= S * 1.5) r[1] = t;
		else out.push([t, t]);
	}
	return out.map((r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`)).join(', ');
};
console.log(`${report.length} pairs. Most movers at once: ${maxMovers}.`);
for (const h of report) console.log(`${String(h.peak).padStart(3)}/160 at T ${h.peakT}  [${ranges(h.times)}]  ${JSON.stringify(h.where)}\n      ${h.key}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 1));
await browser.close();
