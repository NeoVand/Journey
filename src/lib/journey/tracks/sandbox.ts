import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { Card, machine, shadowOn } from '../kit/machines';
import { Lamp, color, mats } from '../kit/materials';
import { bell, inOut, lerp, outBack, seg, smooth } from '../kit/math';
import { createSign, grown } from '../kit/parts';
import { font } from '../kit/print';
import { createIsland } from '../props/island';
import { Cloudscape } from '../props/sky';
import type { HarnessId } from '../content';
import type { Shot } from '../rig';

/**
 * The side trip into permission and containment: a stage of its own, high above the story, reached by dropping into
 * the sandbox's glass. On the left the harness and its rules, which decide whether a call may run. On the right the
 * glass, which limits what a running command can reach. In front, what the glass never wraps.
 */
export const STAGE_AT = new THREE.Vector3(0, 600, 0);
/** A clear day, like the sky outside the story's islands. */
export const STAGE_SKY = { top: new THREE.Color('#9fd0f8'), mid: new THREE.Color('#c6e5fd'), low: new THREE.Color('#ecf7ff') };

/** The rail the calls ride, and the three checks along it, in the order a call meets them. */
const RAIL_Z = 1.5;
const RAIL_FROM = -11.1;
const CHECKS = [
	{ word: 'Deny', rule: 'Read(./.env)', x: -7.8, ink: color.red },
	{ word: 'Ask', rule: 'Bash(git push:*)', x: -5.6, ink: '#e09a00' },
	{ word: 'Allow', rule: 'Bash(pytest:*)', x: -3.4, ink: '#12a956' }
];
/** How far short of a check a call stops, so its card is clear of the arch's posts. */
const SHORT = 1.06;
/** The glass, and the slot in its left wall the rail runs through. */
const G0 = -0.6;
const G1 = 9.6;
const GZ0 = -3.6;
const GZ1 = 3.6;
const GH = 4.4;
const SLOT_H = 1.3;
const SLOT_HALF = 0.55;
/** Where a command starts, at the end of the rail inside the glass, and the processes it starts. */
const PAD_X = 1.2;
/** The pad a command starts on, just past where the rail ends. */
const START_X = 2.45;
const START_TOP = 0.12;
const PROCS = [
	{ name: 'pytest', at: new THREE.Vector3(START_X, START_TOP, RAIL_Z), size: 0.8 },
	{ name: 'python', at: new THREE.Vector3(4.3, 0, 0.5), size: 0.7 },
	{ name: 'worker', at: new THREE.Vector3(6.3, 0, 1.3), size: 0.6 }
];
const PROJECT = new THREE.Vector3(2.8, 0, -2.0);
const HOME = new THREE.Vector3(11.5, 0, -0.4);
const PROXY_X = 7.4;
const YOU = new THREE.Vector3(-4.5, 0, 3.0);
/** The dial, in the front corner by the harness, clear of everything else. */
const DIAL_AT = new THREE.Vector3(-11.2, 0, 3.2);
/** What stands outside the glass, by agent: Codex's edits and Copilot's MCP servers are wrapped too. */
const INSIDE_SPOT = new THREE.Vector3(8.1, 0, 2.55);
const OUTSIDE = {
	files: new THREE.Vector3(-9.7, 0, 4.6),
	mcp: new THREE.Vector3(-7.2, 0, 4.7),
	hooks: new THREE.Vector3(-2.0, 0, 4.6)
};

const at = (t: number, card: number, a: number, b: number) => seg(t - card, a, b);

/* ---------- the camera, in the stage's own coordinates ---------- */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);
const shot = (az: number, el: number, target: [number, number, number], radius: number, ry = radius * 0.6, extra: Partial<Shot> = {}): Omit<Shot, 'T'> => ({
	az,
	el,
	target: [target[0] + STAGE_AT.x, target[1] + STAGE_AT.y, target[2] + STAGE_AT.z],
	radius,
	ry,
	wide: WIDE,
	tall: TALL,
	...extra,
	// A phone's own subject is given in the stage's coordinates too.
	...(extra.tallTarget && {
		tallTarget: [extra.tallTarget[0] + STAGE_AT.x, extra.tallTarget[1] + STAGE_AT.y, extra.tallTarget[2] + STAGE_AT.z] as [number, number, number]
	})
});
const OVERVIEW = shot(8, 24, [-0.8, 1.3, 1.0], 10.4, 4.4, { tallRadius: 10.6, tallRy: 5.4 });
const RULES = shot(4, 16, [-6.2, 1.15, 2.1], 4.0, 1.9, { tallRadius: 4.1 });
const DIAL = shot(4, 10, [DIAL_AT.x, 1.35, DIAL_AT.z], 1.55, 1.15);
const GLASS = shot(6, 22, [4.4, 1.5, 0.3], 5.6, 2.9, { tallRadius: 4.9 });
const TREE = shot(10, 26, [4.4, 1.0, 0.6], 3.4, 1.9);
const OUTSIDE_SHOT = shot(10, 24, [-4.4, 1.0, 2.6], 7.2, 3.2, { tallTarget: [-5.8, 1.0, 3.0], tallRadius: 4.7 });
const ASKING = shot(4, 20, [1.6, 1.3, 1.0], 8.2, 3.4, { tallRadius: 8.4 });
const DESK = shot(-10, 16, [YOU.x + 0.1, 1.0, YOU.z], 1.9, 1.1);

