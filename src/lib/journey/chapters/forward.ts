import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { arcPoint, curve, machine, panel, shadowOn, tube } from '../kit/machines';
import { font, Label, Surface } from '../kit/print';
import { createSign } from '../kit/parts';
import { bell, hash, inOut, outBack, outCubic, seg, smooth } from '../kit/math';
import { createPad } from '../props/board';
import { Tile, TILE_D, TILE_H } from '../props/tokenizer';
import { CALLS, type HarnessId } from '../content';
import { ORIGIN, PAD_Y, RAIL_Y, RAIL_Z } from '../layout';
import type { Shot } from '../rig';
import { createMapPlate, Transformer, TRANSFORMER_SHOTS } from './transformer';

const WHEEL = 200;
const DEC = 233;
const DET = DEC + 27;
const ROW0 = DEC - 13;
const BACK_Z = -2.4;
const PLATE_Y = (i: number) => PAD_Y + 0.56 + i * 1.04;

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [ORIGIN.x + x, ORIGIN.y + y, ORIGIN.z + z];
const TALL = box(0, 0.06, 1, 0.47);

const S_WHEEL: Omit<Shot, 'T'> = { az: 8, el: 9, target: at(WHEEL - 0.4, 3.4, 0), radius: 9.2, ry: 4.3, wide: box(0, 0.07, 0.56, 0.88), tall: TALL };
const S_DEC: Omit<Shot, 'T'> = { az: 8, el: 25, target: at(DEC - 6.6, 2.2, 1.2), radius: 7.7, ry: 5.4, wide: box(0.4, 0.06, 0.59, 0.9), tall: TALL };
const S_CALL: Omit<Shot, 'T'> = { az: -4, el: 56, target: at(DEC + 1.6, 0.8, 4.6), radius: 6.4, ry: 3.1, wide: box(0.02, 0.4, 0.96, 0.56), tall: box(0, 0.08, 1, 0.42), tallRadius: 4.6 };
const S_DET: Omit<Shot, 'T'> = { az: -14, el: 13, target: at(DET, 3.2, 2), radius: 7, ry: 4.3, wide: box(0.01, 0.07, 0.6, 0.88), tall: TALL };

export const FORWARD_SHOTS: Shot[] = [
	...TRANSFORMER_SHOTS,
	{ T: 15.04, ...S_WHEEL },
	{ T: 15.9, ...S_WHEEL, az: -5 },
	{ T: 16.04, ...S_DEC },
	{ T: 16.9, ...S_DEC, az: 11 },
	{ T: 17.06, ...S_CALL },
	{ T: 17.9, ...S_CALL, az: -3 },
	{ T: 18.06, ...S_DET },
	{ T: 18.62, ...S_DET, az: -9 },
	{ T: 18.97, ...S_DET, az: -6, el: 40, target: at(DET, 13, 0.4), radius: 2.6, ry: 2.6 }
];

/* ------------------------------------------------------------------ sampler ---- */

const LOGITS = [
	{ text: 'The', score: 3.6, p: 0.62 },
	{ text: 'I', score: 2.3, p: 0.17 },
	{ text: 'Let', score: 1.9, p: 0.11 },
	{ text: 'First', score: 1.4, p: 0.06 },
	{ text: 'To', score: 1.05, p: 0.04 },
	{ text: 'Sorry', score: 0.4, p: 0 },
	{ text: 'Cat', score: 0.2, p: 0 }
];
const SPINS = 4;

