import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { drawIcon, Label, Surface, font, roundRectPath } from '../kit/print';
import { Card } from '../kit/machines';
import { plinth, screw, ventX } from '../kit/parts';
import { hitBox } from '../poke';

export const HW = 2.7;
export const HH = 3.7;
export const HD = 2.2;

/** Where the lines enter, in the harness's own coordinates. The pipes in the world are drawn to these. */
export const PORT_Y = 0.42;
export const PORT_OUT_Z = 0.55;
export const PORT_MCP_Z = -0.55;
export const PORT_KEYS_Z = -0.05;
export const PORT_BACK_X = -0.7;
export const PORT_BACK_Y = 1.3;

const OPEN_W = 2.14;
const OPEN_H = 2.5;
const OPEN_Y = 1.62;
const ROWS = 4;
const ROW_H = OPEN_H / ROWS;
const DRAWER_TRAVEL = 1.25;
/** How far a drawer comes out when the reader pulls it. */
const PULL = 0.96;
/** A sheet may only stand once its drawer is this far out, or it would swing into the drawer above. */
const CLEAR = 0.9;
/** How far back a standing sheet leans. */
const LEAN = 0.14;

/** A number with a little give in it, so things arrive like objects rather than slides. */
class Give {
	x = 0;
	private v = 0;

	to(goal: number, stiff: number, damp: number, dt: number) {
		this.v += ((goal - this.x) * stiff - this.v * damp) * dt;
		this.x = Math.max(0, this.x + this.v * dt);
	}
}

export const DRAWER_NAMES = ['Instructions', 'Environment', 'Tools', 'Conversation'] as const;
const DRAWER_ICONS = ['doc', 'cube', 'wrench', 'chat'];
/** What stands up out of a drawer when the reader pulls it open to look. */
const DRAWER_PAPER = [
	['Who the agent is', 'Your project’s rules'],
	['Folder, git branch', 'OS, date, shell'],
	['What it may ask for', 'Built in, or from MCP'],
	['Your prompt', 'Just that, on turn one']
];

class Drawer {
	group = new THREE.Group();
	lamp: Lamp;
	sheet: THREE.Group;
	hit: THREE.Mesh;
	sheetHit: THREE.Object3D;
	private plate: Surface;
	y: number;

