import * as THREE from 'three';
import { Batch } from '../../kit/batch';
import { hang } from '../../kit/cable';
import { extrude, rbox } from '../../kit/geometry';
import { shadowOn, tube } from '../../kit/machines';
import { Lamp, color, mats } from '../../kit/materials';
import { createSign, fitting } from '../../kit/parts';
import { font, roundRectPath, Surface } from '../../kit/print';
import { FLOOR, GATE, GATE_X, GATE_Z, HOOK_PORT, SCREEN, SIDE_X } from './layout';

/*
 * What checks, on the left by you: the gate every call goes through before any bench, your screen in the wall facing
 * it, and the port your hooks plug into.
 */

/** Something printed on a small plate, facing +z. */
export function printed(w: number, h: number, draw: (c: CanvasRenderingContext2D, pw: number, ph: number) => void, density = 400) {
	const s = new Surface(Math.round(w * density), Math.round(h * density));
	s.draw(draw);
	return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.6, transparent: true }));
}

/**
 * The gate's face, seen from in front: an outline w wide and h tall with a round-topped arch through it, open down to
 * the floor, its legs `leg` wide and its top at `open`. Small rooms draw their gates with it too.
 */
export function archShape(w: number, h: number, leg: number, open: number) {
	const half = w / 2;
	const inner = half - leg;
	const spring = open - inner;
	const r = Math.min(0.26, w * 0.17);
	const s = new THREE.Shape();
	s.moveTo(-half, 0);
	s.lineTo(-inner, 0);
	s.lineTo(-inner, spring);
	s.absarc(0, spring, inner, Math.PI, 0, true);
	s.lineTo(inner, 0);
	s.lineTo(half, 0);
	s.lineTo(half, h - r);
	s.quadraticCurveTo(half, h, half - r, h);
	s.lineTo(-half + r, h);
	s.quadraticCurveTo(-half, h, -half, h - r);
	s.closePath();
	return { outline: s, inner };
}

export const VERDICTS = ['Allow', 'Ask', 'Deny'] as const;

export class Gate {
	group = new THREE.Group();
	/** Allow, ask and deny, across the arch's face. */
	lamps: Lamp[] = [];
	beacon: Lamp;
	bell = new THREE.Group();
	needle = new THREE.Group();
	hookLamp: Lamp;
	/** Where the hooks' cable plugs in, on the gate's west side. */
	socket: [number, number, number] = [GATE.x0, 0.55, GATE_Z - 0.12];

	constructor() {
		const m = mats();
		const b = new Batch();
		const { outline, inner } = archShape(GATE.x1 - GATE.x0, GATE.h, GATE.leg, GATE.open);
		// The arch, front and back, as two slabs; the west leg and the top filled in between them. The east side stays
		// open between the slabs: that's where the cart drives in.
		const slab = extrude(outline, GATE.slab, 0.04, 3, 18);
		b.add(slab, m.creamLight, { p: [GATE_X, 0, GATE.z1 - GATE.slab / 2] });
		b.add(slab, m.creamLight, { p: [GATE_X, 0, GATE.z0 + GATE.slab / 2] });
		const between = GATE.z1 - GATE.z0 - GATE.slab * 2;
		b.add(rbox(GATE.leg, GATE.h - 0.06, between + 0.04, 0.03, 2), m.cream, { p: [GATE.x0 + GATE.leg / 2, (GATE.h - 0.06) / 2, GATE_Z] });
		const roof = GATE.h - GATE.open - 0.05;
		b.add(rbox(GATE.x1 - GATE.x0 - 0.06, roof, between + 0.04, 0.03, 2), m.cream, { p: [GATE_X, GATE.open + 0.05 + roof / 2, GATE_Z] });
		// A brass sill across the arch's foot on each face, and a plinth either side of the cart's doorway.
		for (const z of [GATE.z0 + 0.02, GATE.z1 - 0.02]) b.add(rbox(inner * 2 + 0.1, 0.03, 0.06, 0.01, 2), m.gold, { p: [GATE_X, 0.015, z] });
		this.group.add(b.build('gate'));
		shadowOn(this.group, GATE_X, 0, GATE_Z, GATE.x1 - GATE.x0 + 0.5, GATE.z1 - GATE.z0 + 0.5, 0.34);

		// The verdict lamps, across the top of the arch's face, and the beacon on its roof.
		const face = GATE.z1 + 0.005;
		VERDICTS.forEach((_, i) => {
			const lamp = new Lamp(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), [color.green, color.amber, color.red][i], 0.12);
			lamp.mesh.rotation.x = Math.PI / 2;
			lamp.mesh.position.set(GATE_X + (i - 1) * 0.3, GATE.open + 0.32, face);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
		});
		const top = new Batch();
		for (let i = 0; i < 3; i++) top.add(new THREE.TorusGeometry(0.085, 0.016, 8, 24), m.gold, { p: [GATE_X + (i - 1) * 0.3, GATE.open + 0.32, face] });
		top.add(new THREE.CylinderGeometry(0.17, 0.19, 0.07, 32), m.gold, { p: [GATE_X, GATE.h + 0.035, GATE_Z] });
		this.group.add(top.build('gate-trim'));
		this.beacon = new Lamp(new THREE.SphereGeometry(0.15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), color.green, 0.18);
		this.beacon.mesh.position.set(GATE_X, GATE.h + 0.07, GATE_Z);
		this.group.add(this.beacon.mesh);

