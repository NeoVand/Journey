import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { createSign } from '../kit/parts';
import { machine, shadowOn } from '../kit/machines';
import { font, Label, Surface } from '../kit/print';
import { bell, inOut, lerp, outBack, seg, smooth } from '../kit/math';

const GATE_X = -4.9; // left of everything it would otherwise stand in front of
const PRESS_X = -0.95; // straight in front of slot 9, where the one new block ends up
const PITCH = 1.5;
const RB_H = 0.36;
const FRESH_Z = 3.2;
const BAR_X0 = 1.1;
const BAR_W = 4.7;
const REUSED = 21000 / 22500;

const COLS = 6;
const ROWS = 2;
const SW = 1.9;
const SD = 1.75;
const BH = 0.56;

/** Physical slot of each of our blocks: deliberately scattered, because that is the whole point. */
const OURS: Record<string, number> = { A: 8, B: 2, C: 11, D: 5, E: 9 };
/** Strangers: one quiet colour, because they are not the story here. */
const STRANGERS = [3, 4, 6, 10];
const NAMES = ['A', 'B', 'C', 'D', 'E'];

const slotXZ = (slot: number) => {
	const col = (slot - 1) % COLS;
	const row = Math.floor((slot - 1) / COLS);
	return [(col - (COLS - 1) / 2) * SW, (row - (ROWS - 1) / 2) * SD] as const;
};

