import * as THREE from 'three';
import { hitBall } from '../poke';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect, sweep } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { hash, seg, smooth } from '../kit/math';
import { islandAt, machine, shadowOn } from '../kit/machines';
import { createCastShadow } from './island';

/*
 * The model, as what it is: a very large brain, built by someone who only knows how to make machines.
 * Long axis along X with the front at +X, the fissure in the plane z = 0, and the near side facing +Z.
 * Origin at the middle of the brain. Every fold is a fat glazed pipe laid over the shell, the same
 * family as the pipes that have carried the request here.
 */

const A = 6.4;
const B = 4.4;
const OUTER = 3;
const INNER = 2.7;
const OFFSET = 2.2;
const SPACING = 0.66;
const PIPE = 0.43;
const RADIAL = 12;

/** Height of the flat seat the intake stands on, above the brain's centre. */
export const BRAIN_SEAT = 0.9 * B;
/** The stem and pedestal go down this far below the brain's centre, to the island's top. */
export const BRAIN_FOOT = 7.5;

const gauss = (v: number, m: number, s: number) => Math.exp(-(((v - m) / s) ** 2));
const smoothstep = (a: number, b: number, v: number) => smooth(seg(v, a, b));

/** A point on the surface of one hemisphere. `d` is a unit direction, side is +1 for the near half. */
function surface(d: THREE.Vector3, side: number, out: THREE.Vector3) {
	const front = smoothstep(0.1, 1, d.x);
	let x = d.x * A;
	let y = d.y * B * (d.y < 0 ? 0.76 : 1) * (1 - 0.1 * front);
	let z = d.z * (d.z > 0 ? OUTER : INNER) * (1 - 0.18 * front);
	// The temporal lobe: low, forward, and pushing outward.
	const temporal = gauss(d.x, 0.36, 0.42) * gauss(d.y, -0.62, 0.4) * smoothstep(-0.1, 0.4, d.z);
	y -= temporal * 1;
	z += temporal * 0.3;
	x += temporal * 0.2;
	// Room behind and below for the cerebellum.
	const back = gauss(d.x, -0.8, 0.36) * gauss(d.y, -0.6, 0.42);
	y += back * 1.2;
	x += back * 1;
	return out.set(x, y, (z + OFFSET) * side);
}

const tangentA = new THREE.Vector3();
const tangentB = new THREE.Vector3();
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const dd = new THREE.Vector3();

function normalAt(d: THREE.Vector3, side: number, out: THREE.Vector3) {
	tangentA.set(d.y, -d.x, 0.13).cross(d).normalize();
	tangentB.copy(d).cross(tangentA).normalize();
	surface(d, side, p0);
	surface(dd.copy(d).addScaledVector(tangentA, 0.012).normalize(), side, p1);
	surface(dd.copy(d).addScaledVector(tangentB, 0.012).normalize(), side, p2);
	out.copy(p1.sub(p0)).cross(p2.sub(p0)).normalize();
	// Point it away from the middle of this half.
	if (out.x * p0.x + out.y * p0.y + out.z * (p0.z - OFFSET * side) < 0) out.negate();
	return out;
}

/** Fat tubes that follow the surface, with rounded ends and their own baked shade in the creases. */
class FoldBuilder {
	pos: number[] = [];
	col: number[] = [];
	uv: number[] = [];
	idx: number[] = [];