/** Where the reader drops in: straight down into the glass on the story's sandbox island, in the story's coordinates. */
export const GLASS_ROOF: Omit<Shot, 'T'> = { az: 6, el: 62, target: [-21.2, -11.4, 0.6], radius: 1.4, ry: 1.0, wide: box(0, 0, 1, 1), tall: box(0, 0, 1, 1) };

export const STAGE_SHOTS: Shot[] = [
	{ T: 0, ...OVERVIEW },
	{ T: 0.85, ...OVERVIEW, az: 12 },
	{ T: 1.04, ...RULES },
	{ T: 1.86, ...RULES, az: 4 },
	{ T: 2.06, ...DIAL },
	{ T: 2.86, ...DIAL, az: 20 },
	{ T: 3.04, ...GLASS },
	{ T: 3.22, ...TREE },
	{ T: 3.56, ...TREE, az: 14 },
	{ T: 3.66, ...GLASS, az: 4 },
	{ T: 3.9, ...GLASS, az: 10 },
	{ T: 4.06, ...OUTSIDE_SHOT },
	{ T: 4.88, ...OUTSIDE_SHOT, az: 14 },
	{ T: 5.06, ...ASKING },
	{ T: 5.3, ...ASKING, az: 6 },
	{ T: 5.5, ...DESK },
	{ T: 6, ...DESK, az: 12 }
];

/* ---------- printed things ---------- */

/** A tool call on its way to the checks: what it is, and the call itself. */
function callCard(call: string) {
	const card = new Card(1.16, 0.7, 700, 0.02);
	card.draw((c, w, h) => {
		c.fillStyle = color.amber;
		c.fillRect(0, 0, w, h * 0.24);
		c.fillStyle = color.ink;
		c.font = `700 ${h * 0.13}px ${font.sans}`;
		c.textBaseline = 'middle';
		c.fillText('Tool call', w * 0.07, h * 0.125);
		c.font = `700 ${h * 0.15}px ${font.mono}`;
		c.fillText(call, w * 0.07, h * 0.56);
		c.fillStyle = '#5a6b85';
		c.font = `500 ${h * 0.1}px ${font.sans}`;
		c.fillText('checked in order', w * 0.07, h * 0.8);
	});
	return card;
}

/** The face of a check: its word, in its colour, and the rule it holds. */
function checkFace(word: string, rule: string, ink: string) {
	const card = new Card(1.62, 0.62, 640, 0.01);
	card.draw((c, w, h) => {
		c.fillStyle = ink;
		c.fillRect(0, 0, w, h * 0.42);
		c.fillStyle = '#ffffff';
		c.font = `800 ${h * 0.27}px ${font.display}`;
		c.textBaseline = 'middle';
		c.fillText(word, w * 0.07, h * 0.22);
		c.fillStyle = color.ink;
		c.font = `700 ${h * 0.17}px ${font.mono}`;
		c.fillText(rule, w * 0.07, h * 0.7);
	});
	return card;
}

/** A small sheet a process writes, or a question on its way to you. */
function note(lines: string[], accent: string, w = 0.58, h = 0.36) {
	const card = new Card(w, h, 820, 0.02);
	card.draw((c, cw, ch) => {
		c.fillStyle = accent;
		c.fillRect(0, 0, cw * 0.05, ch);
		c.fillStyle = color.ink;
		c.textBaseline = 'middle';
		lines.forEach((line, i) => {
			// Each line at its size, or smaller if that's what it takes to fit the sheet.
			const face = (size: number) => `${i ? 500 : 700} ${size}px ${i ? font.sans : font.mono}`;
			const size = ch * (i ? 0.15 : 0.19);
			c.font = face(size);
			const room = cw * 0.84;
			const width = c.measureText(line).width;
			if (width > room) c.font = face((size * room) / width);
			c.fillText(line, cw * 0.11, ch * (lines.length === 1 ? 0.5 : 0.32 + i * 0.32));
		});
	});
	return card;
}

/** The dial's face: how much the agent may do on its own, from asking about everything to asking about nothing. */
const DIAL_STOPS = ['Asks first', 'Edits free', 'Reviewed', 'No checks'];
const DIAL_ANGLES = [-1.05, -0.35, 0.35, 1.05];

/* ---------- the stage ---------- */

interface Ride {
	group: THREE.Group;
	card: Card;
}

interface Proc {
	group: THREE.Group;
	lamp: Lamp;
	size: number;
}

export class SandboxStage {
	group = new THREE.Group();
	private clouds = new Cloudscape();
	private rides: Ride[] = [];
	private checkLamps: Lamp[] = [];
	private youLamp: Lamp;
	private youSign: THREE.Group;
	private refused: THREE.Group;
	private procs: Proc[] = [];
	private rods: THREE.Mesh[] = [];
	private toProject: Card;
	private toHome: Card;
	private projectLamp: Lamp;
	private ripple: THREE.Mesh;
	private stopped: THREE.Group;
	private packets: THREE.Mesh[] = [];
	private proxyLamp: Lamp;
	private needle: THREE.Group;
	private dialLamps: Lamp[] = [];
	private outside: Record<'files' | 'mcp' | 'hooks', THREE.Group>;
	private question: Card;
	private glassMat: THREE.MeshPhysicalMaterial;
	private signs: Record<HarnessId, THREE.Group>;
	private harnessId: HarnessId = 'claude';
	private v = new THREE.Vector3();
	private w = new THREE.Vector3();
	private up = new THREE.Vector3(0, 1, 0);
	private d = new THREE.Vector3();