		// The bell, hanging under the roof inside the arch: it rings when the gate has to ask you.
		const bell = new Batch();
		const profile = [
			[0.0, -0.2],
			[0.125, -0.2],
			[0.115, -0.17],
			[0.085, -0.1],
			[0.07, -0.02],
			[0.045, 0.0],
			[0.0, 0.01]
		].map(([x, y]) => new THREE.Vector2(x, y));
		bell.add(new THREE.LatheGeometry(profile, 32), m.gold);
		bell.add(new THREE.SphereGeometry(0.03, 12, 8), m.steel, { p: [0, -0.2, 0] });
		bell.add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), m.steel, { p: [0, 0.06, 0] });
		this.bell.add(bell.build('bell'));
		this.bell.position.set(GATE_X, GATE.open - 0.06, GATE_Z);
		this.group.add(this.bell);

		// The mode dial on the west leg's face, and the rule rack under it: allow, ask, deny, your rules.
		const legX = GATE.x0 + GATE.leg / 2;
		const dialY = 1.22;
		const dial = printed(0.3, 0.3, (c, w, h) => {
			c.fillStyle = color.paper;
			c.beginPath();
			c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
			c.fill();
			c.strokeStyle = '#8b7a5c';
			c.lineWidth = 6;
			for (let i = 0; i < 5; i++) {
				const a = Math.PI * (0.8 + (i / 4) * 1.4);
				c.beginPath();
				c.moveTo(w / 2 + Math.cos(a) * w * 0.3, h / 2 + Math.sin(a) * w * 0.3);
				c.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * w * 0.42);
				c.stroke();
			}
		});
		dial.position.set(legX, dialY, GATE.z1 + 0.012);
		this.group.add(dial);
		const ring = new Batch();
		ring.add(new THREE.TorusGeometry(0.152, 0.018, 10, 32), m.gold, { p: [legX, dialY, GATE.z1 + 0.012] });
		ring.add(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), m.gold, { p: [legX, dialY, GATE.z1 + 0.02], r: [Math.PI / 2, 0, 0] });
		this.group.add(ring.build('dial'));
		const needle = new THREE.Mesh(rbox(0.018, 0.11, 0.01, 0.004, 1), m.recess);
		needle.position.y = 0.055;
		this.needle.add(needle);
		this.needle.position.set(legX, dialY, GATE.z1 + 0.026);
		this.needle.rotation.z = Math.PI * 0.2;
		this.group.add(this.needle);
		const rack = new Batch();
		rack.add(rbox(0.3, 0.5, 0.03, 0.015, 2), m.gold, { p: [legX, 0.72, GATE.z1 + 0.005] });
		this.group.add(rack.build('rule-rack'));
		VERDICTS.forEach((name, i) => {
			const rule = printed(0.26, 0.13, (c, w, h) => {
				c.fillStyle = color.paper;
				roundRectPath(c, 0, 0, w, h, 8);
				c.fill();
				c.fillStyle = [color.green, color.amber, color.red][i];
				c.fillRect(0, 0, w * 0.12, h);
				c.fillStyle = color.ink;
				c.font = `700 ${h * 0.5}px ${font.sans}`;
				c.textBaseline = 'middle';
				c.fillText(name.toLowerCase(), w * 0.2, h * 0.55);
			});
			rule.position.set(legX, 0.88 - i * 0.155, GATE.z1 + 0.024);
			this.group.add(rule);
		});

		// The hooks' socket on the west side, facing the wall, with a lamp that lights while a hook runs.
		const plug = new Batch();
		fitting(plug, this.socket, [-1, 0, 0], 0.05);
		this.group.add(plug.build('hook-socket'));
		this.hookLamp = new Lamp(rbox(0.03, 0.1, 0.1, 0.02, 2), color.cobalt, 0.1);
		this.hookLamp.mesh.position.set(GATE.x0 - 0.012, this.socket[1] + 0.22, this.socket[2]);
		this.group.add(this.hookLamp.mesh);
	}
}

/** Your screen: a window in the left wall, facing the gate. It shows what you'd see in your terminal. */
export class Screen {
	group = new THREE.Group();
	surface: Surface;
	private shown = '';