/** A pool of chip memory, shared with strangers, plus the table saying which block is where. */
export class BlockTray {
	group = new THREE.Group();
	private blocks: { name: string; mesh: THREE.Mesh; material: THREE.MeshPhysicalMaterial; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
	private row: { mesh: THREE.Mesh; material: THREE.MeshPhysicalMaterial }[] = [];
	private turnTwo = new THREE.Group();
	private gateLamp!: Lamp;
	private prefill!: THREE.MeshStandardMaterial;
	private barGreen!: THREE.Mesh;
	private barAmber!: THREE.Mesh;
	private cream = new THREE.Color(color.creamLight);
	private table = new Surface(760, 860);
	private tableKey = '';
	private green = new THREE.Color('#1fc873');
	private amber = new THREE.Color(color.amber);
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private c = new THREE.Vector3();

	constructor(
		private railZ: number,
		private railY: number
	) {
		const m = mats();
		const b = new Batch();
		const W = COLS * SW + 0.5;
		const D = ROWS * SD + 0.5;
		b.add(extrude(roundedRect(W, D, 0.22), 0.2, 0.05, 3, 8), m.steelSoft, { p: [0, 0.1, 0], r: [-Math.PI / 2, 0, 0] });
		this.group.add(b.build('tray'));

		const floor = new Surface(1280, Math.round((1280 * (D - 0.26)) / (W - 0.26)));
		floor.draw((c, w, h) => {
			c.fillStyle = '#0d1b3c';
			c.fillRect(0, 0, w, h);
			const sx = (w / (W - 0.26)) * SW;
			const sy = (h / (D - 0.26)) * SD;
			const ox = (w - sx * COLS) / 2;
			const oy = (h - sy * ROWS) / 2;
			for (let s = 0; s < COLS * ROWS; s++) {
				const col = s % COLS;
				const row = Math.floor(s / COLS);
				c.fillStyle = '#17294f';
				c.beginPath();
				c.roundRect(ox + col * sx + 6, oy + row * sy + 6, sx - 12, sy - 12, 10);
				c.fill();
				c.fillStyle = 'rgba(160,190,235,.8)';
				c.font = `600 44px ${font.mono}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(String(s + 1), ox + col * sx + sx / 2, oy + row * sy + sy / 2);
			}
		});
		const top = new THREE.Mesh(
			new THREE.PlaneGeometry(W - 0.26, D - 0.26),
			new THREE.MeshStandardMaterial({ map: floor.texture, roughness: 0.7, emissive: '#ffffff', emissiveMap: floor.texture, emissiveIntensity: 0.32 })
		);
		top.rotation.x = -Math.PI / 2;
		top.position.y = 0.206;
		top.receiveShadow = true;
		this.group.add(top);

		const others = new THREE.InstancedMesh(
			rbox(SW - 0.2, BH, SD - 0.2, 0.08, 3),
			new THREE.MeshPhysicalMaterial({ color: '#9fb2d6', roughness: 0.42, clearcoat: 0.5 }),
			STRANGERS.length
		);
		const d = new THREE.Object3D();
		STRANGERS.forEach((slot, i) => {
			const [x, z] = slotXZ(slot);
			d.position.set(x, 0.2 + BH / 2, z);
			d.updateMatrix();
			others.setMatrixAt(i, d.matrix);
		});
		others.castShadow = true;
		others.receiveShadow = true;
		this.group.add(others);

		// Our blocks.
		const geo = rbox(SW - 0.2, BH, SD - 0.2, 0.08, 3);
		NAMES.forEach((name, i) => {
			const material = (m.hbm as THREE.MeshPhysicalMaterial).clone();
			const mesh = new THREE.Mesh(geo, material);
			mesh.castShadow = true;
			const face = new Label(name, 0.6, { color: '#06351c', weight: 800 }).mesh;
			face.rotation.x = -Math.PI / 2;
			face.position.y = BH / 2 + 0.003;
			mesh.add(face);
			mesh.visible = false;
			this.group.add(mesh);
			const [x, z] = slotXZ(OURS[name]);
			this.blocks.push({
				name,
				mesh,
				material,
				from: new THREE.Vector3((i - 1.5) * (SW + 0.1), this.railY + BH / 2, this.railZ),
				to: new THREE.Vector3(x, 0.2 + BH / 2, z)
			});
		});

		this.buildTurnTwo();

		// The block table.
		const stand = new Batch();
		const TW = 3.9;
		const TH = TW * (860 / 760);
		stand.add(extrude(roundedRect(TW + 0.2, TH + 0.2, 0.16), 0.14, 0.03, 3, 10), m.creamLight, { p: [0, TH / 2 + 0.22, 0] });
		stand.add(rbox(TW + 0.5, 0.12, 0.8, 0.04, 2), m.steelSoft, { p: [0, 0.06, 0] });
		const tableGroup = new THREE.Group();
		tableGroup.add(stand.build('table-stand'));
		const face = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), new THREE.MeshStandardMaterial({ map: this.table.texture, roughness: 0.7 }));
		face.position.set(0, TH / 2 + 0.22, 0.076);
		tableGroup.add(face);
		tableGroup.position.set(-(W / 2 + 2.45), 0, 0);
		tableGroup.rotation.y = 0.16;
		this.group.add(tableGroup);
		this.drawTable(0, 0);

	}

	private drawTable(rows: number, hits: number) {
		const key = `${rows}/${hits}`;
		if (key === this.tableKey) return;
		this.tableKey = key;
		this.table.draw((c, w, h) => {
			c.fillStyle = '#fffaf0';
			c.fillRect(0, 0, w, h);
			c.fillStyle = color.ink;
			c.font = `800 68px ${font.display}`;
			c.textBaseline = 'alphabetic';
			c.letterSpacing = '-1px';
			c.fillText('Block table', 56, 104);
			c.letterSpacing = '0px';
			c.font = `500 34px ${font.sans}`;
			c.fillStyle = '#5a6b85';
			c.fillText('block', 56, 170);
			c.fillText('memory slot', 300, 170);
			const rowH = 120;
			NAMES.forEach((name, i) => {
				const y = 196 + i * rowH;
				c.strokeStyle = 'rgba(60,84,120,.2)';
				c.lineWidth = 2;
				c.beginPath();
				c.moveTo(48, y);
				c.lineTo(w - 48, y);
				c.stroke();
				if (i >= rows) return;
				const hit = i < hits;
				c.fillStyle = '#1fc873';
				c.beginPath();
				c.roundRect(56, y + 18, 110, 84, 16);
				c.fill();
				c.fillStyle = '#06351c';
				c.font = `800 60px ${font.display}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(name, 111, y + 62);
				c.textAlign = 'left';
				c.fillStyle = color.ink;
				c.font = `700 66px ${font.mono}`;
				c.fillText(String(OURS[name]), 300, y + 64);
				if (hit) {
					c.fillStyle = '#0f8a4a';
					c.font = `700 38px ${font.sans}`;
					c.textAlign = 'right';
					c.fillText('reused', w - 56, y + 62);
					c.textAlign = 'left';
				}
				c.textBaseline = 'alphabetic';
			});
		});
	}