	add(dirs: THREE.Vector3[], side: number, tone: number, phase: number) {
		const start = this.pos.length / 3;
		const rings: { c: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3; r: number; s: number }[] = [];
		const spline = new THREE.CatmullRomCurve3(dirs, false, 'centripetal');
		const steps = Math.max(10, dirs.length * 8);
		const c = new THREE.Vector3();
		const last = new THREE.Vector3();
		let run = 0;
		const samples: { c: THREE.Vector3; n: THREE.Vector3 }[] = [];
		for (let i = 0; i <= steps; i++) {
			spline.getPoint(i / steps, dd);
			const d = dd.clone().normalize();
			surface(d, side, c);
			const n = new THREE.Vector3();
			normalAt(d, side, n);
			samples.push({ c: c.clone(), n });
		}
		const tangent = new THREE.Vector3();
		samples.forEach((sample, i) => {
			const a = samples[Math.max(0, i - 1)].c;
			const b = samples[Math.min(samples.length - 1, i + 1)].c;
			tangent.copy(b).sub(a).normalize();
			const bi = new THREE.Vector3().crossVectors(tangent, sample.n).normalize();
			const nn = new THREE.Vector3().crossVectors(bi, tangent).normalize();
			if (i > 0) run += sample.c.distanceTo(last);
			last.copy(sample.c);
			// Rounded ends: a few extra rings closing the tube like the end of a sausage.
			if (i === 0 || i === samples.length - 1) {
				const dir = i === 0 ? -1 : 1;
				const order = i === 0 ? [4, 3, 2, 1] : [];
				order.forEach((k) => {
					const phi = (k / 4) * (Math.PI / 2);
					rings.push({ c: sample.c.clone().addScaledVector(tangent, dir * PIPE * Math.sin(phi)), n: nn, b: bi, r: PIPE * Math.cos(phi), s: run });
				});
			}
			rings.push({ c: sample.c.clone(), n: nn, b: bi, r: PIPE, s: run });
			if (i === samples.length - 1) {
				[1, 2, 3, 4].forEach((k) => {
					const phi = (k / 4) * (Math.PI / 2);
					rings.push({ c: sample.c.clone().addScaledVector(tangent, PIPE * Math.sin(phi)), n: nn, b: bi, r: PIPE * Math.cos(phi), s: run });
				});
			}
		});
		rings.forEach((ring) => {
			for (let j = 0; j <= RADIAL; j++) {
				const a = (j / RADIAL) * Math.PI * 2;
				const ca = Math.cos(a);
				const sa = Math.sin(a);
				this.pos.push(ring.c.x + ring.r * (ca * ring.n.x + sa * ring.b.x), ring.c.y + ring.r * (ca * ring.n.y + sa * ring.b.y), ring.c.z + ring.r * (ca * ring.n.z + sa * ring.b.z));
				// Baked crease shade: the crown of a fold is full colour, its flanks fall into the dark.
				const shade = (0.16 + 0.84 * smoothstep(-0.55, 0.72, ca)) * tone;
				this.col.push(shade, shade, shade);
				this.uv.push(ring.s + phase, j / RADIAL);
			}
		});
		for (let i = 0; i < rings.length - 1; i++) {
			for (let j = 0; j < RADIAL; j++) {
				const a = start + i * (RADIAL + 1) + j;
				const b = a + RADIAL + 1;
				this.idx.push(a, a + 1, b, b, a + 1, b + 1);
			}
		}
	}

	build() {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
		g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
		g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
		g.setIndex(this.idx);
		g.computeVertexNormals();
		return g;
	}
}

export function gearShape(teeth: number, pitch: number, holes = 0) {
	const shape = new THREE.Shape();
	const step = (Math.PI * 2) / teeth;
	const root = pitch - 0.075;
	const tip = pitch + 0.065;
	for (let i = 0; i < teeth; i++) {
		const a = i * step;
		const pts: [number, number][] = [
			[root, a - step * 0.3],
			[tip, a - step * 0.15],
			[tip, a + step * 0.15],
			[root, a + step * 0.3]
		];
		pts.forEach(([r, t], k) => {
			const x = Math.cos(t) * r;
			const y = Math.sin(t) * r;
			if (i === 0 && k === 0) shape.moveTo(x, y);
			else shape.lineTo(x, y);
		});
	}
	shape.closePath();
	for (let i = 0; i < holes; i++) {
		const a = (i / holes) * Math.PI * 2;
		const hole = new THREE.Path();
		hole.absarc(Math.cos(a) * pitch * 0.55, Math.sin(a) * pitch * 0.55, pitch * 0.2, 0, Math.PI * 2, true);
		shape.holes.push(hole);
	}
	return shape;
}

