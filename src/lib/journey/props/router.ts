import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { machine, curve, tube, shadowOn } from '../kit/machines';
import { color, Lamp, mats } from '../kit/materials';
import { bell, outBack, seg, smooth } from '../kit/math';
import { createSign } from '../kit/parts';

/** Between the pads on either side of it, with the belt running along the front. */
export const ROUTER_X = 43.75;
export const ROUTER_PAD = 7.7;

/** Where the wire to the third machine ends: at the block table's foot, on the next pad along. */
const THIRD: [number, number, number] = [6, 0.07, 1.2];

/**
 * A model name doesn't point to one computer. There are many copies of it, and we've been inside one all along.
 * The router reads the start of the request and asks which copy most likely still holds it.
 */
export class Router {
	group = new THREE.Group();
	private scanBar: THREE.Mesh;
	private bead: THREE.Mesh;
	private wires: THREE.Curve<THREE.Vector3>[] = [];
	private lamps: Lamp[] = [];
	private beam: THREE.Group;
	private answers: THREE.Group[] = [];

	constructor(railZ: number, railY: number) {
		const m = mats();

		// The arch across the belt, the same kind of thing as the gate further along.
		const arch = new Batch();
		const top = railY + 1.72;
		const floor = -0.3;
		for (const s of [-1, 1]) arch.add(rbox(0.28, top - floor, 0.28, 0.07, 3), m.cream, { p: [0, (top + floor) / 2, railZ + s * 1.02] });
		arch.add(rbox(0.46, 0.46, 2.6, 0.1, 3), m.cream, { p: [0, top, railZ] });
		this.group.add(arch.build('router-arch'));
		this.beam = new THREE.Group();
		const sign = createSign('Router: who has these blocks?', 0.3);
		sign.position.set(0, railY + 2.34, railZ);
		this.beam.add(sign);
		this.group.add(this.beam);

		// What reads the start of the row as it goes under.
		this.scanBar = new THREE.Mesh(rbox(0.1, 0.05, 1.5, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#7cc4ff' }));
		this.scanBar.position.set(0, railY + 1.45, railZ);
		this.scanBar.visible = false;
		this.group.add(this.scanBar);

		// Two other copies of the same model, behind the belt. Their chips are busy with other people.
		[-1.9, 1.9].forEach((x, i) => {
			const copy = machine({ w: 3, h: 1.9, d: 2.2, finish: 'cobalt', name: `Copy ${i + 1}`, signH: 0.26, vent: false });
			copy.position.set(x, 0, -1.6);
			this.group.add(copy);
			shadowOn(this.group, x, 0, -1.6, 3.4, 2.6, 0.4);
			const grid = new Batch();
			grid.add(rbox(2.4, 0.74, 0.03, 0.05, 2), m.recess, { p: [x, 0.74, -0.5 + 0.015] });
			for (let c = 0; c < 6; c++) {
				for (let r = 0; r < 2; r++) grid.add(rbox(0.34, 0.28, 0.03, 0.03, 1), m.steelSoft, { p: [x + (c - 2.5) * 0.38, 0.92 - r * 0.36, -0.5 + 0.03] });
			}
			this.group.add(grid.build('copy-memory'));
			const lamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.15);
			lamp.mesh.position.set(x + 1.2, 1.62, -0.48);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
			const no = createSign('Not here', 0.24);
			no.position.set(x, 2.52, -1.1);
			no.visible = false;
			this.group.add(no);
			this.answers.push(no);
			this.wires.push(curve([[0, 0.07, 4.75], [x * 0.7, 0.07, 3.4], [x, 0.07, 1.6], [x, 0.07, -0.3]]));
		});

		// The third wire crosses to the next pad, because the third copy is the one we've been standing in all along.
		this.wires.push(curve([[0.05, 0.07, 4.75], [1.8, 0.07, 3.9], [3.86, 0.07, 3.2], [THIRD[0], THIRD[1], 2.4], THIRD]));
		const found = createSign('Copy 3 still has them', 0.3, color.ink, m.hbm);
		found.position.set(THIRD[0] + 0.1, 0.42, 2.1);
		found.rotation.x = -0.5;
		found.visible = false;
		this.group.add(found);
		this.answers.push(found);
		const wire = (m.rubber as THREE.Material).clone() as THREE.MeshStandardMaterial;
		this.wires.forEach((w) => this.group.add(tube(w, 0.035, wire, 60)));

		this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: '#9fe2ff' }));
		this.bead.visible = false;
		this.group.add(this.bead);
		this.lampThird = new Lamp(rbox(0.16, 0.16, 0.04, 0.05, 3), color.green, 0.1);
		this.lampThird.mesh.position.set(THIRD[0], 0.12, THIRD[2] - 0.02);
		this.group.add(this.lampThird.mesh);
	}

	private lampThird: Lamp;

	/** scan: the arch reads the head of the row. ping: the question goes down each wire in turn. */
	update(scan: number, ping: number) {
		this.scanBar.visible = scan > 0 && scan < 1;
		if (this.scanBar.visible) (this.scanBar.material as THREE.MeshBasicMaterial).color.set('#7cc4ff').multiplyScalar(0.7 + bell(scan, 0, 1) * 1.6);

		const steps = ping * 3;
		const leg = Math.min(2, Math.floor(steps));
		const u = steps - leg;
		const running = ping > 0 && ping < 1;
		this.bead.visible = running && u < 0.72;
		if (this.bead.visible) this.wires[leg].getPointAt(smooth(u / 0.72), this.bead.position);
		this.answers.forEach((sign, i) => {
			const from = (i + 0.7) / 3;
			const k = seg(ping, from, from + 0.1);
			sign.visible = k > 0;
			sign.scale.setScalar(Math.max(0.001, outBack(k, 2.2)));
		});
		this.lamps.forEach((lamp, i) => {
			const from = (i + 0.7) / 3;
			lamp.mix(color.amber, color.red, seg(ping, from, from + 0.05), 0.15 + bell(ping, from, from + 0.2) * 0.9);
		});
		const third = seg(ping, 2.7 / 3, 2.9 / 3);
		this.lampThird.set(color.green, 0.1 + third * 1.2);
	}
}
