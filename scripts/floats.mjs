// Finds things that look placed but aren't attached: node scripts/floats.mjs <outDir> [T,T,...] [harness]
// Splits every mesh into its separate parts, joins parts whose boxes touch, and reports whatever isn't joined
// to the largest thing around it. Then takes a close-up of each, because a report alone can't tell a token in
// flight from a sign that's lost its post. Boxes are generous, so this misses small gaps on tilted parts.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [dir, list = '0.3,2.7,3.5,5.3,6.7,7.6,9.5,10.5,11.2,12.5,13.3,15.4,16.4,17.5,18.4,20.3,21.5,22.5,23.5,24.5,26.5,27.4,28.5,29.5,30.5,31.5,32.9', harness] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 460, height: 340 } });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
await page.evaluate((h) => {
	document.querySelector('.journey').style.visibility = 'hidden';
	document.querySelector('[data-dive]').style.visibility = 'hidden';
	if (h) window.__journey.seek(0, 0, h);
	// Separate pieces of one merged geometry, found once per geometry: triangles that share a corner are one piece.
	const cache = new Map();
	window.__partsOf = (geo) => {
		if (cache.has(geo.uuid)) return cache.get(geo.uuid);
		const pos = geo.attributes.position;
		const index = geo.index;
		const n = index ? index.count : pos.count;
		const parent = new Int32Array(n);
		for (let i = 0; i < n; i++) parent[i] = i;
		const find = (a) => {
			while (parent[a] !== a) {
				parent[a] = parent[parent[a]];
				a = parent[a];
			}
			return a;
		};
		const seen = new Map();
		for (let c = 0; c < n; c++) {
			const v = index ? index.getX(c) : c;
			const key = `${Math.round(pos.getX(v) * 2000)},${Math.round(pos.getY(v) * 2000)},${Math.round(pos.getZ(v) * 2000)}`;
			const other = seen.get(key);
			if (other === undefined) seen.set(key, c);
			else parent[find(c)] = find(other);
			if (c % 3 === 2) {
				parent[find(c)] = find(c - 1);
				parent[find(c - 1)] = find(c - 2);
			}
		}
		const boxes = new Map();
		for (let c = 0; c < n; c++) {
			const v = index ? index.getX(c) : c;
			const r = find(c);
			let b = boxes.get(r);
			if (!b) boxes.set(r, (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
			const x = pos.getX(v);
			const y = pos.getY(v);
			const z = pos.getZ(v);
			if (x < b[0]) b[0] = x;
			if (y < b[1]) b[1] = y;
			if (z < b[2]) b[2] = z;
			if (x > b[3]) b[3] = x;
			if (y > b[4]) b[4] = y;
			if (z > b[5]) b[5] = z;
		}
		const out = [...boxes.values()];
		cache.set(geo.uuid, out);
		return out;
	};
}, harness);

const seen = new Set();
const found = [];
for (const T of list.split(',').map(Number)) {
	const here = await page.evaluate((T) => {
		const w = window.__world;
		w.update(T, 3.1, 1, 0, 0, true);
		w.stage.scene.updateMatrixWorld(true);
		const V = w.root.position.constructor;
		const parts = [];
		const v = new V();
		const add = (name, hex, box, moved) => parts.push({ name, hex, box, moved });
		w.stage.scene.traverseVisible((o) => {
			if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
			const mat = Array.isArray(o.material) ? o.material[0] : o.material;
			if (mat.transparent && mat.opacity < 0.6) return;
			const type = o.geometry.type;
			if (type === 'PlaneGeometry' || type === 'CircleGeometry') return;
			const name = o.parent?.name || o.name || type;
			const hex = mat.color?.getHexString?.() ?? '';
			if (type === 'TubeGeometry' && o.geometry.parameters?.path) {
				// A tube's box would touch everything nearby, so it's a string of small boxes instead.
				const { path, radius } = o.geometry.parameters;
				if (radius < 0.03) return;
				const steps = Math.ceil(path.getLength() / (radius * 1.6));
				for (let i = 0; i <= steps; i++) {
					path.getPointAt(i / steps, v).applyMatrix4(o.matrixWorld);
					add(name, hex, [v.x - radius, v.y - radius, v.z - radius, v.x + radius, v.y + radius, v.z + radius]);
					parts[parts.length - 1].isTube = true;
				}
				return;
			}
			for (const b of window.__partsOf(o.geometry)) {
				const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
				for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
					v.set(x, y, z).applyMatrix4(o.matrixWorld);
					box[0] = Math.min(box[0], v.x);
					box[1] = Math.min(box[1], v.y);
					box[2] = Math.min(box[2], v.z);
					box[3] = Math.max(box[3], v.x);
					box[4] = Math.max(box[4], v.y);
					box[5] = Math.max(box[5], v.z);
				}
				add(name, hex, box);
			}
		});
		// Join whatever touches, using a grid so this doesn't compare everything with everything.
		const parent = parts.map((_, i) => i);
		const find = (a) => {
			while (parent[a] !== a) {
				parent[a] = parent[parent[a]];
				a = parent[a];
			}
			return a;
		};
		const gap = 0.03;
		const touches = (a, b) => a[0] - gap <= b[3] && b[0] - gap <= a[3] && a[1] - gap <= b[4] && b[1] - gap <= a[4] && a[2] - gap <= b[5] && b[2] - gap <= a[5];
		const cell = 2;
		const grid = new Map();
		parts.forEach((p, i) => {
			const [x0, y0, z0, x1, y1, z1] = p.box.map((n) => Math.floor(n / cell));
			if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4000) return void (p.huge = true);
			for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
				const key = `${x},${y},${z}`;
				const list = grid.get(key);
				if (list) list.push(i);
				else grid.set(key, [i]);
			}
		});
		for (const list of grid.values()) {
			for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
				if (touches(parts[list[a]].box, parts[list[b]].box)) parent[find(list[a])] = find(list[b]);
			}
		}
		const groups = new Map();
		parts.forEach((p, i) => {
			const r = find(i);
			const g = groups.get(r);
			if (g) g.push(p);
			else groups.set(r, [p]);
		});
		const size = (g) => {
			const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
			g.forEach((p) => p.box.forEach((n, i) => (b[i] = i < 3 ? Math.min(b[i], n) : Math.max(b[i], n))));
			return b;
		};
		const out = [];
		for (const g of groups.values()) {
			const b = size(g);
			const span = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
			// A big group is a machine on its island. A speck is too small to read as anything.
			if (span > 7 || span < 0.05) continue;
			// A cable is tested by scripts/cables.mjs, and its string of small boxes breaks up into noise here.
			if (g.every((p) => p.isTube)) continue;
			const names = [...new Set(g.map((p) => `${p.name}#${p.hex}`))].slice(0, 4).join(' ');
			out.push({ names, at: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], span, T, n: g.length });
		}
		return out;
	}, T);
	for (const f of here) {
		const key = `${f.names}|${f.at.map((v) => Math.round(v)).join(',')}`;
		if (seen.has(key)) continue;
		seen.add(key);
		found.push(f);
	}
}

if (process.env.LIST) {
	for (const f of found) console.log(`T ${f.T}  span ${f.span.toFixed(2)}  parts ${f.n}  [${f.at.map((v) => v.toFixed(2)).join(', ')}]  ${f.names}`);
	await browser.close();
	process.exit(0);
}

let n = 0;
for (const f of found) {
	const name = `${String(n++).padStart(3, '0')}.png`;
	await page.evaluate((f) => {
		const w = window.__world;
		const region = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
		const radius = Math.max(1, f.span * 1.3);
		const shot = { az: 28, el: 14, target: f.at, radius, ry: radius, wide: region, tall: region };
		w.rig.shots = [{ T: -1, ...shot }, { T: 100, ...shot }];
		w.update(f.T, 3.1, 1, 0, 0, true);
	}, f);
	await page.waitForTimeout(60);
	await page.evaluate((T) => window.__world.update(T, 3.1, 1, 0, 0, true), f.T);
	await page.waitForTimeout(30);
	await page.screenshot({ path: `${dir}/${name}` });
	console.log(`${name} T ${f.T}  span ${f.span.toFixed(2)}  parts ${f.n}  [${f.at.map((v) => v.toFixed(1)).join(', ')}]  ${f.names}`);
}
await browser.close();