	/** Turn two: the same blocks again, on the belt, asked one by one whether they have been computed before. */
	private buildTurnTwo() {
		const m = mats();
		const t = this.turnTwo;
		this.group.add(t);

		const geo = rbox(1.36, RB_H, 0.86, 0.06, 3);
		NAMES.forEach((name, i) => {
			const material = new THREE.MeshPhysicalMaterial({ color: color.creamLight, roughness: 0.4, clearcoat: 0.5 });
			const mesh = new THREE.Mesh(geo, material);
			mesh.castShadow = true;
			const face = new Label(name, 0.5, { color: color.ink, weight: 800 }).mesh;
			face.rotation.x = -Math.PI / 2;
			face.position.y = RB_H / 2 + 0.003;
			mesh.add(face);
			mesh.visible = false;
			this.group.add(mesh);
			this.row.push({ mesh, material });
			void i;
		});

		// The gate over the belt.
		const Z = this.railZ;
		const gate = new Batch();
		for (const s of [-1, 1]) gate.add(rbox(0.28, 1.72, 0.28, 0.07, 3), m.cream, { p: [GATE_X, this.railY + 0.72, Z + s * 1.02] });
		gate.add(rbox(0.46, 0.46, 2.6, 0.1, 3), m.cream, { p: [GATE_X, this.railY + 1.72, Z] });
		t.add(gate.build('prefix-gate'));
		const sign = createSign('Computed before?', 0.3);
		sign.position.set(GATE_X, this.railY + 2.34, Z);
		t.add(sign);
		this.gateLamp = new Lamp(rbox(0.2, 0.2, 0.05, 0.06, 3), color.amber, 0.2);
		this.gateLamp.mesh.position.set(GATE_X - 0.24, this.railY + 1.72, Z);
		this.gateLamp.mesh.rotation.y = Math.PI / 2;
		t.add(this.gateLamp.mesh);

		// Prefill, for whatever the gate does not recognise.
		const press = machine({ w: 2.3, h: 1.14, d: 1.5, finish: 'cobalt', name: 'Prefill', signH: 0.2, vent: false });
		press.position.set(PRESS_X, 0.2, FRESH_Z);
		t.add(press);
		shadowOn(t, PRESS_X, 0.2, FRESH_Z, 2.6, 1.8, 0.4);
		const hatch = new Batch();
		hatch.add(rbox(1.36, 0.03, 1, 0.01, 1), m.recess, { p: [PRESS_X, 0.2 + 0.14 + 1.14 + 0.002, FRESH_Z] });
		t.add(hatch.build('prefill-hatch'));
		this.prefill = new THREE.MeshStandardMaterial({ color: '#2a5fd8', emissive: '#6fc0ff', emissiveIntensity: 0.05 });
		const light = new THREE.Mesh(rbox(1.3, 0.14, 0.05, 0.03, 2), this.prefill);
		light.position.set(PRESS_X, 0.48, FRESH_Z + 0.78);
		t.add(light);

		// What it all comes to: the part reused, and the part that had to run.
		const bar = rbox(1, 0.34, 0.62, 0.05, 2);
		bar.translate(0.5, 0, 0);
		this.barGreen = new THREE.Mesh(bar, m.hbm);
		this.barGreen.position.set(BAR_X0, 0.2 + 0.17, FRESH_Z);
		this.barGreen.castShadow = true;
		this.barAmber = new THREE.Mesh(bar, m.amber);
		this.barAmber.position.set(BAR_X0 + BAR_W * REUSED, 0.2 + 0.17, FRESH_Z);
		this.barAmber.castShadow = true;
		t.add(this.barGreen, this.barAmber);
		shadowOn(t, BAR_X0 + BAR_W / 2, 0.2, FRESH_Z, BAR_W + 0.3, 0.9, 0.3);
		const floor = (text: string, x: number, align: 'left' | 'right', ink: string) => {
			const l = new Label(text, 0.38, { color: ink, weight: 800, align });
			l.mesh.rotation.x = -Math.PI / 2;
			l.mesh.position.set(x, 0.206, FRESH_Z + 0.66);
			t.add(l.mesh);
		};
		floor('21,000 reused', BAR_X0, 'left', '#0a7a42');
		floor('1,500 new', BAR_X0 + BAR_W, 'right', '#a86c00');
		t.visible = false;
	}

