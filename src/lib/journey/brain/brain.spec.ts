import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BEARING, between, KEEL_IN, NOTCHES, PART, under } from './chassis';
import { DIP, LOBE, WIDE } from './cerebellum';
import { clearance, shifted, soup, together, type Soup } from './clearance';
import { core } from './core';
import { BALLS, beneath, GYRI, MACHINES, PORT } from './design';
import { trace, type Machine } from './machines';
import { LIFT, MOST, rise } from './motion';
import { FISSURE, profile, shell } from './shell';
import { FIT, solve, type Cushions } from './solve';
import { KEEL_BOLT, seat, SLIDE, stem, STEM } from './stem';
import { build, EYE_TURN, type Finish } from './works';

/*
 * The brain is meant to be a machine whose parts fit and move without ever touching. These tests build it the way the
 * page does and measure: every gap between cushions, every plate through its whole rise against every neighbour and
 * every machine, the halves drawn apart, and each turning part against the space it turns in.
 */

const FINISHES: Finish[] = ['chrome', 'copper', 'dark', 'glass', 'amber', 'cyan'];
/** The furthest a plate is ever off its seat. */
const TOP = LIFT * MOST;

let solved: Cushions;
/** Each plate as a solid, and where its middle is. */
let plates: { solid: Soup; centre: THREE.Vector3; radius: number }[];
/** Each machine's fixed parts, and each coil's windings. */
let machines: { m: Machine; fixed: Soup; wound: Soup | null }[];
/** What rides under a half, what stands between the halves, and the two turning things there. */
let below: Soup;
let drum: Soup;
let drumAt: (dip: number) => Soup;
let mid: Soup;
let ring: Soup;
/** What stands between the halves and goes into neither core (the pins do), and a core itself. */
let fixed: Soup;
let shellOf: Soup;

const all = (parts: { take(f: Finish): THREE.BufferGeometry | null }) =>
	together(
		FINISHES.map((f) => parts.take(f))
			.filter((g): g is THREE.BufferGeometry => !!g)
			.map((g) => soup(g))
	);

beforeAll(() => {
	solved = solve(GYRI, BALLS);
	plates = solved.plates.map((plate) => {
		const p = solved.position.slice(plate.from * 3, plate.to * 3);
		const tri = solved.index.slice(plate.first, plate.last).map((i) => i - plate.from);
		const box = new THREE.Box3().setFromArray(p);
		const sphere = box.getBoundingSphere(new THREE.Sphere());
		return { solid: { p, tri }, centre: sphere.center, radius: sphere.radius };
	});
	machines = MACHINES.map((m) => {
		const built = build([m]);
		return { m, fixed: all(built.parts), wound: built.coils ? soup(built.coils) : null };
	});
	const u = under();
	below = all(u.parts);
	// The cerebellum, lobe and lid, dipped by a share of all it ever dips.
	const lobeAt = together([soup(u.drum.copper), soup(u.drum.dark), soup(u.drum.blue), soup(u.drum.cyan)]);
	drumAt = (k: number) => shifted(lobeAt, [0, -DIP * k, 0]);
	drum = drumAt(0);
	const b = between();
	fixed = all(b.parts);
	mid = together([fixed, all(b.pins)]);
	const c = core();
	shellOf = { p: c.position, tri: c.index };
	ring = together([soup(b.ring.take('chrome')!, new THREE.Matrix4().makeTranslation(PORT.x, 0, 0)), soup(b.ring.take('dark')!, new THREE.Matrix4().makeTranslation(PORT.x, 0, 0))]);
});

const raised = (k: number, share: number) => {
	const axis = solved.plates[k].axis;
	return share ? shifted(plates[k].solid, [axis[0] * TOP * share, axis[1] * TOP * share, axis[2] * TOP * share]) : plates[k].solid;
};
const near = (a: number, b: number, reach: number) => plates[a].centre.distanceTo(plates[b].centre) < plates[a].radius + plates[b].radius + reach;

