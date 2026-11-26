// Arches that run into each other: node scripts/arches.mjs
// Every arch the world builds with span() is recorded (sky/aqueduct.ts SPANS). Each is a solid: a spandrel wall, its
// arch let through it, and the round piers at its ends going down into the haze. Points are scattered through every
// solid and tested against every other one; neighbours that share a pier meet there on purpose, so only what one arch
// puts into another away from their shared ends is reported.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
const found = await page.evaluate(async () => {
	const SPANS = globalThis.__spans;
	const PIER_FOOT = -16;
	const solids = SPANS.map((s, i) => {
		const [ax, ay, az] = s.a;
		const [ex, ey, ez] = s.e;
		const dx = ex - ax;
		const dz = ez - az;
		const L = Math.hypot(dx, dz);
		const ux = dx / L;
		const uz = dz / L;
		const slope = (ey - ay) / L;
		const pr = Math.min(0.75, L * 0.11);
		const r = L / 2 - pr;
		const D = r + 0.5;
		const mid = [(ax + ex) / 2, (ay + ey) / 2, (az + ez) / 2];
		const piers = s.piers === 'both' ? [s.a, s.e] : s.piers === 'pier' ? [s.a] : [];
		return { i, s, L, ux, uz, slope, pr, r, D, mid, piers };
	});
	const inside = (o, p) => {
		const qx = p[0] - o.mid[0];
		const qz = p[2] - o.mid[2];
		const x = qx * o.ux + qz * o.uz;
		const w = -qx * o.uz + qz * o.ux;
		if (Math.abs(x) <= o.L / 2 && Math.abs(w) <= o.s.thick / 2) {
			const y = p[1] - o.mid[1] - o.slope * x;
			if (y <= 0 && y >= -o.D) {
				const open = Math.abs(x) < o.r && y < -o.D + Math.sqrt(o.r * o.r - x * x);
				if (!open) return 'wall';
			}
		}
		for (const q of o.piers) if (Math.hypot(p[0] - q[0], p[2] - q[2]) <= o.pr && p[1] <= q[1] - o.D && p[1] >= PIER_FOOT) return 'pier';
		return null;
	};
	const samples = (o) => {
		const pts = [];
		for (let a = 0; a <= 16; a++)
			for (let b = 0; b <= 6; b++)
				for (const c of [-0.45, 0, 0.45]) {
					const x = -o.L / 2 + (o.L * a) / 16;
					const y = -(o.D * b) / 6;
					if (Math.abs(x) < o.r && y < -o.D + Math.sqrt(o.r * o.r - x * x)) continue;
					const w = c * o.s.thick;
					pts.push([o.mid[0] + x * o.ux - w * o.uz, o.mid[1] + o.slope * x + y, o.mid[2] + x * o.uz + w * o.ux]);
				}
		for (const q of o.piers) for (let k = 0; k <= 10; k++) for (let a = 0; a < 6; a++) {
			const t = (a / 6) * Math.PI * 2;
			pts.push([q[0] + Math.cos(t) * o.pr * 0.8, q[1] - o.D - ((q[1] - o.D - PIER_FOOT) * k) / 10, q[2] + Math.sin(t) * o.pr * 0.8]);
		}
		return pts;
	};
	const near = (p, q, d) => Math.hypot(p[0] - q[0], p[2] - q[2]) < d;
	const out = [];
	for (const A of solids)
		for (const B of solids) {
			if (A.i >= B.i) continue;
			const ends = [A.s.a, A.s.e, B.s.a, B.s.e];
			let hits = 0;
			let at = null;
			for (const p of [...samples(A).map((p) => [p, B]), ...samples(B).map((p) => [p, A])]) {
				const [pt, other] = p;
				if (ends.some((q) => near(pt, q, Math.max(A.pr, B.pr) + 0.6))) continue;
				const k = inside(other, pt);
				if (k) {
					hits++;
					at ??= pt.map((v) => +v.toFixed(2));
				}
			}
			if (hits) out.push({ a: A.i, b: B.i, hits, at, A: [A.s.a.map((v) => +v.toFixed(1)), A.s.e.map((v) => +v.toFixed(1))], B: [B.s.a.map((v) => +v.toFixed(1)), B.s.e.map((v) => +v.toFixed(1))] });
		}
	return { count: SPANS.length, out };
});
console.log(`${found.count} arches; ${found.out.length} pairs run into each other`);
for (const o of found.out.sort((p, q) => q.hits - p.hits)) console.log(`  #${o.a} ${JSON.stringify(o.A)}  ×  #${o.b} ${JSON.stringify(o.B)}  ${o.hits} points, at ${JSON.stringify(o.at)}`);
await browser.close();
