import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { font, Label } from '../kit/print';
import { createSign, plinth, ventX } from '../kit/parts';
import { bell, inOut, outBack, seg, smooth } from '../kit/math';

const CW = 4.3;
const CH = 4.9;
const CD = 2.3;
const ROW_H = 0.62;
const WORDS = ['Fix', 'the', 'race', 'condition', 'in', 'the'];
const AX = 5.2;

const letter = (text: string, ink = '#06351c') => new Label(text, 0.3, { color: ink, weight: 800 });

/**
 * Two machines, as in the book: a cabinet that stores keys and values, one row per token,
 * and the attention machine that writes them once and reads them back forever after.
 */
export class KvCache {
	group = new THREE.Group();
	private rows: { kv: THREE.Mesh[]; from: THREE.Vector3; lamp: Lamp; y: number }[] = [];
	private q: THREE.Mesh;
	private qMat: THREE.MeshStandardMaterial;
	private readPulse: THREE.Mesh[] = [];
	private readCurve: THREE.CatmullRomCurve3;
	private writeCurve: THREE.CatmullRomCurve3;
	private blockMat: THREE.MeshPhysicalMaterial;
	/** The K and the V on the machine's face: what gets stored is a copy of what it just made. */
	private made = [new THREE.Vector3(AX + 0.68, 1.82, 1.46), new THREE.Vector3(AX + 0.68, 0.94, 1.46)];