export class Brain {
	group = new THREE.Group();
	private pulses: THREE.CanvasTexture;
	private foldMat: THREE.MeshPhysicalMaterial;
	private gears: { mesh: THREE.Object3D; rate: number; phase: number }[] = [];
	private lamps: Lamp[] = [];
	hit!: THREE.Mesh;
	private excited = 0;
	private extraTurn = 0;
	private lastUpdate = 0;

	constructor() {
		// What runs along the folds. One soft band every so often, drifting.
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 4;
		const c = canvas.getContext('2d')!;
		c.fillStyle = '#000';
		c.fillRect(0, 0, 512, 4);
		const band = c.createLinearGradient(0, 0, 70, 0);
		band.addColorStop(0, 'rgba(255,255,255,0)');
		band.addColorStop(0.75, 'rgba(255,255,255,1)');
		band.addColorStop(1, 'rgba(255,255,255,0)');
		c.fillStyle = band;
		c.fillRect(0, 0, 70, 4);
		this.pulses = new THREE.CanvasTexture(canvas);
		this.pulses.wrapS = THREE.RepeatWrapping;
		this.pulses.repeat.set(1 / 11, 1);
		this.foldMat = new THREE.MeshPhysicalMaterial({
			color: color.cobalt,
			roughness: 0.3,
			metalness: 0.08,
			clearcoat: 0.9,
			clearcoatRoughness: 0.18,
			vertexColors: true,
			emissive: '#7cc4ff',
			emissiveMap: this.pulses,
			emissiveIntensity: 0.25
		});

		const porthole = new THREE.Vector3(0.1, 0.22, 0.97).normalize();
		const portAt = surface(porthole, 1, new THREE.Vector3()).clone();

		[1, -1].forEach((side) => this.buildHalf(side, side > 0 ? portAt : null));
		this.buildPorthole(porthole, portAt);
		this.buildKeel();
		this.buildCerebellum();
		this.buildStem();
	}

