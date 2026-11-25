import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, frameAt, rbox, sweep } from '../kit/geometry';
import { hazed, palette } from './palette';
import * as P from './masterplan';

/*
 * The aqueduct: the internet, built. One row of round porcelain arches climbs from the back of your desk to the
 * provider's platform in a gentle S, carrying the token's two lanes on its deck: on the left the request rides away
 * from you, on the right the reply rides home, each lane a dark belt between riveted brass kerbs, a raised porcelain
 * divider between them. Under every arch hangs a warm lamp; each pier has a gold band where its arch springs, and goes on
 * down into the haze, never resting on anything.
 *
 * The internet is a chain of hops, and the hops are the relay masts that stand beside the deck on piers of their own:
 * slender white pylons with red bands near the top, gold collars, a head of three small dishes and a whip with a beacon,
 * a brass railing round the pier's top. From each a slim brass beam reaches out over both lanes with a small reader over
 * each, its lamp looking down, which flares as a capsule passes under it: read, and sent on.
 *
 * The provider's platform stands on the aqueduct's tallest arches. Drawn from concepts/aqueduct/span (stretch, mast,
 * start, arches).
 */

type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The aqueduct's middle line, as a curve. */
export const AQUEDUCT_CURVE = new THREE.CatmullRomCurve3(
	P.AQUEDUCT.map((p) => v(...p)),
	false,
	'centripetal'
);
/** Half the deck's width, and how deep the deck slab is under its top. */
const HALF = 1.75;
const SLAB = 0.55;
/** The lanes' belts: their half width and the height of their tops over the deck. The kerbs stand at their edges. */
const BELT = { half: 0.55, top: 0.4 };
/** How far along the aqueduct (0 to 1) its first pier stands, clear of the desk, and how many arches it has. */
const FIRST = 0.2;
const ARCHES = 5;
/** The masts: how far along each stands, which side, how far out from the middle line, and how tall. */
// Three, and none in the last stretch before the door, so the door is seen clear along the deck.
export const MASTS = [
	{ u: 0.3, side: -1, out: 3.4, h: 6.2 },
	{ u: 0.53, side: 1, out: 3.4, h: 6.6 },
	{ u: 0.76, side: -1, out: 3.4, h: 6.4 }
] as const;

/**
 * The face that closes a swept part's end: its profile laid across the curve at u, facing back along it (at the start)
 * or on along it (at the end), so the part reads as solid, not a hollow section cut off.
 */