	constructor() {
		const m = mats();
		const g = this.group;
		g.position.copy(STAGE_AT);
		g.visible = false;

		const island = createIsland([
			[-13.8, 3.2],
			[-12.6, 5.0],
			[0, 5.6],
			[12.6, 5.0],
			[14.0, 2.4],
			[13.4, -4.6],
			[8, -6.6],
			[-6, -6.6],
			[-13.2, -5.2],
			[-14.2, -1.2]
		]);
		g.add(island);

		/* -- the harness and its rail of checks -- */
		const harness = machine({ w: 2.4, h: 2.8, d: 1.8, name: 'Harness' });
		harness.position.set(-10, 0, -1.8);
		g.add(harness);
		shadowOn(g, -10, 0, -1.8, 2.8, 2.2);

		const rail = new Batch();
		rail.add(rbox(G0 - RAIL_FROM + (PAD_X - G0), 0.1, 0.5, 0.03, 2), m.steelSoft, { p: [(RAIL_FROM + PAD_X) / 2, 0.05, RAIL_Z] });
		for (const x of [-10.6, -6.7, -2.4]) rail.add(rbox(0.6, 0.04, 0.7, 0.02, 2), m.steel, { p: [x, 0.02, RAIL_Z] });
		g.add(rail.build('rules-rail'));
		shadowOn(g, -5, 0, RAIL_Z, 12, 0.9, 0.3);

		for (const check of CHECKS) {
			const arch = new Batch();
			for (const z of [RAIL_Z - 0.62, RAIL_Z + 0.62]) {
				arch.add(rbox(0.16, 1.9, 0.16, 0.05, 2), m.cream, { p: [check.x, 0.95, z] });
				arch.add(rbox(0.36, 0.08, 0.36, 0.03, 2), m.creamDeep, { p: [check.x, 0.04, z] });
			}
			arch.add(rbox(0.24, 0.24, 1.6, 0.06, 2), m.cream, { p: [check.x, 1.9, RAIL_Z] });
			g.add(arch.build(`check-${check.word}`));
			// The check's face hangs on the front of its beam, like a sign over a door.
			const face = checkFace(check.word, check.rule, check.ink);
			face.mesh.position.set(check.x, 1.9, RAIL_Z + 0.83);
			g.add(face.mesh);
			const lamp = new Lamp(rbox(0.3, 0.12, 0.3, 0.05, 3), '#ffffff', 0.2);
			lamp.mesh.position.set(check.x, 2.08, RAIL_Z);
			g.add(lamp.mesh);
			this.checkLamps.push(lamp);
		}

		// Three calls, on sleds, waiting in the harness's mouth.
		['Read(.env)', 'Bash(git push)', 'Bash(pytest -x)'].forEach((call) => {
			const group = new THREE.Group();
			const sled = new Batch();
			sled.add(rbox(1.2, 0.08, 0.44, 0.03, 2), m.steel, { p: [0, 0.04, 0] });
			group.add(sled.build('sled'));
			const card = callCard(call);
			card.mesh.position.set(0, 0.08 + 0.35 * Math.cos(0.12), -0.35 * Math.sin(0.12));
			card.mesh.rotation.x = -0.12;
			group.add(card.mesh);
			group.position.set(RAIL_FROM, 0.1, RAIL_Z);
			group.visible = false;
			g.add(group);
			this.rides.push({ group, card });
		});

		// Refused calls go back as the tool result: the word hangs over the rail for a moment.
		this.refused = createSign('Refused, as the tool result', 0.2);
		this.refused.position.set(-9.5, 1.15, RAIL_Z + 0.5);
		g.add(this.refused);

		/* -- you -- */
		const desk = new Batch();
		desk.add(rbox(1.7, 0.9, 0.7, 0.08, 3), m.cream, { p: [YOU.x, 0.45, YOU.z] });
		g.add(desk.build('you-desk'));
		shadowOn(g, YOU.x, 0, YOU.z, 1.9, 0.9);
		this.youLamp = new Lamp(rbox(0.26, 0.1, 0.26, 0.05, 3), '#ffffff', 0.2);
		this.youLamp.mesh.position.set(YOU.x - 0.66, 0.95, YOU.z - 0.12);
		g.add(this.youLamp.mesh);
		// Its name on its front, like a nameplate.
		this.youSign = createSign('You decide', 0.2);
		this.youSign.position.set(YOU.x, 0.5, YOU.z + 0.4);
		g.add(this.youSign);

		/* -- the dial: how much it may do alone -- */
		// A gauge on a post: its needle swings from asking about everything to asking about nothing.
		const pivot = new THREE.Vector3(DIAL_AT.x, 1.02, DIAL_AT.z + 0.09);
		const dial = new Batch();
		dial.add(rbox(0.14, 1.0, 0.14, 0.04, 2), m.steelSoft, { p: [DIAL_AT.x, 0.5, DIAL_AT.z - 0.05] });
		dial.add(rbox(0.5, 0.08, 0.5, 0.03, 2), m.steelSoft, { p: [DIAL_AT.x, 0.04, DIAL_AT.z - 0.05] });
		dial.add(rbox(2.5, 1.36, 0.12, 0.12, 3), m.porcelain, { p: [DIAL_AT.x, 1.6, DIAL_AT.z] });
		g.add(dial.build('mode-dial'));
		shadowOn(g, DIAL_AT.x, 0, DIAL_AT.z, 0.8, 0.8, 0.3);
		const face = new Card(2.3, 1.2, 520, 0);
		face.draw((c, w, h) => {
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			const px = w / 2.3;
			// The pivot sits 0.6 below the face's middle; labels stand on an arc round it, outside the lamps.
			const cx = w / 2;
			const cy = h / 2 + 0.58 * px - 0.04 * px;
			c.strokeStyle = 'rgba(16,26,48,.14)';
			c.lineWidth = 0.05 * px;
			c.beginPath();
			c.arc(cx, cy, 0.62 * px, -Math.PI / 2 - 1.15, -Math.PI / 2 + 1.15);
			c.stroke();
			c.fillStyle = color.ink;
			c.font = `700 ${0.105 * px}px ${font.sans}`;
			DIAL_STOPS.forEach((stop, i) => {
				const a = DIAL_ANGLES[i];
				c.fillText(stop, cx + Math.sin(a) * 0.9 * px, cy - Math.cos(a) * 0.86 * px);
			});
		});
		face.mesh.position.set(DIAL_AT.x, 1.6, DIAL_AT.z + 0.065);
		g.add(face.mesh);
		this.needle = new THREE.Group();
		const needle = new Batch();
		needle.add(rbox(0.06, 0.56, 0.03, 0.015, 2), m.red, { p: [0, 0.28, 0] });
		needle.add(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24).rotateX(Math.PI / 2), m.steel, { p: [0, 0, 0] });
		this.needle.add(needle.build('dial-needle'));
		this.needle.position.copy(pivot);
		g.add(this.needle);
		DIAL_ANGLES.forEach((a) => {
			const lamp = new Lamp(new THREE.SphereGeometry(0.045, 12, 8), '#ffffff', 0.2);
			lamp.mesh.position.set(pivot.x + Math.sin(a) * 0.62, pivot.y + Math.cos(a) * 0.62, DIAL_AT.z + 0.08);
			g.add(lamp.mesh);
			this.dialLamps.push(lamp);
		});
		const dialSign = createSign('How much it may do alone', 0.16);
		dialSign.position.set(DIAL_AT.x, 2.46 + grown(0.16), DIAL_AT.z);
		g.add(dialSign);