	private buildHalf(side: number, keepClear: THREE.Vector3 | null) {
		// The shell the folds lie on: the colour of the creases.
		const rows = 72;
		const cols = 110;
		const pos: number[] = [];
		const idx: number[] = [];
		const d = new THREE.Vector3();
		const q = new THREE.Vector3();
		for (let i = 0; i <= rows; i++) {
			const phi = (i / rows) * Math.PI;
			for (let j = 0; j <= cols; j++) {
				const th = (j / cols) * Math.PI * 2;
				d.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
				surface(d, side, q);
				pos.push(q.x, q.y, q.z);
			}
		}
		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				const a = i * (cols + 1) + j;
				const b = a + cols + 1;
				if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
				else idx.push(a, b, a + 1, b, b + 1, a + 1);
			}
		}
		const shellGeo = new THREE.BufferGeometry();
		shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		shellGeo.setIndex(idx);
		shellGeo.computeVertexNormals();
		const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: '#0a1a50', roughness: 0.7, side: THREE.DoubleSide }));
		shell.castShadow = true;
		this.group.add(shell);

		// Even points over the surface, then walks between neighbours: that is what makes it a labyrinth.
		const nodes: { d: THREE.Vector3; p: THREE.Vector3 }[] = [];
		const seed = side > 0 ? 11 : 57;
		for (let i = 0; i < 16000 && nodes.length < 620; i++) {
			const u = hash(i * 1.37 + seed) * 2 - 1;
			const t = hash(i * 2.71 + seed * 3) * Math.PI * 2;
			const r = Math.sqrt(1 - u * u);
			const dir = new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
			const p = surface(dir, side, new THREE.Vector3());
			// Clear of the spine, the intake's seat and the porthole.
			if (Math.abs(p.z) < 0.96) continue;
			if (p.y > BRAIN_SEAT - 1 && Math.abs(p.x) < 2.25 && Math.abs(p.z) < 2.4) continue;
			if (keepClear && p.distanceTo(keepClear) < 2.32) continue;
			if (nodes.some((n) => n.p.distanceTo(p) < SPACING)) continue;
			nodes.push({ d: dir, p });
		}
		const near = nodes.map((n) => nodes.map((o, k) => (o !== n && n.p.distanceTo(o.p) < SPACING * 1.75 ? k : -1)).filter((k) => k >= 0));
		const used = new Array(nodes.length).fill(false);
		const paths: number[][] = [];
		const heading = new THREE.Vector3();
		const step = new THREE.Vector3();
		nodes.forEach((_, startRaw) => {
			const start = (startRaw * 37 + seed) % nodes.length;
			if (used[start]) return;
			used[start] = true;
			const path = [start];
			const longest = 4 + Math.floor(hash(start * 5.3 + seed) * 9);
			let at = start;
			heading.set(hash(start) - 0.5, hash(start + 9) - 0.5, hash(start + 21) - 0.5).normalize();
			while (path.length < longest) {
				let best = -1;
				let score = -Infinity;
				near[at].forEach((k) => {
					if (used[k]) return;
					step.copy(nodes[k].p).sub(nodes[at].p).normalize();
					const along = step.dot(heading);
					if (along < -0.05) return; // no hairpins: a pipe this fat cannot bend that tight
					const s = along + (hash(k * 3.3 + at) - 0.5) * 0.8;
					if (s > score) {
						score = s;
						best = k;
					}
				});
				if (best < 0) break;
				step.copy(nodes[best].p).sub(nodes[at].p).normalize();
				heading.lerp(step, 0.5).normalize();
				used[best] = true;
				path.push(best);
				at = best;
			}
			paths.push(path);
		});
		// Lone points join the nearest fold end rather than sit there as a pimple.
		const singles = paths.filter((p) => p.length === 1);
		singles.forEach((single) => {
			const host = paths.find((p) => p.length > 1 && p.length < 12 && near[single[0]].includes(p[p.length - 1]));
			if (host) {
				host.push(single[0]);
				single.length = 0;
			}
		});
		const builder = new FoldBuilder();
		paths.forEach((path, i) => {
			if (path.length === 0) return;
			const dirs = path.length === 1 ? [nodes[path[0]].d.clone(), nodes[path[0]].d.clone().add(new THREE.Vector3(0.02, 0.01, 0)).normalize()] : path.map((k) => nodes[k].d);
			builder.add(dirs, side, 0.92 + hash(i * 7.7) * 0.16, hash(i * 2.2) * 11);
		});
		const folds = new THREE.Mesh(builder.build(), this.foldMat);
		folds.castShadow = true;
		folds.receiveShadow = true;
		this.group.add(folds);
		folds.geometry.computeBoundingSphere();
		const round = folds.geometry.boundingSphere!;
		this.hit = hitBall(round.radius);
		this.hit.position.copy(round.center);
		this.group.add(this.hit);
	}

	/* ---- a window in the side, with the works turning behind it ---- */
	private buildPorthole(dir: THREE.Vector3, at: THREE.Vector3) {
		const m = mats();
		const n = normalAt(dir, 1, new THREE.Vector3());
		const port = new THREE.Group();
		port.position.copy(at).addScaledVector(n, 0.12);
		port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
		const R = 1.66;
		const b = new Batch();
		b.add(new THREE.CylinderGeometry(R + 0.3, R + 0.42, 0.9, 72, 1, true), m.steelSoft, { p: [0, 0, -0.42], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(R + 0.1, 0.17, 18, 96), m.steel, { p: [0, 0, 0.08] });
		const bolt = new THREE.CylinderGeometry(0.06, 0.07, 0.07, 8);
		for (let i = 0; i < 14; i++) {
			const a = (i / 14) * Math.PI * 2;
			b.add(bolt, m.steelSoft, { p: [Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), 0.26], r: [Math.PI / 2, 0, 0] });
		}
		port.add(b.build('porthole'));
		const back = new THREE.Mesh(new THREE.CircleGeometry(R + 0.04, 72), new THREE.MeshStandardMaterial({ color: '#0b1838', roughness: 0.6 }));
		back.position.z = 0.03;
		port.add(back);

		// Three gears that really mesh: pitch radii add up to their centre distances, and rates go by tooth count.
		const big = { t: 18, r: 0.86, x: -0.66, y: -0.12 };
		const mid = { t: 11, r: 0.86 * (11 / 18), x: 0, y: 0 };
		const lit = { t: 8, r: 0.86 * (8 / 18), x: 0, y: 0 };
		const a1 = 0.62;
		mid.x = big.x + Math.cos(a1) * (big.r + mid.r);
		mid.y = big.y + Math.sin(a1) * (big.r + mid.r);
		const a2 = -1.1;
		lit.x = mid.x + Math.cos(a2) * (mid.r + lit.r);
		lit.y = mid.y + Math.sin(a2) * (mid.r + lit.r);
		const gear = (g: typeof big, holes: number, rate: number, phase: number) => {
			const piece = new Batch();
			piece.add(extrude(gearShape(g.t, g.r, holes), 0.14, 0.02, 2, 16), m.gold);
			piece.add(new THREE.CylinderGeometry(g.r * 0.2, g.r * 0.2, 0.22, 20), m.steel, { r: [Math.PI / 2, 0, 0] });
			const mesh = piece.build('gear');
			mesh.position.set(g.x, g.y, 0.18);
			port.add(mesh);
			this.gears.push({ mesh, rate, phase });
		};
		// Tooth index along the line of centres stays constant as they turn, which fixes each one's starting angle.
		const s1 = (Math.PI * 2) / big.t;
		const s2 = (Math.PI * 2) / mid.t;
		const s3 = (Math.PI * 2) / lit.t;
		const phi2 = a1 + Math.PI - s2 * (0.5 - a1 / s1);
		const phi3 = a2 + Math.PI - s3 * (0.5 - (a2 - phi2) / s2);
		gear(big, 5, 1, 0);
		gear(mid, 4, -big.t / mid.t, phi2);
		gear(lit, 0, big.t / lit.t, phi3);

		const glass = new THREE.Mesh(
			new THREE.CircleGeometry(R, 72),
			new THREE.MeshPhysicalMaterial({ color: '#d5ecff', transparent: true, opacity: 0.13, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, envMapIntensity: 0.5 })
		);
		glass.position.z = 0.27;
		glass.renderOrder = 5;
		port.add(glass);
		this.group.add(port);
	}

	/* ---- the spine in the fissure, flush with the seat at its highest point ---- */
	private buildKeel() {
		const m = mats();
		const Y = BRAIN_SEAT;
		const X = A * 0.95;
		const points: THREE.Vector3[] = [];
		for (let i = 0; i <= 60; i++) {
			const a = THREE.MathUtils.lerp(0.34, Math.PI - 0.46, i / 60);
			points.push(new THREE.Vector3(Math.cos(a) * X, Math.sin(a) * Y, 0));
		}
		const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
		path.arcLengthDivisions = 300;
		const W = 0.72;
		const profile: [number, number][] = [
			[-W, -2.4],
			[-W, -0.09],
			[-W + 0.09, 0],
			[W - 0.09, 0],
			[W, -0.09],
			[W, -2.4]
		];
		const keel = new THREE.Mesh(sweep(path, profile, 180), new THREE.MeshStandardMaterial({ color: '#99a3b4', metalness: 0.6, roughness: 0.4 }));
		keel.castShadow = true;
		keel.receiveShadow = true;
		this.group.add(keel);
		const b = new Batch();
		const up = new THREE.Vector3();
		for (let i = 1; i < 26; i++) {
			const u = i / 26;
			if (Math.abs(u - 0.5) < 0.17) continue;
			const p = path.getPointAt(u);
			const t = path.getTangentAt(u);
			up.set(-t.y, t.x, 0);
			if (up.y < 0) up.negate();
			const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
			const e = new THREE.Euler().setFromQuaternion(q);
			for (const s of [-1, 1]) {
				b.add(new THREE.CylinderGeometry(0.075, 0.085, 0.07, 8), m.steel, { p: [p.x + up.x * 0.02, p.y + up.y * 0.02, s * 0.5], r: [e.x, e.y, e.z] });
			}
			if (i % 4 === 2) {
				const lamp = new Lamp(rbox(0.26, 0.05, 0.26, 0.02, 2), color.amber, 0.4);
				lamp.mesh.position.copy(p).addScaledVector(up, 0.02);
				lamp.mesh.quaternion.copy(q);
				this.group.add(lamp.mesh);
				this.lamps.push(lamp);
			}
		}
		this.group.add(b.build('keel-bolts'));

		// The seat the intake stands on. Its top is exactly the intake's underside.
		const seat = new Batch();
		seat.add(extrude(roundedRect(4.5, 4.7, 0.5), 0.9, 0.1, 4, 12), m.steelSoft, { p: [0, Y - 0.45, 0], r: [-Math.PI / 2, 0, 0] });
		this.group.add(seat.build('seat'));
	}

	/* ---- the cerebellum, which here is a heat sink ---- */
	private buildCerebellum() {
		const m = mats();
		const cx = -4.75;
		const cy = -2.32;
		const b = new Batch();
		const fin = new THREE.CylinderGeometry(1, 1, 0.1, 64);
		const count = 16;
		for (let i = 0; i < count; i++) {
			const k = (i + 0.5) / count;
			const y = (k - 0.5) * 3.4;
			const w = Math.sqrt(1 - (2 * k - 1) ** 2);
			const g = fin.clone();
			g.scale(2.35 * w + 0.14, 1, 3.9 * w + 0.14);
			b.add(g, i % 2 ? m.steel : m.steelSoft, { p: [cx, cy + y, 0] });
		}
		const core = new THREE.CylinderGeometry(1, 1, 3.3, 40);
		core.scale(1.5, 1, 2.8);
		b.add(core, m.recess, { p: [cx, cy, 0] });
		this.group.add(b.build('cerebellum'));
	}

	/* ---- the stem, the pedestal, and the island it all stands on ---- */
	private buildStem() {
		const m = mats();
		const sx = -1.4;
		const top = -2.5;
		const bottom = -BRAIN_FOOT + 1.72;
		const h = top - bottom;
		const b = new Batch();
		b.add(new THREE.CylinderGeometry(1.15, 1.55, h, 40), m.cream, { p: [sx, bottom + h / 2, 0] });
		[0.2, 0.55, 0.88].forEach((k) => {
			const r = THREE.MathUtils.lerp(1.55, 1.15, k) + 0.08;
			b.add(new THREE.TorusGeometry(r, 0.09, 12, 56), m.steel, { p: [sx, bottom + h * k, 0], r: [Math.PI / 2, 0, 0] });
		});
		this.group.add(b.build('stem'));

		const base = machine({ w: 8.2, h: 1.5, d: 6.2, finish: 'cream', name: 'The model', signH: 0.56, vent: false });
		base.position.set(sx, -BRAIN_FOOT, 0);
		this.group.add(base);

		const isl = islandAt(21, 15, 0.8);
		isl.position.set(sx, -BRAIN_FOOT, 0);
		this.group.add(isl);
		shadowOn(this.group, sx, -BRAIN_FOOT, 0, 8.7, 6.7, 0.46);
		const shade = createCastShadow(23, 17, 0.2);
		shade.position.set(sx, -BRAIN_FOOT - 9, 0);
		this.group.add(shade);
	}

	/** Busy while tokens pour in, otherwise ticking over. */
	/** Press it and it gets to thinking. */
	excite() {
		this.excited = 1;
	}

	update(T: number, time: number) {
		const now = performance.now();
		const dt = Math.min(0.05, (now - this.lastUpdate) / 1000);
		this.lastUpdate = now;
		this.excited *= Math.exp(-dt * 0.9);
		this.extraTurn += this.excited * dt * 7;
		const busy = smooth(seg(T, 7.2, 7.7));
		this.pulses.offset.x = -time * 0.05 - T * 0.6 - this.extraTurn * 0.4;
		this.foldMat.emissiveIntensity = 0.2 + busy * 0.75 + this.excited * 1.5;
		const turn = time * 0.5 + T * 2.2 + this.extraTurn;
		this.gears.forEach((g) => {
			g.mesh.rotation.z = turn * g.rate + g.phase;
		});
		this.lamps.forEach((lamp, i) => {
			const beat = Math.sin(time * 1.6 - i * 0.9) * 0.5 + 0.5;
			lamp.set(color.amber, 0.12 + beat * (0.2 + busy * 0.5));
		});
	}
}
