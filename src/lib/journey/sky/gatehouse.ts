import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox } from '../kit/geometry';
import { color, Lamp } from '../kit/materials';
import { Label } from '../kit/print';
import { inOut, outBack, seg } from '../kit/math';
import { palette } from './palette';
import { fitted, orosi, rect, stainedGlass } from './persian';
import { brickWork, facetedShaft, glint, mirrorWork, painted, panelOf, tiledUV } from './crafts';
import * as P from './masterplan';

/*
 * The provider's front door: a gatehouse of deep jade enamel and polished brass, solid and secure, like the door of a
 * bank, built as the gate of a Persian palace. Across its front a talar, a deep porch under a flat roof, open to the
 * lanes: two slim columns clad in mirror work hold its front beam, and its ceiling is coffered in walnut, every coffer
 * a panel of mirror work, so the porch glitters as you come up to it. Between the columns, on a brass rail, hang five
 * brass tumblers, the five checks every request passes on its way in: its seal is broken (decrypt), its key is checked
 * (who are you), its count (rate limit), its coins (budget), and whether there is room (capacity). Each tumbler has a
 * lamp over it, amber while its check runs and green once it has passed, and a brass plaque under it with its name.
 *
 * Behind the columns, the door: its walnut leaves stand open against the way through, a sash window of coloured glass
 * over it, and either side a panel of painted tile, a rose bush with a nightingale singing in it, over a footing of
 * brick. At each front corner a badgir, a windcatcher, rises over the roof, its vents open to the breeze, as on the
 * houses of Yazd. Behind, where the hall sees it, the door keeps its bank-door brass: a thick riveted band.
 *
 * Drawn from concepts/carpets-r1/door. Its own frame has its foot on the platform at the origin, its front towards +z,
 * the lanes running through it along z.
 */

/** The five checks, in the order a request meets them. */
export const CHECKS = ['Decrypt', 'Who are you?', 'Rate limit', 'Budget', 'Capacity'];

const G = P.GATEHOUSE;
/** The front between the windcatchers, and the walls' height. */
const W = 9.0;
const D = G.d;
const WALL = 5.6;
/** The door: the lanes' way through, a plain rectangle. */
const DOOR = { w: 4.6, h: 3.9 };
/** The talar: where its back wall (the gatehouse's front) stands, its columns' line, and its roof's foot and top. */
const TALAR = { back: 0.4, cols: D / 2 - 0.25, x: 2.75, r: 0.16, foot: 0.3, beam: 5.25, roof: 5.6, top: WALL + 0.26 };
/** The windcatchers at the front corners: how far out, how far forward, how wide, how tall, and their vents. */
const BADGIR = { x: W / 2 + 0.85, z: D / 2 - 0.9, half: 1.2, h: 7.9, vents: [6.0, 7.45] };
/** The tumblers' row, on a rail between the columns: how high, how far apart, how big, and how far forward. */
const TUMBLER = { y: 3.2, gap: 0.96, r: 0.27, len: 0.6, z: TALAR.cols - 0.05 };

export class Gatehouse {
	group = new THREE.Group();
	/** The tumblers' lamps, left to right, each its own, so each can turn green on its own. */
	private lamps: Lamp[] = [];
	private drums: THREE.Object3D[] = [];
	private plaques: THREE.Object3D[] = [];
	/** When a conversation last named each check (the clock's seconds): named one after another, they ripple. */
	private namedAt = CHECKS.map(() => -10);
	private clock = 0;