function cap(curve: THREE.Curve<THREE.Vector3>, profile: [number, number][], u: number) {
	const { p, t, side, up } = frameAt(curve, u);
	const tris = THREE.ShapeUtils.triangulateShape(profile.map(([a, b]) => new THREE.Vector2(a, b)), []);
	const pos = profile.flatMap(([a, b]) => [p.x + side.x * a + up.x * b, p.y + side.y * a + up.y * b, p.z + side.z * a + up.z * b]);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	// Facing out of the part: back along the curve at its start, on along it at its end.
	const out = t.clone().multiplyScalar(u < 0.5 ? -1 : 1);
	const [a, b, c] = tris[0].map((i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
	const flip = b.clone().sub(a).cross(c.clone().sub(a)).dot(out) < 0;
	g.setIndex(tris.flatMap(([i, j, k]) => (flip ? [i, k, j] : [i, j, k])));
	g.computeVertexNormals();
	return g;
}

/** A frame on the aqueduct's middle line, level across: where, which way it runs, which way is right. */
function along(u: number) {
	const p = AQUEDUCT_CURVE.getPointAt(u);
	const t = AQUEDUCT_CURVE.getTangentAt(u);
	const right = v(-t.z, 0, t.x).normalize();
	return { p, t, right };
}

export class Aqueduct {
	group = new THREE.Group();
	/** Each reader's lamp, and the point on the deck under it. */
	private readers: { lamp: THREE.MeshStandardMaterial; at: THREE.Vector3 }[] = [];

	constructor() {
		this.group.name = 'aqueduct';
		const c = palette();
		const pier = hazed(c.porcelain);
		const b = new Batch();
		this.deck(b);
		// Each arch brings the pier at its own start; the last one's far end is the platform's.
		for (let i = 0; i < ARCHES; i++) {
			const a = along(FIRST + ((1 - FIRST) * i) / ARCHES).p;
			const e = along(FIRST + ((1 - FIRST) * (i + 1)) / ARCHES).p;
			span(b, a.clone().setY(a.y - SLAB - 0.3), e.clone().setY(e.y - SLAB - 0.3), HALF * 1.5, pier, 'pier');
		}
		this.masts(b, pier);
		this.platform(b, pier);
		this.group.add(b.build('aqueduct'));
	}

	/**
	 * The deck: its slab and cornice, the lanes' belts and kerbs, the divider between them, rounded rails at its edges.
	 * Where it begins, behind the harness's roof, every part of it is closed off, each belt turns over a brass roller,
	 * and a brass plate is bolted across the slab's end.
	 */
	private deck(b: Batch) {
		const c = palette();
		const segs = 160;
		const curve = AQUEDUCT_CURVE;
		const swept = (profile: [number, number][], mat: THREE.Material, closed = true) => {
			b.add(sweep(curve, profile, segs, closed), mat);
			b.add(cap(curve, profile, 0), mat);
		};
		swept([[-HALF, 0], [HALF, 0], [HALF, -SLAB], [-HALF, -SLAB]], c.porcelain);
		swept([[-HALF - 0.16, -SLAB], [HALF + 0.16, -SLAB], [HALF + 0.16, -SLAB - 0.18], [HALF, -SLAB - 0.32], [-HALF, -SLAB - 0.32], [-HALF - 0.16, -SLAB - 0.18]], c.porcelainShade);
		// A gold line along each face of the slab, under the rail.
		for (const s of [-1, 1]) swept([[s * (HALF + 0.005), -0.12], [s * (HALF + 0.04), -0.12], [s * (HALF + 0.04), -0.2], [s * (HALF + 0.005), -0.2]], c.gold);
		// The rounded rail along each edge.
		for (const s of [-1, 1]) {
			const rail: [number, number][] = [];
			for (let i = 0; i <= 10; i++) {
				const a = (i / 10) * Math.PI;
				rail.push([s * (HALF - 0.22) + Math.cos(a) * 0.2 * s, 0.02 + Math.sin(a) * 0.3]);
			}
			swept(rail, c.porcelain);
		}
		// The two lanes: a dark belt on a raised bed, a riveted brass kerb at each edge.
		for (const s of [-1, 1]) {
			const x = s * P.LANE;
			swept([[x - BELT.half, BELT.top], [x + BELT.half, BELT.top], [x + BELT.half, 0], [x - BELT.half, 0]], c.iron);
			for (const k of [-1, 1]) {
				const kx = x + k * (BELT.half + 0.05);
				swept([[kx - 0.06, BELT.top + 0.12], [kx + 0.06, BELT.top + 0.12], [kx + 0.06, 0], [kx - 0.06, 0]], c.brass);
			}
		}
		// The divider between the lanes, porcelain with a brass cap.
		swept([[-0.08, 0.5], [0.08, 0.5], [0.08, 0], [-0.08, 0]], c.porcelain);
		swept([[-0.05, 0.54], [0.05, 0.54], [0.05, 0.5], [-0.05, 0.5]], c.brass);
		// Where the deck begins: each belt rounds a brass roller between its kerbs, with a hub at each end, and a brass
		// plate is bolted across the slab's end under them.
		const start = frameAt(curve, 0);
		const toSide = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.side);
		const at = (a: number, h: number, back = 0) => start.p.clone().addScaledVector(start.side, a).addScaledVector(start.up, h).addScaledVector(start.t, -back);
		for (const s of [-1, 1]) {
			const x = s * P.LANE;
			const roller = new THREE.CylinderGeometry(BELT.top / 2, BELT.top / 2, BELT.half * 2, 24).applyQuaternion(toSide);
			b.add(roller.translate(...at(x, BELT.top / 2).toArray()), c.iron);
			for (const k of [-1, 1]) {
				const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 20).applyQuaternion(toSide);
				b.add(hub.translate(...at(x + k * (BELT.half + 0.115), BELT.top / 2).toArray()), c.gold);
			}
		}
		const plate = rbox(HALF * 2 - 0.3, SLAB - 0.16, 0.05, 0.02, 2);
		plate.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(start.side, start.up, start.t)));
		b.add(plate.translate(...at(0, -SLAB / 2, 0.02).toArray()), c.brass);
		for (const s of [-1, 1])
			for (const h of [-0.15, -SLAB + 0.15]) b.add(new THREE.SphereGeometry(0.04, 10, 6).translate(...at(s * (HALF - 0.32), h, 0.05).toArray()), c.gold);
		// Rivets along the kerbs.
		const rivet = new THREE.SphereGeometry(0.035, 8, 6);
		const len = curve.getLength();
		for (let d = 0.3; d < len - 0.3; d += 0.6) {
			const { p, right } = along(d / len);
			for (const s of [-1, 1])
				for (const k of [-1, 1]) {
					const at = p.clone().addScaledVector(right, s * P.LANE + k * (BELT.half + 0.05));
					b.add(rivet, c.gold, { p: [at.x, at.y + BELT.top + 0.12, at.z] });
				}
		}
	}

	/** The relay masts, each on its own pier beside the deck, its arm out over the lanes and its reader under the arm's end. */
	private masts(b: Batch, pier: THREE.Material) {
		const c = palette();
		for (const m of MASTS) {
			const { p, right } = along(m.u);
			const base = p.clone().addScaledVector(right, m.side * m.out);
			const top = p.y - 0.25;
			const h = top - P.PIER_FOOT;
			// The pier, its drum, the brass railing round its top.
			b.add(new THREE.CylinderGeometry(0.62, 0.62, h, 32), pier, { p: [base.x, P.PIER_FOOT + h / 2, base.z] });
			b.add(new THREE.CylinderGeometry(1.15, 0.8, 0.6, 40), c.porcelain, { p: [base.x, top - 0.3, base.z] });
			b.add(new THREE.TorusGeometry(1.15, 0.07, 10, 48), c.gold, { p: [base.x, top - 0.02, base.z], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.TorusGeometry(1.05, 0.04, 8, 48), c.brass, { p: [base.x, top + 0.55, base.z], r: [Math.PI / 2, 0, 0] });
			for (let i = 0; i < 10; i++) {
				const a = (i / 10) * Math.PI * 2;
				b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), c.brass, { p: [base.x + 1.05 * Math.cos(a), top + 0.28, base.z + 1.05 * Math.sin(a)] });
			}
			// The mast: a slender white pylon, tapering, a gold collar at its foot and at each third, red bands near its top
			// where a pilot would look for them.
			const r0 = 0.2;
			const r1 = 0.1;
			const rAt = (k: number) => r0 + (r1 - r0) * k;
			b.add(new THREE.CylinderGeometry(r1, r0, m.h, 24), c.mastWhite, { p: [base.x, top + m.h / 2, base.z] });
			for (const k of [0.62, 0.8]) b.add(new THREE.CylinderGeometry(rAt(k + 0.07) + 0.012, rAt(k) + 0.012, m.h * 0.07, 24), c.mastRed, { p: [base.x, top + m.h * (k + 0.035), base.z] });
			for (const k of [0.02, 1 / 3, 2 / 3]) b.add(new THREE.TorusGeometry(rAt(k) + 0.02, 0.035, 8, 28), c.gold, { p: [base.x, top + m.h * k, base.z], r: [Math.PI / 2, 0, 0] });
			const crown = top + m.h;
			// Its head: a brass ring with three small dishes looking three ways, a whip, and the beacon on top.
			b.add(new THREE.TorusGeometry(0.34, 0.03, 8, 32), c.brass, { p: [base.x, crown - 0.55, base.z], r: [Math.PI / 2, 0, 0] });
			for (let i = 0; i < 3; i++) {
				const a = (i / 3) * Math.PI * 2 + m.u * 7;
				const dx = Math.sin(a);
				const dz = Math.cos(a);
				b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), c.brass, { p: [base.x + dx * 0.17, crown - 0.55, base.z + dz * 0.17], r: [Math.PI / 2, a, 0] });
				const dish = new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, 0.85);
				b.add(dish, c.mastWhite, { p: [base.x + dx * 0.4, crown - 0.55, base.z + dz * 0.4], r: [Math.PI / 2, a, 0] });
			}
			b.add(new THREE.CylinderGeometry(0.13, r1 + 0.01, 0.16, 20), c.brass, { p: [base.x, crown + 0.08, base.z] });
			b.add(new THREE.SphereGeometry(0.13, 18, 12), c.beacon, { p: [base.x, crown + 0.27, base.z] });
			b.add(new THREE.CylinderGeometry(0.012, 0.02, 0.9, 6), c.brass, { p: [base.x, crown + 0.85, base.z] });
			// The arm: a slim brass beam from the mast out over both lanes, on a collar and a stay; under it, over each
			// lane, a small reader with its lamp looking down, which flares as something passes under it.
			const armY = p.y + 2.6;
			const from = base.clone().setY(armY);
			const far = p.clone().addScaledVector(right, -m.side * (P.LANE + 0.75)).setY(armY);
			b.add(new THREE.TubeGeometry(new THREE.LineCurve3(from, far), 4, 0.055, 10), c.brass);
			b.add(new THREE.SphereGeometry(0.075, 12, 8), c.gold, { p: far.toArray() as V3 });
			b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 16), c.gold, { p: [from.x, armY, from.z] });
			const stay = new THREE.LineCurve3(base.clone().setY(armY + 1.3), from.clone().lerp(far, 0.45).setY(armY + 0.03));
			b.add(new THREE.TubeGeometry(stay, 4, 0.025, 8), c.brass);
			const lamp = new THREE.MeshStandardMaterial({ color: '#fff1cf', emissive: '#ffc94d', emissiveIntensity: 0.8 });
			const yaw = Math.atan2(right.x, right.z);
			for (const s of [-1, 1]) {
				const over = p.clone().addScaledVector(right, s * P.LANE).setY(armY);
				b.add(rbox(0.42, 0.18, 0.3, 0.05, 2), c.brass, { p: [over.x, armY - 0.14, over.z], r: [0, yaw, 0] });
				b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), lamp, { p: [over.x, armY - 0.245, over.z] });
			}
			this.readers.push({ lamp, at: p.clone() });
		}
	}

	/** The provider's platform on the aqueduct's tallest arches: arcades along both its sides and across its front. */
	private platform(b: Batch, pier: THREE.Material) {
		const Y = P.PLATFORM_Y - 1.55;
		const z0 = P.DOOR_Z - 1.6;
		const z1 = P.PLATFORM_BACK;
		for (const s of [-1, 1]) {
			for (let i = 0; i < 3; i++) {
				const a = v(s * 7.6, Y, z0 + ((z1 - z0) * i) / 3);
				const e = v(s * 7.6, Y, z0 + ((z1 - z0) * (i + 1)) / 3);
				span(b, a, e, 2.4, pier, i === 2 ? 'both' : 'pier');
			}
		}
		// Across the front, between the two sides' first piers.
		span(b, v(-7.6, Y, z0), v(7.6, Y, z0), 2.4, pier, 'none');
	}

	/** The readers flare as a capsule passes under them. cargo: where each piece on the lanes is now. */
	update(time: number, cargo: THREE.Vector3[] = []) {
		for (const r of this.readers) {
			let near = Infinity;
			for (const p of cargo) {
				const d = Math.hypot(p.x - r.at.x, p.z - r.at.z);
				if (d < near) near = d;
			}
			r.lamp.emissiveIntensity = 0.7 + 3 * Math.exp(-near * near * 2.5) + 0.1 * Math.sin(time * 2);
		}
	}
}