	constructor() {
		// Its name lets the conversation point at it: see pointer.svelte.ts.
		this.group.name = 'KV cache';
		const m = mats();
		const b = new Batch();

		// The cabinet: same silhouette and finish as the harness, because it is the same kind of thing.
		plinth(b, CW + 0.34, CD + 0.34, 0.14);
		const Y0 = 0.14;
		const shell = chamferRect(CW, CH, 0.38, 0.1);
		const oh = ROW_H * WORDS.length + 0.2;
		const oy = Y0 + 0.26 + oh / 2;
		const hole = new THREE.Path();
		const hw = CW / 2 - 0.2;
		const hy = oy - Y0 - CH / 2;
		hole.moveTo(-hw, hy - oh / 2);
		hole.lineTo(hw, hy - oh / 2);
		hole.lineTo(hw, hy + oh / 2);
		hole.lineTo(-hw, hy + oh / 2);
		hole.closePath();
		shell.holes.push(hole);
		b.add(extrude(shell, CD, 0.085, 6, 10), m.cream, { p: [0, Y0 + CH / 2, 0] });
		b.add(rbox(hw * 2 + 0.06, oh + 0.06, CD - 0.3, 0.02, 1), m.recess, { p: [0, oy, -0.1] });
		ventX(b, CW / 2 + 0.002, oy, -0.2, oh - 0.5, 1.2, 12);

		// One drawer per token, with two bays for its key and value.
		const front = extrude(roundedRect(hw * 2 - 0.08, ROW_H - 0.07, 0.07), 0.1, 0.028, 4, 10);
		const bay = rbox(0.68, ROW_H - 0.2, 0.03, 0.02, 2);
		WORDS.forEach((_, i) => {
			const y = oy + oh / 2 - 0.1 - (i + 0.5) * ROW_H;
			b.add(front, m.creamLight, { p: [0, y, CD / 2 - 0.1] });
			b.add(bay, m.recess, { p: [0.28, y, CD / 2 - 0.038] });
			b.add(bay, m.recess, { p: [1.08, y, CD / 2 - 0.038] });
		});
		this.group.add(b.build('kv-cabinet'));

		const sign = createSign('KV cache', 0.25);
		sign.position.set(0, oy + oh / 2 + 0.42, CD / 2 + 0.03);
		this.group.add(sign);

		this.blockMat = (m.hbm as THREE.MeshPhysicalMaterial).clone();
		const geo = rbox(0.62, ROW_H - 0.22, 0.3, 0.05, 3);
		const K = letter('K');
		const V = letter('V');
		WORDS.forEach((word, i) => {
			const y = oy + oh / 2 - 0.1 - (i + 0.5) * ROW_H;
			const name = new Label(word, 0.23, { font: font.mono, weight: 600, align: 'left' });
			name.mesh.position.set(-hw + 0.2, y, CD / 2 - 0.04 + 0.025);
			this.group.add(name.mesh);
			const lamp = new Lamp(rbox(0.09, 0.09, 0.024, 0.03, 3), color.amber, 0.2);
			lamp.mesh.position.set(hw - 0.2, y, CD / 2 - 0.035);
			this.group.add(lamp.mesh);
			const kv = [K, V].map((l, j) => {
				const mesh = new THREE.Mesh(geo, this.blockMat);
				mesh.castShadow = true;
				const face = l.mesh.clone();
				face.position.z = 0.153;
				mesh.add(face);
				mesh.position.set(0.28 + j * 0.8, y, CD / 2 + 0.1);
				mesh.visible = false;
				this.group.add(mesh);
				return mesh;
			});
			this.rows.push({ kv, from: new THREE.Vector3(), lamp, y });
		});

		// Attention: the cobalt machine, with what it does on its face.
		const a = new Batch();
		const AW = 3.8;
		const AH = 3.7;
		const AD = 2.6;
		const panel = new THREE.Group();
		panel.position.x = AX;
		plinth(a, AW + 0.34, AD + 0.34, 0.14);
		a.add(extrude(chamferRect(AW, AH, 0.42, 0.14), AD, 0.09, 6, 10), m.cobalt, { p: [0, 0.14 + AH / 2, 0] });
		a.add(extrude(roundedRect(AW - 0.6, 1.9, 0.14), 0.05, 0.016, 2, 8), m.recess, { p: [0, 1.38, AD / 2 + 0.012] });
		// K and V, always there. Q is the one that changes.
		const big = rbox(0.86, 0.76, 0.14, 0.09, 3);
		a.add(big, m.hbm, { p: [0.68, 1.82, AD / 2 + 0.1] });
		a.add(big, m.hbm, { p: [0.68, 0.94, AD / 2 + 0.1] });
		for (const y of [1.82, 0.94]) a.add(rbox(0.5, 0.05, 0.05, 0.02, 1), m.steel, { p: [-0.02, y, AD / 2 + 0.06] });
		a.add(rbox(0.05, 0.93, 0.05, 0.02, 1), m.steel, { p: [-0.26, 1.38, AD / 2 + 0.06] });
		panel.add(a.build('attention'));
		const label = (t: string, x: number, y: number, ink = '#06351c', z = 0.176) => {
			const l = new Label(t, 0.46, { color: ink, weight: 800 });
			l.mesh.position.set(x, y, AD / 2 + z);
			panel.add(l.mesh);
		};
		label('K', 0.68, 1.82);
		label('V', 0.68, 0.94);
		this.qMat = new THREE.MeshStandardMaterial({ color: color.amber, emissive: '#ff9600', emissiveIntensity: 0.6, roughness: 0.3 });
		this.q = new THREE.Mesh(rbox(0.86, 0.86, 0.16, 0.1, 3), this.qMat);
		this.q.position.set(-0.86, 1.38, AD / 2 + 0.1);
		panel.add(this.q);
		label('Q', -0.86, 1.38, color.ink, 0.19);
		const asign = createSign('Attention', 0.25);
		asign.position.set(0, 3.02, AD / 2 + 0.03);
		panel.add(asign);
		this.group.add(panel);

		// Two pipes, the two directions: reading on top, storing below.
		this.readCurve = new THREE.CatmullRomCurve3(
			[new THREE.Vector3(CW / 2, 2.9, 0.2), new THREE.Vector3(2.5, 2.9, 0.2), new THREE.Vector3(2.95, 2.9, 0.2), new THREE.Vector3(AX - AW / 2, 2.9, 0.2)],
			false,
			'centripetal'
		);
		this.writeCurve = new THREE.CatmullRomCurve3(
			[new THREE.Vector3(AX - AW / 2, 0.92, 0.2), new THREE.Vector3(2.95, 0.92, 0.2), new THREE.Vector3(2.5, 0.92, 0.2), new THREE.Vector3(CW / 2, 0.92, 0.2)],
			false,
			'centripetal'
		);
		const tube = (curve: THREE.Curve<THREE.Vector3>, mat: THREE.Material) => {
			const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.13, 16), mat);
			t.castShadow = true;
			this.group.add(t);
		};
		tube(this.readCurve, m.orangeGlow);
		tube(this.writeCurve, m.greenGlow);
		// Each pipe ends in a socket on both machines, so it visibly plugs in.
		const sockets = new Batch();
		for (const y of [2.9, 0.92]) {
			for (const [x, s] of [[CW / 2, 1], [AX - AW / 2, -1]] as const) {
				sockets.add(new THREE.CylinderGeometry(0.21, 0.25, 0.12, 24), m.steel, { p: [x + s * 0.05, y, 0.2], r: [0, 0, (s * -Math.PI) / 2] });
			}
		}
		this.group.add(sockets.build('kv-sockets'));
		const pulse = new THREE.SphereGeometry(0.17, 16, 12);
		const pulseMat = new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: color.amber, emissiveIntensity: 3 });
		for (let i = 0; i < 4; i++) {
			const p = new THREE.Mesh(pulse, pulseMat);
			p.visible = false;
			this.group.add(p);
			this.readPulse.push(p);
		}
	}

	/** write: rows fill, one token at a time. read: attention looks back through all of them. */
	update(write: number, read: number, time: number) {
		const n = this.rows.length;
		this.rows.forEach((row, i) => {
			const delay = (i / n) * 0.84;
			row.kv.forEach((mesh, j) => {
				// The value leaves once the key is well clear of the port.
				const k = seg(write, delay + j * 0.07, delay + j * 0.07 + 0.13);
				mesh.visible = k > 0;
				if (!k) return;
				const home = 0.28 + j * 0.8;
				const e = inOut(k);
				const zHome = CD / 2 + 0.1;
				// Across the front of the cabinet to its own row, then straight in, so it never crosses the rows already filled.
				const across = smooth(seg(e, 0, 0.74));
				const zFront = zHome + 0.62;
				const start = this.made[j];
				const toFront = start.z + (zFront - start.z) * smooth(seg(e, 0, 0.3));
				// Reading slides each block out a little: this is the look-back made physical.
				const wave = bell(read, (i / n) * 0.7, (i / n) * 0.7 + 0.3) * 0.3;
				mesh.position.set(
					start.x + (home - start.x) * across,
					start.y + (row.y - start.y) * across + Math.sin(across * Math.PI) * 0.7,
					toFront + (zHome - toFront) * smooth(seg(e, 0.74, 1)) + wave
				);
				mesh.scale.setScalar(outBack(Math.min(1, k * 2.4), 2));
			});
			const filled = seg(write, delay + 0.2, delay + 0.24);
			const reading = bell(read, (i / n) * 0.7, (i / n) * 0.7 + 0.3);
			row.lamp.mix(color.amber, color.green, filled, 0.12 + filled * 0.5 + reading * 1.1);
		});
		this.blockMat.emissiveIntensity = 0.45 + bell(read, 0, 1) * 0.5;
		const reading = read > 0 && read < 1;
		this.qMat.emissiveIntensity = reading ? 1.5 + Math.sin(time * 7) * 0.5 : 0.5 + smooth(write) * 0.2;
		this.readPulse.forEach((p, i) => {
			const u = (read * 3.4 + i * 0.25) % 1;
			p.visible = reading;
			if (reading) p.position.copy(this.readCurve.getPointAt(u));
		});
	}
}