class Sampler {
	group = new THREE.Group();
	private bars: { mesh: THREE.Mesh; h: number; cut: boolean }[] = [];
	private wheel = new THREE.Group();
	private chosen: Tile;
	private sign: THREE.Group;
	private lamp: Lamp;
	private a = new THREE.Vector3();
	private from = new THREE.Vector3(3.6, PAD_Y + 6.6, 0.6);
	private to = new THREE.Vector3(ROW0 - WHEEL, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
	private dock = new THREE.Vector3(3.6, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);

	constructor() {
		const m = mats();
		this.group.position.x = WHEEL;
		const pad = createPad(20, 9.4);
		pad.position.set(0, PAD_Y, 0);
		this.group.add(pad);

		// The logits board.
		const lx = -4.8;
		const board = machine({ w: 7.4, h: 4.6, d: 1.2, finish: 'cream', name: 'Logits: one score per token', signH: 0.24, vent: false });
		board.position.set(lx, PAD_Y, -0.6);
		this.group.add(board);
		shadowOn(this.group, lx, PAD_Y, -0.6, 7.6, 1.4);
		const plate = new Surface(1480, 150);
		plate.draw((c, w, h) => {
			c.fillStyle = color.ink;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.font = `600 62px ${font.mono}`;
			LOGITS.forEach((l, i) => c.fillText(l.text, ((i + 0.5) / LOGITS.length) * w, h / 2));
		});
		const label = panel(6.9, (6.9 * 150) / 1480, plate);
		label.position.set(lx, PAD_Y + 0.56, 0.16);
		this.group.add(label);
		const barGeo = rbox(0.66, 1, 0.34, 0.06, 2);
		barGeo.translate(0, 0.5, 0);
		LOGITS.forEach((l, i) => {
			const mat = (m.cobalt as THREE.MeshPhysicalMaterial).clone();
			const mesh = new THREE.Mesh(barGeo, mat);
			mesh.position.set(lx + ((i + 0.5) / LOGITS.length - 0.5) * 6.9, PAD_Y + 0.84, 0.28);
			mesh.castShadow = true;
			this.group.add(mesh);
			this.bars.push({ mesh, h: l.score * 0.82, cut: l.p === 0 });
		});

		// The wheel of the next token.
		const wx = 3.6;
		const R = 2.9;
		const cy = PAD_Y + 3.5;
		const s = new Surface(1200, 1200);
		s.draw((c, w, h) => {
			const cx = w / 2;
			const ry = h / 2;
			let a = -Math.PI / 2 - LOGITS[0].p * Math.PI;
			const fills = ['#ffbc12', '#3b76ec', '#fbf1dd', '#22b866', '#f08a3c'];
			LOGITS.filter((l) => l.p > 0).forEach((l, i) => {
				const span = l.p * Math.PI * 2;
				c.fillStyle = fills[i];
				c.beginPath();
				c.moveTo(cx, ry);
				c.arc(cx, ry, cx, a, a + span);
				c.closePath();
				c.fill();
				c.strokeStyle = '#111a2e';
				c.lineWidth = 7;
				c.stroke();
				c.save();
				c.translate(cx, ry);
				c.rotate(a + span / 2);
				c.textAlign = 'right';
				c.textBaseline = 'middle';
				c.fillStyle = i === 1 ? '#ffffff' : color.ink;
				c.font = `800 ${i === 0 ? 118 : 74}px ${font.display}`;
				c.fillText(l.text, cx - 62, 0);
				c.restore();
				a += span;
			});
			c.fillStyle = '#111a2e';
			c.beginPath();
			c.arc(cx, ry, 92, 0, Math.PI * 2);
			c.fill();
		});
		const face = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.45 }));
		face.position.z = 0.1;
		this.wheel.add(face);
		const wb = new Batch();
		wb.add(new THREE.TorusGeometry(R, 0.14, 14, 96), m.steel);
		for (let i = 0; i < 30; i++) {
			const ang = (i / 30) * Math.PI * 2;
			wb.add(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8), m.steel, {
				p: [Math.cos(ang) * (R - 0.14), Math.sin(ang) * (R - 0.14), 0.16],
				r: [Math.PI / 2, 0, 0]
			});
		}
		wb.add(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.18, 96), m.slate, { r: [Math.PI / 2, 0, 0] });
		this.wheel.add(wb.build('wheel'));
		this.wheel.position.set(wx, cy, 0.4);
		this.group.add(this.wheel);

		const stand = new Batch();
		stand.add(rbox(4.4, 0.2, 2.2, 0.06, 3), m.steelSoft, { p: [wx, PAD_Y + 0.1, 0] });
		for (const sx of [-1, 1]) {
			stand.add(rbox(0.3, cy - PAD_Y, 0.5, 0.08, 3), m.cream, { p: [wx + sx * 1.15, PAD_Y + (cy - PAD_Y) / 2, -0.2], r: [0, 0, sx * 0.3] });
		}
		stand.add(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 20), m.steel, { p: [wx, cy, 0.1], r: [Math.PI / 2, 0, 0] });
		const pointer = new THREE.ConeGeometry(0.22, 0.56, 4);
		stand.add(pointer, m.red, { p: [wx, cy + R + 0.2, 0.62], r: [Math.PI, Math.PI / 4, 0] });
		stand.add(rbox(0.3, 0.3, 0.3, 0.06, 2), m.steel, { p: [wx, cy + R + 0.5, 0.62] });
		this.group.add(stand.build('wheel-stand'));
		shadowOn(this.group, wx, PAD_Y, 0, 4.4, 2.2);
		this.sign = createSign('Sampler', 0.3);
		this.sign.position.set(wx - 3.4, PAD_Y + 0.75, 1.2);
		this.sign.rotation.y = 0.22;
		this.group.add(this.sign);
		this.lamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.3);
		this.lamp.mesh.position.set(wx + 0.34, cy + R + 0.5, 0.79);
		this.group.add(this.lamp.mesh);

		this.chosen = new Tile({ text: 'The', id: 791, width: 0.92, special: false });
		this.chosen.update(1, 0);
		this.group.add(this.chosen.group);
	}

	update(rise: number, cut: number, spin: number, pick: number, ride: number, time: number) {
		this.bars.forEach((b, i) => {
			const r = outBack(seg(rise, i * 0.07, i * 0.07 + 0.55), 1.4);
			const sink = b.cut ? 1 - inOut(cut) : 1;
			b.mesh.scale.y = Math.max(0.001, b.h * r * sink);
			b.mesh.visible = r * sink > 0.001;
			const lit = i === 0 ? smooth(pick) : 0;
			const mat = b.mesh.material as THREE.MeshPhysicalMaterial;
			mat.emissive.set(color.amber);
			mat.emissiveIntensity = lit * 0.9;
		});
		const e = outCubic(spin);
		this.wheel.rotation.z = -e * SPINS * Math.PI * 2;
		this.wheel.position.z = 0.4;
		this.lamp.mix(color.amber, color.green, smooth(pick), spin > 0 && spin < 1 ? 1.2 + Math.sin(time * 12) * 0.6 : 0.4 + pick);

		const c = this.chosen.group;
		c.visible = pick > 0 && ride < 1;
		if (c.visible) {
			c.scale.setScalar(outBack(Math.min(1, pick * 1.5), 2));
			arcPoint(this.from, this.dock, 0.7, inOut(pick), this.a);
			if (ride > 0) this.a.lerpVectors(this.dock, this.to, inOut(ride));
			c.position.copy(this.a);
		}
	}
}

