import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, mats } from '../kit/materials';
import { bell } from '../kit/math';
import { plinth } from '../kit/parts';
import { font, Label } from '../kit/print';

/** One folder, tab and all. */
function folder(w: number, h: number) {
	const shape = roundedRect(w, h, 0.05);
	const geo = extrude(shape, 0.05, 0.012, 2, 8);
	const tab = extrude(roundedRect(w * 0.36, 0.14, 0.04), 0.05, 0.01, 2, 6);
	return { geo, tab };
}

/** Skills wait here, shut. They're instructions for one kind of task, and they only come out when a task needs them. */
export class SkillShelf {
	group = new THREE.Group();
	private folders: THREE.Group[] = [];

	constructor() {
		const m = mats();
		const base = new Batch();
		plinth(base, 1.5, 1.14, 0.08);
		base.add(rbox(1.28, 0.1, 0.92, 0.03, 2), m.steelSoft, { p: [0, 0.13, 0] });
		this.group.add(base.build('skills-shelf'));
		const W = 1.1;
		const H = 0.72;
		const { geo, tab } = folder(W, H);
		const skins = [new THREE.MeshPhysicalMaterial({ color: '#e7d2a4', roughness: 0.6 }), new THREE.MeshPhysicalMaterial({ color: '#f0dfb9', roughness: 0.6 }), m.creamLight];
		[-0.3, -0.04, 0.22].forEach((z, i) => {
			const f = new THREE.Group();
			const b = new Batch();
			b.add(geo, skins[i], { p: [0, H / 2, 0] });
			b.add(tab, skins[i], { p: [-W * 0.26 + i * 0.26, H + 0.04, 0] });
			f.add(b.build('skill-folder'));
			f.position.set(-0.05 + i * 0.05, 0.18, z);
			f.rotation.x = -0.24 + i * 0.07;
			this.group.add(f);
			this.folders.push(f);
		});
		const label = new Label('Skills', 0.17, { color: color.ink, weight: 800, font: font.display });
		label.mesh.position.set(0, H * 0.5, 0.034);
		this.folders[2].add(label.mesh);
	}

	/** It looks up when the harness reaches for its tools, and stays shut. */
	update(T: number) {
		this.folders.forEach((f, i) => {
			const a = 2.36 + i * 0.02;
			f.position.y = 0.18 + bell(T, a, a + 0.1) * 0.16;
		});
	}
}