	/** place: 0..1 our blocks hop into scattered slots. arrive, hit, compute: turn two. */
	update(place: number, arrive: number, hit: number, compute: number, time: number) {
		const onRail = (i: number) => i < 4;
		const steps = hit * 5;
		const step = Math.min(4, Math.floor(steps));
		const f = hit >= 1 ? 1 : steps - step;
		// Where the row is: each step brings the next block under the gate, and it waits there to be judged.
		const rowP = arrive < 1 ? lerp(-9, -1, inOut(arrive)) : -1 + step + inOut(seg(f, 0, 0.5));
		const judged = (i: number) => (hit >= 1 ? 1 : step > i ? 1 : step === i ? smooth(seg(f, 0.55, 0.85)) : 0);

		this.blocks.forEach((b, i) => {
			if (!onRail(i)) {
				// The new block comes out of prefill, finished, and takes a free slot.
				const out = seg(compute, 0.66, 1);
				b.mesh.visible = out > 0;
				if (!out) return;
				const e = inOut(out);
				this.a.set(PRESS_X, 1.4, FRESH_Z);
				b.mesh.position.lerpVectors(this.a, b.to, smooth(seg(e, 0, 0.74)));
				b.mesh.position.y += 1.3 * smooth(seg(e, 0, 0.3)) * (1 - smooth(seg(e, 0.74, 1)));
				const landed = bell(out, 0.84, 1);
				const grown = lerp(0.6, 1, e);
				b.mesh.scale.set(grown * (1 + landed * 0.08), grown * (1 - landed * 0.2), grown * (1 + landed * 0.08));
				b.material.emissiveIntensity = 0.45 + bell(out, 0.7, 1) * 1.4;
				return;
			}
			const delay = i * 0.17;
			const k = seg(place, delay, delay + 0.46);
			b.mesh.visible = place > 0;
			const e = inOut(k);
			// Up, across, and straight down into its slot, so it clears the blocks already there.
			b.mesh.position.lerpVectors(b.from, b.to, smooth(seg(e, 0, 0.74)));
			b.mesh.position.y += 1.7 * smooth(seg(e, 0, 0.3)) * (1 - smooth(seg(e, 0.74, 1)));
			b.mesh.rotation.z = Math.sin(e * Math.PI) * 0.22;
			const landed = bell(k, 0.82, 1);
			const grown = outBack(seg(place, 0, 0.12), 2);
			b.mesh.scale.set(grown * (1 + landed * 0.08), grown * (1 - landed * 0.2), grown * (1 + landed * 0.08));
			// Recognised: the block in memory stands up, because it is the one being reused.
			const flash = step === i && hit < 1 ? bell(f, 0.5, 1) : 0;
			b.mesh.position.y += flash * 0.42;
			b.material.emissiveIntensity = 0.45 + flash * 1.8;
		});

		/* ---- turn two ---- */
		const t = this.turnTwo;
		t.visible = arrive > 0;
		const rise = outBack(seg(arrive, 0, 0.5), 1.2);
		t.scale.y = Math.max(0.001, rise);
		this.row.forEach((r, i) => {
			r.mesh.visible = arrive > 0;
			if (!r.mesh.visible) return;
			const x = GATE_X + (rowP - i) * PITCH;
			this.a.set(x, this.railY + RB_H / 2 + 0.002, this.railZ);
			const j = judged(i);
			if (i < 4) {
				r.material.color.copy(this.cream).lerp(this.green, j);
				r.mesh.position.copy(this.a);
				return;
			}
			// E is not recognised. It leaves the belt, over the gate's foot, and into prefill.
			const lift = seg(compute, 0, 0.3);
			const inside = seg(compute, 0.26, 0.36);
			r.material.color.copy(this.amber);
			r.mesh.visible = inside < 1;
			if (lift > 0) {
				this.b.set(PRESS_X, 1.64, FRESH_Z);
				this.c.lerpVectors(this.a, this.b, inOut(lift));
				this.c.y += Math.sin(inOut(lift) * Math.PI) * 1.2;
				this.c.y -= inOut(inside) * 0.5;
				r.mesh.position.copy(this.c);
			} else r.mesh.position.copy(this.a);
		});
		const verdict = step === 4 ? color.amber : color.green;
		const gateOn = arrive >= 1 && hit < 1 ? bell(f, 0.5, 1) : 0;
		this.gateLamp.set(hit >= 1 ? color.amber : verdict, 0.15 + gateOn * 1.5 + (hit >= 1 && compute < 0.3 ? 0.5 : 0));
		const running = bell(compute, 0.3, 0.68);
		this.prefill.emissiveIntensity = 0.05 + running * (1.6 + Math.sin(time * 14) * 0.4);

		const matched = (step + (hit >= 1 ? 1 : judged(step))) / 4;
		this.barGreen.scale.x = Math.max(0.001, BAR_W * REUSED * Math.min(1, matched));
		const newK = seg(compute, 0.66, 1);
		this.barAmber.scale.x = Math.max(0.001, BAR_W * (1 - REUSED) * newK);
		this.barAmber.visible = newK > 0;

		const rows = Math.floor(seg(place, 0, 1) * 4 + 0.01) + (compute > 0.85 ? 1 : 0);
		const hits = hit >= 1 ? 4 : Math.min(4, step + (judged(step) > 0.5 ? 1 : 0));
		this.drawTable(rows, arrive > 0 ? hits : 0);
	}
}
