import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { createSign } from '../kit/parts';
import { color, mats } from '../kit/materials';
import { font, Surface } from '../kit/print';
import { inOut, outBack, seg } from '../kit/math';

const CELL = 0.56;
const LANE_Z = [-2.6, -1.3, 0, 1.3, 2.6];
const X0 = -6.2;
const X1 = 6.9;
export const STEPS = 14;

/** A sequence in the batch. It enters at step `from` holding `len` tokens and leaves at step `to`. */
interface Seq {
	lane: number;
	from: number;
	to: number;
	len: number;
	tint: string;
}

const OTHERS = ['#9fb2d6', '#aebcdb', '#92a8cf', '#a6b7d9', '#99add3', '#b3c0dd', '#94aad0'];
/** Everyone's work shares each step. Yours is amber, and it is one lane among many. */
const SEQS: Seq[] = [
	{ lane: 0, from: 0, to: 6, len: 5, tint: OTHERS[0] },
	{ lane: 0, from: 7, to: 15, len: 1, tint: OTHERS[5] },
	{ lane: 1, from: 0, to: 3, len: 8, tint: OTHERS[1] },
	{ lane: 1, from: 4, to: 11, len: 2, tint: OTHERS[6] },
	{ lane: 1, from: 12, to: 15, len: 1, tint: OTHERS[0] },
	{ lane: 2, from: 0, to: 15, len: 2, tint: color.amber },
	{ lane: 3, from: 0, to: 9, len: 3, tint: OTHERS[2] },
	{ lane: 3, from: 10, to: 15, len: 3, tint: OTHERS[3] },
	{ lane: 4, from: 0, to: 4, len: 6, tint: OTHERS[4] },
	{ lane: 4, from: 5, to: 15, len: 2, tint: OTHERS[1] }
];

export class BatchLanes {
	group = new THREE.Group();
	private cells: THREE.InstancedMesh;
	private cellSeq: { seq: Seq; index: number }[] = [];
	private scanner: THREE.Group;
	private you: THREE.Group;
	private counter = new Surface(560, 200);
	private shown = -1;
	private d = new THREE.Object3D();

	constructor() {
		const m = mats();
		const b = new Batch();
		for (const z of LANE_Z) {
			b.add(rbox(X1 - X0 + 0.5, 0.1, 0.92, 0.04, 2), m.rubber, { p: [(X0 + X1) / 2, 0.05, z] });
			for (const s of [-1, 1]) b.add(rbox(X1 - X0 + 0.5, 0.1, 0.06, 0.025, 2), m.steel, { p: [(X0 + X1) / 2, 0.07, z + s * 0.5] });
		}
		// Queue of waiting work at the left, cut-off at the right where finished work leaves.
		b.add(rbox(1.0, 0.5, 7, 0.1, 3), m.creamLight, { p: [X0 - 0.95, 0.25, 0] });
		b.add(rbox(0.5, 0.26, 7, 0.08, 3), m.steelSoft, { p: [X1 + 0.5, 0.13, 0] });
		this.group.add(b.build('lanes'));

		const list: { seq: Seq; index: number }[] = [];
		for (const seq of SEQS) {
			const total = seq.len + (seq.to - seq.from);
			for (let i = 0; i < total; i++) list.push({ seq, index: i });
		}
		this.cellSeq = list;
		this.cells = new THREE.InstancedMesh(
			rbox(CELL - 0.06, 0.24, 0.72, 0.05, 2),
			new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
			list.length
		);
		this.cells.castShadow = true;
		this.cells.frustumCulled = false;
		const c = new THREE.Color();
		list.forEach((e, i) => this.cells.setColorAt(i, c.set(e.seq.tint)));
		this.group.add(this.cells);

		// One bridge, sweeping across every lane once per step: everyone advances together.
		const bridge = new Batch();
		const span = X1 - X0 + 1;
		bridge.add(rbox(span, 0.3, 0.42, 0.1, 3), m.cream, { p: [0, 0.98, 0] });
		for (const x of [-span / 2, span / 2]) bridge.add(rbox(0.26, 1.0, 0.3, 0.07, 3), m.steel, { p: [x, 0.5, 0] });
		bridge.add(rbox(span - 0.5, 0.06, 0.1, 0.02, 2), m.steel, { p: [0, 0.74, 0] });
		this.scanner = bridge.build('sweep');
		this.scanner.position.x = (X0 + X1) / 2;
		this.group.add(this.scanner);

		const lit = createSign('Your request', 0.22, color.ink);
		lit.position.set(X0 + 2.1, 0.62, LANE_Z[2] + 0.02);
		lit.rotation.x = -0.6;
		this.you = lit;
		this.group.add(lit);

		const waiting = createSign('Waiting', 0.2);
		waiting.position.set(X0 - 0.95, 0.86, 2.0);
		waiting.rotation.x = -0.4;
		this.group.add(waiting);

		// Step counter, standing behind the lanes.
		const plate = new Batch();
		plate.add(rbox(2.9, 1.05, 0.14, 0.09, 3), m.creamLight, { p: [0, 1.2, 0] });
		plate.add(rbox(0.16, 0.7, 0.16, 0.04, 2), m.steelSoft, { p: [0, 0.35, 0] });
		const g = new THREE.Group();
		g.add(plate.build('counter'));
		const face = new THREE.Mesh(
			new THREE.PlaneGeometry(2.7, (2.7 * 200) / 560),
			new THREE.MeshStandardMaterial({ map: this.counter.texture, transparent: true, roughness: 0.6, depthWrite: false })
		);
		face.position.set(0, 1.2, 0.076);
		face.renderOrder = 2;
		g.add(face);
		g.position.set(0, 0, -3.9);
		this.group.add(g);
	}