describe('the brain as a machine', () => {
	it('rises by one law, bounded', () => {
		let most = 0;
		for (let t = 0; t < 2; t += 0.002) most = Math.max(most, rise(t));
		expect(most).toBeLessThanOrEqual(MOST);
		expect(most).toBeGreaterThan(1);
		expect(rise(0)).toBe(0);
		expect(rise(1.5)).toBeCloseTo(0, 6);
	});

	it('keeps a gap between every two cushions', () => {
		let least = Infinity;
		let where = '';
		for (let a = 0; a < plates.length; a++)
			for (let b = a + 1; b < plates.length; b++) {
				if (solved.plates[a].gyrus === solved.plates[b].gyrus || !near(a, b, 0.3)) continue;
				const { gap } = clearance(plates[a].solid, plates[b].solid, 0.3);
				if (gap < least) [least, where] = [gap, `${solved.plates[a].name} and ${solved.plates[b].name}`];
			}
		// On the side of the brain the gaps are the drawing's own, which are not all one width; nowhere do two cushions come
		// nearer than this.
		expect(least, `tightest between ${where}`).toBeGreaterThan(0.035);
	});

	it('lets every plate rise and settle without meeting a neighbour', () => {
		let seam = Infinity;
		let other = Infinity;
		let where = '';
		for (let a = 0; a < plates.length; a++)
			for (let b = a + 1; b < plates.length; b++) {
				if (!near(a, b, 0.25)) continue;
				const same = solved.plates[a].gyrus === solved.plates[b].gyrus;
				// Either still, either at the top of its rise, and both: the corners of everything a pass can bring about.
				for (const [ra, rb] of [
					[0, 0],
					[1, 0],
					[0, 1],
					[1, 1]
				]) {
					const { gap } = clearance(raised(a, ra), raised(b, rb), 0.25);
					if (same) seam = Math.min(seam, gap);
					else if (gap < other) [other, where] = [gap, `${solved.plates[a].name} and ${solved.plates[b].name}`];
				}
			}
		// Two plates of one cushion are a hairline apart and stay so; two cushions keep most of their gap.
		expect(seam).toBeGreaterThan(FIT.seam * 0.5);
		expect(other, `tightest between ${where}`).toBeGreaterThan(0.03);
	});

	it('keeps every plate clear of every machine, seated or risen', () => {
		const works = together([...machines.map((x) => x.fixed), ...machines.flatMap((x) => (x.wound ? [x.wound] : [])), below, drum]);
		let least = Infinity;
		let where = '';
		for (let k = 0; k < plates.length; k++)
			for (const share of [0, 1])
				for (const [name, thing] of [
					['the works', works],
					['what stands between the halves', mid]
				] as const) {
					const { gap, at } = clearance(raised(k, share), thing, 0.2);
					if (gap < least) [least, where] = [gap, `${solved.plates[k].name} and ${name} at ${at.map((x) => x.toFixed(2))}`];
				}
		expect(least, where).toBeGreaterThan(0.02);
	});

	it('seats every cushion in a gasket that nothing else touches', () => {
		// (Only the points its faces use: where a cushion has no seat, the seat has points and no faces.)
		const use = new Map<number, number>();
		for (const i of solved.seat.index) if (!use.has(i)) use.set(i, use.size);
		const points = new Float32Array(use.size * 3);
		for (const [i, k] of use) points.set(solved.seat.position.subarray(i * 3, i * 3 + 3), k * 3);
		const seat: Soup = { p: points, tri: solved.seat.index.map((i) => use.get(i)!) };
		// A plate stands a hair inside its own seat and a gap from any other, at rest and risen.
		let least = Infinity;
		let where = '';
		for (let k = 0; k < plates.length; k++)
			for (const share of [0, 1]) {
				const { gap, at } = clearance(raised(k, share), seat, 0.05);
				if (gap < least) [least, where] = [gap, `${solved.plates[k].name} at ${at.map((x) => x.toFixed(2))}`];
			}
		expect(least, where).toBeGreaterThan(0.006);
		const works = together([...machines.map((x) => x.fixed), ...machines.flatMap((x) => (x.wound ? [x.wound] : [])), below, drum, mid]);
		const { gap, at } = clearance(seat, works, 0.05);
		expect(gap, `a seat and the works at ${at.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.004);
	});

	it('stands every machine clear of every other, and of what holds the halves', () => {
		// Two machines may share one pivot, where the design says so: the arm along the arch ends on the first pin of the links.
		const joined = (a: Machine, b: Machine) => a.name === 'arch' && b.name === 'arch';
		const whole = machines.map((x) => (x.wound ? together([x.fixed, x.wound]) : x.fixed));
		for (let a = 0; a < machines.length; a++) {
			for (let b = a + 1; b < machines.length; b++) {
				if (joined(machines[a].m, machines[b].m)) continue;
				const { gap, at } = clearance(whole[a], whole[b], 0.1);
				expect(gap, `${machines[a].m.kind} ${machines[a].m.name} and ${machines[b].m.kind} ${machines[b].m.name} at ${at.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.01);
			}
			for (const [name, thing] of [
				['what rides under the half', below],
				['the drum', drum],
				['what stands between the halves', mid]
			] as const) {
				const { gap, at } = clearance(whole[a], thing, 0.1);
				expect(gap, `${machines[a].m.kind} ${machines[a].m.name} and ${name} at ${at.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.01);
			}
		}
	});

	it('stands the intake and everything else between the halves clear of the cores', () => {
		// The intake is wider than the fissure: each core has a notch for it. Closed, and drawn apart.
		for (const open of [0, 1]) {
			for (const [name, thing] of [
				['what stands between the halves', fixed],
				['the ring', ring]
			] as const) {
				const { gap, at } = clearance(shifted(shellOf, [0, 0, PART * open]), thing, 0.2);
				expect(gap, `a core and ${name}, open ${open}, at ${at.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.012);
			}
		}
	});

	it('keeps the two halves apart, and lets them draw apart on the keel', () => {
		// Nothing of a half crosses the fissure's middle, even at the top of a rise: so it cannot meet its mirror image.
		let inmost = Infinity;
		for (let k = 0; k < plates.length; k++) {
			const p = raised(k, 1).p;
			for (let i = 2; i < p.length; i += 3) inmost = Math.min(inmost, p[i]);
		}
		const half = together([...machines.map((x) => x.fixed), ...machines.flatMap((x) => (x.wound ? [x.wound] : [])), below, drum]);
		for (let i = 2; i < half.p.length; i += 3) inmost = Math.min(inmost, half.p[i]);
		expect(inmost).toBeGreaterThan(0.02);
		// What rides with a half against what stays between them, closed and wide open. The pins and the axle are a sliding fit.
		for (const open of [0, 0.5, 1]) {
			const { gap, at } = clearance(shifted(half, [0, 0, PART * open]), mid, 0.2);
			expect(gap, `open ${open} at ${at.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.008);
		}
	});

	it('turns each eye, coil, drum and ring inside a space that is its own', () => {
		const rest = (but: Machine) => together([...machines.filter((x) => x.m !== but).map((x) => x.fixed), ...machines.filter((x) => x.m !== but).flatMap((x) => (x.wound ? [x.wound] : [])), ...plates.map((p) => p.solid), below]);
		for (const x of machines) {
			if (x.m.kind === 'eye') {
				// An eye's ball is a sphere about a fixed middle, and its housing's bore a larger one: whatever way it turns, the gap is the same.
				const eye = build([x.m]).eyes[0];
				const centre = new THREE.Vector3().setFromMatrixPosition(eye.frame);
				let outer = 0;
				for (const g of Object.values(eye.ball)) {
					const p = g!.getAttribute('position');
					for (let i = 0; i < p.count; i++) outer = Math.max(outer, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
				}
				expect(outer).toBeLessThanOrEqual(eye.radius + 0.004);
				const others = together([x.fixed, rest(x.m)]);
				let inner = Infinity;
				for (let i = 0; i < others.p.length; i += 3) inner = Math.min(inner, Math.hypot(others.p[i] - centre.x, others.p[i + 1] - centre.y, others.p[i + 2] - centre.z));
				expect(inner, `eye ${x.m.name}`).toBeGreaterThan(eye.radius + 0.008);
				expect(EYE_TURN).toBeLessThan(0.3);
			}
			if (x.m.kind === 'coil' && x.wound) {
				// A coil's windings turn about its own axis, so they stay inside the tube they already fill: nothing else may be in it.
				const up = x.m.r + 0.035;
				const axis = trace(x.m.path, 0.04).map((st) => new THREE.Vector3(st.p[0] + st.n[0] * up, st.p[1] + st.n[1] * up, st.p[2] + st.n[2] * up));
				const others = rest(x.m);
				const line = new THREE.Line3();
				const on = new THREE.Vector3();
				const q = new THREE.Vector3();
				let inner = Infinity;
				for (let i = 0; i < others.p.length; i += 3) {
					q.set(others.p[i], others.p[i + 1], others.p[i + 2]);
					if (q.distanceTo(axis[0]) > 3) continue;
					for (let k = 3; k < axis.length - 4; k++) {
						line.set(axis[k], axis[k + 1]).closestPointToPoint(q, true, on);
						inner = Math.min(inner, on.distanceTo(q));
					}
				}
				expect(inner, `coil ${x.m.name}`).toBeGreaterThan(x.m.r + 0.01);
			}
		}
		// The intake's ring is turned about an upright axis, and the cerebellum's egg about its own: each is measured against
		// what is round it at every stage of a turn that brings it back to where it began.
		const turned = (thing: Soup, cx: number, cz: number, angle: number) => {
			const p = new Float32Array(thing.p.length);
			const c = Math.cos(angle);
			const s = Math.sin(angle);
			for (let i = 0; i < p.length; i += 3) {
				const x = thing.p[i] - cx;
				const z = thing.p[i + 2] - cz;
				p[i] = cx + x * c + z * s;
				p[i + 1] = thing.p[i + 1];
				p[i + 2] = cz - x * s + z * c;
			}
			return { p, tri: thing.tri };
		};
		const cushions = together(plates.map((p) => p.solid));
		const round = together([below, mid, cushions, ...machines.map((x) => x.fixed)]);
		// The lobe dips straight down and comes back; the ring has a mark at each notch.
		for (const k of [0, 0.5, 1]) expect(clearance(drumAt(k), round, 0.1).gap, 'the cerebellum').toBeGreaterThan(0.012);
		for (let k = 0; k < 8; k++) expect(clearance(turned(ring, PORT.x, 0, (k / 8) * ((Math.PI * 2) / NOTCHES)), together([mid, cushions]), 0.1).gap, 'ring').toBeGreaterThan(0.004);
	});

	it('seats every part of the brainstem in another, from the stand up to the keel and out to the axle', () => {
		const named = new Map<string, Soup[]>([['seat', [soup(seat())]]]);
		for (const piece of stem()) named.set(piece.name, [...(named.get(piece.name) ?? []), soup(piece.geo)]);
		const of = (name: string) => together(named.get(name)!);
		// Two parts that are fitted together have surfaces that meet or pass through each other: nothing between them.
		const fitted = (a: string, b: string, within = 0.04) => expect(clearance(of(a), of(b), 0.4).gap, `${a} and ${b}`).toBeLessThan(within);
		// The plug's foot stands in the seat's bore, with a little room all round, and goes down past the seat's top.
		fitted('plug', 'seat', 0.08);
		expect(Math.min(...Array.from(of('plug').p).filter((_, i) => i % 3 === 1))).toBeLessThan(STEM.seat - 0.1);
		// The neck stands in the plug's top; its cheeks hold the spine, the bolt through the keel, and the hubs of the pin and the axle.
		for (const [a, b] of [['cheek', 'plug rim'], ['spine', 'cheek'], ['keel bolt', 'cheek'], ['hub', 'cheek'], ['pin', 'hub'], ['axle', 'hub']]) fitted(a, b);
		// That bolt goes through the keel's plate, well inside its edge.
		const edge = Array.from({ length: 720 }, (_, i) => profile((i / 720) * Math.PI * 2, KEEL_IN));
		let inside = false;
		let near = Infinity;
		edge.forEach((a, i) => {
			const b = edge[(i + 1) % edge.length];
			if (a[1] > KEEL_BOLT[1] !== b[1] > KEEL_BOLT[1] && KEEL_BOLT[0] < ((b[0] - a[0]) * (KEEL_BOLT[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
			near = Math.min(near, Math.hypot(a[0] - KEEL_BOLT[0], a[1] - KEEL_BOLT[1]));
		});
		expect(inside).toBe(true);
		expect(near).toBeGreaterThan(0.12);
		// Each tine runs from its knuckle on the pin to its eye on the axle; the pin and the axle are capped.
		for (const [a, b] of [['knuckle', 'pin'], ['tine', 'knuckle'], ['tine', 'eye'], ['eye', 'axle'], ['pin end', 'pin'], ['axle end', 'axle']]) fitted(a, b);
		// The lights are let into what they light, and the plug's plates are riveted onto its drum.
		for (const [a, b] of [['tine light', 'tine'], ['back light', 'spine'], ['front light', 'spine'], ['side light', 'spine'], ['plug light', 'plug'], ['plug drum', 'plug'], ['plug plate', 'plug drum'], ['plug rivet', 'plug plate'], ['plug rim', 'plug plate']]) fitted(a, b);
		// And each half's bearing has its stretch of the axle to slide on, between the neck's hub and the tine's eye.
		expect(BEARING - 0.11).toBeGreaterThan(SLIDE.from + 0.05);
		expect(BEARING + 0.11 + PART).toBeLessThan(SLIDE.to - 0.05);
	});

	it('closes the back: the cerebellum\'s lid sits on its lobe all round and goes up into the body of the brain', () => {
		const u = under();
		const blue = u.drum.blue.getAttribute('position').array as Float32Array;
		const copper = u.drum.copper.getAttribute('position').array as Float32Array;
		// Round the lobe's own axis: which way a point is from it, and how far (the lobe is an oval, WIDE for its length).
		// (The directions are counted from a little off the back, so that no row of the lid's points lies on the line
		// between two of them.)
		const sectors = 47;
		const where = (p: ArrayLike<number>, i: number) => {
			const x = p[i] - LOBE.x;
			const z = (p[i + 2] - LOBE.z) / WIDE;
			return { sector: Math.floor(((Math.atan2(z, -x) / (Math.PI * 2) + 1.0019) % 1) * sectors) % sectors, far: Math.hypot(x, z), y: p[i + 1], flat: p[i + 2] < FISSURE + 0.02 };
		};
		// The lid's lower edge in each direction, and how near the axis its underside comes in there.
		const edge = Array.from({ length: sectors }, () => ({ y: Infinity, in: Infinity, flat: false }));
		let top = -Infinity;
		for (let i = 0; i < blue.length; i += 3) {
			const q = where(blue, i);
			top = Math.max(top, q.y);
			const e = edge[q.sector];
			if (q.flat) e.flat = true;
			if (q.y < e.y - 1e-4) [e.y, e.in] = [q.y, q.far];
			else if (q.y < e.y + 1e-4) e.in = Math.min(e.in, q.far);
		}
		// It sits on the lobe: where its underside ends, in under its edge, there is copper further out than that. (The
		// copper's skin at the edge's height is between its nearest ring of points above and its nearest below.)
		const rings = edge.map(() => ({ above: [Infinity, 0], below: [-Infinity, 0] }));
		for (let i = 0; i < copper.length; i += 3) {
			const q = where(copper, i);
			const r = rings[q.sector];
			const e = edge[q.sector].y;
			if (q.y >= e && (q.y < r.above[0] - 1e-4 || (q.y < r.above[0] + 1e-4 && q.far > r.above[1]))) r.above = [q.y, q.far];
			if (q.y < e && (q.y > r.below[0] + 1e-4 || (q.y > r.below[0] - 1e-4 && q.far > r.below[1]))) r.below = [q.y, q.far];
		}
		const copperOut = rings.map((r, k) => r.below[1] + ((r.above[1] - r.below[1]) * (edge[k].y - r.below[0])) / (r.above[0] - r.below[0]));
		// (Not asked of the part cut off flat at the fissure, which is not round.)
		edge.forEach((e, k) => !e.flat && expect(copperOut[k] - e.in, `the lid's edge on the lobe, direction ${k} of ${sectors}`).toBeGreaterThan(0.005));
		// And it goes up into the brain: all over its top it is above the core's own underside, by more than it ever dips, and
		// its lower edge is below it, so that what closes the back is the lid itself and the brain round it.
		const p: [number, number, number] = [0, 0, 0];
		const n: [number, number, number] = [0, 0, 0];
		let covered = 0;
		for (let i = 0; i < blue.length; i += 3) {
			if (blue[i + 1] < top - 1e-4 || blue[i + 2] < FISSURE + 0.02) continue;
			const at = beneath(blue[i], blue[i + 2]);
			if (!at) continue;
			shell(at[0], at[1], p, n);
			covered++;
			expect(top - DIP - p[1], `the lid's top inside the brain at ${blue[i].toFixed(2)}, ${blue[i + 2].toFixed(2)}`).toBeGreaterThan(0.05);
		}
		expect(covered).toBeGreaterThan(100);
	});
});