/* ------------------------------------------------------------------- decode ---- */

const THINKING = ['The', ' user', ' wants', ' the', ' race', ' condition', ' fixed', '.', ' I', ' should', ' search', ' first', '.'];
type Kind = 'think' | 'tool' | 'mark';

class OutTile {
	group = new THREE.Group();
	width: number;
	private face: THREE.Mesh;

	constructor(text: string, kind: Kind) {
		const m = mats();
		const pretty = text.replace(/^ /, '');
		const id = Math.round(100 + hash(text.length * 7.3 + text.charCodeAt(0)) * 39000);
		this.width = Math.max(0.56, Math.min(14, pretty.length) * 0.15 + 0.24);
		const mat =
			kind === 'mark'
				? m.cobalt
				: kind === 'tool'
					? m.amber
					: (thinkMat ??= new THREE.MeshPhysicalMaterial({ color: '#b6c4e2', roughness: 0.38, clearcoat: 0.7 }));
		const body = new THREE.Mesh(rbox(this.width, TILE_H, TILE_D, 0.055, 3), mat);
		body.castShadow = true;
		this.group.add(body);
		const H = 180;
		const W = Math.round((H * this.width) / TILE_D);
		const s = new Surface(W, H);
		s.draw((c, w, h) => {
			const ink = kind === 'mark' ? '#ffffff' : color.ink;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillStyle = ink;
			c.font = `600 62px ${font.mono}`;
			c.fillText(pretty, w / 2, h * 0.42);
			c.globalAlpha = 0.55;
			c.font = `500 28px ${font.mono}`;
			c.fillText(String(id), w / 2, h * 0.8);
			c.globalAlpha = 1;
		});
		this.face = panel(this.width - 0.04, TILE_D - 0.06, s);
		this.face.rotation.x = -Math.PI / 2;
		this.face.position.y = TILE_H / 2 + 0.002;
		this.group.add(this.face);
	}
}
let thinkMat: THREE.MeshPhysicalMaterial | undefined;