	constructor() {
		// Its name lets the conversation point at it.
		this.group.name = 'Front door';
		this.group.position.copy(G.at);
		const c = palette();
		const b = new Batch();
		const glass = new Batch();

		// The body: one jade block from the back to the talar's back wall, the door let right through it, a brass plinth
		// band along its foot and a cornice along its top.
		const body = new THREE.Shape();
		body.moveTo(-W / 2, 0);
		body.lineTo(-DOOR.w / 2, 0);
		body.lineTo(-DOOR.w / 2, DOOR.h);
		body.lineTo(DOOR.w / 2, DOOR.h);
		body.lineTo(DOOR.w / 2, 0);
		body.lineTo(W / 2, 0);
		body.lineTo(W / 2, WALL);
		body.lineTo(-W / 2, WALL);
		body.closePath();
		const depth = TALAR.back + D / 2;
		b.add(extrude(body, depth, 0.06, 2, 4), c.jade, { p: [0, 0, (TALAR.back - D / 2) / 2] });
		for (const s of [-1, 1]) b.add(rbox((W - DOOR.w) / 2 + 0.15, 0.32, depth + 0.3, 0.08), c.brass, { p: [s * (DOOR.w / 2 + (W - DOOR.w) / 4 + 0.075), 0.16, (TALAR.back - D / 2) / 2] });
		// The cornice runs round the roof's edge; the roof inside it is jade, a terrace with a skylight of coloured glass.
		const bz = (TALAR.back - D / 2) / 2;
		for (const sz of [-1, 1]) b.add(rbox(W + 0.5, 0.26, 0.4, 0.06, 1), c.brass, { p: [0, WALL + 0.13, bz + sz * (depth / 2 + 0.05)] });
		for (const sx of [-1, 1]) b.add(rbox(0.4, 0.26, depth + 0.5, 0.06, 1), c.brass, { p: [sx * (W / 2 + 0.05), WALL + 0.13, bz] });
		b.add(rbox(3.2, 0.2, 1.3, 0.05, 1), c.brass, { p: [0, WALL + 0.1, bz - 0.1] });
		glass.add(fitted(rect(-1.45, -0.5, 1.45, 0.5)), stainedGlass(orosi(2.9, 0.15), true), { p: [0, WALL + 0.205, bz - 0.1], r: [-Math.PI / 2, 0, 0] });

		// Behind, where the hall sees it, the door keeps its bank-door brass: a thick band round it, studded with rivets.
		const band = new THREE.Shape([
			new THREE.Vector2(-DOOR.w / 2 - 0.32, 0),
			new THREE.Vector2(-DOOR.w / 2, 0),
			new THREE.Vector2(-DOOR.w / 2, DOOR.h),
			new THREE.Vector2(DOOR.w / 2, DOOR.h),
			new THREE.Vector2(DOOR.w / 2, 0),
			new THREE.Vector2(DOOR.w / 2 + 0.32, 0),
			new THREE.Vector2(DOOR.w / 2 + 0.32, DOOR.h + 0.32),
			new THREE.Vector2(-DOOR.w / 2 - 0.32, DOOR.h + 0.32)
		]);
		b.add(extrude(band, 0.14, 0.03, 2, 4), c.brass, { p: [0, 0, -D / 2 - 0.05] });
		const rivet = new THREE.SphereGeometry(0.065, 8, 5);
		for (let i = 0; i <= 12; i++) {
			const x = -DOOR.w / 2 - 0.16 + ((DOOR.w + 0.32) * i) / 12;
			b.add(rivet, c.gold, { p: [x, DOOR.h + 0.16, -D / 2 - 0.13] });
		}
		for (const s of [-1, 1]) for (let i = 1; i <= 8; i++) b.add(rivet, c.gold, { p: [s * (DOOR.w / 2 + 0.16), (DOOR.h * i) / 9 + 0.1, -D / 2 - 0.13] });

		this.doorway(b, glass);
		this.talar(b);
		for (const s of [-1, 1]) this.badgir(b, glass, s);

		// The rail across the talar that carries the tumblers, its ends seated in the columns.
		const railY = TUMBLER.y + TUMBLER.r + 0.18;
		b.add(new THREE.CylinderGeometry(0.08, 0.08, 2 * (TALAR.x - TALAR.r + 0.04), 16), c.brass, { p: [0, railY, TUMBLER.z], r: [0, 0, Math.PI / 2] });
		for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.21, 0.21, 0.16, 16), c.brass, { p: [s * TALAR.x, railY, TALAR.cols] });
		this.group.add(b.build('gatehouse'), glass.build('gatehouse-windows'));

		// The five tumblers: brass drums turning on the rail, ribbed, each with its own lamp on top and its name under it.
		const drumGeo = new THREE.CylinderGeometry(TUMBLER.r, TUMBLER.r, TUMBLER.len, 32);
		const ribGeo = new THREE.TorusGeometry(TUMBLER.r + 0.01, 0.025, 6, 32);
		for (let i = 0; i < 5; i++) {
			const x = (i - 2) * TUMBLER.gap;
			const drum = new THREE.Group();
			drum.position.set(x, TUMBLER.y, TUMBLER.z);
			const body = new THREE.Mesh(drumGeo, c.brass);
			body.rotation.z = Math.PI / 2;
			drum.add(body);
			// Clear of the hanger in the middle, which holds the drum's axle.
			for (const dx of [-0.22, -0.1, 0.1, 0.22]) {
				const rib = new THREE.Mesh(ribGeo, c.gold);
				rib.rotation.y = Math.PI / 2;
				rib.position.x = dx;
				drum.add(rib);
			}
			const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), c.brass);
			hanger.position.set(0, TUMBLER.r + 0.1, 0);
			this.group.add(drum);
			this.drums.push(drum);
			const lamp = new Lamp(new THREE.SphereGeometry(0.1, 16, 12), color.amber, 0.2);
			lamp.mesh.position.set(x, TUMBLER.y + TUMBLER.r + 0.36, TUMBLER.z + 0.35);
			const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.1, 16), c.brass);
			cup.position.set(x, TUMBLER.y + TUMBLER.r + 0.27, TUMBLER.z + 0.35);
			this.group.add(lamp.mesh, cup, hanger);
			hanger.position.add(drum.position);
			this.lamps.push(lamp);
			// Its plaque: cream in a brass frame, hung from the drum's axle on two short rods.
			const plaque = new THREE.Group();
			plaque.position.set(x, TUMBLER.y - TUMBLER.r - 0.36, TUMBLER.z);
			const pb = new Batch();
			pb.add(rbox(0.92, 0.3, 0.06, 0.03), c.brass);
			pb.add(rbox(0.84, 0.22, 0.04, 0.02), c.cream, { p: [0, 0, 0.025] });
			for (const s of [-1, 1]) pb.add(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), c.brass, { p: [s * 0.3, 0.27, 0] });
			plaque.add(pb.build(`check-${i}`));
			const name = new Label(CHECKS[i], 0.095, { weight: 700 });
			name.mesh.position.set(0, 0, 0.047);
			plaque.add(name.mesh);
			this.group.add(plaque);
			this.plaques.push(plaque);
		}
	}

	/**
	 * The door in the talar's back wall: its walnut leaves standing open against the way through, a brass frame round it,
	 * a sash window of coloured glass over it, a painted tile panel either side, and a footing of brick.
	 */
	private doorway(b: Batch, glass: Batch) {
		const c = palette();
		const z = TALAR.back;
		// The frame: brass jambs and a lintel, standing proud of the wall.
		for (const s of [-1, 1]) b.add(rbox(0.22, DOOR.h + 0.22, 0.16, 0.04, 1), c.brass, { p: [s * (DOOR.w / 2 + 0.11), (DOOR.h + 0.22) / 2, z + 0.06] });
		b.add(rbox(DOOR.w + 0.44, 0.22, 0.18, 0.04, 1), c.brass, { p: [0, DOOR.h + 0.11, z + 0.07] });
		// The leaves, each half the door, swung in against the way's sides: carved walnut, raised panels, brass studs and a
		// knocker ring.
		const leafW = DOOR.w / 2 - 0.05;
		for (const s of [-1, 1]) {
			const x = s * (DOOR.w / 2 - 0.07);
			const mid = z - 0.05 - leafW / 2;
			b.add(rbox(0.1, DOOR.h - 0.08, leafW, 0.03, 1), c.walnut, { p: [x, (DOOR.h - 0.08) / 2, mid] });
			for (const py of [0.95, 2.05, 3.15])
				for (const pz of [-1, 1]) b.add(rbox(0.04, 0.85, leafW / 2 - 0.22, 0.02, 1), c.woodEdge, { p: [x - s * 0.06, py, mid + (pz * leafW) / 4] });
			for (let k = 0; k < 4; k++) b.add(new THREE.SphereGeometry(0.04, 8, 5), c.gold, { p: [x - s * 0.08, 0.4 + k * 1.05, mid] });
			b.add(new THREE.TorusGeometry(0.11, 0.02, 6, 16), c.gold, { p: [x - s * 0.1, 1.7, mid + leafW * 0.3], r: [0, Math.PI / 2, 0] });
		}
		// Over it, a sash window of coloured glass in a walnut frame, the lintel under it.
		const sash = { w: DOOR.w - 0.4, h: 0.85, y: DOOR.h + 0.42 };
		b.add(rbox(sash.w + 0.28, sash.h + 0.28, 0.12, 0.03, 1), c.walnut, { p: [0, sash.y + sash.h / 2, z + 0.02] });
		glass.add(fitted(rect(-sash.w / 2, 0, sash.w / 2, sash.h)), stainedGlass(orosi(sash.w / sash.h, 0.42 / (sash.w / sash.h)), true), { p: [0, sash.y, z + 0.085] });
		for (const s of [-1, 1]) b.add(rbox(0.05, sash.h, 0.06, 0.01, 1), c.walnut, { p: [(s * sash.w) / 6, sash.y + sash.h / 2, z + 0.1] });
		// Either side, a panel of painted tile in a brass frame: a rose bush and its nightingale, singing towards the door.
		const pw = W / 2 - 0.5 - (DOOR.w / 2 + 0.4);
		const px = DOOR.w / 2 + 0.4 + pw / 2;
		const py = [0.85, 4.75];
		const ph = py[1] - py[0];
		for (const s of [-1, 1]) {
			b.add(rbox(pw + 0.16, ph + 0.16, 0.08, 0.03, 1), c.brass, { p: [s * px, (py[0] + py[1]) / 2, z + 0.02] });
			b.add(fitted(rect(-pw / 2, 0, pw / 2, ph)), panelOf(pw / ph, s < 0 ? 5 : 8, -s), { p: [s * px, py[0], z + 0.065] });
		}
		// The footing: brick, from the plinth to the panels' foot.
		const footH = py[0] - 0.4;
		for (const s of [-1, 1]) {
			const fw = W / 2 - DOOR.w / 2 - 0.22;
			b.add(tiledUV(new THREE.PlaneGeometry(fw, footH), fw / 1.7, footH / 1.7), brickWork(), { p: [s * (DOOR.w / 2 + 0.22 + fw / 2), 0.32 + footH / 2, z + 0.008] });
		}
	}

	/**
	 * The talar: a flat roof over the gatehouse's front, its front on a walnut beam carried by two slim columns clad in
	 * mirror work, its ceiling walnut coffers with mirror work in them, and along its top a brass balustrade.
	 */
	private talar(b: Batch) {
		const c = palette();
		const mirror = mirrorWork();
		const { cols, x: cx, r, foot, beam, roof, top } = TALAR;
		const span = 2 * (BADGIR.x - BADGIR.half);
		// The columns: a brass base, a faceted shaft of mirror, a gold collar, and a stepped walnut capital under the beam.
		for (const s of [-1, 1]) {
			const x = s * cx;
			b.add(new THREE.CylinderGeometry(r + 0.14, r + 0.2, foot, 16), c.brass, { p: [x, foot / 2, cols] });
			b.add(new THREE.TorusGeometry(r + 0.1, 0.04, 6, 16), c.gold, { p: [x, foot, cols], r: [Math.PI / 2, 0, 0] });
			const shaftH = beam - 0.5 - foot;
			b.add(tiledUV(facetedShaft(r * 0.85, r, shaftH), 2, shaftH / 0.55), mirror, { p: [x, foot + shaftH / 2, cols] });
			b.add(new THREE.TorusGeometry(r * 0.9, 0.035, 6, 16), c.gold, { p: [x, foot + shaftH, cols], r: [Math.PI / 2, 0, 0] });
			[
				[0.42, 0.16],
				[0.58, 0.16],
				[0.76, 0.18]
			].forEach(([w, h], k) => b.add(rbox(w, h, w, 0.03, 1), k === 1 ? c.gold : c.walnut, { p: [x, foot + shaftH + 0.08 + k * 0.165, cols] }));
		}
		// The beam on the columns, from windcatcher to windcatcher, a painted band along its face, gold along its edges.
		const beamH = roof - beam;
		b.add(rbox(span, beamH, 0.4, 0.04, 1), c.walnut, { p: [0, beam + beamH / 2, cols] });
		b.add(tiledUV(new THREE.PlaneGeometry(span - 0.2, beamH - 0.12), Math.round((span - 0.2) / 2.2), 1), painted().frieze, { p: [0, beam + beamH / 2, cols + 0.205] });
		for (const y of [beam + 0.03, roof - 0.03]) b.add(rbox(span, 0.04, 0.05, 0.015, 1), c.gold, { p: [0, y, cols + 0.2] });
		// The roof: a jade slab over it all, a brass cornice on its edge.
		const d = cols + 0.2 - TALAR.back;
		const mid = TALAR.back + d / 2;
		b.add(rbox(span, top - roof, d, 0.04, 1), c.jade, { p: [0, (roof + top) / 2, mid] });
		b.add(rbox(span + 0.1, 0.1, 0.12, 0.03, 1), c.brass, { p: [0, top - 0.05, cols + 0.22] });
		// The ceiling: walnut ribs both ways, a gold boss where they cross, and in every coffer a panel of mirror work.
		const nx = 8;
		const nz = 2;
		const ceil = roof - 0.01;
		for (let i = 0; i < nx; i++)
			for (let k = 0; k < nz; k++) {
				const w = span / nx;
				const dd = d / nz;
				b.add(tiledUV(new THREE.PlaneGeometry(w - 0.1, dd - 0.1), 0.9, 0.8), mirror, { p: [-span / 2 + w * (i + 0.5), ceil, TALAR.back + dd * (k + 0.5)], r: [Math.PI / 2, 0, 0] });
			}
		for (let i = 0; i <= nx; i++) b.add(rbox(0.1, 0.12, d, 0.02, 1), c.walnut, { p: [-span / 2 + (span * i) / nx, roof - 0.06, mid] });
		for (let k = 0; k <= nz; k++) b.add(rbox(span, 0.1, 0.1, 0.02, 1), c.walnut, { p: [0, roof - 0.055, TALAR.back + (d * k) / nz] });
		for (let i = 1; i < nx; i++) b.add(new THREE.SphereGeometry(0.07, 8, 5), c.gold, { p: [-span / 2 + (span * i) / nx, roof - 0.13, mid] });
		// The balustrade along the roof's front: brass posts, gold knobs, a rail.
		const n = 14;
		for (let i = 0; i <= n; i++) {
			const x = -span / 2 + 0.1 + ((span - 0.2) * i) / n;
			b.add(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8), c.brass, { p: [x, top + 0.21, cols + 0.08] });
			if (i % 2 === 0) b.add(new THREE.SphereGeometry(0.07, 8, 6), c.gold, { p: [x, top + 0.47, cols + 0.08] });
		}
		b.add(new THREE.CylinderGeometry(0.035, 0.035, span - 0.2, 8), c.brass, { p: [0, top + 0.4, cols + 0.08], r: [0, 0, Math.PI / 2] });
	}

	/**
	 * A windcatcher at a front corner: a square jade tower to the roof, a sash window in its face, and over the roof its
	 * cream head, open on every side in tall vents between fins, under a flat cap with a brass edge.
	 */
	private badgir(b: Batch, glass: Batch, s: number) {
		const c = palette();
		const { half, h, vents } = BADGIR;
		const x = s * BADGIR.x;
		const z = BADGIR.z;
		const w = half * 2;
		b.add(rbox(w + 0.3, 0.32, w + 0.3, 0.08, 1), c.brass, { p: [x, 0.16, z] });
		b.add(rbox(w, WALL, w, 0.08, 1), c.jade, { p: [x, WALL / 2, z] });
		b.add(rbox(w + 0.16, 0.2, w + 0.16, 0.05, 1), c.brass, { p: [x, WALL + 0.1, z] });
		// Its window: coloured glass in a walnut sash, on the face towards you, and a small painted panel over it.
		const face = z + half;
		const win = { w: 0.9, h: 1.9, y: 1.3 };
		b.add(rbox(win.w + 0.22, win.h + 0.22, 0.1, 0.03, 1), c.walnut, { p: [x, win.y + win.h / 2, face + 0.01] });
		glass.add(fitted(rect(-win.w / 2, 0, win.w / 2, win.h)), stainedGlass(orosi(win.w / win.h, 0.5), true), { p: [x, win.y, face + 0.065] });
		const ph = 1.35;
		b.add(rbox(win.w + 0.22, ph + 0.14, 0.08, 0.03, 1), c.brass, { p: [x, win.y + win.h + 0.45 + ph / 2, face + 0.01] });
		b.add(fitted(rect(-win.w / 2 - 0.04, 0, win.w / 2 + 0.04, ph)), panelOf((win.w + 0.08) / ph, s < 0 ? 12 : 15, -s), { p: [x, win.y + win.h + 0.45, face + 0.055] });
		// The head: a cream shaft over the roof, a dark core seen through its vents, fins between them on every side.
		const headFoot = WALL + 0.2;
		b.add(rbox(w - 0.1, vents[0] - headFoot, w - 0.1, 0.06, 1), c.cream, { p: [x, (headFoot + vents[0]) / 2, z] });
		b.add(rbox(w - 0.4, vents[1] - vents[0], w - 0.4, 0.02, 1), c.walnut, { p: [x, (vents[0] + vents[1]) / 2, z] });
		const fins = 5;
		for (let k = 0; k < fins; k++) {
			const t = -half + 0.05 + ((w - 0.1) * k) / (fins - 1);
			for (const [fx, fz, rot] of [
				[t, half - 0.05, 0],
				[t, -half + 0.05, 0],
				[half - 0.05, t, Math.PI / 2],
				[-half + 0.05, t, Math.PI / 2]
			])
				b.add(rbox(0.16, vents[1] - vents[0], 0.34, 0.03, 1), c.cream, { p: [x + fx, (vents[0] + vents[1]) / 2, z + fz], r: [0, rot, 0] });
		}
		b.add(rbox(w - 0.1, h - vents[1], w - 0.1, 0.05, 1), c.cream, { p: [x, (vents[1] + h) / 2, z] });
		b.add(rbox(w + 0.14, 0.14, w + 0.14, 0.04, 1), c.brass, { p: [x, h + 0.07, z] });
		b.add(rbox(w - 0.3, 0.12, w - 0.3, 0.04, 1), c.cream, { p: [x, h + 0.2, z] });
	}

	/** A conversation names one of the checks: its plaque nods forward and back, its lamp flares. */
	name(i: number) {
		if (i >= 0 && i < this.namedAt.length) this.namedAt[i] = this.clock;
	}

	/**
	 * checks: how far the request has got through the five checks, 0 to 5: each tumbler turns a notch while its check
	 * runs, its lamp blinking amber, and its lamp stays green once it has passed. Below 0, at rest: the lamps glow dimly
	 * and the drums tick over, as a door does that others are going through.
	 */
	update(time: number, checks = -1) {
		this.clock = time;
		glint(time);
		const idle = checks < 0;
		const ticking = idle ? (time * 0.8) % 7 : checks;
		this.drums.forEach((drum, i) => {
			const turn = idle ? Math.min(1, Math.max(0, ticking - i)) + Math.floor((time * 0.8) / 7) : outBack(seg(checks, i, i + 0.5), 2);
			drum.rotation.x = -turn * (Math.PI / 2);
		});
		this.lamps.forEach((lamp, i) => {
			const since = time - this.namedAt[i];
			const nod = since >= 0 && since < 1.1 ? Math.sin((since / 1.1) * Math.PI) : 0;
			this.plaques[i].rotation.x = nod * 0.32;
			if (idle) lamp.mix(color.amber, color.green, THREE.MathUtils.clamp(ticking - i, 0, 1), 0.25 + nod * 1.5);
			else if (checks >= i + 0.5) lamp.set(color.green, 1.4 + nod * 1.6);
			else if (checks >= i) lamp.set(color.amber, 1.1 + Math.sin(time * 14) * 0.6);
			else lamp.set(color.amber, 0.12 + nod * 1.5);
			if (nod > 0) this.plaques[i].position.z = TUMBLER.z + inOut(nod) * 0.12;
		});
	}
}