	constructor(public index: number, name: string, icon: string) {
		const m = mats();
		const b = new Batch();
		const fw = OPEN_W - 0.08;
		const fh = ROW_H - 0.06;
		this.y = OPEN_Y + OPEN_H / 2 - ROW_H * (index + 0.5);

		// Tray: a real open box, so a pulled drawer has somewhere to hold its contents.
		const len = 1.5;
		const wall = 0.035;
		const th = fh * 0.56;
		const zc = -len / 2 - 0.02;
		b.add(rbox(fw - 0.14, wall, len, 0.012, 2), m.steelSoft, { p: [0, -fh / 2 + 0.05, zc] });
		for (const s of [-1, 1]) {
			b.add(rbox(wall, th, len, 0.012, 2), m.steelSoft, { p: [s * (fw / 2 - 0.09), -fh / 2 + 0.05 + th / 2, zc] });
		}
		b.add(rbox(fw - 0.14, th, wall, 0.012, 2), m.steelSoft, { p: [0, -fh / 2 + 0.05 + th / 2, -len - 0.02] });

		// Paper resting in the tray.
		for (let i = 0; i < 4; i++) {
			b.add(rbox(fw - 0.4, 0.016, len - 0.42 - i * 0.03, 0.004, 1), m.paper, {
				p: [(i % 2 ? 1 : -1) * 0.014, -fh / 2 + 0.082 + i * 0.022, zc + 0.02]
			});
		}

		// Drawer front.
		const front = extrude(roundedRect(fw, fh, 0.075), 0.1, 0.028, 4, 10);
		b.add(front, m.creamLight, { p: [0, 0, 0.05] });
		// Pull: a scooped metal bar at the lower edge.
		b.add(rbox(0.5, 0.05, 0.06, 0.024, 3), m.steel, { p: [fw / 2 - 0.46, -fh / 2 + 0.12, 0.118] });
		this.group.add(b.build(`drawer-${index}`));

		// Printed face.
		this.plate = new Surface(1024, Math.round((1024 * (fh - 0.06)) / (fw - 0.08)));
		const c = this.plate.ctx;
		const H = this.plate.h;
		c.clearRect(0, 0, this.plate.w, H);
		const iconBox = H * 0.72;
		roundRectPath(c, H * 0.14, (H - iconBox) / 2, iconBox, iconBox, 26);
		c.fillStyle = '#fff';
		c.fill();
		c.strokeStyle = 'rgba(40,64,95,.22)';
		c.lineWidth = 3;
		c.stroke();
		drawIcon(c, icon, H * 0.14 + iconBox * 0.17, (H - iconBox) / 2 + iconBox * 0.17, iconBox * 0.66, '#1f3e6e', 2.1);
		c.font = `700 ${H * 0.36}px ${font.display}`;
		c.letterSpacing = `${-H * 0.004}px`;
		c.fillStyle = color.ink;
		c.textBaseline = 'middle';
		c.fillText(name, H * 0.14 + iconBox + H * 0.2, H * 0.48);
		this.plate.texture.needsUpdate = true;

		const face = new THREE.Mesh(
			new THREE.PlaneGeometry(fw - 0.08, fh - 0.06),
			new THREE.MeshStandardMaterial({
				map: this.plate.texture,
				transparent: true,
				roughness: 0.5,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -2
			})
		);
		face.position.set(0, 0, 0.101);
		face.renderOrder = 2;
		this.group.add(face);

		// State lamp on the front's right end.
		this.lamp = new Lamp(rbox(0.1, 0.1, 0.034, 0.03, 3), color.amber, 0.4);
		this.lamp.mesh.position.set(fw / 2 - 0.16, 0.02, 0.112);
		this.group.add(this.lamp.mesh);

		this.sheet = new THREE.Group();
		this.group.add(this.sheet);

		// From this low the inside of a tray can't be seen, so its top sheet stands up to be read.
		const card = new Card(1.6, 1, 330, 0.012);
		card.mesh.position.y = 0.5;
		card.draw((c, w, h) => {
			c.fillStyle = color.amber;
			c.fillRect(0, 0, 16, h);
			c.textBaseline = 'middle';
			// Both lines in the top half, because the drawer's front hides the rest.
			const line = (text: string, y: number, weight: number, ink: string) => {
				let size = h * 0.135;
				c.font = `${weight} ${size}px ${font.sans}`;
				while (c.measureText(text).width > w - 70) c.font = `${weight} ${--size}px ${font.sans}`;
				c.fillStyle = ink;
				c.fillText(text, 44, y);
			};
			line(DRAWER_PAPER[index][0], h * 0.15, 700, color.ink);
			line(DRAWER_PAPER[index][1], h * 0.33, 600, '#46546e');
		});
		this.sheet.add(card.mesh);
		this.sheetHit = card.mesh;
		// Hinged at the near edge of the pile, lying on top of it until it's called for.
		this.sheet.position.set(0, -fh / 2 + 0.16, -0.16);
		this.sheet.visible = false;

		// The tray as well as the front, so a drawer that's out can be pushed back wherever you press it.
		this.hit = hitBox(fw, fh, 1.7);
		this.hit.position.z = -0.72;
		this.group.add(this.hit);
	}

	update(open: number, stand = 0) {
		this.group.position.set(0, this.y, HD / 2 - 0.06 + open * DRAWER_TRAVEL);
		this.sheet.visible = stand > 0.01;
		// Lying flat at 0, leaning back at 1. The spring's overshoot brings it up to plumb and no further.
		if (this.sheet.visible) this.sheet.rotation.x = -(LEAN + (1 - Math.min(stand, 1.1)) * (Math.PI / 2 - LEAN));
	}
}

export class Harness {
	group = new THREE.Group();
	drawers: Drawer[] = [];
	private sideLamps: Lamp[] = [];
	private roofLamp: Lamp;
	private name: Label;