const THINK_A = 16.06;
const THINK_B = 16.9;
const CALL_A = 17.06;
const CALL_B = 17.72;

class Decoder {
	group = new THREE.Group();
	private think: OutTile[] = THINKING.map((t) => new OutTile(t, 'think'));
	private rows: Record<HarnessId, OutTile[]>;
	private row: OutTile[] = [];
	private xs: number[] = [];
	private rider: THREE.Mesh;
	private bead: THREE.Mesh;
	private flash: Lamp[] = [];
	private kv: THREE.InstancedMesh;
	private inner: THREE.Group;
	private thinkSign: THREE.Group;
	private toolSign: THREE.Group;
	private stops: Lamp[] = [];
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private port = new THREE.Vector3(DEC - 7.2, PAD_Y + 4.8, BACK_Z);
	private portIn = new THREE.Vector3(DEC - 7.2, PAD_Y + 0.6, BACK_Z);
	private d = new THREE.Object3D();

	constructor() {
		const m = mats();
		const pad = createPad(13, 9.4);
		pad.position.set(DEC - 7, PAD_Y, -1.5);
		this.group.add(pad);
		const stack = new THREE.Group();
		stack.position.z = BACK_Z;
		this.group.add(stack);

		// One decode step: the same stack of maps as before, small, with one token going up it.
		const ex = DEC - 7.2;
		const frame = new Batch();
		frame.add(rbox(6.6, 0.12, 4.4, 0.05, 3), m.steelSoft, { p: [ex, PAD_Y + 0.06, 0] });
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.add(new THREE.CylinderGeometry(0.07, 0.07, 5, 12), m.steel, { p: [ex + sx * 3, PAD_Y + 2.5, sz * 1.84] });
		stack.add(frame.build('decode-frame'));
		shadowOn(stack, ex, PAD_Y, 0, 6.9, 4.7, 0.5);
		for (let i = 0; i < 5; i++) {
			const y = PLATE_Y(i);
			const { group, material } = createMapPlate(5.7, 3.5, 0.13);
			material.opacity = 0.42;
			group.scale.y = 0.6;
			group.position.set(ex, y, 0);
			stack.add(group);
			const lamp = new Lamp(rbox(0.3, 0.07, 0.05, 0.02, 2), '#ffc53d', 0.05);
			lamp.mesh.position.set(ex + 2.4, y, 1.95);
			stack.add(lamp.mesh);
			this.flash.push(lamp);
		}
		const stepSign = createSign('One decode step, through every layer', 0.24);
		stepSign.position.set(ex, PAD_Y + 0.42, 2.02);
		stack.add(stepSign);
		this.bead = new THREE.Mesh(rbox(0.7, TILE_H, TILE_D * 0.7, 0.055, 3), m.amber);
		this.bead.castShadow = true;
		this.bead.visible = false;
		stack.add(this.bead);
		this.inner = new THREE.Group();
		this.group.add(this.inner);

		// Its KV shelf, gaining a row with every token.
		const shelf = machine({ w: 3.4, h: 5, d: 2.2, finish: 'cream', name: 'KV cache', signH: 0.26, vent: false });
		shelf.position.set(DEC - 0.4 - 0.6, PAD_Y, -0.9);
		stack.add(shelf);
		shadowOn(stack, DEC - 1, PAD_Y, -0.9, 3.7, 2.5);
		this.kv = new THREE.InstancedMesh(rbox(0.5, 0.2, 0.24, 0.05, 2), m.hbm, 44);
		this.kv.frustumCulled = false;
		stack.add(this.kv);
		const link = curve([
			[DEC - 4.1, PAD_Y + 3, 0.2],
			[DEC - 3.4, PAD_Y + 3.3, 0.2],
			[DEC - 2.7, PAD_Y + 3, 0.2]
		]);
		stack.add(tube(link, 0.12, m.greenGlow, 16));

		this.rider = new THREE.Mesh(rbox(0.7, TILE_H, TILE_D, 0.055, 3), m.amber);
		this.rider.castShadow = true;
		this.group.add(this.rider);

		this.think.forEach((t) => this.group.add(t.group));
		this.rows = {
			claude: this.buildCall('claude'),
			codex: this.buildCall('codex'),
			copilot: this.buildCall('copilot')
		};

		this.thinkSign = createSign('Thinking: billed as output, kept private', 0.22);
		this.thinkSign.rotation.x = -0.6;
		this.group.add(this.thinkSign);
		this.toolSign = createSign('A tool call', 0.28);
		this.toolSign.rotation.x = -0.6;
		this.group.add(this.toolSign);

		// Why generation stopped.
		const panelBox = new Batch();
		panelBox.add(rbox(4.2, 2.3, 0.3, 0.1, 3), m.creamLight, { p: [0, 1.25, 0] });
		panelBox.add(rbox(0.4, 0.3, 0.5, 0.05, 2), m.steelSoft, { p: [0, 0.15, 0] });
		const pg = new THREE.Group();
		pg.add(panelBox.build('stops'));
		['end_turn', 'tool_use', 'max_tokens', 'refusal'].forEach((name, i) => {
			const y = 2 - i * 0.48;
			const l = new Label(name, 0.21, { font: font.mono, weight: 600, align: 'left' });
			l.mesh.position.set(-1.45, y, 0.156);
			pg.add(l.mesh);
			const lamp = new Lamp(rbox(0.16, 0.16, 0.04, 0.05, 3), color.green, 0.1);
			lamp.mesh.position.set(1.65, y, 0.16);
			pg.add(lamp.mesh);
			this.stops.push(lamp);
		});
		const title = createSign('Stop reason', 0.2);
		title.position.set(0, 2.72, 0.05);
		pg.add(title);
		pg.position.set(DEC + 5.4, PAD_Y, 2.9);
		pg.rotation.x = -0.3;
		const subPad = createPad(6.2, 2.8);
		subPad.position.set(DEC + 5.4, PAD_Y, 3.5);
		this.group.add(subPad, pg);
		this.setHarness('claude');
	}