		/* -- the glass -- */
		const frame = new Batch();
		for (const x of [G0, G1]) for (const z of [GZ0, GZ1]) frame.add(rbox(0.14, GH, 0.14, 0.04, 2), m.steel, { p: [x, GH / 2, z] });
		for (const y of [0.07, GH]) {
			for (const z of [GZ0, GZ1]) frame.add(rbox(G1 - G0, 0.12, 0.12, 0.03, 2), m.steel, { p: [(G0 + G1) / 2, y, z] });
			frame.add(rbox(0.12, 0.12, GZ1 - GZ0, 0.03, 2), m.steel, { p: [G1, y, 0] });
			// On the left the bottom bar stops either side of the slot, so the rail runs in under nothing.
			if (y > 1) frame.add(rbox(0.12, 0.12, GZ1 - GZ0, 0.03, 2), m.steel, { p: [G0, y, 0] });
			else
				for (const [z0, z1] of [
					[GZ0, RAIL_Z - SLOT_HALF],
					[RAIL_Z + SLOT_HALF, GZ1]
				])
					frame.add(rbox(0.12, 0.12, z1 - z0, 0.03, 2), m.steel, { p: [G0, y, (z0 + z1) / 2] });
		}
		// The slot the rail comes in through: a steel frame round a hole in the left wall.
		frame.add(rbox(0.16, 0.12, SLOT_HALF * 2 + 0.16, 0.03, 2), m.steel, { p: [G0, SLOT_H, RAIL_Z] });
		for (const z of [RAIL_Z - SLOT_HALF, RAIL_Z + SLOT_HALF]) frame.add(rbox(0.16, SLOT_H, 0.12, 0.03, 2), m.steel, { p: [G0, SLOT_H / 2, z] });
		// The proxy's door in the back wall.
		frame.add(rbox(1.3, 0.12, 0.2, 0.03, 2), m.steel, { p: [PROXY_X, 1.9, GZ0] });
		for (const x of [PROXY_X - 0.6, PROXY_X + 0.6]) frame.add(rbox(0.12, 1.9, 0.2, 0.03, 2), m.steel, { p: [x, 0.95, GZ0] });
		g.add(frame.build('glass-frame'));