	constructor() {
		const m = mats();
		const b = new Batch();
		plinth(b, HW + 0.34, HD + 0.34, 0.14);

		const Y0 = 0.14;
		const midY = Y0 + HH / 2;

		// Shell: an extruded ring, so the opening is a true recess with a soft inner lip.
		const profile = chamferRect(HW, HH, 0.34, 0.1);
		const hole = new THREE.Path();
		const hw = OPEN_W / 2;
		const hy = OPEN_Y - midY;
		const hh = OPEN_H / 2;
		const r = 0.08;
		hole.moveTo(-hw + r, hy - hh);
		hole.lineTo(hw - r, hy - hh);
		hole.quadraticCurveTo(hw, hy - hh, hw, hy - hh + r);
		hole.lineTo(hw, hy + hh - r);
		hole.quadraticCurveTo(hw, hy + hh, hw - r, hy + hh);
		hole.lineTo(-hw + r, hy + hh);
		hole.quadraticCurveTo(-hw, hy + hh, -hw, hy + hh - r);
		hole.lineTo(-hw, hy - hh + r);
		hole.quadraticCurveTo(-hw, hy - hh, -hw + r, hy - hh);
		profile.holes.push(hole);
		const shell = extrude(profile, HD, 0.085, 6, 10);
		b.add(shell, m.cream, { p: [0, midY, 0] });

		// A real cavity, dark so drawers read against it, with a bay for each drawer: nothing stands in a tray's way as it slides out.
		const BACK = -0.98;
		const LIP = HD / 2 - 0.12;
		const deep = LIP - BACK;
		const midZ = (LIP + BACK) / 2;
		const t = 0.012;
		b.add(new THREE.BoxGeometry(OPEN_W, OPEN_H, 0.03), m.recess, { p: [0, OPEN_Y, BACK] });
		for (const s of [-1, 1]) {
			b.add(new THREE.BoxGeometry(t, OPEN_H, deep), m.recess, { p: [s * (OPEN_W / 2 - t / 2), OPEN_Y, midZ] });
			b.add(new THREE.BoxGeometry(OPEN_W, t, deep), m.recess, { p: [0, OPEN_Y + s * (OPEN_H / 2 - t / 2), midZ] });
		}
		for (let row = 1; row < ROWS; row++) {
			b.add(new THREE.BoxGeometry(OPEN_W, 0.016, deep), m.recess, { p: [0, OPEN_Y + OPEN_H / 2 - ROW_H * row, midZ] });
		}

		// Metal reveal lining the opening.
		const trimOuter = roundedRect(OPEN_W + 0.1, OPEN_H + 0.1, 0.1);
		const trimHole = new THREE.Path();
		{
			const w = OPEN_W / 2;
			const h = OPEN_H / 2;
			const q = 0.07;
			trimHole.moveTo(-w + q, -h);
			trimHole.lineTo(w - q, -h);
			trimHole.quadraticCurveTo(w, -h, w, -h + q);
			trimHole.lineTo(w, h - q);
			trimHole.quadraticCurveTo(w, h, w - q, h);
			trimHole.lineTo(-w + q, h);
			trimHole.quadraticCurveTo(-w, h, -w, h - q);
			trimHole.lineTo(-w, -h + q);
			trimHole.quadraticCurveTo(-w, -h, -w + q, -h);
		}
		trimOuter.holes.push(trimHole);
		b.add(extrude(trimOuter, 0.06, 0.016, 2, 8), m.steelSoft, { p: [0, OPEN_Y, HD / 2 + 0.002] });

		// Nameplate above the opening.
		const plateY = OPEN_Y + OPEN_H / 2 + 0.32;
		b.add(extrude(roundedRect(1.5, 0.4, 0.14), 0.07, 0.022, 3, 10), m.creamLight, {
			p: [0, plateY, HD / 2 + 0.03]
		});

		// A closed back: a panel let into the shell, screwed on at its corners.
		b.add(extrude(chamferRect(HW - 0.22, HH - 0.22, 0.26, 0.08), 0.1, 0.03, 3, 8), m.cream, { p: [0, midY, -HD / 2 + 0.03] });
		for (const sx of [-1, 1]) {
			for (const y of [0.42, 3.1]) screw(b, sx * (HW / 2 - 0.26), y, -HD / 2 - 0.022, 'z');
		}

		// A collar wherever a line enters, so every line ends at something.
		const collar = (r: number, x: number, y: number, z: number, axis: 'x' | 'z') =>
			b.add(new THREE.CylinderGeometry(r, r, 0.09, 24), m.steel, { p: [x, y, z], r: axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
		collar(0.14, HW / 2 + 0.01, PORT_Y, PORT_OUT_Z, 'x');
		collar(0.095, HW / 2 + 0.01, PORT_Y, PORT_MCP_Z, 'x');
		collar(0.09, -HW / 2 - 0.01, PORT_Y, PORT_KEYS_Z, 'x');
		collar(0.2, PORT_BACK_X, PORT_BACK_Y, -HD / 2 - 0.03, 'z');
		collar(0.14, PORT_BACK_X, 3.2, -HD / 2 - 0.03, 'z');

		// Roof: hatch plate and handle.
		const roofY = Y0 + HH;
		b.add(rbox(1.3, 0.05, HD * 0.62, 0.02, 2), m.steelSoft, { p: [0, roofY + 0.015, -0.1] });
		for (let i = 0; i < 5; i++) {
			b.add(rbox(1.02, 0.016, 0.05, 0.006, 1), m.recess, { p: [0, roofY + 0.042, -0.5 + i * 0.2] });
		}
		for (const s of [-1, 1]) {
			for (const z of [-0.7, 0.5]) screw(b, s * 0.56, roofY + 0.045, z - 0.1, 'y');
		}

		// Right-hand flank: vent and a status strip.
		ventX(b, HW / 2 + 0.002, 1.72, -0.28, 2.1, 0.94, 12);
		b.add(rbox(0.03, 2.1, 0.2, 0.012, 2), m.recess, { p: [HW / 2 - 0.004, 1.72, 0.74] });

		this.group.add(b.build('harness'));

		for (let i = 0; i < 5; i++) {
			const lamp = new Lamp(rbox(0.024, 0.3, 0.1, 0.01, 2), color.amber, 1.5);
			lamp.mesh.position.set(HW / 2 + 0.012, 1.0 + i * 0.36, 0.74);
			this.group.add(lamp.mesh);
			this.sideLamps.push(lamp);
		}

		this.roofLamp = new Lamp(rbox(0.1, 0.1, 0.03, 0.03, 3), color.green, 1.2);
		this.roofLamp.mesh.position.set(0.58, plateY, HD / 2 + 0.07);
		this.group.add(this.roofLamp.mesh);

		this.name = new Label('Harness', 0.21, { weight: 700 });
		this.name.mesh.position.set(-0.08, plateY - 0.004, HD / 2 + 0.068);
		this.group.add(this.name.mesh);

		DRAWER_NAMES.forEach((n, i) => {
			const d = new Drawer(i, n, DRAWER_ICONS[i]);
			this.drawers.push(d);
			this.group.add(d.group);
		});
	}

	/** Each drawer's front and tray, then each drawer's sheet: index modulo the number of drawers says which. */
	get drawerHits() {
		return [...this.drawers.map((d) => d.hit), ...this.drawers.map((d) => d.sheetHit)];
	}

	/** The drawer the reader has pulled out, if any. One at a time, as in a real cabinet with an interlock. */
	pulled = -1;
	private slide = [new Give(), new Give(), new Give(), new Give()];
	private stand = [new Give(), new Give(), new Give(), new Give()];
	private shut = [new Give(), new Give(), new Give(), new Give()];
	private out = [0, 0, 0, 0];
	private lastSettle = 0;

	pull(i: number) {
		this.pulled = this.pulled === i ? -1 : i;
	}

	/**
	 * Keeps the moving parts out of each other's way by doing things in order. Other drawers go in first,
	 * even one the story has open, then this one comes out, and only then does its sheet stand. Going back,
	 * the sheet lies down before the drawer moves.
	 */
	private settlePulls(opens: number[]) {
		const now = performance.now();
		const dt = Math.min(0.05, (now - this.lastSettle) / 1000);
		this.lastSettle = now;
		this.drawers.forEach((_, i) => {
			const mine = this.pulled === i;
			const inTheWay = this.out.some((o, j) => j !== i && o > 0.2);
			const goal = mine ? (inTheWay ? 0 : PULL) : this.stand[i].x > 0.02 ? PULL : 0;
			this.slide[i].to(goal, 110, 13, dt);
			this.stand[i].to(mine && this.slide[i].x > CLEAR ? 1 : 0, 170, 17, dt);
			// Nothing the story has open comes back out over a sheet that's still lying down.
			const sheetUp = this.stand.some((sheet, j) => j !== i && sheet.x > 0.02);
			this.shut[i].to((this.pulled >= 0 && !mine) || sheetUp ? 1 : 0, 110, 16, dt);
			this.out[i] = Math.max(opens[i] * (1 - Math.min(1, this.shut[i].x)), this.slide[i].x);
		});
	}

	/**
	 * opens: 0..1(+) per drawer. wake: 0..1 powers the machine up.
	 * filled: 0..1 per drawer, its lamp goes green once its contents have been taken.
	 */
	update(opens: number[], filled: number[], wake: number, time: number, jolt = 0) {
		// A soft squash when something lands in it. Scale comes from the base, so it stays planted.
		this.group.scale.set(1 + jolt * 0.016, 1 - jolt * 0.024, 1 + jolt * 0.016);
		this.settlePulls(opens);
		this.drawers.forEach((d, i) => {
			d.update(this.out[i], this.stand[i].x);
			d.lamp.mix(color.amber, color.green, filled[i], 0.3 + wake * 0.6 + filled[i] * 0.3);
		});
		this.sideLamps.forEach((l, i) => {
			const breathe = 0.5 + 0.5 * Math.sin(time * 1.4 + i * 0.7);
			const lit = THREE.MathUtils.clamp(wake * 6 - i, 0, 1);
			l.set(color.amber, 0.2 + lit * (0.6 + breathe * 0.4));
		});
		this.roofLamp.set(color.green, 0.3 + wake * 0.7);
	}

	/** Where a drawer's contents lie once it is fully open, so something on its way there can aim at it before it has opened. */
	catchPoint(i: number, target: THREE.Vector3) {
		return this.group.localToWorld(target.set(0, this.drawers[i].y + 0.1, HD / 2 - 0.06 + DRAWER_TRAVEL - 0.7));
	}

	/** World position a drawer's contents lift from. */
	drawerTop(i: number, target: THREE.Vector3) {
		const d = this.drawers[i];
		return d.group.localToWorld(target.set(0, 0.1, -0.7));
	}
}
