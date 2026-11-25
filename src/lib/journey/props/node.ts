import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { mats } from '../kit/materials';
import { font, Label, Surface } from '../kit/print';
import { createSign, grown } from '../kit/parts';
import { hash, inOut, lerp, outBack, seg } from '../kit/math';
import { cores, craft, fan, pipe } from '../kit/craft';

const CX = [-4.8, -1.6, 1.6, 4.8];
const CZ = [-1.6, 1.6];
const LID_TOP = 0.36;
const LID_X = -0.36;
const SLAB_W = 13;
const SLAB_D = 6.8;
const SLAB_H = 0.56;

/** The weights are numbers, so the slab is printed with numbers. */
function digits() {
	const s = new Surface(2048, Math.round((2048 * SLAB_D) / SLAB_W));
	s.draw((c, w, h) => {
		c.fillStyle = '#1f5fe0';
		c.fillRect(0, 0, w, h);
		c.font = `500 30px ${font.mono}`;
		c.textBaseline = 'middle';
		const rows = Math.floor(h / 44);
		for (let r = 0; r < rows; r++) {
			for (let k = 0; k < 18; k++) {
				const n = hash(r * 31 + k * 7.7);
				const v = (n * 4 - 2).toFixed(3);
				c.fillStyle = `rgba(190,220,255,${0.3 + hash(r + k * 3.1) * 0.35})`;
				c.fillText(n < 0.5 ? v : ` ${v}`, 16 + k * 113, 26 + r * 44);
			}
		}
	});
	return s.texture;
}

/** One node: eight accelerators, each with its own stacks of HBM, tied together by NVLink. */
export class Node3D {
	group = new THREE.Group();
	private fixed = new THREE.Group();
	private links: THREE.MeshStandardMaterial;
	/** The fan wall's rotors, which turn while the chips work. */
	private rotors: THREE.Object3D[] = [];
	private pieces: THREE.Mesh[] = [];
	private slab: THREE.Group;
	private sign: THREE.Group;
	private PW = SLAB_W / 4;
	private PD = SLAB_D / 2;