		this.glassMat = new THREE.MeshPhysicalMaterial({
			color: '#cfe8ff',
			transparent: true,
			opacity: 0.12,
			roughness: 0.1,
			clearcoat: 1,
			depthWrite: false,
			side: THREE.DoubleSide,
			envMapIntensity: 0.7
		});
		const pane = (w: number, h: number, x: number, y: number, z: number, ry = 0) => {
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.glassMat);
			mesh.position.set(x, y, z);
			mesh.rotation.y = ry;
			mesh.renderOrder = 5;
			g.add(mesh);
		};
		// Back, with the proxy's door left open.
		pane(PROXY_X - 0.6 - G0, GH, (G0 + PROXY_X - 0.6) / 2, GH / 2, GZ0);
		pane(G1 - PROXY_X - 0.6, GH, (PROXY_X + 0.6 + G1) / 2, GH / 2, GZ0);
		pane(1.2, GH - 1.9, PROXY_X, (GH + 1.9) / 2, GZ0);
		pane(GZ1 - GZ0, GH, G1, GH / 2, 0, Math.PI / 2);
		// Left, round the slot.
		const below = RAIL_Z - SLOT_HALF - GZ0;
		const above = GZ1 - RAIL_Z - SLOT_HALF;
		pane(below, GH, G0, GH / 2, GZ0 + below / 2, Math.PI / 2);
		pane(above, GH, G0, GH / 2, GZ1 - above / 2, Math.PI / 2);
		pane(SLOT_HALF * 2, GH - SLOT_H, G0, (GH + SLOT_H) / 2, RAIL_Z, Math.PI / 2);

		const signFor = (text: string) => {
			const s = createSign(text, 0.26);
			s.position.set((G0 + G1) / 2, GH + 0.36 + grown(0.26), GZ1);
			g.add(s);
			return s;
		};
		this.signs = {
			claude: signFor('Sandbox: Seatbelt or bubblewrap'),
			codex: signFor('Sandbox: Seatbelt, bwrap or MXC'),
			copilot: signFor('Sandbox: off unless you turn it on')
		};

		/* -- inside: your project, and where commands start -- */
		const tray = new Batch();
		tray.add(rbox(3.4, 0.22, 1.5, 0.06, 2), m.cream, { p: [PROJECT.x, 0.11, PROJECT.z] });
		tray.add(rbox(3.2, 0.06, 1.3, 0.03, 2), m.creamDeep, { p: [PROJECT.x, 0.23, PROJECT.z] });
		const pad = new Batch();
		pad.add(rbox(1.1, START_TOP, 1.0, 0.05, 2), m.porcelain, { p: [START_X, START_TOP / 2, RAIL_Z] });
		g.add(tray.build('project-tray'), pad.build('start-pad'));
		shadowOn(g, PROJECT.x, 0, PROJECT.z, 3.6, 1.7);
		['src/', 'tests/', 'README.md'].forEach((name, i) => {
			const f = note([name], color.amber, 0.82, 0.5);
			f.mesh.position.set(PROJECT.x - 1.05 + i * 1.05, 0.26 + 0.25, PROJECT.z - 0.15);
			f.mesh.rotation.x = -0.18;
			g.add(f.mesh);
		});
		const project = createSign('Your project', 0.2);
		project.position.set(PROJECT.x, 0.2 + grown(0.2), PROJECT.z + 0.79);
		g.add(project);
		this.projectLamp = new Lamp(rbox(0.3, 0.08, 0.3, 0.04, 3), '#ffffff', 0.2);
		this.projectLamp.mesh.position.set(PROJECT.x + 1.45, 0.27, PROJECT.z + 0.5);
		g.add(this.projectLamp.mesh);

		// The processes: the command, and everything it starts.
		for (const p of PROCS) {
			const group = new THREE.Group();
			const lamp = new Lamp(rbox(p.size, p.size, p.size, p.size * 0.16, 3), color.orange, 0.5);
			lamp.mesh.position.y = p.size / 2;
			group.add(lamp.mesh);
			const label = createSign(p.name, 0.16);
			label.position.set(0, p.size + 0.22 + grown(0.16), 0);
			group.add(label);
			group.position.copy(p.at);
			group.visible = false;
			g.add(group);
			this.procs.push({ group, lamp, size: p.size });
		}
		for (let i = 0; i < 2; i++) {
			const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 10), m.steel);
			rod.visible = false;
			g.add(rod);
			this.rods.push(rod);
		}
		this.toProject = note(['notes.txt', 'in the project'], '#12a956');
		this.toHome = note(['~/.ssh/key', 'outside it'], color.red);
		g.add(this.toProject.mesh, this.toHome.mesh);

		/* -- outside on the right: your home, which the glass keeps out of reach -- */
		const home = new Batch();
		home.add(rbox(1.6, 0.22, 1.3, 0.06, 2), m.cream, { p: [HOME.x, 0.11, HOME.z] });
		g.add(home.build('home-tray'));
		shadowOn(g, HOME.x, 0, HOME.z, 1.8, 1.5);
		const key = note(['~/.ssh'], color.red, 0.7, 0.42);
		key.mesh.position.set(HOME.x, 0.26 + 0.21, HOME.z - 0.2);
		key.mesh.rotation.x = -0.18;
		g.add(key.mesh);
		const homeSign = createSign('Your home folder', 0.18);
		homeSign.position.set(HOME.x, 0.2 + grown(0.18), HOME.z + 0.7);
		g.add(homeSign);
		this.ripple = new THREE.Mesh(
			new THREE.RingGeometry(0.16, 0.26, 40),
			new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, depthWrite: false, side: THREE.DoubleSide })
		);
		this.ripple.rotation.y = Math.PI / 2;
		this.ripple.position.set(G1 - 0.02, 1.4, 0.0);
		g.add(this.ripple);
		this.stopped = createSign('Stopped by the glass', 0.2);
		this.stopped.position.set(G1 - 1.6, 2.5, 0.4);
		g.add(this.stopped);

		/* -- the network: out only through the proxy, to the domains on its list -- */
		this.proxyLamp = new Lamp(rbox(0.3, 0.1, 0.16, 0.04, 3), '#ffffff', 0.2);
		this.proxyLamp.mesh.position.set(PROXY_X, 2.04, GZ0 + 0.04);
		g.add(this.proxyLamp.mesh);
		const proxySign = createSign('Proxy', 0.2);
		proxySign.position.set(PROXY_X, 2.32 + grown(0.2), GZ0 + 0.06);
		g.add(proxySign);
		const list = note(['pypi.org', 'on the list'], '#12a956', 1.0, 0.56);
		const listStand = new Batch();
		listStand.add(rbox(0.08, 0.9, 0.08, 0.02, 2), m.steelSoft, { p: [PROXY_X + 1.6, 0.45, GZ0 - 0.9] });
		g.add(listStand.build('list-post'));
		list.mesh.position.set(PROXY_X + 1.6, 1.18, GZ0 - 0.86);
		g.add(list.mesh);
		for (const tint of ['#7fe0a8', '#ff8a7a', '#ff8a7a']) {
			const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, emissive: tint, emissiveIntensity: 1.4 });
			const packet = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 6, 12), mat);
			packet.rotation.z = Math.PI / 2;
			packet.visible = false;
			g.add(packet);
			this.packets.push(packet);
		}

		/* -- what the glass never wraps -- */
		this.outside = {
			files: machine({ w: 1.9, h: 1.1, d: 1.0, name: 'File tools' }),
			mcp: machine({ w: 1.5, h: 1.3, d: 1.0, name: 'MCP server', finish: 'cobalt' }),
			hooks: machine({ w: 1.4, h: 0.9, d: 0.9, name: 'Your hooks' })
		};
		for (const thing of Object.values(this.outside)) {
			thing.scale.setScalar(0.001);
			g.add(thing);
		}

		/* -- the question that goes to you when the glass says no -- */
		this.question = note(['Run outside the sandbox?', 'pip install, from a new domain'], '#e09a00', 1.0, 0.42);
		g.add(this.question.mesh);

		this.clouds.lay([{ shots: STAGE_SHOTS, sky: () => true }], 22);
		g.add(this.clouds.group);
		this.setHarness('claude');
	}

	setHarness(id: HarnessId) {
		this.harnessId = id;
		for (const [key, sign] of Object.entries(this.signs)) sign.visible = key === id;
		// Without an OS sandbox by default, Copilot's glass is only a ghost of one.
		this.glassMat.opacity = id === 'copilot' ? 0.05 : 0.12;
	}

	/** Puts a ride's sled at x along the rail, in the glass once it's past the slot. */
	private rideAt(ride: Ride, x: number, shown: number) {
		ride.group.visible = shown > 0.001;
		ride.group.position.set(x, 0.1, RAIL_Z);
		ride.group.scale.setScalar(Math.max(0.001, shown));
	}

	/** Something flying in an arc from a to b, s from 0 to 1. */
	private arc(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, s: number, lift: number) {
		mesh.position.lerpVectors(a, b, s);
		mesh.position.y += Math.sin(Math.PI * s) * lift;
	}

	/** t: the trip's own time, one unit per card. */
	update(t: number, time: number) {
		this.clouds.update(time);
		const [deny, ask, allow] = this.checkLamps;

		/* ---- card 2: deny, then ask, then allow ---- */
		// One call at a time on the rail, so no two ever meet. The refused call goes out to the first check, is stopped,
		// and comes back into the harness's mouth.
		const aOut = inOut(at(t, 1, 0.06, 0.18));
		const aBack = inOut(at(t, 1, 0.26, 0.36));
		const aX = lerp(lerp(RAIL_FROM, CHECKS[0].x - SHORT, aOut), RAIL_FROM, aBack);
		this.rideAt(this.rides[0], aX, Math.min(smooth(at(t, 1, 0, 0.05)), 1 - smooth(at(t, 1, 0.34, 0.38))) * (t < 2 ? 1 : 0));
		const aStopped = bell(t, 1.18, 1.3);
		this.refused.scale.setScalar(Math.max(0.001, outBack(at(t, 1, 0.19, 0.25), 1.4) * (1 - smooth(at(t, 1, 0.34, 0.4)))));

		// The call that asks: past the deny check, which doesn't match it, to the ask, which does. Then it hops off the
		// rail onto your desk to wait for you, which leaves the rail clear.
		const bX = lerp(RAIL_FROM, CHECKS[1].x - SHORT, inOut(at(t, 1, 0.4, 0.5)));
		const bOn = smooth(at(t, 1, 0.385, 0.42)) * (1 - smooth(at(t, 2, 0.1, 0.16)));
		const hop = at(t, 1, 0.53, 0.61);
		const waiting = this.rides[1];
		this.rideAt(waiting, bX, bOn * (t < 2.2 ? 1 : 0));
		if (hop > 0) {
			// Up and forward off the rail, short of the Ask gate's posts, then across onto your desk.
			const up = inOut(seg(hop, 0, 0.5));
			const across = inOut(seg(hop, 0.5, 1));
			waiting.group.position.set(
				lerp(bX, YOU.x + 0.25, across),
				lerp(0.1, 0.9, up) + Math.sin(Math.PI * up) * 0.3 + Math.sin(Math.PI * across) * 0.14,
				lerp(RAIL_Z, YOU.z - 0.05, up)
			);
		}
		const bAsking = smooth(at(t, 1, 0.5, 0.54)) * (1 - smooth(at(t, 2, 0.1, 0.16)));

		// The call that's allowed: through all three and on into the glass, once the waiting one is off the rail.
		const cX = t < 3 ? lerp(RAIL_FROM, PAD_X, inOut(at(t, 1, 0.62, 0.84))) : PAD_X;
		const cOn = smooth(at(t, 1, 0.6, 0.64)) * (1 - smooth(at(t, 3, 0.08, 0.14)));
		this.rideAt(this.rides[2], cX, cOn);

		// Each check lights as a call reaches it: white while it reads the call, then its own colour when it matches.
		const passing = (x: number, checkX: number) => bell(x, checkX - 1.1, checkX + 0.6);
		const read = Math.max(passing(bX, CHECKS[0].x) * (t < 2 ? 1 : 0), passing(cX, CHECKS[0].x) * (t < 2 ? 1 : 0));
		if (aStopped > 0.01) deny.mix('#ffffff', color.red, aStopped, 0.2 + aStopped * 2.2);
		else deny.set('#ffffff', 0.2 + read * 1.2);
		const askLit = Math.max(bAsking, this.questionLanded(t));
		if (askLit > 0.01) ask.mix('#ffffff', '#ffb000', askLit, 0.2 + askLit * 2);
		else ask.set('#ffffff', 0.2 + passing(cX, CHECKS[1].x) * (t < 2 ? 1.2 : 0));
		const allowLit = bell(cX, CHECKS[2].x - 1.2, CHECKS[2].x + 0.9) * (t < 2 ? 1 : 0);
		allow.mix('#ffffff', '#22d36b', allowLit, 0.2 + allowLit * 2.2);
		this.youLamp.mix('#ffffff', '#ffb000', askLit, 0.2 + askLit * 2);

		/* ---- card 3: the dial ---- */
		const turns = [
			[0.12, 0.2],
			[0.32, 0.4],
			[0.52, 0.6],
			[0.74, 0.82]
		];
		let angle = DIAL_ANGLES[0];
		turns.forEach(([a, b], i) => {
			if (i === 0) return;
			angle = lerp(angle, DIAL_ANGLES[i], outBack(at(t, 2, a, b), 1.6));
		});
		// After the trip's card on the dial, it settles back where most people keep it.
		angle = lerp(angle, DIAL_ANGLES[0], inOut(at(t, 3, 0.0, 0.1)));
		this.needle.rotation.z = -angle;
		this.dialLamps.forEach((lamp, i) => {
			const near = Math.max(0, 1 - Math.abs(angle - DIAL_ANGLES[i]) / 0.3);
			lamp.mix('#ffffff', i === 3 ? color.red : i === 0 ? '#22d36b' : '#ffb000', near, 0.2 + near * 2);
		});

		/* ---- card 4: inside the glass ---- */
		const born = [at(t, 3, 0.08, 0.16), at(t, 3, 0.2, 0.28), at(t, 3, 0.32, 0.4)];
		this.procs.forEach((p, i) => {
			const k = outBack(born[i], 1.5);
			p.group.visible = k > 0.001;
			p.group.scale.setScalar(Math.max(0.001, k));
			p.lamp.set(color.orange, 0.5 + bell(t, 3 + 0.12 * i + 0.1, 3 + 0.12 * i + 0.22) * 1.4);
		});
		this.rods.forEach((rod, i) => {
			const k = smooth(born[i + 1]);
			rod.visible = k > 0.001;
			if (!rod.visible) return;
			const a = this.v.copy(PROCS[i].at).setY(PROCS[i].at.y + PROCS[i].size * 0.5);
			const b = this.w.copy(PROCS[i + 1].at).setY(PROCS[i + 1].at.y + PROCS[i + 1].size * 0.5);
			// From face to face, not centre to centre, so a link never runs inside the boxes it joins.
			const dir = this.d.copy(b).sub(a);
			const flat = Math.max(Math.abs(dir.x), Math.abs(dir.z)) / dir.length();
			dir.normalize();
			a.addScaledVector(dir, PROCS[i].size / 2 / flat + 0.02);
			b.addScaledVector(dir, -(PROCS[i + 1].size / 2 / flat + 0.02));
			b.lerpVectors(a, b, k);
			rod.position.lerpVectors(a, b, 0.5);
			rod.scale.set(1, Math.max(0.001, a.distanceTo(b)), 1);
			rod.quaternion.setFromUnitVectors(this.up, b.sub(a).normalize());
		});
		// From above the worker and its name, so nothing it throws passes through its own label.
		const worker = this.v.copy(PROCS[2].at).setY(PROCS[2].size + 0.62);

		// A write into the project lands, and its lamp says so.
		const pj = at(t, 3, 0.46, 0.58);
		this.toProject.mesh.visible = pj > 0 && pj < 1;
		if (this.toProject.mesh.visible) {
			this.arc(this.toProject.mesh, worker, this.w.set(PROJECT.x + 1.05, 0.62, PROJECT.z + 0.1), inOut(pj), 1.1);
			this.toProject.mesh.rotation.set(-0.2, 0, 0);
			this.toProject.mesh.scale.setScalar(Math.max(0.001, Math.min(1, pj * 6, (1 - pj) * 6)));
		}
		const kept = bell(t, 3.56, 3.7);
		this.projectLamp.mix('#ffffff', '#22d36b', kept, 0.2 + kept * 2);

		// A write to your home flies at the glass and is stopped flat against it.
		const hm = at(t, 3, 0.6, 0.7);
		const fall = at(t, 3, 0.7, 0.8);
		this.toHome.mesh.visible = hm > 0 && fall < 1;
		if (this.toHome.mesh.visible) {
			const hit = this.w.set(G1 - 0.08, 1.4, 0.0);
			if (fall <= 0) this.arc(this.toHome.mesh, worker, hit, inOut(hm), 0.5);
			else this.toHome.mesh.position.set(hit.x - fall * 0.3, 1.4 - fall * fall * 1.1, 0.0);
			this.toHome.mesh.rotation.set(0, -Math.PI / 2 + fall * 0.6, fall * 0.9);
			this.toHome.mesh.scale.setScalar(Math.max(0.001, Math.min(1, hm * 6, (1 - fall) * 4)));
		}
		const ripple = at(t, 3, 0.7, 0.8);
		this.ripple.visible = ripple > 0 && ripple < 1;
		this.ripple.scale.setScalar(0.6 + ripple * 3.2);
		(this.ripple.material as THREE.MeshBasicMaterial).opacity = (1 - ripple) * 0.85;
		this.stopped.scale.setScalar(Math.max(0.001, outBack(at(t, 3, 0.72, 0.78), 1.4) * (1 - smooth(at(t, 3, 0.9, 0.96)))));

		// The network: one packet to a domain on the list goes through the proxy; one to anywhere else is turned back.
		const door = this.w.set(PROXY_X, 1.0, GZ0);
		const from = this.v.copy(PROCS[1].at).setY(1.0);
		const ok = at(t, 3, 0.8, 0.92);
		const okPacket = this.packets[0];
		okPacket.visible = ok > 0 && ok < 1;
		if (okPacket.visible) {
			if (ok < 0.6) okPacket.position.lerpVectors(from, door, inOut(ok / 0.6));
			else okPacket.position.set(PROXY_X + ((ok - 0.6) / 0.4) * 1.6, 1.0 + ((ok - 0.6) / 0.4) * 0.2, GZ0 - ((ok - 0.6) / 0.4) * 0.8);
			okPacket.scale.setScalar(Math.max(0.001, Math.min(1, ok * 8, (1 - ok) * 6)));
		}
		this.turnBack(this.packets[1], from, door, at(t, 3, 0.9, 0.99));
		this.turnBack(this.packets[2], from, door, at(t, 5, 0.06, 0.2));
		const proxyNo = Math.max(bell(t, 3.94, 3.99), bell(t, 5.13, 5.22));
		const proxyYes = bell(t, 3.84, 3.9);
		if (proxyNo > 0.01) this.proxyLamp.mix('#ffffff', color.red, proxyNo, 0.2 + proxyNo * 2.2);
		else this.proxyLamp.mix('#ffffff', '#22d36b', proxyYes, 0.2 + proxyYes * 2.2);

		/* ---- card 5: what the glass never wraps ---- */
		const spots = this.harnessId === 'codex' ? { ...OUTSIDE, files: INSIDE_SPOT } : this.harnessId === 'copilot' ? { ...OUTSIDE, mcp: INSIDE_SPOT } : OUTSIDE;
		(['files', 'mcp', 'hooks'] as const).forEach((key, i) => {
			const k = outBack(at(t, 4, 0.1 + i * 0.1, 0.22 + i * 0.1), 1.5);
			const thing = this.outside[key];
			thing.visible = k > 0.001;
			thing.scale.setScalar(Math.max(0.001, k));
			thing.position.copy(spots[key]);
		});

		/* ---- card 6: the glass says no, and the question comes to you ---- */
		const q = at(t, 5, 0.26, 0.5);
		this.question.mesh.visible = q > 0;
		if (this.question.mesh.visible) {
			const start = this.v.copy(PROCS[1].at).setY(1.5);
			// It lands standing on your desk, leaning back a little, like a note left for you.
			const end = this.w.set(YOU.x + 0.2, 0.9 + 0.21 * Math.cos(0.3), YOU.z + 0.05 - 0.21 * Math.sin(0.3));
			this.arc(this.question.mesh, start, end, inOut(q), GH + 0.6 - 0.5);
			this.question.mesh.rotation.set(-0.3 * smooth(q), 0, 0);
			this.question.mesh.scale.setScalar(Math.max(0.001, Math.min(1, q * 5)));
		}
	}

	/** When the question has reached your desk, 0 to 1. */
	private questionLanded(t: number) {
		return smooth(at(t, 5, 0.48, 0.54));
	}

	/** A packet that goes to the proxy's door and is turned back. k: 0 to 1 over its whole trip. */
	private turnBack(packet: THREE.Mesh, from: THREE.Vector3, door: THREE.Vector3, k: number) {
		packet.visible = k > 0 && k < 1;
		if (!packet.visible) return;
		const out = k < 0.55 ? inOut(k / 0.55) : 1 - inOut((k - 0.55) / 0.45) * 0.6;
		packet.position.lerpVectors(from, door, out * 0.94);
		packet.scale.setScalar(Math.max(0.001, Math.min(1, k * 8, (1 - k) * 5)));
	}
}