	/** s runs from 0 to STEPS. Each whole number is one forward pass through the model. */
	update(s: number) {
		const step = Math.min(STEPS, Math.floor(s));
		const f = s - step;
		// Bar sweeps once across all lanes per step: everyone advances together.
		const sweep = inOut(seg(f, 0, 0.8));
		this.scanner.position.z = -3.3 + sweep * 6.6;
		this.you.position.x = X0 + 0.4 + (2 + Math.min(STEPS, s)) * CELL + 1.2;

		const d = this.d;
		this.cellSeq.forEach((e, i) => {
			const { seq, index } = e;
			// How many tokens does this sequence have right now? Its lane's scanner crossing adds one.
			const laneAt = (LANE_Z[seq.lane] + 3.3) / 6.6;
			const crossed = sweep >= laneAt ? 1 : 0;
			const grown = seq.len + Math.max(0, Math.min(seq.to, step) - seq.from) + (step >= seq.from && step < seq.to ? crossed : 0);
			const enter = seg(s, seq.from - 0.9, seq.from);
			const exit = seg(s, seq.to + 0.35, seq.to + 1);
			const has = index < grown;
			const justMade = index === grown - 1 && step >= seq.from && step < seq.to && crossed ? seg(sweep, laneAt, Math.min(1, laneAt + 0.2)) : 1;
			if (!has || (seq.from > 0 && enter <= 0) || (exit >= 1 && seq.to < STEPS) || (exit > 0 && seq.to >= STEPS && false)) {
				d.scale.setScalar(0);
				d.position.set(0, -50, 0);
			} else {
				const x = X0 + 0.4 + index * CELL;
				const inX = seq.from > 0 ? (1 - inOut(enter)) * -2.6 : 0;
				const outX = seq.to < STEPS ? inOut(exit) * 16 : 0;
				const X = x + inX + outX;
				const gone = X > X1 + 0.4;
				d.position.set(X, 0.22, LANE_Z[seq.lane]);
				d.scale.setScalar(gone ? 0 : outBack(justMade, 2.4));
			}
			d.updateMatrix();
			this.cells.setMatrixAt(i, d.matrix);
		});
		this.cells.instanceMatrix.needsUpdate = true;

		const shown = s <= 0 ? 0 : Math.min(STEPS, step + 1);
		if (shown !== this.shown) {
			this.shown = shown;
			this.counter.draw((c, w, h) => {
				c.fillStyle = color.ink;
				c.textBaseline = 'middle';
				c.textAlign = 'center';
				c.font = `800 92px ${font.display}`;
				c.letterSpacing = '-2px';
				c.fillText(`Step ${shown}`, w / 2, h / 2 + 4);
			});
		}
	}
}
