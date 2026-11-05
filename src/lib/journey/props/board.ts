import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { hash } from '../kit/math';

/** Printed traces: routed at 45 degrees like a real board, and tiled so nobody sees the seam. */
function traces() {
	const S = 1024;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = S;
	const c = canvas.getContext('2d')!;
	c.fillStyle = '#10234d';
	c.fillRect(0, 0, S, S);
	c.lineCap = 'round';
	c.lineJoin = 'round';
	for (let i = 0; i < 34; i++) {
		const y = (i + 0.5) * (S / 34);
		const bend = 200 + hash(i) * 500;
		const run = 30 + hash(i + 40) * 60;
		const up = hash(i + 80) > 0.5 ? 1 : -1;
		const on = hash(i + 120) > 0.3;
		c.strokeStyle = on ? 'rgba(244,195,90,.07)' : 'rgba(127,196,255,.06)';
		c.lineWidth = hash(i + 7) > 0.8 ? 4 : 2;
		c.beginPath();
		c.moveTo(0, y);
		c.lineTo(bend, y);
		c.lineTo(bend + run, y + up * run);
		c.lineTo(S, y + up * run);
		c.stroke();
		c.fillStyle = 'rgba(244,195,90,.1)';
		c.beginPath();
		c.arc(bend + run + 60 + hash(i + 9) * 100, y + up * run, 4.5, 0, Math.PI * 2);
		c.fill();
	}
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

/** The floor of the machine's interior. Top surface sits at y = 0. */
export function createBoard(x0: number, x1: number, z0: number, z1: number) {
	const m = mats();
	const group = new THREE.Group();
	const w = x1 - x0;
	const d = z1 - z0;
	const cx = (x0 + x1) / 2;
	const cz = (z0 + z1) / 2;
	const b = new Batch();
	b.add(extrude(roundedRect(w, d, 0.6), 0.7, 0.14, 5, 10), m.cobalt, { p: [cx, -0.38, cz], r: [-Math.PI / 2, 0, 0] });
	group.add(b.build('board-rim'));
	const map = traces();
	map.repeat.set(w / 14, d / 14);
	const top = new THREE.Mesh(
		new THREE.PlaneGeometry(w - 0.5, d - 0.5),
		new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.25 })
	);
	top.rotation.x = -Math.PI / 2;
	top.position.set(cx, -0.012, cz);
	top.receiveShadow = true;
	group.add(top);
	return group;
}

/** Aisles of other racks in the dark, because this machine is one of very many. */
export function createRacks(x0: number, x1: number, z: number) {
	const group = new THREE.Group();
	const pitch = 5.2;
	const n = Math.ceil((x1 - x0) / pitch);
	const rack = new THREE.InstancedMesh(
		rbox(4.6, 26, 3, 0.1, 2),
		new THREE.MeshStandardMaterial({ color: '#14264f', roughness: 0.7, metalness: 0.2 }),
		n
	);
	const dummy = new THREE.Object3D();
	const pos: number[] = [];
	const col: number[] = [];
	const palette = [new THREE.Color('#41e58a'), new THREE.Color('#ffc247'), new THREE.Color('#7fc4ff')];
	for (let i = 0; i < n; i++) {
		const x = x0 + i * pitch;
		dummy.position.set(x, 6, z);
		dummy.updateMatrix();
		rack.setMatrixAt(i, dummy.matrix);
		for (let r = 0; r < 26; r++) {
			for (let k = 0; k < 6; k++) {
				const seed = i * 100 + r * 10 + k;
				if (hash(seed) < 0.78) continue;
				pos.push(x - 1.8 + k * 0.72, -6.4 + r * 0.92, z + 1.56);
				const c = palette[hash(seed + 3) < 0.7 ? 0 : hash(seed + 5) < 0.6 ? 2 : 1];
				const dim = 0.35 + hash(seed + 8) * 0.65;
				col.push(c.r * dim, c.g * dim, c.b * dim);
			}
		}
	}
	group.add(rack);

	const dot = document.createElement('canvas');
	dot.width = dot.height = 32;
	const c = dot.getContext('2d')!;
	const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
	g.addColorStop(0, '#fff');
	g.addColorStop(0.45, 'rgba(255,255,255,.7)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	c.fillStyle = g;
	c.fillRect(0, 0, 32, 32);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	group.add(
		new THREE.Points(
			geo,
			new THREE.PointsMaterial({
				size: 0.36,
				map: new THREE.CanvasTexture(dot),
				vertexColors: true,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			})
		)
	);
	return group;
}

/** The raised white slab each machine stands on: the same porcelain as the islands in the sky. */
export function createPad(w: number, d: number, h = 0.3) {
	const m = mats();
	const b = new Batch();
	b.add(extrude(roundedRect(w, d, 0.7), h, 0.11, 5, 12), m.porcelain, { p: [0, -h / 2, 0], r: [-Math.PI / 2, 0, 0] });
	const pad = b.build('pad');
	return pad;
}
