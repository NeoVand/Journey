import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox, sharedRbox } from '../kit/geometry';
import { curve, tube, shadowOn } from '../kit/machines';
import { craft, fan, loaf, loafBeads, pane } from '../kit/craft';
import { color, Lamp, mats } from '../kit/materials';
import { bell, outBack, seg, smooth } from '../kit/math';
import { createSign, fitting, grown, leaving, standSign } from '../kit/parts';

/** Between the pads on either side of it, with the belt running along the front. */
export const ROUTER_X = 43.75;
export const ROUTER_PAD = 7.7;

/** Where the wire to the third machine ends: at the block table's foot, on the next pad along. */
const THIRD: [number, number, number] = [6, 0.1, 1.2];
const WIRE = 0.035;

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
	private rotors: THREE.Object3D[] = [];

	constructor(railZ: number, railY: number) {
		// Its name lets the conversation point at it: see pointer.svelte.ts.
		this.group.name = 'Router';
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
		// Sitting on the beam: its top is at railY + 1.95, and the sign is 0.6 tall.
		sign.position.set(0, railY + 2.24, railZ);
		this.beam.add(sign);
		this.group.add(this.beam);

		// What reads the start of the row as it goes under.
		this.scanBar = new THREE.Mesh(rbox(0.1, 0.05, 1.5, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#7cc4ff' }));
		this.scanBar.position.set(0, railY + 1.45, railZ);
		this.scanBar.visible = false;
		this.group.add(this.scanBar);

		const plugs: [number, number, number][] = [];
		// Two other copies of the same model, behind the belt. Their chips are busy with other people.
		// Each one built as the pools are, small: a cream base with the wire's socket, a glass case with its memory
		// inside, full of other people's blocks, and a cobalt hood with its name and a fan.
		const c = craft();
		// Other people's blocks, in the same quiet colour as the strangers' in the tray.
		const strangers = new THREE.MeshPhysicalMaterial({ color: '#9fb2d6', roughness: 0.42, clearcoat: 0.5 });
		[-1.9, 1.9].forEach((x, i) => {
			const copy = new THREE.Group();
			copy.name = `Copy ${i + 1}`;
			copy.position.set(x, 0, -1.6);
			const cb = new Batch();
			const CW = 3;
			const CD = 2.2;
			cb.add(rbox(CW + 0.34, 0.14, CD + 0.34, 0.05, 2), m.steelSoft, { p: [0, 0.07, 0] });
			cb.add(rbox(CW + 0.38, 0.03, CD + 0.38, 0.012, 1), c.chrome, { p: [0, 0.15, 0] });
			cb.add(rbox(CW, 0.46, CD, 0.08, 2), m.cream, { p: [0, 0.37, 0] });
			cb.add(rbox(CW + 0.04, 0.05, CD + 0.04, 0.02, 1), c.chrome, { p: [0, 0.61, 0] });
			// The case: a dark back and floor, its memory on the back, a chrome frame on its front edges.
			cb.add(rbox(CW - 0.1, 0.7, 0.05, 0.02, 1), m.recess, { p: [0, 0.98, -CD / 2 + 0.3] });
			cb.add(rbox(CW - 0.1, 0.03, CD - 0.3, 0.01, 1), m.recess, { p: [0, 0.645, 0.15] });
			for (let col = 0; col < 6; col++) {
				for (let r = 0; r < 2; r++) cb.add(rbox(0.34, 0.24, 0.05, 0.03, 1), strangers, { p: [(col - 2.5) * 0.4, 1.06 - r * 0.3, -CD / 2 + 0.36] });
			}
			for (const sx of [-1, 1]) for (const z of [CD / 2 - 0.03, -CD / 2 + 0.3]) cb.add(rbox(0.06, 0.72, 0.06, 0.02, 1), c.chrome, { p: [sx * (CW / 2 - 0.05), 0.98, z] });
			cb.add(rbox(CW, 0.06, 0.06, 0.02, 1), c.chrome, { p: [0, 0.65, CD / 2 - 0.03] });
			// The hood.
			cb.add(loaf(CW, CD, 0.7, 0.28), m.cobalt, { p: [0, 1.34, 0] });
			cb.add(rbox(CW + 0.04, 0.05, CD + 0.04, 0.02, 1), c.chrome, { p: [0, 1.35, 0] });
			loafBeads(cb, CW, CD, 2.04, 0.28);
			const rotor = fan(cb, 0.34, [0.85, 2.18, 0]);
			copy.add(cb.build('copy'), rotor);
			copy.add(pane(CW - 0.12, 0.68, [0, 0.98, CD / 2 - 0.01], 0.02));
			const name = createSign(`Copy ${i + 1}`, 0.18, undefined, undefined, true);
			name.position.set(-0.3, 1.62, CD / 2 + 0.03);
			copy.add(name);
			this.rotors.push(rotor);
			this.group.add(copy);
			shadowOn(this.group, x, 0, -1.6, 3.4, 2.6, 0.4);
			const lamp = new Lamp(sharedRbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.15);
			lamp.mesh.position.set(x + 1.2, 1.62, -0.48);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
			const no = standSign(createSign('Not here', 0.24), 0.24, 0.24);
			no.position.set(x, 2.52, -1.1);
			no.visible = false;
			this.group.add(no);
			this.answers.push(no);
			plugs.push([x, 0.25, -0.5]);
			this.wires.push(
				curve([
					...leaving([x < 0 ? -0.2 : 0.2, 0.17, 3.69], [0, 0, -1], WIRE),
					[x * 0.35, 0.04, 3.0],
					[x * 0.85, 0.04, 2.2],
					[x, 0.04, 1.2],
					[x, 0.04, 0.35],
					[x, 0.12, -0.02],
					...leaving([x, 0.25, -0.5], [0, 0, 1], WIRE).reverse()
				])
			);
		});

		// The third wire crosses to the next pad, because the third copy is the one we've been standing in all along.
		this.wires.push(
			curve([
				...leaving([0, 0.17, 3.69], [0, 0, -1], WIRE),
				[1, 0.04, 3.1],
				[3, 0.04, 2.6],
				[3.9, 0.08, 2.32],
				[4.5, 0.08, 2.05],
				[5.2, 0.04, 1.4],
				...leaving([THIRD[0] - 0.17, THIRD[1], THIRD[2]], [-1, 0, 0], WIRE).reverse()
			])
		);
		// Where all three start: a box on the pad, fed from the arch that reads the row.
		const box = new Batch();
		box.add(rbox(0.82, 0.34, 0.42, 0.06, 3), m.cream, { p: [0, 0.17, 3.9] });
		box.add(rbox(0.96, 0.05, 0.56, 0.02, 2), m.steelSoft, { p: [0, 0.025, 3.9] });
		for (const x of [-0.2, 0, 0.2]) fitting(box, [x, 0.17, 3.69], [0, 0, -1], WIRE);
		plugs.forEach((p) => fitting(box, p, [0, 0, 1], WIRE));
		fitting(box, [0, 0.2, 4.11], [0, 0, 1], 0.06);
		fitting(box, [0, 0.2, railZ - 1.16], [0, 0, -1], 0.06);
		box.add(rbox(0.34, 0.2, 0.34, 0.05, 2), m.steelSoft, { p: THIRD });
		fitting(box, [THIRD[0] - 0.17, THIRD[1], THIRD[2]], [-1, 0, 0], WIRE, { flange: 1.7 });
		this.group.add(box.build('router-box'));
		shadowOn(this.group, 0, 0, 3.9, 1.1, 0.7, 0.34);
		const found = createSign('Copy 3 still has them', 0.3, color.ink, m.hbm);
		found.position.set(THIRD[0] + 0.1, 0.42 + grown(0.3) * Math.cos(0.5), 2.1);
		found.rotation.x = -0.5;
		found.visible = false;
		this.group.add(found);
		this.answers.push(found);
		const wire = (m.rubber as THREE.Material).clone() as THREE.MeshStandardMaterial;
		this.wires.forEach((w) => this.group.add(tube(w, WIRE, wire, 140)));
		this.group.add(tube(curve([[0, 0.2, 4.11], [0, 0.2, 4.4], [0, 0.2, railZ - 1.4], [0, 0.2, railZ - 1.16]]), 0.06, wire, 12));

		this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: '#9fe2ff' }));
		this.bead.visible = false;
		this.group.add(this.bead);
		this.lampThird = new Lamp(sharedRbox(0.16, 0.16, 0.04, 0.05, 3), color.green, 0.1);
		this.lampThird.mesh.position.set(THIRD[0], 0.1, THIRD[2] + 0.18);
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
		// Along the wire, on top of it, and not quite to its end, where the socket is.
		if (this.bead.visible) this.wires[leg].getPointAt(smooth(u / 0.72) * 0.9, this.bead.position).y += 0.08;
		this.answers.forEach((sign, i) => {
			const from = (i + 0.7) / 3;
			const k = seg(ping, from, from + 0.1);
			sign.visible = k > 0;
			sign.scale.setScalar(Math.max(0.001, outBack(k, 1.2)));
		});
		this.lamps.forEach((lamp, i) => {
			const from = (i + 0.7) / 3;
			lamp.mix(color.amber, color.red, seg(ping, from, from + 0.05), 0.15 + bell(ping, from, from + 0.2) * 0.9);
		});
		const third = seg(ping, 2.7 / 3, 2.9 / 3);
		this.lampThird.set(color.green, 0.1 + third * 1.2);
		this.rotors.forEach((r, i) => (r.rotation.y += 0.05 + i * 0.01));
	}
}