	private buildCall(id: HarnessId) {
		const list = [new OutTile('<tool>', 'mark'), ...CALLS[id].pieces.map((p) => new OutTile(p, 'tool')), new OutTile('<end>', 'mark')];
		list.forEach((t) => {
			t.group.visible = false;
			this.group.add(t.group);
		});
		return list;
	}

	setHarness(id: HarnessId) {
		Object.values(this.rows).forEach((r) => r.forEach((t) => (t.group.visible = false)));
		this.row = [...this.think, ...this.rows[id]];
		let x = ROW0;
		this.xs = this.row.map((t) => {
			const c = x + t.width / 2;
			x += t.width + 0.06;
			return c;
		});
	}

	/** How many tiles exist at T, as a fraction: thinking first, a held breath, then the call. */
	private count(T: number) {
		const nT = THINKING.length;
		const nC = this.row.length - nT;
		return 1 + seg(T, THINK_A, THINK_B) * (nT - 1) + seg(T, CALL_A, CALL_B) * nC;
	}

	update(T: number, shift: number, gate: number, time: number) {
		const n = this.count(T);
		const whole = Math.floor(n);
		const f = n - whole;
		const working = T > THINK_A && (T < THINK_B || (T > CALL_A && T < CALL_B));

		this.row.forEach((tile, i) => {
			const appear = i === 0 ? (T >= 15.98 ? 1 : 0) : n - i - 0.55;
			const x = this.xs[i] + shift;
			const past = x > gate;
			tile.group.visible = appear > 0 && !past;
			if (!tile.group.visible) return;
			const k = Math.min(1, appear * 2.3);
			this.a.set(x, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
			if (k < 1) arcPoint(this.port, this.a, 1.4, smooth(k), this.a);
			tile.group.position.copy(this.a);
			tile.group.scale.setScalar(Math.max(0.3, k));
		});

		// The newest token rides back into the machine: its K and V do not exist until the next pass.
		const riding = working && f < 0.45 && whole >= 1;
		this.rider.visible = riding;
		if (riding) {
			this.b.set(this.xs[whole - 1], RAIL_Y + TILE_H / 2, RAIL_Z);
			arcPoint(this.b, this.portIn, 1.3, smooth(seg(f, 0, 0.45)), this.a);
			this.rider.position.copy(this.a);
			this.rider.rotation.x = f * 4;
		}
		const up = seg(f, 0.3, 0.62);
		this.bead.visible = working && up > 0 && up < 1;
		if (this.bead.visible) this.bead.position.set(DEC - 7.2, PAD_Y + 0.7 + up * 4.1, 0);
		this.flash.forEach((lamp, i) => {
			const on = working ? bell(up, i / 5 - 0.1, i / 5 + 0.3) : 0;
			lamp.set('#ffc53d', 0.05 + on * 1.3);
		});

		const d = this.d;
		for (let i = 0; i < this.kv.count; i++) {
			const row = i % 22;
			const col = Math.floor(i / 22);
			const made = n > i / 2 + 1 ? 1 : 0;
			d.position.set(DEC - 1 - 1.1 + 0.55 * (row % 5) + col * 0.05, PAD_Y + 0.5 + 0.36 * Math.floor(row / 5) + col * 0.02, 0.27 + col * 0.26);
			d.scale.setScalar(made ? 1 : 0.0001);
			d.updateMatrix();
			this.kv.setMatrixAt(i, d.matrix);
		}
		this.kv.instanceMatrix.needsUpdate = true;

		const nT = THINKING.length;
		const midThink = (this.xs[0] + this.xs[nT - 1]) / 2 + shift;
		const s1 = outBack(seg(T, 16.5, 16.62), 2) * (1 - seg(T, 18.1, 18.2));
		this.thinkSign.visible = s1 > 0.001;
		this.thinkSign.scale.setScalar(Math.max(0.001, s1));
		this.thinkSign.position.set(midThink, RAIL_Y + 0.72, RAIL_Z - 0.9);
		const midTool = (this.xs[nT] + this.xs[this.xs.length - 1]) / 2 + shift;
		const s2 = outBack(seg(T, 17.5, 17.62), 2) * (1 - seg(T, 18.1, 18.2));
		this.toolSign.visible = s2 > 0.001;
		this.toolSign.scale.setScalar(Math.max(0.001, s2));
		this.toolSign.position.set(midTool, RAIL_Y + 0.72, RAIL_Z - 0.9);

		const stopK = smooth(seg(T, 17.72, 17.8));
		this.stops.forEach((lamp, i) => lamp.set(i === 1 ? color.green : '#54606f', i === 1 ? 0.1 + stopK * 1.1 : 0.03));
		void time;
	}
}

/* -------------------------------------------------------------- detokenizer ---- */

const SLIP_TEXT = ['Grep', '("lock', '|schedule', '", src', '/")', 'The user', ' wants', ' the race'];

class Detokenizer {
	group = new THREE.Group();
	private slips: THREE.Mesh[] = [];
	private lamp: Lamp;
	private TOP = PAD_Y + 4;

