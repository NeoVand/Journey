import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { shadowOn } from '../kit/machines';
import { color, Lamp, mats } from '../kit/materials';
import { bell, inOut, lerp, outBack, seg, smooth } from '../kit/math';
import { createSign, grown } from '../kit/parts';
import { font, isPhone, Label, Surface } from '../kit/print';

const CELL = 0.56;
const LANE_Z = [-2.6, -1.3, 0, 1.3, 2.6];
const LANE_START = -7.1; // the lanes run right up to the waiting rail
const X0 = -5.8; // where the front of a row sits in its lane
const X1 = 7.2; // the face of the block where finished rows leave
const RAIL_X = -7.6;
const QUEUE_Z = -3.6; // the front of the queue
const BACK_Z = -5.3;
const SLOT = 1.25; // far enough apart that two can't touch going round the corner
export const STEPS = 14;
const NEVER = STEPS + 1;

/** A request in the batch. It takes its lane at step `from` holding `len` tokens, and gets its last token in step `to` - 1. */
interface Seq {
	name: string;
	lane: number;
	from: number;
	to: number;
	len: number;
	tint: string;
	/** Its place in the waiting line, if it starts out waiting. */
	queue?: number;
	/** The steps it sits out when memory runs short. */
	pause?: [number, number];
}

const OTHERS = ['#9fb2d6', '#aebcdb', '#92a8cf', '#a6b7d9', '#99add3', '#b3c0dd', '#94aad0'];
/** Everyone's work shares each step. Yours is amber, and it is one lane among many. */
const SEQS: Seq[] = [
	{ name: 'A', lane: 0, from: 0, to: 6, len: 5, tint: OTHERS[0] },
	{ name: 'G', lane: 0, from: 7, to: NEVER, len: 1, tint: OTHERS[5], queue: 2 },
	{ name: 'B', lane: 1, from: 0, to: 3, len: 8, tint: OTHERS[1] },
	{ name: 'E', lane: 1, from: 4, to: 12, len: 2, tint: OTHERS[6], queue: 0 },
	{ name: 'I', lane: 1, from: 13, to: NEVER, len: 1, tint: OTHERS[0], queue: 4 },
	{ name: 'You', lane: 2, from: 0, to: NEVER, len: 2, tint: color.amber },
	{ name: 'C', lane: 3, from: 0, to: 9, len: 3, tint: OTHERS[2] },
	{ name: 'H', lane: 3, from: 11, to: NEVER, len: 3, tint: OTHERS[3], queue: 3 },
	{ name: 'D', lane: 4, from: 0, to: 4, len: 6, tint: OTHERS[4] },
	{ name: 'F', lane: 4, from: 5, to: NEVER, len: 2, tint: OTHERS[1], queue: 1, pause: [8, 10] }
];
const JOINERS = SEQS.filter((q) => q.queue !== undefined);

/** What the board says, from the step each line starts. Each one is the poster's "B finishes, D joins" as it happens. */
const LOG: [number, string][] = [
	[0, 'Everyone gets one token.'],
	[4, 'B finished. E joins.'],
	[5, 'D finished. F joins.'],
	[6, 'Everyone gets one token.'],
	[7, 'A finished. G joins.'],
	[8, 'Memory full. F pauses.'],
	[9, 'F is paused. Room again.'],
	[10, 'C finished. F resumes.'],
	[11, 'H joins.'],
	[12, 'Everyone gets one token.'],
	[13, 'E finished. I joins.']
];
/** How full the chips' memory is, step by step. Illustrative. It drops the moment F's blocks are moved out. */
const MEMORY = [62, 66, 70, 74, 68, 63, 71, 78, 100, 82, 76, 80, 84, 78, 82, 82];

const pausedAt = (q: Seq, step: number) => !!q.pause && step >= q.pause[0] && step < q.pause[1];

/** How many tokens a request holds once `step` steps have gone by. */
function grownBy(q: Seq, step: number) {
	let n = q.len;
	for (let i = q.from; i < Math.min(q.to, step); i++) if (!pausedAt(q, i)) n++;
	return n;
}

export class BatchLanes {
	group = new THREE.Group();
	private cells: THREE.InstancedMesh;
	private cellSeq: { seq: Seq; index: number }[] = [];
	private heads: THREE.Group[] = [];
	private scanner: THREE.Group;
	private lamps: Lamp[] = [];
	private pauseSign: THREE.Group;
	private board = new Surface(1280, 310);
	private shown = '';
	private d = new THREE.Object3D();
	private tint = new THREE.Color();
	private dim = new THREE.Color('#5b6880');
	private rest = new THREE.Color(OTHERS[1]);

