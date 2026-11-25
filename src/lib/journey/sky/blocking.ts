import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect, sweep } from '../kit/geometry';
import { createIsland } from '../props/island';
import { paintCloud, seeded } from '../props/sky';
import { Brain, STEM_FOOT } from '../props/brain';
import { palette, tinted } from './palette';
import * as P from './masterplan';
import { Tower } from './tower';
import { Gatehouse } from './gatehouse';
import { Hall } from './hall';

/*
 * The whole world blocked out from the masterplan: every place at its size and in its colours, in simple forms, so the
 * plan can be checked against the four views before any place is built properly. Nothing here is final but the layout.
 */

type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Lays a flat outline (x, z pairs, seen from above) down as a shape the extruder turns into a slab facing up. */
const plan = (pts: [number, number][]) => pts.map(([x, z]) => [x, -z] as [number, number]);

export class Blocking {
	group = new THREE.Group();
	brain: Brain | null = null;
	tower = new Tower();
	gatehouse = new Gatehouse();
	hall = new Hall();
	private up!: THREE.CatmullRomCurve3;
	private down!: THREE.CatmullRomCurve3;
	private tokens!: THREE.InstancedMesh;
	private pearls!: THREE.InstancedMesh;
	/** Across the internet the request and the reply travel as sealed capsules; inside the provider, as tokens. */
	private upSealed!: THREE.InstancedMesh;
	private downSealed!: THREE.InstancedMesh;
	private m = new THREE.Matrix4();

	constructor() {
		this.group.name = 'blocking';
		const b = new Batch();
		this.desk(b);
		this.aqueduct(b);
		this.masts(b);
		this.provider(b);
		this.foundry(b);
		this.proving(b);
		this.remote(b);
		this.group.add(b.build('world'), this.tower.group, this.gatehouse.group, this.hall.group);
		this.platform();
		this.lanes();
		this.clouds();
		this.model();
	}