/**
 * One arch between two points on the underside of a deck: a spandrel with a round arch through it and a cornice-like
 * edge, sheared to follow the deck's slope; round piers at its ends (as asked) that go down into the haze, with a gold
 * band where the arch springs; and a lamp hanging under its crown.
 */
export function span(b: Batch, a: THREE.Vector3, e: THREE.Vector3, thick: number, pier: THREE.Material, piers: 'both' | 'pier' | 'none') {
	const c = palette();
	const flat = v(e.x - a.x, 0, e.z - a.z);
	const L = flat.length();
	const slope = (e.y - a.y) / L;
	const pr = Math.min(0.75, L * 0.11);
	const r = L / 2 - pr;
	const D = r + 0.5;
	const s = new THREE.Shape();
	s.moveTo(-L / 2, 0);
	s.lineTo(L / 2, 0);
	s.lineTo(L / 2, -D);
	s.lineTo(r, -D);
	s.absarc(0, -D, r, 0, Math.PI, false);
	s.lineTo(-L / 2, -D);
	s.closePath();
	const g = extrude(s, thick, 0.08, 2, 24);
	g.applyMatrix4(new THREE.Matrix4().makeShear(slope, 0, 0, 0, 0, 0));
	const yaw = Math.atan2(-flat.z, flat.x);
	const mid = a.clone().add(e).multiplyScalar(0.5);
	b.add(g, pier, { p: [mid.x, mid.y, mid.z], r: [0, yaw, 0] });
	// The archivolt: a gold band round the arch's face on both sides.
	const ring = new THREE.TorusGeometry(r + 0.02, 0.05, 8, 40, Math.PI);
	ring.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -D, 0));
	for (const side of [-1, 1]) {
		const g2 = ring.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, side * (thick / 2 + 0.02)));
		g2.applyMatrix4(new THREE.Matrix4().makeShear(slope, 0, 0, 0, 0, 0));
		b.add(g2, c.gold, { p: [mid.x, mid.y, mid.z], r: [0, yaw, 0] });
	}
	// The lamp under the crown: a little gold dome and its glow.
	const crown = mid.y - D + r - 0.05;
	b.add(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.gold, { p: [mid.x, crown - 0.22, mid.z] });
	b.add(new THREE.SphereGeometry(0.15, 16, 10), c.amberWindow, { p: [mid.x, crown - 0.26, mid.z] });
	b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), c.gold, { p: [mid.x, crown - 0.1, mid.z] });
	const ends: THREE.Vector3[] = piers === 'both' ? [a, e] : piers === 'pier' ? [a] : [];
	for (const p of ends) {
		const top = p.y - D;
		const h = top - P.PIER_FOOT;
		const at: V3 = [p.x, P.PIER_FOOT + h / 2, p.z];
		b.add(new THREE.CylinderGeometry(pr, pr * 1.04, h, 32), pier, { p: at });
		b.add(new THREE.CylinderGeometry(pr + 0.08, pr + 0.08, 0.18, 32), c.gold, { p: [p.x, top + 0.02, p.z] });
		b.add(new THREE.CylinderGeometry(pr + 0.16, pr + 0.04, 0.3, 32), c.porcelain, { p: [p.x, top + 0.24, p.z] });
	}
}