	constructor() {
		const m = mats();
		const b = new Batch();
		const len = X1 - LANE_START + 0.05;
		const mid = (X1 + LANE_START) / 2;
		for (const z of LANE_Z) b.add(rbox(len, 0.1, 0.96, 0.04, 2), m.rubber, { p: [mid, 0.05, z] });
		// The waiting line: down the side of the lanes, and round the corner along the back.
		const railLen = 3.3 - BACK_Z + 0.46;
		const railMid = (3.3 + BACK_Z - 0.46) / 2;
		b.add(rbox(1, 0.1, railLen, 0.04, 2), m.rubber, { p: [RAIL_X, 0.05, railMid] });
		const backLen = -3.7 - (RAIL_X + 0.5);
		b.add(rbox(backLen, 0.1, 0.92, 0.04, 2), m.rubber, { p: [RAIL_X + 0.5 + backLen / 2, 0.05, BACK_Z] });
		// Where finished work leaves: one mouth for each lane, and a lamp that says so.
		b.add(rbox(0.9, 0.56, 7.5, 0.06, 3), m.creamLight, { p: [X1 + 0.45, 0.28, -0.15] });
		for (const z of LANE_Z) b.add(rbox(0.02, 0.4, 0.82, 0.01, 1), m.recess, { p: [X1 - 0.002, 0.24, z] });
		this.group.add(b.build('lanes'));
		shadowOn(this.group, X1 + 0.45, 0, -0.15, 1.1, 7.7, 0.34);
		LANE_Z.forEach((z) => {
			const lamp = new Lamp(rbox(0.26, 0.05, 0.26, 0.02, 2), color.green, 0.08);
			lamp.mesh.position.set(X1 + 0.45, 0.575, z);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
		});
		const done = createSign('Finished', 0.2);
		done.position.set(X1 + 0.45, 0.755 + grown(0.2), -3.74);
		this.group.add(done);
		const waiting = createSign('Waiting', 0.24);
		waiting.position.set(-2.75, 0.62 + grown(0.24), BACK_Z);
		this.group.add(waiting);
		const waitingLeg = new Batch();
		waitingLeg.add(rbox(0.1, 0.4, 0.1, 0.03, 2), m.steelSoft, { p: [-2.75, 0.2, BACK_Z] });
		this.group.add(waitingLeg.build('waiting-leg'));

		const list: { seq: Seq; index: number }[] = [];
		for (const seq of SEQS) {
			const total = grownBy(seq, seq.to);
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
		list.forEach((e, i) => {
			// The last token of a finished request is its end-of-turn token, and that's why it leaves.
			const last = e.seq.to !== NEVER && e.index === grownBy(e.seq, e.seq.to) - 1;
			this.cells.setColorAt(i, c.set(last ? '#2fcf7d' : e.seq.tint));
		});
		this.group.add(this.cells);

		// The front of each row carries its name.
		const headGeo = rbox(0.5, 0.3, 0.72, 0.06, 3);
		const headMat = new THREE.MeshPhysicalMaterial({ color: '#1c2c4c', roughness: 0.34, clearcoat: 0.6 });
		for (const q of SEQS) {
			const head = new THREE.Group();
			const you = q.name === 'You';
			const body = new THREE.Mesh(headGeo, you ? m.amber : headMat);
			body.castShadow = true;
			head.add(body);
			const label = new Label(q.name, you ? 0.24 : 0.34, { color: you ? color.ink : '#ffffff', weight: 800 });
			label.mesh.rotation.x = -Math.PI / 2;
			label.mesh.position.y = 0.153;
			head.add(label.mesh);
			this.group.add(head);
			this.heads.push(head);
		}

		// One shuttle, back and forth over every lane once per step: everyone advances together.
		const bridge = new Batch();
		const span = 16.8;
		bridge.add(rbox(span, 0.3, 0.42, 0.1, 3), m.cream, { p: [0, 0.98, 0] });
		for (const x of [-span / 2, span / 2]) bridge.add(rbox(0.26, 1.0, 0.3, 0.07, 3), m.steel, { p: [x, 0.5, 0] });
		bridge.add(rbox(span - 0.5, 0.06, 0.1, 0.02, 2), m.steel, { p: [0, 0.74, 0] });
		this.scanner = bridge.build('sweep');
		this.scanner.position.x = -0.05;
		const said = new Label('One step: one more token each', 0.22, { weight: 700 });
		said.mesh.position.set(1.5, 0.98, 0.212);
		this.scanner.add(said.mesh);
		this.group.add(this.scanner);

		this.pauseSign = createSign('Paused', 0.22);
		this.pauseSign.rotation.x = -0.95;
		this.pauseSign.visible = false;
		this.group.add(this.pauseSign);

		// The scheduler's board, standing behind the lanes.
		const plate = new Batch();
		plate.add(rbox(7.6, 1.9, 0.14, 0.12, 3), m.creamLight, { p: [0, 1.55, 0] });
		for (const x of [-3, 3]) plate.add(rbox(0.16, 0.7, 0.16, 0.04, 2), m.steelSoft, { p: [x, 0.35, 0] });
		const g = new THREE.Group();
		g.add(plate.build('counter'));
		const face = new THREE.Mesh(
			new THREE.PlaneGeometry(7.4, (7.4 * 310) / 1280),
			new THREE.MeshStandardMaterial({ map: this.board.texture, transparent: true, roughness: 0.6, depthWrite: false })
		);
		face.position.set(0, 1.55, 0.076);
		face.renderOrder = 2;
		g.add(face);
		g.position.set(2.8, 0, -3.95);
		// It's the board that tells the story, so a phone gets a bigger one.
		g.scale.setScalar(isPhone ? 1.2 : 1);
		this.group.add(g);
	}

	/** Along the waiting line, measured back from its front. */
	private queueAt(dist: number, out: THREE.Vector3) {
		const down = QUEUE_Z - BACK_Z;
		if (dist <= down) out.set(RAIL_X, 0.25, QUEUE_Z - dist);
		else out.set(RAIL_X + dist - down, 0.25, BACK_Z);
		return out;
	}

	private drawBoard(n: number, log: string, memory: number) {
		const full = memory >= 100;
		this.board.draw((c, w) => {
			c.textBaseline = 'middle';
			c.textAlign = 'left';
			c.fillStyle = color.ink;
			c.font = `800 100px ${font.display}`;
			c.fillText(`Step ${n}`, 36, 88);
			c.fillStyle = full ? '#c8321f' : color.ink;
			let size = 66;
			c.font = `700 ${size}px ${font.sans}`;
			while (c.measureText(log).width > w - 462 - 30) c.font = `700 ${--size}px ${font.sans}`;
			c.fillText(log, 462, 90);
			c.fillStyle = '#46546e';
			c.font = `600 50px ${font.sans}`;
			c.fillText('Chip memory', 36, 230);
			const x = 462;
			const room = w - x - 36;
			c.fillStyle = 'rgba(16,26,48,.13)';
			c.beginPath();
			c.roundRect(x, 204, room, 52, 16);
			c.fill();
			c.fillStyle = full ? '#e0442f' : '#2fcf7d';
			c.beginPath();
			c.roundRect(x, 204, (room * memory) / 100, 52, 16);
			c.fill();
		});
	}

	/** s runs from 0 to STEPS. Each whole number is one forward pass through the model. */
	update(s: number) {
		const step = Math.min(STEPS, Math.floor(s));
		const f = s - step;
		// The shuttle crosses once per step, and comes back on the next, so it never has to jump.
		const sweep = step % 2 ? 1 - inOut(seg(f, 0, 0.86)) : inOut(seg(f, 0, 0.86));
		this.scanner.position.z = -3.3 + sweep * 6.6;
		const passed = (lane: number) => {
			const at = (LANE_Z[lane] + 3.3) / 6.6;
			return step % 2 ? sweep <= at : sweep >= at;
		};
		const fresh = (lane: number) => {
			const at = (LANE_Z[lane] + 3.3) / 6.6;
			return seg(Math.abs(sweep - at), 0, 0.2);
		};

		// Each one that takes a lane moves the whole line up.
		let moved = 0;
		for (const q of JOINERS) moved += smooth(seg(s, q.from - 0.9, q.from - 0.35));

		const row = SEQS.map((q, i) => {
			const entering = q.from > 0 ? seg(s, q.from - 0.9, q.from) : 1;
			const leaving = q.to !== NEVER ? seg(s, q.to + 0.3, q.to + 1) : 0;
			const running = step >= q.from && step < q.to && !pausedAt(q, step);
			const grown = grownBy(q, step) + (running && passed(q.lane) ? 1 : 0);
			const newest = running && passed(q.lane) ? fresh(q.lane) : 1;
			const outX = inOut(leaving) * 14;

			const head = this.heads[i];
			const p = head.position;
			if (entering <= 0) this.queueAt(((q.queue ?? 0) - moved) * SLOT, p);
			else if (entering < 1) {
				const along = inOut(seg(entering, 0, 0.55));
				const over = inOut(seg(entering, 0.55, 1));
				p.set(lerp(RAIL_X, X0, over), 0.25, lerp(QUEUE_Z, LANE_Z[q.lane], along));
			} else p.set(X0 + outX, 0.25, LANE_Z[q.lane]);
			head.visible = p.x < X1 + 0.25 + 0.05 && leaving < 1;
			// It settles into its lane with a little weight.
			const land = q.from > 0 ? bell(s, q.from - 0.08, q.from + 0.16) : 0;
			head.scale.set(1 + land * 0.05, 1 - land * 0.22, 1 + land * 0.05);
			return { q, entering, outX, grown, newest };
		});

		const d = this.d;
		this.cellSeq.forEach((e, i) => {
			const r = row[SEQS.indexOf(e.seq)];
			const { index } = e;
			const hidden = index >= r.grown || r.entering < 1;
			const X = X0 + (index + 1) * CELL + r.outX;
			if (hidden || X > X1 + 0.3) {
				d.scale.setScalar(0);
				d.position.set(0, -50, 0);
			} else {
				// A new arrival's tokens unfold behind it. After that, the shuttle adds one per step.
				const unfold = e.seq.from > 0 ? seg(s, e.seq.from + index * 0.04, e.seq.from + 0.18 + index * 0.04) : 1;
				const just = index === r.grown - 1 ? r.newest : 1;
				const size = Math.max(0.001, outBack(Math.min(unfold, just), 2.4));
				// Standing on the lane at any size, so an overshoot goes up and never down through it.
				d.position.set(X, 0.1 + 0.12 * size, LANE_Z[e.seq.lane]);
				d.scale.setScalar(size);
			}
			d.updateMatrix();
			this.cells.setMatrixAt(i, d.matrix);
		});
		this.cells.instanceMatrix.needsUpdate = true;

		// A paused request greys out where it stands, and takes up no chip memory until it's let back in.
		const paused = SEQS.find((q) => q.pause)!;
		const off = smooth(seg(s, paused.pause![0] - 0.3, paused.pause![0])) * (1 - smooth(seg(s, paused.pause![1] - 0.3, paused.pause![1])));
		if (off > 0 || this.tint.r !== 0) {
			this.tint.copy(this.rest).lerp(this.dim, off);
			this.cellSeq.forEach((e, i) => {
				if (e.seq === paused) this.cells.setColorAt(i, this.tint);
			});
			this.cells.instanceColor!.needsUpdate = true;
		}
		const sign = this.pauseSign;
		sign.visible = off > 0.01;
		if (sign.visible) {
			sign.scale.setScalar(Math.max(0.001, outBack(off, 2)));
			// Clear of the row at the length it stopped at, however it's reached.
			sign.position.set(X0 + (grownBy(paused, paused.pause![0]) + 1) * CELL + 0.45, 0.36, LANE_Z[paused.lane]);
		}

		this.lamps.forEach((lamp, lane) => {
			let flash = 0;
			for (const q of SEQS) if (q.lane === lane && q.to !== NEVER) flash = Math.max(flash, bell(s, q.to + 0.65, q.to + 1.3));
			lamp.set(color.green, 0.08 + flash * 1.8);
		});

		// The board changes as the thing it's reporting starts to happen.
		const now = Math.min(STEPS, Math.floor(s + 0.7));
		const n = s <= 0 ? 0 : Math.min(STEPS, step + 1);
		let log = LOG[0][1];
		for (const [from, text] of LOG) if (now >= from) log = text;
		const key = `${n}/${log}/${MEMORY[now]}`;
		if (key !== this.shown) {
			this.shown = key;
			this.drawBoard(n, log, MEMORY[now]);
		}
	}
}
