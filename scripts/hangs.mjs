// The remote MCP servers' cables, walked: node scripts/hangs.mjs [T]   MOVE='{"lilac":[x,y,z]}' tries a tower elsewhere.
// Each cable is hung as sky/remote.ts hangs it, from its tower's mooring ring to its post, and sampled every 10 cm;
// a point with an odd number of a mesh's faces above it and below it is inside that mesh. The overlap scan can't see
// these: a cable through a deck is a sliver of its length.
import { chromium } from 'playwright';
const T = +(process.argv[2] ?? 7.5);
const MOVE = JSON.parse(process.env.MOVE ?? '{}');
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
const out = await page.evaluate(async ([T, MOVE]) => {
	const THREE = await import('/node_modules/three/build/three.module.js');
	const P = await import('/src/lib/journey/sky/masterplan.ts');
	const world = window.__world; const scene = world.stage.scene; world.stage.render = () => {};
	window.__journey.seek(T, 0); scene.updateMatrixWorld(true);
	const named = (o) => { const p = []; for (let q = o; q && p.length < 3; q = q.parent) if (q.name) p.push(q.name); return p.join(' < ') || o.geometry.type; };
	const meshes = []; scene.traverseVisible((o) => { if (!o.isMesh || o.isInstancedMesh) return; const m = [o.material].flat()[0]; if (m.transparent && m.opacity < 0.6) return; if (named(o).startsWith('remote towers')) return; meshes.push(o); });
	for (const o of meshes) for (const m of [o.material].flat()) m.side = THREE.DoubleSide;
	const V = (p) => new THREE.Vector3(p.x, p.y, p.z);
	const ray = new THREE.Raycaster(); ray.far = 400;
	const res = [];
	P.REMOTE_CABLES.forEach(({ from, to }, ci) => {
		const at = MOVE[P.REMOTE[from].name] ? new THREE.Vector3(...MOVE[P.REMOTE[from].name]) : V(P.REMOTE[from].at);
		const toward = new THREE.Vector3(-at.x, 0, -at.z - 20).normalize();
		const a = at.clone().addScaledVector(toward, 2.35).setY(at.y - 0.25);
		const end = V(to).setY(to.y + 1.45);
		const sag = a.distanceTo(end) * 0.12;
		const n = Math.ceil(a.distanceTo(end) / 0.1);
		const near = new Map();
		for (let i = 3; i < n - 3; i++) {
			const u = i / n; const p = a.clone().lerp(end, u); p.y -= sag * 4 * u * (1 - u);
			ray.set(p, new THREE.Vector3(0, 1, 0)); const up = ray.intersectObjects(meshes, false);
			ray.set(p, new THREE.Vector3(0, -1, 0)); const down = ray.intersectObjects(meshes, false);
			const count = (hits) => { const c = new Map(); for (const h of hits) c.set(h.object, (c.get(h.object) ?? 0) + 1); return c; };
			const cu = count(up), cd = count(down);
			for (const [o, k] of cu) if (k % 2 === 1 && (cd.get(o) ?? 0) % 2 === 1) { const key = named(o); const e = near.get(key) ?? { n: 0, at: p.toArray().map((x) => +x.toFixed(2)) }; e.n++; near.set(key, e); }
		}
		for (const [k, e] of near) res.push(`cable ${ci} (${P.REMOTE[from].name}) inside ${k}: ${e.n} points from ${JSON.stringify(e.at)}`);
		res.push(`cable ${ci} (${P.REMOTE[from].name}) from ${a.toArray().map((x) => x.toFixed(1))} to ${end.toArray().map((x) => x.toFixed(1))}`);
	});
	return res.join('\n');
}, [T, MOVE]);
console.log(out);
await browser.close();