	constructor() {
		const m = mats();
		this.group.position.x = DET;
		const pad = createPad(10, 10);
		pad.position.set(0, PAD_Y, 2.4);
		this.group.add(pad);

		// An arch over the belt: tiles go in, nothing but paper comes out.
		const b = new Batch();
		const W = 3.6;
		const H = 3.5;
		const D = 8;
		for (const z of [-0.6, 7.6]) {
			b.add(rbox(W, H + 0.2, 1.1, 0.14, 3), m.cream, { p: [0, PAD_Y + (H + 0.2) / 2, z] });
		}
		b.add(rbox(W, 1.1, D + 1.1, 0.2, 4), m.cream, { p: [0, PAD_Y + H + 0.3, 3.5] });
		b.add(rbox(0.1, 3.06, 1.3, 0.02, 1), m.recess, { p: [-W / 2 - 0.005, PAD_Y + 1.56, RAIL_Z] });
		this.group.add(b.build('detok'));

		const sign = createSign('Detokenizer: IDs become text', 0.24);
		sign.position.set(-0.2, PAD_Y + H + 0.3, 8.06);
		this.group.add(sign);
		const stay = createSign('Token IDs stay here', 0.24, '#ffffff', m.red);
		stay.position.set(-W / 2 - 2.2, PAD_Y + 2.2, RAIL_Z + 1.8);
		stay.rotation.y = 0.3;
		const pole = new Batch();
		pole.add(rbox(0.1, 2.2, 0.1, 0.03, 2), m.steelSoft, { p: [-W / 2 - 2.2, PAD_Y + 1.1, RAIL_Z + 1.72] });
		this.group.add(stay, pole.build('pole'));

		this.lamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.3);
		this.lamp.mesh.position.set(W / 2 - 0.3, PAD_Y + H + 0.3, 8.06);
		this.group.add(this.lamp.mesh);