	constructor() {
		const m = mats();
		const w = SCREEN.z1 - SCREEN.z0;
		const h = SCREEN.y1 - SCREEN.y0;
		const cz = (SCREEN.z0 + SCREEN.z1) / 2;
		const cy = (SCREEN.y0 + SCREEN.y1) / 2;
		const b = new Batch();
		b.add(rbox(0.06, h + 0.24, w + 0.24, 0.05, 3), m.gold, { p: [-SIDE_X + 0.03, cy, cz] });
		b.add(rbox(0.06, h + 0.08, w + 0.08, 0.03, 2), m.recess, { p: [-SIDE_X + 0.05, cy, cz] });
		// A little sill under it.
		b.add(rbox(0.18, 0.06, w + 0.3, 0.02, 2), m.creamLight, { p: [-SIDE_X + 0.09, SCREEN.y0 - 0.15, cz] });
		this.group.add(b.build('screen-frame'));
		this.surface = new Surface(1100, Math.round((1100 * h) / w));
		const glassFace = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.surface.texture, toneMapped: false }));
		// Named for the conversations to show: it faces into the room, so a look at it can be met face on.
		glassFace.name = 'your-screen';
		glassFace.rotation.y = Math.PI / 2;
		glassFace.position.set(-SIDE_X + 0.085, cy, cz);
		this.group.add(glassFace);
		const sign = createSign('Your screen', 0.16);
		sign.rotation.y = Math.PI / 2;
		sign.position.set(-SIDE_X + 0.05, SCREEN.y1 + 0.42, cz);
		this.group.add(sign);
		this.show(['> fix the flaky scheduler test'], null);
	}

	/** Your terminal: the lines so far, and a question waiting for you if the gate is asking; answered once you say yes. */
	show(lines: string[], ask: string | null, answered = false) {
		const key = lines.join('\n') + '|' + ask + '|' + answered;
		if (key === this.shown) return;
		this.shown = key;
		this.surface.draw((c, w, h) => {
			c.fillStyle = '#1c2b45';
			c.fillRect(0, 0, w, h);
			c.fillStyle = '#26385a';
			c.fillRect(0, 0, w, 64);
			['#f0473c', '#ffbc12', '#22d36b'].forEach((dot, i) => {
				c.fillStyle = dot;
				c.beginPath();
				c.arc(40 + i * 36, 32, 11, 0, Math.PI * 2);
				c.fill();
			});
			c.font = `500 46px ${font.mono}`;
			c.textBaseline = 'top';
			lines.forEach((line, i) => {
				c.fillStyle = line.startsWith('>') ? '#ffe7b0' : '#c9d6ee';
				c.fillText(line, 44, 110 + i * 64);
			});
			if (ask) {
				const y = h - 300;
				c.fillStyle = '#fff3da';
				roundRectPath(c, 36, y, w - 72, 250, 26);
				c.fill();
				c.fillStyle = color.ink;
				c.font = `700 44px ${font.sans}`;
				c.fillText(ask, 70, y + 36);
				[
					['Yes', color.green],
					['No', color.red]
				].forEach(([label, hex], i) => {
					// Your answer: the button you pressed stands out, the other fades.
					c.globalAlpha = answered && i === 1 ? 0.3 : 1;
					c.fillStyle = hex;
					roundRectPath(c, 70 + i * 250, y + 130, 220, 84, 20);
					c.fill();
					if (answered && i === 0) {
						c.strokeStyle = color.ink;
						c.lineWidth = 8;
						roundRectPath(c, 62, y + 122, 236, 100, 26);
						c.stroke();
					}
					c.fillStyle = '#ffffff';
					c.font = `700 42px ${font.sans}`;
					c.fillText(label, 110 + i * 250, y + 150);
					c.globalAlpha = 1;
				});
			}
		});
	}
}

/** Your hooks: a port in the left wall, and a cable along the floor to the gate's socket. */
export function buildHooks(gate: Gate) {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	b.add(rbox(0.05, 0.42, 0.42, 0.04, 3), m.cobalt, { p: [HOOK_PORT[0] + 0.025, HOOK_PORT[1], HOOK_PORT[2]] });
	fitting(b, [HOOK_PORT[0] + 0.05, HOOK_PORT[1], HOOK_PORT[2]], [1, 0, 0], 0.05);
	group.add(b.build('hook-port'));
	const path = hang({
		from: { at: [HOOK_PORT[0] + 0.05, HOOK_PORT[1], HOOK_PORT[2]], out: [1, 0, 0] },
		to: { at: gate.socket, out: [-1, 0, 0] },
		r: 0.05,
		slack: 1.12,
		bend: 0.4,
		on: [
			{ min: [-FLOOR.x, -0.5, FLOOR.z0], max: [FLOOR.x, 0, FLOOR.z1] },
			{ min: [GATE.x0, 0, GATE.z0], max: [GATE.x1, GATE.h, GATE.z1] }
		]
	});
	group.add(tube(path, 0.05, m.cobalt, 120));
	const sign = createSign('Your hooks', 0.13);
	sign.rotation.y = Math.PI / 2;
	sign.position.set(-SIDE_X + 0.05, HOOK_PORT[1] + 0.5, HOOK_PORT[2]);
	group.add(sign);
	return { group, cable: path as THREE.Curve<THREE.Vector3> };
}