	constructor() {
		const m = mats();
		const b = new Batch();
		this.links = (m.gold as THREE.MeshStandardMaterial).clone();
		this.links.emissive = new THREE.Color('#ffb040');
		const linksBatch = new Batch();
		const accel = new Label('Accelerator', 0.2, { color: '#ffffff', weight: 700 });
		const hbmLabel = new Label('HBM', 0.16, { color: '#06351c', weight: 800 });

		// Each chip's lid shows its cores, as the pools' chips do.
		const coreMap = cores(7, 7);
		const lid = new THREE.MeshStandardMaterial({ map: coreMap, emissiveMap: coreMap, color: '#ffffff', emissive: '#6fb6ff', emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.2 });
		// The board itself: a dark plate, so the chips stand out from the white pad.
		b.add(rbox(13.6, 0.06, 6.9, 0.02, 2), m.slate, { p: [0, 0.03, 0] });
		for (const x of CX) {
			for (const z of CZ) {
				b.add(rbox(2.7, 0.08, 2.7, 0.03, 2), m.recess, { p: [x, 0.1, z] });
				b.add(rbox(1.55, 0.22, 1.55, 0.06, 3), lid, { p: [x + LID_X, 0.25, z] });
				const face = accel.mesh.clone();
				face.rotation.x = -Math.PI / 2;
				face.position.set(x + LID_X, 0.143, z + 1.08);
				this.fixed.add(face);
				for (const s of [-0.62, 0.62]) {
					for (let i = 0; i < 5; i++) {
						b.add(rbox(0.74, 0.058, 0.92, 0.014, 1), m.hbm, { p: [x + 0.92, 0.18 + i * 0.074, z + s * 0.9] });
					}
					const tag = hbmLabel.mesh.clone();
					tag.rotation.x = -Math.PI / 2;
					tag.position.set(x + 0.92, 0.18 + 4 * 0.074 + 0.032, z + s * 0.9);
					this.fixed.add(tag);
				}
				for (let i = -2; i <= 2; i++) {
					linksBatch.add(rbox(0.3, 0.012, 0.05), this.links, { p: [x + 0.42, 0.147, z + i * 0.24] });
				}
			}
		}
		// NVLink: gold ribbons between neighbouring chips, across and along.
		for (let i = 0; i < 3; i++) {
			for (const z of CZ) {
				for (let k = -2; k <= 2; k++) {
					linksBatch.add(rbox(0.56, 0.03, 0.09, 0.01, 1), this.links, { p: [(CX[i] + CX[i + 1]) / 2, 0.08, z + k * 0.26] });
				}
			}
		}
		for (const x of CX) {
			for (let k = -2; k <= 2; k++) {
				linksBatch.add(rbox(0.09, 0.03, 0.56, 0.01, 1), this.links, { p: [x + k * 0.26, 0.08, 0] });
			}
		}

		// The chassis: a cream tray with low walls and a chrome cap along them, two chrome handles and a row of status
		// lamps on its front, a fan wall down its right side, coolant along its back in chrome clamps, and each chip
		// seated in a chrome frame with a screw at each corner.
		const c = craft();
		const wall = (w: number, d: number, x: number, z: number) => {
			b.add(rbox(w, 0.34, d, 0.08, 3), m.cream, { p: [x, 0.17, z] });
			b.add(rbox(w + 0.02, 0.03, d + 0.02, 0.012, 1), c.chrome, { p: [x, 0.35, z] });
		};
		wall(13.9, 0.26, 0, -3.5);
		wall(13.9, 0.26, 0, 3.5);
		wall(0.26, 7.2, -6.95, 0);
		wall(0.26, 7.2, 6.95, 0);
		for (const s of [-1, 1]) {
			const hx = s * 5.9;
			pipe(b, [[hx - 0.45, 0.2, 3.63], [hx - 0.45, 0.2, 3.95], [hx, 0.2, 4.05], [hx + 0.45, 0.2, 3.95], [hx + 0.45, 0.2, 3.63]], 0.045, c.chrome, 9);
		}
		for (let i = 0; i < 10; i++) b.add(rbox(0.1, 0.06, 0.03, 0.02, 1), i % 4 === 3 ? new THREE.MeshBasicMaterial({ color: '#ffbc12' }) : new THREE.MeshBasicMaterial({ color: '#3fe583' }), { p: [-1.35 + i * 0.3, 0.2, 3.64] });
		for (const x of CX) {
			for (const z of CZ) {
				const ring = new THREE.Shape();
				ring.moveTo(-1.4, -1.4);
				ring.lineTo(1.4, -1.4);
				ring.lineTo(1.4, 1.4);
				ring.lineTo(-1.4, 1.4);
				ring.closePath();
				const hole = new THREE.Path();
				hole.moveTo(-1.3, -1.3);
				hole.lineTo(1.3, -1.3);
				hole.lineTo(1.3, 1.3);
				hole.lineTo(-1.3, 1.3);
				hole.closePath();
				ring.holes.push(hole);
				b.add(new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: false }).rotateX(-Math.PI / 2), c.chrome, { p: [x, 0.06, z] });
				for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), c.gunmetal, { p: [x + sx * 1.35, 0.125, z + sz * 1.35] });
			}
		}
		for (const z of [-2.95, -3.15]) pipe(b, [[-6.4, 0.22, z], [-2, 0.22, z], [2, 0.22, z], [6.1, 0.22, z]], 0.06, c.coolant, 1.1);
		this.fixed.add(b.build('node'));
		// The fan wall: six fans in a cream housing against the chassis's right wall, blowing out. Built lying down, its
		// fans looking up, and stood up so they look out to the right along its length.
		const fb = new Batch();
		fb.add(rbox(7.0, 0.5, 0.92, 0.1, 3), m.cream, { p: [0, -0.25, 0] });
		fb.add(rbox(7.04, 0.04, 0.96, 0.015, 1), c.chrome, { p: [0, -0.02, 0] });
		for (let i = 0; i < 6; i++) this.rotors.push(fan(fb, 0.36, [-2.92 + i * 1.17, 0.06, 0]));
		const fanWall = new THREE.Group();
		fanWall.add(fb.build('fan-wall'), ...this.rotors);
		fanWall.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
		fanWall.position.set(7.58, 0.52, 0);
		this.fixed.add(fanWall);
		this.fixed.add(linksBatch.build('nvlink'));
		this.group.add(this.fixed);

		// Solid until the moment it splits, so there is no seam to see.
		const map = digits();
		const body = (w: number, d: number, u0: number, u1: number, v0: number, v1: number) => {
			const g = new THREE.Group();
			const mesh = new THREE.Mesh(rbox(w, SLAB_H, d, 0.07, 3), m.cobalt);
			mesh.castShadow = true;
			g.add(mesh);
			const plane = new THREE.PlaneGeometry(w - 0.14, d - 0.14);
			const uv = plane.attributes.uv as THREE.BufferAttribute;
			for (let i = 0; i < uv.count; i++) {
				uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
			}
			const top = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map, roughness: 0.4 }));
			top.rotation.x = -Math.PI / 2;
			top.position.y = SLAB_H / 2 + 0.002;
			g.add(top);
			return g;
		};
		this.slab = body(SLAB_W, SLAB_D, 0, 1, 0, 1);
		this.group.add(this.slab);
		CX.forEach((x, ci) => {
			CZ.forEach((z, ri) => {
				const piece = body(this.PW - 0.01, this.PD - 0.01, ci / 4, (ci + 1) / 4, 1 - (ri + 1) / 2, 1 - ri / 2) as unknown as THREE.Mesh;
				piece.userData = { x, z };
				this.group.add(piece);
				this.pieces.push(piece);
			});
		});

		this.sign = createSign('The model’s weights', 0.42);
		this.sign.rotation.x = -0.42;
		this.group.add(this.sign);
	}

	/** A copy for the aisle behind: same parts and materials, no slab. */
	farCopy() {
		const copy = new THREE.Group();
		copy.add(this.fixed.clone());
		return copy;
	}

	/** drop: slab comes down into view. split: it breaks apart and each slice lands on a chip. */
	update(drop: number, split: number, active: number, time: number) {
		const hover = lerp(9, 3.7, outBack(drop, 0.9));
		const sep = inOut(seg(split, 0.04, 0.42));
		const land = inOut(seg(split, 0.38, 1));
		const whole = split <= 0.04;
		this.slab.visible = whole && drop > 0.001;
		this.slab.position.set(0, hover, 0);
		this.pieces.forEach((piece, i) => {
			const { x, z } = piece.userData as { x: number; z: number };
			piece.visible = !whole;
			if (whole) return;
			const stagger = seg(land, i * 0.05, 0.6 + i * 0.05);
			const px = x * 1.0156 * (1 + sep * 0.1);
			const pz = (z / 1.6) * (SLAB_D / 4) * (1 + sep * 0.3);
			const thin = lerp(1, 0.2, stagger);
			piece.position.set(
				lerp(px, x + LID_X, stagger),
				lerp(hover, LID_TOP + (SLAB_H * thin) / 2, stagger),
				lerp(pz, z, stagger)
			);
			piece.scale.set(lerp(1, 0.46, stagger), thin, lerp(1, 0.44, stagger));
		});
		const s = 1 - seg(split, 0, 0.05);
		this.sign.visible = drop > 0.001 && s > 0.001;
		this.sign.scale.setScalar(Math.max(0.001, s));
		this.sign.position.set(0, hover + SLAB_H / 2 + 0.34 + grown(0.42), 2.2);
		this.links.emissiveIntensity = active * (0.5 + 0.5 * Math.sin(time * 4)) * 1.5;
		this.rotors.forEach((r, i) => (r.rotation.y = time * (2 + active * 10) + i));
	}
}