		// The way out: a glass tube, up through the ceiling.
		const glass = new THREE.Mesh(
			new THREE.CylinderGeometry(0.72, 0.72, 40, 40, 1, true),
			new THREE.MeshPhysicalMaterial({ color: '#d5ecff', transparent: true, opacity: 0.2, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.position.set(0, this.TOP + 20.5, 3.5);
		glass.renderOrder = 4;
		this.group.add(glass);
		const collar = new Batch();
		collar.add(new THREE.CylinderGeometry(0.96, 1.02, 0.34, 40), m.steel, { p: [0, this.TOP + 0.65, 3.5] });
		collar.add(new THREE.CylinderGeometry(0.86, 0.86, 0.1, 40), m.steel, { p: [0, this.TOP + 6, 3.5] });
		collar.add(new THREE.CylinderGeometry(0.86, 0.86, 0.1, 40), m.steel, { p: [0, this.TOP + 12, 3.5] });
		this.group.add(collar.build('collar'));

		SLIP_TEXT.forEach((text) => {
			const s = new Surface(420, 170);
			s.draw((c, w, h) => {
				c.fillStyle = color.paper;
				c.fillRect(0, 0, w, h);
				c.fillStyle = color.ink;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.font = `600 62px ${font.mono}`;
				c.fillText(text.trim(), w / 2, h / 2);
			});
			const slip = new THREE.Mesh(
				new THREE.PlaneGeometry(0.96, 0.39),
				new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.7, side: THREE.DoubleSide })
			);
			slip.visible = false;
			this.group.add(slip);
			this.slips.push(slip);
		});
	}

	update(k: number, time: number) {
		const on = k > 0.05;
		this.lamp.mix(color.amber, color.green, on ? 1 : 0, on ? 1.1 : 0.3);
		this.slips.forEach((slip, i) => {
			const run = (k * 3.6 - (i / this.slips.length) * 1.1) % 1;
			const live = k > 0.04 + (i / this.slips.length) * 0.3 && run > 0;
			slip.visible = live;
			if (!live) return;
			slip.position.set(Math.sin(i * 2.3 + time) * 0.14, this.TOP + 0.5 + run * 22, 3.5 + Math.cos(i * 1.7) * 0.14);
			slip.rotation.set(Math.sin(run * 8 + i) * 0.35, 0.3 + run * 2.4 + i, Math.sin(run * 5 + i) * 0.2);
		});
	}
}

/* ------------------------------------------------------------------ chapter ---- */

export class Forward {
	group = new THREE.Group();
	private prefill = new Transformer();
	private sampler = new Sampler();
	private decoder = new Decoder();
	private detok = new Detokenizer();

	constructor() {
		this.group.add(this.prefill.group, this.sampler.group, this.decoder.group, this.detok.group);
	}

	setHarness(id: HarnessId) {
		this.decoder.setHarness(id);
	}

	update(T: number, time: number) {
		const near = (g: THREE.Object3D, a: number, b: number) => (g.visible = T > a && T < b);
		if (near(this.prefill.group, 13.9, 15.4)) this.prefill.update(T, time);
		if (near(this.sampler.group, 14.7, 16.3)) {
			this.sampler.update(seg(T, 15.06, 15.3), seg(T, 15.3, 15.42), seg(T, 15.42, 15.78), seg(T, 15.78, 15.88), seg(T, 15.88, 16), time);
		}
		if (near(this.decoder.group, 15.7, 18.8)) {
			this.decoder.update(T, inOut(seg(T, 18.06, 18.64)) * 46, DET - 0.2, time);
		}
		if (near(this.detok.group, 17.6, 19.2)) this.detok.update(seg(T, 18.14, 18.98), time);
	}
}

