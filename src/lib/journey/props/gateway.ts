import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { Label, font } from '../kit/print';
import { plinth, screw, ventX } from '../kit/parts';
import { outBack, seg } from '../kit/math';

export const GW = 3.0;
export const GH = 4.5;
export const GD = 2.3;

export const CHECKS = ['Decrypt', 'Who are you?', 'Rate limit', 'Budget', 'Capacity'];

class Blade {
	group = new THREE.Group();
	lamp: Lamp;
	constructor(text: string, width: number, height: number) {
		const m = mats();
		const b = new Batch();
		b.add(extrude(roundedRect(width, height, 0.05), 0.16, 0.022, 3, 8), m.slate, { p: [0, 0, 0] });
		for (const s of [-1, 1]) screw(b, s * (width / 2 - 0.09), 0, 0.08, 'z');
		this.group.add(b.build('blade'));
		const label = new Label(text, 0.19, { color: '#f4f8ff', font: font.sans, weight: 600, align: 'left' });
		label.mesh.position.set(-width / 2 + 0.42, -0.004, 0.083);
		this.group.add(label.mesh);
		this.lamp = new Lamp(rbox(0.12, 0.12, 0.03, 0.05, 3), color.amber, 0.5);
		this.lamp.mesh.position.set(-width / 2 + 0.26, 0, 0.085);
		this.group.add(this.lamp.mesh);
	}
}

export class Gateway {
	group = new THREE.Group();
	private blades: Blade[] = [];
	private flankLamps: Lamp[] = [];
	/** Height of the tunnel axis and of the output slot, in local space. */
	static PORT_Y = 2.4;
	static SLOT_Y = 0.56;

	constructor() {
		// Its name lets the conversation point at it: see pointer.svelte.ts.
		this.group.name = 'Front door';
		const m = mats();
		const b = new Batch();
		plinth(b, GW + 0.34, GD + 0.34, 0.14);
		const Y0 = 0.14;

		// Same silhouette family as the harness, in brushed steel: a different owner, the same world.
		const profile = chamferRect(GW, GH, 0.36, 0.1);
		const OW = GW - 0.44;
		const OH = 2.85;
		const OY = 1.72;
		const hole = new THREE.Path();
		const hy = OY - GH / 2 - Y0;
		const q = 0.08;
		hole.moveTo(-OW / 2 + q, hy - OH / 2);
		hole.lineTo(OW / 2 - q, hy - OH / 2);
		hole.quadraticCurveTo(OW / 2, hy - OH / 2, OW / 2, hy - OH / 2 + q);
		hole.lineTo(OW / 2, hy + OH / 2 - q);
		hole.quadraticCurveTo(OW / 2, hy + OH / 2, OW / 2 - q, hy + OH / 2);
		hole.lineTo(-OW / 2 + q, hy + OH / 2);
		hole.quadraticCurveTo(-OW / 2, hy + OH / 2, -OW / 2, hy + OH / 2 - q);
		hole.lineTo(-OW / 2, hy - OH / 2 + q);
		hole.quadraticCurveTo(-OW / 2, hy - OH / 2, -OW / 2 + q, hy - OH / 2);
		profile.holes.push(hole);
		b.add(extrude(profile, GD, 0.085, 6, 10), m.enamelCool, { p: [0, Y0 + GH / 2, 0] });
		b.add(rbox(OW + 0.06, OH + 0.06, GD - 0.28, 0.02, 1), m.recess, { p: [0, OY, -0.1] });

		// Nameplate.
		const plateY = OY + OH / 2 + 0.34;
		b.add(extrude(roundedRect(2.1, 0.44, 0.15), 0.07, 0.022, 3, 10), m.creamLight, {
			p: [0, plateY, GD / 2 + 0.03]
		});

		// Input collar on the left flank, for the tunnel, and output slot on the right.
		const ring = new THREE.TorusGeometry(1.14, 0.09, 12, 64);
		b.add(ring, m.steel, { p: [-GW / 2 - 0.02, Gateway.PORT_Y, 0], r: [0, Math.PI / 2, 0] });
		b.add(rbox(0.1, 0.34, 1.16, 0.05, 3), m.steel, { p: [GW / 2 + 0.03, Gateway.SLOT_Y, 0] });
		b.add(rbox(0.11, 0.17, 0.94, 0.02, 2), m.recess, { p: [GW / 2 + 0.04, Gateway.SLOT_Y, 0] });

		// Flank vents and lamps.
		ventX(b, GW / 2 + 0.002, 2.62, -0.25, 1.9, 1.06, 11);
		b.add(rbox(0.03, 1.9, 0.2, 0.012, 2), m.recess, { p: [GW / 2 - 0.004, 2.62, 0.72] });
		for (const z of [-0.95, 0.95]) screw(b, GW / 2 + 0.006, 4.1, z, 'x');
		this.group.add(b.build('gateway'));

		for (let i = 0; i < 4; i++) {
			const lamp = new Lamp(rbox(0.024, 0.34, 0.1, 0.01, 2), color.amber, 1.5);
			lamp.mesh.position.set(GW / 2 + 0.012, 1.92 + i * 0.46, 0.72);
			this.group.add(lamp.mesh);
			this.flankLamps.push(lamp);
		}

		const label = new Label('API Gateway', 0.24, { weight: 700 });
		label.mesh.position.set(0, plateY - 0.004, GD / 2 + 0.068);
		this.group.add(label.mesh);

		const bh = (OH - 0.16) / CHECKS.length - 0.05;
		CHECKS.forEach((text, i) => {
			const blade = new Blade(text, OW - 0.14, bh);
			blade.group.position.set(0, OY + OH / 2 - 0.08 - (i + 0.5) * (bh + 0.05), GD / 2 - 0.1);
			this.blades.push(blade);
			this.group.add(blade.group);
		});
	}

	/** When a conversation last named each check (the clock's seconds): named one after another, they ripple. */
	private namedAt = CHECKS.map(() => -10);
	private clock = 0;

	/** A conversation names one of the checks: its blade nods out and back, and its lamp flares. */
	name(i: number) {
		if (i >= 0 && i < this.namedAt.length) this.namedAt[i] = this.clock;
	}

	/** checks: 0..N, how far the sequence has progressed. Each blade pops out while it runs. */
	update(checks: number, time: number) {
		this.clock = time;
		this.blades.forEach((blade, i) => {
			const since = time - this.namedAt[i];
			const active = seg(checks, i, i + 0.5);
			const done = seg(checks, i + 0.5, i + 1);
			const pop = active < 1 ? outBack(active, 3) : 1 - done;
			const nod = since >= 0 && since < 1.1 ? Math.sin((since / 1.1) * Math.PI) : 0;
			blade.group.position.z = GD / 2 - 0.1 + Math.max(0, pop, nod) * 0.26;
			if (nod > 0) blade.lamp.set(checks >= i + 0.5 ? color.green : color.amber, 2.0 + nod * 2.5);
			else if (checks >= i + 0.5) blade.lamp.set(color.green, 2.0);
			else if (checks >= i) blade.lamp.set(color.amber, 1.6 + Math.sin(time * 14) * 0.9);
			else blade.lamp.set(color.amber, 0.3);
		});
		this.flankLamps.forEach((l, i) => {
			l.set(color.amber, 0.7 + 0.8 * (0.5 + 0.5 * Math.sin(time * 1.2 + i)));
		});
	}
}