	/* ---------- your desk ---------- */
	private desk(b: Batch) {
		const c = palette();
		const { w, d, top, corner } = P.DESK;
		b.add(extrude(roundedRect(w, d, corner), top, 0.12, 4, 24), c.wood, { r: [-Math.PI / 2, 0, 0], p: [0, -top / 2, 0] });
		b.add(extrude(roundedRect(w - 0.3, d - 0.3, corner - 0.15), 0.35, 0.1, 3, 24), c.cream, { r: [-Math.PI / 2, 0, 0], p: [0, -top - 0.17, 0] });
		// The desk's cream body under its top, with a pair of arched legs at each end.
		b.add(rbox(w - 4.4, 2.4, d - 3.2, 0.5), c.cream, { p: [0, -top - 1.5, 0] });
		for (const s of [-1, 1]) b.add(rbox(2.4, 5.5, d - 3.6, 0.6), c.cream, { p: [s * (w / 2 - 3.2), -top - 3.2, 0] });

		// The laptop: a base and a lid leaning back, its screen lit.
		const L = P.LAPTOP.at;
		b.add(rbox(3.3, 0.12, 2.2, 0.05), c.chrome, { p: [L.x, 0.06, L.z] });
		const lid = new THREE.Object3D();
		lid.position.set(L.x, 0.12, L.z - 1.08);
		lid.rotation.x = -0.28;
		lid.updateMatrix();
		const lidAt = (y: number, z: number) => new THREE.Vector3(0, y, z).applyMatrix4(lid.matrix).toArray() as V3;
		b.add(rbox(3.3, 2.12, 0.07, 0.04), c.chrome, { p: lidAt(1.06, 0), r: [-0.28, 0, 0] });
		b.add(rbox(3.05, 1.85, 0.02, 0.01), c.screen, { p: lidAt(1.08, 0.045), r: [-0.28, 0, 0] });

		// The harness: a butter-cream machine with a rounded roof and amber windows, wired to the laptop.
		const H = P.HARNESS;
		const body = H.h - H.d / 2;
		b.add(rbox(H.w, body, H.d, 0.3), c.butter, { p: [H.at.x, body / 2, H.at.z] });
		b.add(new THREE.CylinderGeometry(H.d / 2, H.d / 2, H.w - 0.2, 40, 1, false, 0, Math.PI), c.butter, {
			p: [H.at.x, body, H.at.z],
			r: [0, 0, Math.PI / 2]
		});
		for (const x of [-2.1, 0, 2.1]) b.add(rbox(1.5, 1.9, 0.12, 0.05), c.amberWindow, { p: [H.at.x + x, 1.75, H.at.z + H.d / 2 + 0.02] });
		b.add(rbox(H.w + 0.2, 0.18, H.d + 0.2, 0.06), c.brass, { p: [H.at.x, 0.09, H.at.z] });
		this.tube(b, [[L.x + 0.9, 0.08, L.z - 1.1], [0.9, 0.08, -0.4], [0.9, 0.08, H.at.z + H.d / 2 + 0.1]], 0.09, c.brass);

		// The permission gate: two posts and a red and white barrier.
		const G = P.GATE.at;
		for (const s of [-1, 1]) {
			b.add(rbox(0.5, 1.5, 0.5, 0.12), c.butter, { p: [G.x + (s * P.GATE.w) / 2, 0.75, G.z] });
			b.add(rbox(0.3, 0.3, 0.06, 0.05), c.amberWindow, { p: [G.x + (s * P.GATE.w) / 2, 1.1, G.z + 0.26] });
		}
		for (let i = 0; i < 6; i++) b.add(rbox(P.GATE.w / 6 - 0.02, 0.2, 0.16, 0.04), i % 2 ? c.mastWhite : c.mastRed, { p: [G.x - P.GATE.w / 2 + (i + 0.5) * (P.GATE.w / 6), 1.15, G.z] });

		// Local MCP servers: cheerful gadgets piped to the laptop's left side.
		[c.mint, c.coral, c.skyBlue].forEach((mat, i) => {
			const g = P.LOCAL_MCP[i];
			b.add(rbox(1.25, 1.3, 1.2, 0.22), mat, { p: [g.x, 0.65, g.z] });
			b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24), c.brass, { p: [g.x, 0.75, g.z + 0.62], r: [Math.PI / 2, 0, 0] });
			b.add(rbox(1.45, 0.16, 1.4, 0.05), c.walnut, { p: [g.x, 0.08, g.z] });
			this.tube(b, [[g.x, 0.12, g.z + 0.7], [g.x, 0.12, 1.9 + i * 0.18], [L.x - 1.7, 0.12, 1.9 + i * 0.18]], 0.06, c.brass);
		});

		// The shell, the files and the archive drawer.
		const S = P.SHELL.at;
		b.add(rbox(1.3, 1.1, 0.9, 0.16), c.cream, { p: [S.x, 0.55, S.z] });
		b.add(rbox(1.0, 0.7, 0.04, 0.03), c.prompt, { p: [S.x, 0.62, S.z + 0.46] });
		const F = P.FILES.at;
		b.add(rbox(1.4, 0.2, 1.0, 0.05), c.brass, { p: [F.x, 0.1, F.z] });
		for (let i = 0; i < 6; i++) b.add(rbox(1.2, 1.1, 0.04, 0.02), c.paper, { p: [F.x, 0.7, F.z - 0.35 + i * 0.14], r: [-0.18, 0, 0] });
		const A = P.ARCHIVE;
		b.add(rbox(A.w, A.h, A.d, 0.18), c.walnut, { p: [A.at.x, A.h / 2, A.at.z - 0.4] });
		b.add(rbox(A.w - 0.3, A.h * 0.42, 1.8, 0.1), c.walnut, { p: [A.at.x, A.h * 0.26, A.at.z + 1.4] });
		for (let i = 0; i < 7; i++) b.add(rbox(A.w - 0.7, 0.62, 0.04, 0.02), c.paper, { p: [A.at.x, A.h * 0.5, A.at.z + 0.75 + i * 0.2] });
		b.add(new THREE.TorusGeometry(0.22, 0.05, 10, 28), c.brass, { p: [A.at.x, A.h * 0.24, A.at.z + 2.32] });

		// Brass posts at the back corners for the remote towers' cables.
		for (const p of P.POSTS) {
			b.add(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 20), c.brass, { p: [p.x, 0.65, p.z] });
			b.add(new THREE.SphereGeometry(0.2, 20, 12), c.brass, { p: [p.x, 1.35, p.z] });
		}
	}

	/* ---------- the aqueduct ---------- */
	private aqueduct(b: Batch) {
		const c = palette();
		const curve = new THREE.CatmullRomCurve3(
			P.AQUEDUCT.map((p) => v(...p)),
			false,
			'centripetal'
		);
		const W = P.DECK_W;
		// The deck, its two kerbs, and a cornice under its edge.
		b.add(sweep(curve, [[-W / 2, 0], [W / 2, 0], [W / 2, -0.7], [-W / 2, -0.7]], 80), c.porcelain);
		for (const s of [-1, 1]) b.add(sweep(curve, [[s * (W / 2 - 0.18), 0.22], [s * (W / 2), 0.22], [s * (W / 2), 0], [s * (W / 2 - 0.18), 0]], 80), c.porcelainShade);
		b.add(sweep(curve, [[-W / 2 - 0.15, -0.7], [W / 2 + 0.15, -0.7], [W / 2 + 0.15, -0.95], [-W / 2 - 0.15, -0.95]], 80), c.porcelainShade);
		// The arches under it, from where it clears the harness to where it meets the platform.
		const len = curve.getLength();
		const start = 4.2 / len;
		const n = 5;
		const at = (i: number) => curve.getPointAt(start + ((1 - start) * i) / n);
		for (let i = 0; i < n; i++) this.span(b, at(i), at(i + 1), -0.95, W * 0.86, c.porcelain);
	}

	/**
	 * One arch of an arcade between two points on a deck's underside: a spandrel with a round arch let into it, sheared
	 * to follow the deck's slope, and a pier at each end going down out of sight.
	 */
	private span(b: Batch, a: THREE.Vector3, c: THREE.Vector3, drop: number, thick: number, mat: THREE.Material) {
		const flat = new THREE.Vector3(c.x - a.x, 0, c.z - a.z);
		const L = flat.length();
		const slope = (c.y - a.y) / L;
		const pier = Math.min(2.0, L * 0.2);
		const r = (L - pier) / 2;
		const D = r + 0.6;
		const s = new THREE.Shape();
		s.moveTo(-L / 2, 0);
		s.lineTo(L / 2, 0);
		s.lineTo(L / 2, -D);
		s.lineTo(r, -D);
		s.absarc(0, -D, r, 0, Math.PI, false);
		s.lineTo(-L / 2, -D);
		s.closePath();
		const g = extrude(s, thick, 0.06, 2, 24);
		g.applyMatrix4(new THREE.Matrix4().makeShear(slope, 0, 0, 0, 0, 0));
		const yaw = Math.atan2(-flat.z, flat.x);
		const mid = a.clone().add(c).multiplyScalar(0.5);
		b.add(g, mat, { p: [mid.x, mid.y + drop, mid.z], r: [0, yaw, 0] });
		for (const [p, top] of [
			[a, a.y + drop - D],
			[c, c.y + drop - D]
		] as const) {
			const h = top - P.PIER_FOOT;
			b.add(rbox(pier, h, thick, 0.12), mat, { p: [p.x, P.PIER_FOOT + h / 2, p.z], r: [0, yaw, 0] });
			b.add(rbox(pier + 0.4, 0.3, thick + 0.4, 0.08), mat, { p: [p.x, top - 0.1, p.z], r: [0, yaw, 0] });
		}
	}

	/** Arches along a straight run under a deck whose underside is at y. */
	private arcade(b: Batch, from: V3, to: V3, y: number, n: number, thick: number, mat: THREE.Material) {
		const a = v(...from);
		const c = v(...to);
		for (let i = 0; i < n; i++) this.span(b, a.clone().lerp(c, i / n).setY(y), a.clone().lerp(c, (i + 1) / n).setY(y), 0, thick, mat);
	}

	/* ---------- the internet ---------- */
	private masts(b: Batch) {
		const c = palette();
		for (const { at, h } of P.MASTS) {
			const ph = at.y - P.PIER_FOOT;
			b.add(new THREE.CylinderGeometry(0.9, 1.0, ph, 32), c.porcelain, { p: [at.x, P.PIER_FOOT + ph / 2, at.z] });
			b.add(new THREE.CylinderGeometry(1.35, 1.1, 0.5, 40), c.porcelain, { p: [at.x, at.y - 0.25, at.z] });
			b.add(new THREE.TorusGeometry(1.25, 0.05, 8, 48), c.brass, { p: [at.x, at.y + 0.6, at.z], r: [Math.PI / 2, 0, 0] });
			const bands = 6;
			for (let i = 0; i < bands; i++) {
				const r0 = 0.42 - (0.2 * i) / bands;
				const r1 = 0.42 - (0.2 * (i + 1)) / bands;
				b.add(new THREE.CylinderGeometry(r1, r0, h / bands, 24), i % 2 ? c.mastWhite : c.mastRed, { p: [at.x, at.y + (i + 0.5) * (h / bands), at.z] });
			}
			b.add(new THREE.SphereGeometry(0.26, 20, 14), c.beacon, { p: [at.x, at.y + h + 0.2, at.z] });
			b.add(new THREE.CylinderGeometry(0.05, 0.5, 0.35, 24), c.mastWhite, { p: [at.x + 0.45, at.y + h * 0.7, at.z], r: [0, 0, Math.PI / 2] });
		}
	}

	/* ---------- the provider ---------- */
	private platform() {
		const outline = plan(P.PLATFORM);
		const isl = createIsland(outline, 1.2);
		isl.position.y = P.PLATFORM_Y;
		this.group.add(isl);
	}

	private provider(b: Batch) {
		const c = palette();
		const Y = P.PLATFORM_Y;
		// Arches carry the platform down both its sides and across its back.
		const z0 = P.DOOR_Z - 1.9;
		const z1 = P.DOOR_Z - 29.4;
		this.arcade(b, [-7.4, 0, z0], [-7.4, 0, z1], Y - 1.4, 3, 2.2, c.porcelain);
		this.arcade(b, [7.4, 0, z0], [7.4, 0, z1], Y - 1.4, 3, 2.2, c.porcelain);
		this.arcade(b, [-6.4, 0, z0], [6.4, 0, z0], Y - 1.4, 1, 2.2, c.porcelain);

	}

	/* ---------- the foundry and its rail ---------- */
	private foundry(b: Batch) {
		const c = palette();
		const F = P.FOUNDRY;
		const deck = createIsland(plan([[-F.w / 2 - 1.2, -F.d / 2 - 1], [F.w / 2 + 1.2, -F.d / 2 - 1], [F.w / 2 + 1.4, F.d / 2 + 1], [-F.w / 2 - 1.2, F.d / 2 + 1]].map(([x, z]) => [x, z] as [number, number])), 0.9);
		deck.position.copy(F.at);
		this.group.add(deck);
		this.arcade(b, [F.at.x - 5, 0, F.at.z + 3.2], [F.at.x + 5, 0, F.at.z + 3.2], F.at.y - 1.3, 2, 1.8, c.porcelain);
		this.arcade(b, [F.at.x - 5, 0, F.at.z - 3.2], [F.at.x + 5, 0, F.at.z - 3.2], F.at.y - 1.3, 2, 1.8, c.porcelain);
		const Y = F.at.y;
		b.add(rbox(F.w - 2, 3.4, F.d - 2.4, 0.2), c.iron, { p: [F.at.x - 0.5, Y + 1.7, F.at.z] });
		b.add(new THREE.CylinderGeometry(2.3, 2.3, F.w - 2.6, 40, 1, false, 0, Math.PI), c.copper, { p: [F.at.x - 0.5, Y + 3.4, F.at.z], r: [0, 0, Math.PI / 2] });
		// The furnace's mouth, glowing, facing the hall across the gap.
		b.add(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 32, 1, false, 0, Math.PI), c.furnace, { p: [F.at.x + F.w / 2 - 1.4, Y + 1.0, F.at.z], r: [Math.PI / 2, Math.PI / 2, 0] });
		b.add(rbox(0.3, 1.0, 2.4, 0.05), c.furnace, { p: [F.at.x + F.w / 2 - 1.4, Y + 0.5, F.at.z] });
		for (const [x, z, h] of [
			[-3.2, -1.6, 6],
			[-1.6, -1.8, 7],
			[0.2, -1.6, 5.5]
		]) {
			b.add(new THREE.CylinderGeometry(0.45, 0.55, h, 24), x === -1.6 ? c.copper : c.iron, { p: [F.at.x + x, Y + h / 2, F.at.z + z] });
			b.add(new THREE.CylinderGeometry(0.62, 0.5, 0.4, 24), c.copper, { p: [F.at.x + x, Y + h, F.at.z + z] });
		}
		for (let i = 0; i < 4; i++) b.add(rbox(0.7, 1.0, 0.1, 0.04), c.furnace, { p: [F.at.x - 3.6 + i * 1.6, Y + 1.4, F.at.z + (F.d - 2.4) / 2 + 0.02] });
		// The rail up to the tower's roof, on brass trestles, with the glass carriage the model came up in near its top.
		const rail = new THREE.CatmullRomCurve3(P.FOUNDRY_RAIL.map((p) => v(...p)), false, 'centripetal');
		b.add(sweep(rail, [[-0.7, 0], [0.7, 0], [0.7, -0.25], [-0.7, -0.25]], 60), c.porcelainShade);
		for (const s of [-1, 1]) b.add(sweep(rail, [[s * 0.5 - 0.06, 0.12], [s * 0.5 + 0.06, 0.12], [s * 0.5 + 0.06, 0], [s * 0.5 - 0.06, 0]], 60), c.brass);
		// It rides on arches of its own, like everything else here.
		for (let i = 0; i < 3; i++) this.span(b, rail.getPointAt(0.08 + i * 0.27), rail.getPointAt(0.08 + (i + 1) * 0.27), -0.25, 1.2, c.porcelain);
		const car = rail.getPointAt(0.82);
		const dir = rail.getTangentAt(0.82);
		const capsule = new THREE.CapsuleGeometry(0.75, 1.6, 8, 20);
		capsule.rotateZ(Math.PI / 2);
		b.add(capsule, c.glass, { p: [car.x, car.y + 0.9, car.z], r: [0, Math.atan2(-dir.z, dir.x), Math.asin(dir.y)] });
		b.add(rbox(2.6, 0.3, 1.2, 0.1), c.brass, { p: [car.x, car.y + 0.25, car.z], r: [0, Math.atan2(-dir.z, dir.x), Math.asin(dir.y)] });
	}

	/* ---------- the proving ground ---------- */
	private proving(b: Batch) {
		const c = palette();
		const G = P.PROVING;
		const Y = G.at.y;
		b.add(new THREE.CylinderGeometry(G.r, G.r - 0.3, 0.8, 64), c.mintEnamel, { p: [G.at.x, Y - 0.4, G.at.z] });
		b.add(new THREE.CylinderGeometry(G.r - 0.3, 2.0, 2.2, 64), c.porcelain, { p: [G.at.x, Y - 1.9, G.at.z] });
		const ph = Y - 3 - P.PIER_FOOT;
		b.add(new THREE.CylinderGeometry(1.6, 1.9, ph, 32), c.porcelain, { p: [G.at.x, P.PIER_FOOT + ph / 2, G.at.z] });
		b.add(new THREE.TorusGeometry(G.r - 0.05, 0.08, 8, 64), c.brass, { p: [G.at.x, Y + 0.02, G.at.z], r: [Math.PI / 2, 0, 0] });
		for (const r of [2.6, 3.4, 4.2]) b.add(new THREE.RingGeometry(r, r + 0.12, 64), c.white, { p: [G.at.x - 0.4, Y + 0.01, G.at.z + 0.6], r: [-Math.PI / 2, 0, 0] });
		b.add(rbox(1.2, 0.8, 2.8, 0.1), c.white, { p: [G.at.x - 1.4, Y + 0.4, G.at.z + 2.4], r: [0.25, 0.5, 0] });
		for (let i = 0; i < 3; i++) b.add(rbox(0.6, 0.5, 0.6, 0.08), c.white, { p: [G.at.x + 0.6 + i * 0.9, Y + 0.25, G.at.z + 1.8] });
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + 0.4;
			const px = G.at.x + (G.r - 0.4) * Math.cos(a);
			const pz = G.at.z + (G.r - 0.4) * Math.sin(a);
			b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), c.brass, { p: [px, Y + 0.7, pz] });
			b.add(new THREE.ConeGeometry(0.25, 0.7, 3), c.pennant, { p: [px + 0.3, Y + 1.25, pz], r: [0, 0, -Math.PI / 2] });
		}
		const O = G.observatory;
		b.add(new THREE.CylinderGeometry(1.8, 1.9, 2.4, 40), c.white, { p: [O.x, Y + 1.2, O.z] });
		b.add(new THREE.SphereGeometry(1.85, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), c.violet, { p: [O.x, Y + 2.4, O.z] });
		b.add(new THREE.CylinderGeometry(0.28, 0.36, 2.2, 20), c.brass, { p: [O.x - 0.8, Y + 3.6, O.z + 0.5], r: [0.6, 0, 0.7] });
		// A little bridge across to the provider's platform.
		this.span(b, v(G.at.x - G.r + 0.3, Y - 0.8, G.at.z), v(9.4, P.PLATFORM_Y - 1.0, G.at.z), 0, 1.6, c.porcelain);
	}

	/* ---------- other companies' MCP servers, on the horizon ---------- */
	private remote(b: Batch) {
		const c = palette();
		for (const R of P.REMOTE) {
			const t = tinted(R.tint);
			const at = R.at;
			b.add(new THREE.CylinderGeometry(1.9, 0.5, 1.0, 40), c.porcelain, { p: [at.x, at.y - 0.5, at.z] });
			b.add(new THREE.CylinderGeometry(1.1, 1.15, 2.4, 32), t, { p: [at.x, at.y + 1.2, at.z] });
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2;
				b.add(rbox(0.32, 0.8, 0.06, 0.03), c.amberWindow, { p: [at.x + 1.14 * Math.cos(a), at.y + 1.3, at.z + 1.14 * Math.sin(a)], r: [0, -a + Math.PI / 2, 0] });
			}
			b.add(new THREE.SphereGeometry(1.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), t, { p: [at.x, at.y + 2.4, at.z] });
			b.add(new THREE.ConeGeometry(0.12, 1.2, 12), c.brass, { p: [at.x, at.y + 4.0, at.z] });
		}
		for (const { from, to } of P.REMOTE_CABLES) {
			const a = P.REMOTE[from].at.clone().setY(P.REMOTE[from].at.y - 0.9);
			const end = to.clone().setY(to.y + 1.4);
			const pts = Array.from({ length: 41 }, (_, i) => {
				const u = i / 40;
				const p = a.clone().lerp(end, u);
				p.y -= a.distanceTo(end) * 0.12 * 4 * u * (1 - u);
				return p;
			});
			const curve = new THREE.CatmullRomCurve3(pts);
			b.add(new THREE.TubeGeometry(curve, 120, 0.05, 6), c.cable);
			const beads = Math.floor(curve.getLength() / 0.9);
			const bead = new THREE.SphereGeometry(0.1, 8, 6);
			for (let i = 1; i < beads; i++) b.add(bead, c.cable, { p: curve.getPointAt(i / beads).toArray() as V3 });
		}
	}

	/* ---------- the lanes and their tokens ---------- */
	private lanes() {
		const c = palette();
		this.up = new THREE.CatmullRomCurve3(P.upLane(), false, 'centripetal');
		this.down = new THREE.CatmullRomCurve3(P.downLane(), false, 'centripetal');
		const b = new Batch();
		// Each lane's tokens ride a thin chrome rail just behind and below them.
		for (const curve of [this.up, this.down]) {
			const rail = new THREE.CatmullRomCurve3(curve.getSpacedPoints(400).map((p) => p.clone().add(new THREE.Vector3(0, 0.05, -0.3))));
			b.add(new THREE.TubeGeometry(rail, 600, 0.045, 8), c.chrome);
		}
		this.group.add(b.build('lanes'));
		// One on the lane every so often, whatever it is carrying there.
		const n = Math.floor(this.up.getLength() / 1.35);
		this.tokens = new THREE.InstancedMesh(rbox(0.46, 0.46, 0.46, 0.09), c.amber, n);
		this.pearls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 20, 14), c.pearl, n);
		const capsule = new THREE.CapsuleGeometry(0.22, 0.42, 8, 20);
		this.upSealed = new THREE.InstancedMesh(capsule, c.amber, n);
		this.downSealed = new THREE.InstancedMesh(capsule, c.pearl, n);
		this.group.add(this.tokens, this.pearls, this.upSealed, this.downSealed);
		this.update(0);
	}

	/* ---------- a few soft clouds, far below ---------- */
	private clouds() {
		const rand = seeded(11);
		const tex = Array.from({ length: 4 }, (_, i) => paintCloud(300 + i * 31, i / 3));
		for (let i = 0; i < 26; i++) {
			const a = rand() * Math.PI * 2;
			const r = 10 + rand() * 70;
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 4], transparent: true, opacity: 0.85, depthWrite: false }));
			const w = 14 + rand() * 18;
			s.scale.set(w, w / 2, 1);
			s.position.set(r * Math.cos(a), -14 - rand() * 6, -24 + r * Math.sin(a) * 0.7);
			this.group.add(s);
		}
	}

	/* ---------- the model, on the tower's roof ---------- */
	private model() {
		// Fed from below: no hose at its crown, a glass pedestal under it with the two lanes inside, standing on the roof.
		const brain = new Brain('stem');
		brain.group.position.set(P.MODEL.stem.x - P.MODEL.stemX, P.ROOF_Y - STEM_FOOT, P.MODEL.stem.z);
		this.group.add(brain.group);
		this.brain = brain;
	}

	private tube(b: Batch, pts: V3[], r: number, mat: THREE.Material) {
		const curve = new THREE.CatmullRomCurve3(pts.map((p) => v(...p)), false, 'catmullrom', 0.1);
		b.add(new THREE.TubeGeometry(curve, 40, r, 8), mat);
	}

	update(time: number) {
		const q = new THREE.Quaternion();
		const one = new THREE.Vector3(1, 1, 1);
		const none = new THREE.Vector3(0, 0, 0);
		const axis = new THREE.Vector3(0, 1, 0);
		/**
		 * Each lane's cargo along its curve: sealed capsules on the side of `seal` towards home, tokens past it. The
		 * request is cut into tokens by the tokenizer, the reply sealed again by the detokenizer's press.
		 */
		const place = (tokens: THREE.InstancedMesh, sealed: THREE.InstancedMesh, curve: THREE.Curve<THREE.Vector3>, seal: number, speed: number) => {
			const n = tokens.count;
			for (let i = 0; i < n; i++) {
				const u = (i / n + time * speed) % 1;
				const p = curve.getPointAt(u);
				p.y += 0.32;
				const home = p.z > seal;
				q.setFromUnitVectors(axis, curve.getTangentAt(u));
				this.m.compose(p, home ? q : q.identity(), home ? none : one);
				tokens.setMatrixAt(i, this.m);
				this.m.compose(p, q.setFromUnitVectors(axis, curve.getTangentAt(u)), home ? one : none);
				sealed.setMatrixAt(i, this.m);
			}
			tokens.instanceMatrix.needsUpdate = true;
			sealed.instanceMatrix.needsUpdate = true;
		};
		place(this.tokens, this.upSealed, this.up, P.TOKENIZER.from - 3.5, 0.008);
		place(this.pearls, this.downSealed, this.down, P.HALL.from - 1.8, 0.008);
		this.brain?.update(6.9, time);
		this.tower.update(time);
		this.gatehouse.update(time);
		this.hall.update(time);
	}
}
