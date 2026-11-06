import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, ring, roundedRect } from '../kit/geometry';
import { Card, curve, machine, shadowOn, stripes, tube } from '../kit/machines';
import { Lamp, color, mats } from '../kit/materials';
import { bell, inOut, lerp, outBack, seg } from '../kit/math';
import { createSign, fitting, grown, leaving } from '../kit/parts';
import { drawIcon, font, Surface } from '../kit/print';
import type { Shot } from '../rig';

/**
 * Where the inside of the harness is built: far above everything else, so nothing outside can be seen from in here.
 * The world shows it instead of the rest, once the reader has dived in through the roof.
 */
export const ROOM_AT = new THREE.Vector3(0, 300, 0);
/** The room's colours where a sky would be: the warm light inside a cream cabinet. */
export const ROOM_SKY = { top: new THREE.Color('#f3dfb6'), mid: new THREE.Color('#f8ead0'), low: new THREE.Color('#fdf6e8') };

const W = 14.4;
const D = 12;
const WALL_H = 6.1;
const BACK_Z = -6;
const SIDE_X = 7.2;
/** The loop on the floor, and how far out from its middle the stations stand. */
const LOOP_R = 2.5;
const STATION_R = 4.3;
const DEG = Math.PI / 180;
/** The stations around the loop, by angle, in the order a turn visits them. */
const STATIONS = [
	{ name: 'Pack', at: -90, w: 3.4, h: 1.1 },
	{ name: 'Send', at: -30, w: 1.8, h: 1.5 },
	{ name: 'Read', at: 30, w: 1.8, h: 1.8 },
	{ name: 'Check', at: 90, w: 0, h: 0 },
	{ name: 'Run', at: 150, w: 1.8, h: 1.6 },
	{ name: 'Write down', at: 210, w: 1.8, h: 1.0 }
];
const HATCHES = ['Instructions', 'Environment', 'Tools', 'Conversation'];
const HATCH_ICONS = ['doc', 'cube', 'wrench', 'chat'];
const HATCH_Y = [4.95, 4.0, 3.05, 2.1];
const PACK_Z = -4.3;
const PACK_TOP = 1.24;
const SUB_AT = new THREE.Vector3(-5.1, 0, 4.5);
/** Your files aren't in the harness: they're on your disk, through a plate in the left wall. */
const FILES_AT = new THREE.Vector3(-SIDE_X, 0.8, 0.6);
/** Where each sheet stands on Pack, in the order they go into the request. The unpacked skill is last. */
const PACK_SLOTS = [-1.32, -0.66, 0, 0.66, 1.32];
const HOOKS_AT = new THREE.Vector3(1.75, 0, 4.0);
const GATE_HALF = 0.56;
/** Which way the cards that ride or stand about face: toward where the camera mostly is. */
const FACING = 0.8;

const at = (t: number, card: number, a: number, b: number) => seg(t - card, a, b);
const onLoop = (deg: number, r = LOOP_R, out = new THREE.Vector3()) => out.set(Math.cos(deg * DEG) * r, 0, Math.sin(deg * DEG) * r);
const station = (name: string) => STATIONS.find((s) => s.name === name)!;
const placeOf = (name: string) => (name === 'Pack' ? new THREE.Vector3(0, 0, PACK_Z) : onLoop(station(name).at, STATION_R));

/** A value that moves between held keys, easing in and out of each. */
function keyed(keys: [number, number][], t: number) {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) {
		const [tb, vb] = keys[i];
		if (t > tb) continue;
		const [ta, va] = keys[i - 1];
		return lerp(va, vb, inOut((t - ta) / (tb - ta)));
	}
	return keys[keys.length - 1][1];
}

/**
 * Where the turn is on the loop, in degrees, by trip time. Card 2 goes once round, stopping at each station; card 4
 * stops short of the gate until the call is allowed; card 5 goes from the gate to Run and Write down; card 6 is a
 * quick next turn that ends at Run, where the subagent is started.
 */
const PUCK: [number, number][] = [
	[0, -90],
	[1.06, -90],
	[1.14, -30],
	[1.22, -30],
	[1.3, 30],
	[1.42, 30],
	[1.5, 90],
	[1.56, 90],
	[1.64, 150],
	[1.72, 150],
	[1.8, 210],
	[1.88, 210],
	[1.96, 270],
	[3.04, 270],
	[3.12, 330],
	[3.2, 330],
	[3.28, 390],
	[3.36, 390],
	[3.42, 430],
	[3.74, 430],
	[3.84, 470],
	[4.04, 470],
	[4.12, 510],
	[4.22, 510],
	[4.3, 570],
	[5.02, 570],
	[5.2, 870]
];

/** What the model writes back, as the Read station's screen shows it, on each turn the trip watches. */
const REPLIES = [
	['I’ll read the scheduler first.', '→ Read(scheduler.py)'],
	['Found it: one lock, taken twice.', '→ Edit(scheduler.py)'],
	['I’ll send a helper to look.', '→ Agent(explore)']
];

/* ---------- the camera, in the room's own coordinates ---------- */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);
const shot = (az: number, el: number, target: [number, number, number], radius: number, ry = radius * 0.7, extra: Partial<Shot> = {}): Omit<Shot, 'T'> => ({
	az,
	el,
	target: [target[0] + ROOM_AT.x, target[1] + ROOM_AT.y, target[2] + ROOM_AT.z],
	radius,
	ry,
	wide: WIDE,
	tall: TALL,
	...extra
});
const OVERVIEW = shot(16, 38, [0, 1.0, -0.4], 7.4, 4.6, { tallRadius: 7.6, tallRy: 5.6 });
const PACK = shot(6, 16, [0.8, 3.5, -5.0], 2.6, 2.4);
// The whole row, Instructions to Skill, centred: it reaches 1.62 either side of the middle slot.
const PACK_ROW = shot(4, 22, [0, 1.55, -4.4], 1.85, 0.95);
const GATE = shot(38, 24, [0.4, 1.0, 3.0], 2.0, 1.3);
const RUN = shot(20, 28, [-3.75, 0.95, 2.3], 1.5, 1.0);
const WRITE = shot(12, 36, [-4.3, 1.2, -2.15], 1.9, 1.2);
const SUB = shot(10, 36, [-4.5, 1.05, 3.1], 2.35, 1.45);

export const ROOM_SHOTS: Shot[] = [
	{ T: 0, ...OVERVIEW },
	{ T: 0.9, ...OVERVIEW, az: 22 },
	{ T: 1.08, ...OVERVIEW, az: 22 },
	{ T: 1.9, ...OVERVIEW, az: -8 },
	{ T: 2.1, ...PACK },
	{ T: 2.56, ...PACK, az: 3 },
	{ T: 2.7, ...PACK_ROW },
	{ T: 2.9, ...PACK_ROW, az: 0 },
	{ T: 3.1, ...GATE },
	{ T: 3.9, ...GATE, az: 30 },
	{ T: 4.08, ...RUN },
	{ T: 4.24, ...RUN, az: 14 },
	{ T: 4.44, ...WRITE },
	{ T: 4.9, ...WRITE, az: 4 },
	{ T: 5.1, ...SUB },
	{ T: 6, ...SUB, az: 2 }
];

/** Where things in the room are, in the story's coordinates: for the sound score to place what it plays. */
export function roomPoint(name: 'pack' | 'send' | 'read' | 'check' | 'run' | 'write' | 'hooks' | 'sub' | 'files' | 'reel' | 'shelf', hatch = 0): [number, number, number] {
	const at = (v: THREE.Vector3, y: number): [number, number, number] => [v.x + ROOM_AT.x, y + ROOM_AT.y, v.z + ROOM_AT.z];
	switch (name) {
		case 'pack':
			return hatch ? [ROOM_AT.x, ROOM_AT.y + HATCH_Y[hatch - 1], ROOM_AT.z + BACK_Z + 0.4] : at(placeOf('Pack'), 1.2);
		case 'check':
			return at(onLoop(90), 1.0);
		case 'hooks':
			return at(HOOKS_AT, 0.5);
		case 'sub':
			return at(SUB_AT, 0.6);
		case 'files':
			return at(FILES_AT, 0.8);
		case 'reel':
			return at(placeOf('Write down').add(new THREE.Vector3(-1.6, 0, 0)), 1.05);
		case 'shelf':
			return [ROOM_AT.x + 2.8, ROOM_AT.y + 0.8, ROOM_AT.z - 4.4];
		default:
			return at(placeOf({ send: 'Send', read: 'Read', run: 'Run', write: 'Write down' }[name]), 1.0);
	}
}

/** Where the turn is on the loop, in story coordinates, at trip time t. */
export function puckPoint(t: number): [number, number, number] {
	const p = onLoop(keyed(PUCK, t));
	return [p.x + ROOM_AT.x, ROOM_AT.y + 0.3, p.z + ROOM_AT.z];
}

/** The times the turn sets off from a station and arrives at the next, from its keyed path. */
export const PUCK_MOVES = PUCK.slice(1)
	.map(([t, deg], i) => ({ from: PUCK[i][0], to: t, moves: deg !== PUCK[i][1] }))
	.filter((m) => m.moves)
	.map(({ from, to }) => ({ from, to }));

/** Looking straight down onto the harness's roof hatch, from outside: the way in. In the story's coordinates. */
export const ROOF: Omit<Shot, 'T'> = {
	az: 18,
	el: 64,
	target: [1.1, 3.9, -0.75],
	radius: 0.62,
	ry: 0.5,
	wide: box(0, 0, 1, 1),
	tall: box(0, 0, 1, 1)
};

/* ---------- paper ---------- */

function sheet(head: string, lines: string[], accent: string, w = 1.1, h = 0.7) {
	const card = new Card(w, h, 520, 0.02);
	card.draw((c, cw, ch) => {
		c.fillStyle = accent;
		c.fillRect(0, 0, cw, ch * 0.22);
		c.fillStyle = accent === color.amber || accent === color.cream ? color.ink : '#ffffff';
		c.font = `700 ${ch * 0.12}px ${font.sans}`;
		c.textBaseline = 'middle';
		c.fillText(head, cw * 0.06, ch * 0.115);
		c.textBaseline = 'alphabetic';
		lines.forEach((line, i) => {
			c.fillStyle = i === 0 ? color.ink : '#4d5a72';
			c.font = `${i === 0 ? 700 : 500} ${ch * 0.11}px ${font.mono}`;
			c.fillText(line, cw * 0.06, ch * (0.44 + i * 0.18));
		});
	});
	return card;
}

/** Something printed on a plate, for a machine's face. */
function plate(w: number, h: number, draw: (c: CanvasRenderingContext2D, pw: number, ph: number) => void) {
	const s = new Surface(Math.round(w * 400), Math.round(h * 400));
	s.draw(draw);
	return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.6, transparent: true }));
}

/** Paper with lines of writing on it, that can be wound on: the transcript as it goes onto its reel. */
function tapeMaterial() {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;
	const c = canvas.getContext('2d')!;
	c.fillStyle = color.paper;
	c.fillRect(0, 0, 256, 64);
	c.fillStyle = '#9aa6bb';
	for (let i = 0; i < 6; i++) {
		const x = i * 44 + 6;
		c.fillRect(x, 12, 30 - (i % 3) * 6, 5);
		c.fillRect(x, 26, 22 + (i % 2) * 8, 5);
		c.fillRect(x, 40, 34 - (i % 2) * 10, 5);
	}
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = THREE.RepeatWrapping;
	t.repeat.set(1.4, 1);
	return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
}

/**
 * The inside of the harness: bigger than the box it lives in. A loop on the floor, a turn going round it, and the
 * stations it visits, with the four drawers as hatches in the back wall.
 */
export class HarnessRoom {
	group = new THREE.Group();
	private puck: THREE.Mesh;
	private stationLamps: Lamp[] = [];
	private stationBodies: THREE.Object3D[] = [];
	private hatches: THREE.Group[] = [];
	private hatchLamps: Lamp[] = [];
	private sheets: Card[] = [];
	private skill: Card;
	private skillFolder: THREE.Object3D = new THREE.Group();
	private call: Card;
	private gateArm!: THREE.Group;
	private gateLamps: Lamp[] = [];
	private hookLamp: Lamp;
	private pulses: THREE.Mesh[] = [];
	private pulseMats: THREE.MeshPhysicalMaterial[] = [];
	private pulsing = 0;
	private hookCable: THREE.Curve<THREE.Vector3>;
	private outPipe: THREE.Curve<THREE.Vector3>;
	private inPipe: THREE.Curve<THREE.Vector3>;
	private runToFiles: THREE.Curve<THREE.Vector3>;
	private runToSub: THREE.Curve<THREE.Vector3>;
	private subToFiles: THREE.Curve<THREE.Vector3>;
	private reel: THREE.Group;
	private tape: THREE.Mesh;
	private tapeMat: THREE.MeshStandardMaterial;
	private pages: Card[] = [];
	private summary: Card;
	private press: THREE.Group;
	private cartridges = new Map<string, THREE.Group>();
	private brief: Card;
	private report: Card;
	private subPuck: THREE.Mesh;
	private subLamp: Lamp;
	private filesLamp: Lamp;
	private ticker: Surface;
	private tickerShown = '';
	private v = new THREE.Vector3();
	private w = new THREE.Vector3();
	private up = new THREE.Vector3(0, 1, 0);

	constructor() {
		const m = mats();
		this.group.position.copy(ROOM_AT);
		this.group.visible = false;

		/* ---- the room: a floor, and three walls, cut away at the front so it can be seen into ---- */
		const room = new Batch();
		room.add(extrude(roundedRect(W + 0.8, D + 0.8, 0.9), 0.5, 0.14, 4, 10), m.porcelain, { r: [-Math.PI / 2, 0, 0], p: [0, -0.25, 0] });
		room.add(rbox(W + 0.4, WALL_H, 0.4, 0.12, 3), m.cream, { p: [0, WALL_H / 2, BACK_Z - 0.2] });
		for (const s of [-1, 1]) room.add(rbox(0.4, WALL_H, D, 0.12, 3), m.cream, { p: [s * (SIDE_X + 0.2), WALL_H / 2, BACK_Z + D / 2] });
		const walls = room.build('room');
		walls.traverse((o) => (o.castShadow = false));
		this.group.add(walls);

		/* ---- the loop ---- */
		const loop = new Batch();
		loop.add(ring(LOOP_R + 0.32, LOOP_R - 0.32, 0.14, 96), m.steelSoft, { p: [0, 0.07, 0] });
		loop.add(ring(LOOP_R + 0.24, LOOP_R - 0.24, 0.03, 96), m.rubber, { p: [0, 0.155, 0] });
		this.group.add(loop.build('loop'));
		this.puck = new THREE.Mesh(rbox(0.62, 0.26, 0.46, 0.09, 3), m.amber);
		this.puck.castShadow = true;
		this.group.add(this.puck);

		/* ---- the stations ---- */
		for (const s of STATIONS) {
			const p = placeOf(s.name);
			const body = s.name === 'Check' ? this.buildGate() : machine({ w: s.w, h: s.h, d: 1.2, name: s.name, signH: 0.28, vent: false });
			body.position.copy(s.name === 'Check' ? onLoop(s.at) : p);
			this.group.add(body);
			this.stationBodies.push(body);
			if (s.name !== 'Check') shadowOn(this.group, p.x, 0, p.z, s.w + 0.5, 1.6, 0.3);
			// On top, where a phone's larger signs can't cover it; on Write down's left, clear of the pages that land there.
			const lamp = new Lamp(s.name === 'Check' ? rbox(0.14, 0.05, 0.14, 0.02, 3) : rbox(0.2, 0.05, 0.2, 0.02, 3), color.amber, 0.25);
			if (s.name === 'Check') lamp.mesh.position.set(-0.11, 2.245, -0.6);
			else lamp.mesh.position.set((s.name === 'Write down' ? -1 : 1) * (s.w / 2 - 0.42), 0.14 + s.h + 0.02, 0.36);
			body.add(lamp.mesh);
			this.stationLamps.push(lamp);
		}

		/* ---- the four drawers, seen from inside: hatches in the back wall, over Pack ---- */
		HATCHES.forEach((name, i) => {
			const recess = new THREE.Mesh(rbox(3.6, 0.92, 0.06, 0.04, 2), m.recess);
			recess.position.set(0, HATCH_Y[i], BACK_Z + 0.01);
			this.group.add(recess);
			const hatch = new THREE.Group();
			const hb = new Batch();
			hb.add(extrude(roundedRect(3.4, 0.78, 0.12), 0.16, 0.04, 3, 8), m.creamLight);
			hatch.add(hb.build('hatch'));
			const face = plate(2.9, 0.5, (c, pw, ph) => {
				drawIcon(c, HATCH_ICONS[i], 14, (ph - 120) / 2, 120, '#1f3e6e', 2);
				c.fillStyle = color.ink;
				c.font = `700 ${ph * 0.5}px ${font.sans}`;
				c.textBaseline = 'middle';
				c.fillText(name, 170, ph * 0.54);
			});
			face.position.set(-0.1, 0, 0.085);
			hatch.add(face);
			const lamp = new Lamp(rbox(0.12, 0.12, 0.04, 0.04, 3), color.amber, 0.3);
			lamp.mesh.position.set(1.45, 0, 0.09);
			hatch.add(lamp.mesh);
			this.hatchLamps.push(lamp);
			hatch.position.set(0, HATCH_Y[i], BACK_Z + 0.14);
			this.group.add(hatch);
			this.hatches.push(hatch);
		});
		const wallSign = createSign('The four drawers', 0.2);
		wallSign.position.set(0, 5.74, BACK_Z + 0.05);
		this.group.add(wallSign);

		// What each hatch hands to Pack, and the skill that gets unpacked.
		const sheetText: [string, string[], string][] = [
			['Instructions', ['Who the agent is', 'Your project’s rules'], color.cobalt],
			['Environment', ['Folder, branch, date', 'Operating system'], color.cobalt],
			['Tools', ['Read  Edit  Bash  Grep', 'and the MCP tools'], color.cobalt],
			['Conversation', ['Fix the race condition', 'Everything said so far'], color.amber]
		];
		for (const [head, lines, accent] of sheetText) {
			const s = sheet(head, lines, accent, 0.62, 0.42);
			s.mesh.visible = false;
			this.group.add(s.mesh);
			this.sheets.push(s);
		}
		this.skill = sheet('Skill', ['debugging/', 'SKILL.md'], color.green, 0.62, 0.42);
		this.skill.mesh.visible = false;
		this.group.add(this.skill.mesh);

		// The skills shelf beside Pack: a name and a line each, until one is needed.
		const shelfAt = new THREE.Vector3(2.8, 0, -4.4);
		const shelf = new Batch();
		shelf.add(rbox(1.6, 0.14, 0.9, 0.04, 2), m.steelSoft, { p: [0, 0.07, 0] });
		shelf.add(rbox(1.6, 1.2, 0.08, 0.03, 2), m.creamLight, { p: [0, 0.6, -0.41] });
		const shelfGroup = shelf.build('skills-shelf');
		shelfGroup.position.copy(shelfAt);
		this.group.add(shelfGroup);
		shadowOn(this.group, shelfAt.x, 0, shelfAt.z, 1.8, 1.1, 0.3);
		['debugging', 'migrating', 'reviewing'].forEach((name, i) => {
			const f = new Batch();
			f.add(rbox(0.42, 0.66, 0.1, 0.02, 2), m.cream, { p: [0, 0.33, 0] });
			f.add(rbox(0.18, 0.08, 0.1, 0.02, 2), m.cream, { p: [-0.1, 0.68, 0] });
			const folder = f.build('skill-folder');
			const label = plate(0.38, 0.13, (c, pw, ph) => {
				c.fillStyle = color.ink;
				c.font = `700 ${ph * 0.4}px ${font.sans}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(name, pw / 2, ph * 0.55);
			});
			label.position.set(0, 0.42, 0.052);
			folder.add(label);
			folder.position.set(shelfAt.x - 0.5 + i * 0.5, 0.14, shelfAt.z + 0.05);
			this.group.add(folder);
			if (i === 0) this.skillFolder = folder;
		});
		const skillsSign = createSign('Skills', 0.17);
		skillsSign.position.set(shelfAt.x, 1.0, shelfAt.z - 0.3);
		this.group.add(skillsSign);

		/* ---- Send and Read, and their pipes out to the model and back ---- */
		const orange = new THREE.MeshPhysicalMaterial({ color: '#ff8a1e', roughness: 0.32, clearcoat: 0.8 });
		const green = new THREE.MeshPhysicalMaterial({ color: '#3fe583', roughness: 0.32, clearcoat: 0.8 });
		const pipes = new Batch();
		const send = placeOf('Send');
		const read = placeOf('Read');
		const mouth = (z: number, label: string) => {
			pipes.add(ring(0.36, 0.2, 0.16, 32), m.steel, { p: [SIDE_X - 0.08, 1.25, z], r: [0, 0, Math.PI / 2] });
			const sign = createSign(label, 0.17);
			sign.position.set(SIDE_X - 0.07, 1.95, z);
			sign.rotation.y = -Math.PI / 2;
			this.group.add(sign);
		};
		mouth(send.z, 'Out to the model');
		mouth(read.z, 'Back from the model');
		const sendPort: [number, number, number] = [send.x + 0.9, 0.8, send.z];
		const readPort: [number, number, number] = [read.x + 0.9, 0.8, read.z];
		fitting(pipes, sendPort, [1, 0, 0], 0.12);
		fitting(pipes, readPort, [1, 0, 0], 0.12);
		this.outPipe = curve([...leaving(sendPort, [1, 0, 0], 0.12), [5.6, 0.95, send.z], ...leaving([SIDE_X - 0.08, 1.25, send.z], [-1, 0, 0], 0.12).reverse()]);
		this.inPipe = curve([...leaving([SIDE_X - 0.08, 1.25, read.z], [-1, 0, 0], 0.12), [5.6, 0.95, read.z], ...leaving(readPort, [1, 0, 0], 0.12).reverse()]);
		this.group.add(pipes.build('room-pipes'));
		this.group.add(tube(this.outPipe, 0.12, orange, 60), tube(this.inPipe, 0.12, green, 60));

		// What the model is writing, as it comes in, on Read's face under its name.
		this.ticker = new Surface(600, 190);
		const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.46), new THREE.MeshBasicMaterial({ map: this.ticker.texture, toneMapped: false }));
		screen.position.set(read.x - 0.02, 0.66, read.z + 0.632);
		this.group.add(screen);
		this.drawTicker(0, 0);

		/* ---- the hooks: your own scripts, plugged into the gate ---- */
		const hooks = machine({ w: 1.1, h: 0.7, d: 0.8, finish: 'cobalt', name: 'Your hooks', signH: 0.16, vent: false });
		hooks.position.copy(HOOKS_AT);
		this.group.add(hooks);
		shadowOn(this.group, HOOKS_AT.x, 0, HOOKS_AT.z, 1.4, 1.1, 0.3);
		const hookOut: [number, number, number] = [HOOKS_AT.x - 0.55, 0.42, HOOKS_AT.z];
		const socket: [number, number, number] = [0, 0.62, LOOP_R + GATE_HALF + 0.13];
		const hookCable = new Batch();
		fitting(hookCable, hookOut, [-1, 0, 0], 0.05);
		fitting(hookCable, socket, [0, 0, 1], 0.05);
		this.group.add(hookCable.build('hook-fittings'));
		this.hookCable = curve([...leaving(hookOut, [-1, 0, 0], 0.05), [0.5, 0.06, 3.85], ...leaving(socket, [0, 0, 1], 0.05).reverse()]);
		this.group.add(tube(this.hookCable, 0.05, m.cobalt, 60));
		for (let i = 0; i < 2; i++) {
			const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', emissive: '#7fb8ff', emissiveIntensity: 1.6, roughness: 0.3 });
			const pulse = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 12), mat);
			pulse.visible = false;
			this.group.add(pulse);
			this.pulses.push(pulse);
			this.pulseMats.push(mat);
		}
		this.hookLamp = new Lamp(rbox(0.12, 0.12, 0.04, 0.04, 3), color.cobalt, 0.3);
		this.hookLamp.mesh.position.set(0, 0.92, LOOP_R + GATE_HALF + 0.14);
		this.group.add(this.hookLamp.mesh);

		/* ---- the call that rides the turn to the gate ---- */
		this.call = sheet('Tool call', ['Edit(scheduler.py)', 'Lock() → RLock()'], color.amber, 0.86, 0.55);
		this.call.mesh.visible = false;
		this.group.add(this.call.mesh);

		/* ---- Write down: the saved transcript on its reel, and what's sent, which gets squeezed ---- */
		const write = placeOf('Write down');
		const reelAt = new THREE.Vector3(write.x - 1.6, 1.05, write.z);
		this.reel = new THREE.Group();
		const rb = new Batch();
		rb.add(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 40), m.paper, { r: [Math.PI / 2, 0, 0] });
		for (const s of [-1, 1]) rb.add(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 40), m.steel, { p: [0, 0, s * 0.33], r: [Math.PI / 2, 0, 0] });
		rb.add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 16), m.steelSoft, { r: [Math.PI / 2, 0, 0] });
		this.reel.add(rb.build('reel'));
		this.reel.position.copy(reelAt);
		this.group.add(this.reel);
		const stand = new Batch();
		stand.add(rbox(0.9, 0.12, 1.2, 0.04, 2), m.steelSoft, { p: [reelAt.x, 0.06, reelAt.z] });
		for (const s of [-1, 1]) stand.add(rbox(0.12, 1.1, 0.08, 0.03, 2), m.steelSoft, { p: [reelAt.x, 0.6, reelAt.z + s * 0.5] });
		this.group.add(stand.build('reel-stand'));
		shadowOn(this.group, reelAt.x, 0, reelAt.z, 1.1, 1.4, 0.3);
		const reelSign = createSign('Saved transcript', 0.15);
		reelSign.position.set(reelAt.x, 1.86, reelAt.z);
		this.group.add(reelSign);
		// The transcript comes out of a slot in Write down's side and winds onto the reel.
		const slot = new THREE.Mesh(rbox(0.04, 0.08, 0.6, 0.02, 1), m.recess);
		slot.position.set(write.x - 0.9, 0.62, write.z);
		this.group.add(slot);
		this.tapeMat = tapeMaterial();
		this.tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.54), this.tapeMat);
		this.tape.castShadow = true;
		this.group.add(this.tape);
		for (let i = 0; i < 5; i++) {
			const pg = sheet(`Turn ${i + 1}`, ['call, result', 'and reply'], color.cream, 0.8, 0.52);
			pg.mesh.visible = false;
			this.group.add(pg.mesh);
			this.pages.push(pg);
		}
		this.summary = sheet('Summary', ['Goal, decisions,', 'files, what’s left'], color.green, 0.8, 0.52);
		this.summary.mesh.visible = false;
		this.group.add(this.summary.mesh);
		// The press over what's sent, on two posts with a bar across.
		const bed = this.bed();
		this.press = new THREE.Group();
		const pb = new Batch();
		pb.add(rbox(0.9, 0.16, 0.64, 0.05, 3), m.cobalt);
		pb.add(rbox(0.1, 0.36, 0.1, 0.03, 2), m.steel, { p: [0, 0.26, 0] });
		this.press.add(pb.build('press-head'));
		this.group.add(this.press);
		const frame = new Batch();
		for (const s of [-1, 1]) frame.add(rbox(0.08, 1.04, 0.08, 0.02, 2), m.steelSoft, { p: [bed.x + s * 0.56, bed.y + 0.52, bed.z - 0.38] });
		frame.add(rbox(1.24, 0.1, 0.12, 0.03, 2), m.steelSoft, { p: [bed.x, bed.y + 1.04, bed.z - 0.38] });
		this.group.add(frame.build('press-frame'));
		const sentSign = createSign('What’s sent', 0.14);
		sentSign.position.set(bed.x, bed.y + 1.3, bed.z - 0.38);
		this.group.add(sentSign);

		/* ---- Run: the tools, the files they work on, and the subagent ---- */
		const run = placeOf('Run');
		['Read', 'Edit', 'Bash', 'Grep', 'MCP', 'Agent'].forEach((name, i) => {
			const cart = new THREE.Group();
			const own = name === 'MCP' || name === 'Agent';
			const cb = new Batch();
			cb.add(rbox(0.5, 0.22, 0.3, 0.05, 2), own ? m.cobalt : m.creamLight);
			cart.add(cb.build('cartridge'));
			const lbl = plate(0.44, 0.15, (c, pw, ph) => {
				c.fillStyle = own ? '#ffffff' : color.ink;
				c.font = `700 ${ph * 0.6}px ${font.mono}`;
				c.textBaseline = 'middle';
				c.textAlign = 'center';
				c.fillText(name, pw / 2, ph * 0.55);
			});
			lbl.position.z = 0.152;
			cart.add(lbl);
			cart.position.set(run.x - 0.56 + (i % 3) * 0.56, 0.6 - Math.floor(i / 3) * 0.27, run.z + 0.5);
			this.group.add(cart);
			// The slot it plugs into, so it reads as coming out of the machine.
			const slot = new THREE.Mesh(rbox(0.56, 0.26, 0.02, 0.01, 1), m.recess);
			slot.position.set(cart.position.x, cart.position.y, run.z + 0.605);
			this.group.add(slot);
			this.cartridges.set(name, cart);
		});
		const filesPlate = new THREE.Mesh(rbox(0.08, 0.7, 1.3, 0.04, 3), m.creamLight);
		filesPlate.position.copy(FILES_AT).setX(-SIDE_X + 0.04);
		this.group.add(filesPlate);
		const filesSign = createSign('Your files', 0.17);
		filesSign.position.set(-SIDE_X + 0.07, FILES_AT.y + 0.66, FILES_AT.z);
		filesSign.rotation.y = Math.PI / 2;
		this.group.add(filesSign);
		this.filesLamp = new Lamp(rbox(0.04, 0.12, 0.12, 0.04, 3), color.amber, 0.3);
		this.filesLamp.mesh.position.set(-SIDE_X + 0.1, FILES_AT.y + 0.2, FILES_AT.z + 0.5);
		this.group.add(this.filesLamp.mesh);

		// The subagent: a smaller harness on its own pad, with its own loop.
		const pad = new Batch();
		pad.add(extrude(roundedRect(2.6, 2.2, 0.5), 0.14, 0.05, 3, 8), m.porcelain, { r: [-Math.PI / 2, 0, 0], p: [SUB_AT.x, 0.07, SUB_AT.z] });
		pad.add(ring(0.5, 0.32, 0.06, 48), m.steelSoft, { p: [SUB_AT.x + 0.6, 0.17, SUB_AT.z + 0.55] });
		this.group.add(pad.build('sub-pad'));
		shadowOn(this.group, SUB_AT.x, 0, SUB_AT.z, 2.8, 2.4, 0.22);
		const sub = machine({ w: 1.1, h: 1.0, d: 0.7, name: 'Subagent', signH: 0.16, vent: false });
		sub.position.set(SUB_AT.x - 0.5, 0.14, SUB_AT.z - 0.5);
		this.group.add(sub);
		this.subLamp = new Lamp(rbox(0.1, 0.1, 0.04, 0.04, 3), color.amber, 0.3);
		this.subLamp.mesh.position.set(0.38, 0.92, 0.37);
		sub.add(this.subLamp.mesh);
		this.subPuck = new THREE.Mesh(rbox(0.24, 0.1, 0.17, 0.04, 2), m.amber);
		this.subPuck.castShadow = true;
		this.group.add(this.subPuck);
		this.brief = sheet('Brief', ['Find every place', 'the jobs are locked.'], color.cobalt, 0.9, 0.58);
		this.report = sheet('Report', ['Two places:', 'scheduler.py, worker.py'], color.green, 0.9, 0.58);
		for (const c of [this.brief, this.report]) {
			c.mesh.visible = false;
			this.group.add(c.mesh);
		}

		// Run's leads: one to your files, one to the subagent, and the subagent's own to the same files.
		const leads = new Batch();
		const runFiles: [number, number, number] = [run.x - 0.9, 0.45, run.z - 0.3];
		const filesFront: [number, number, number] = [-SIDE_X + 0.08, FILES_AT.y - 0.1, FILES_AT.z - 0.3];
		const runSub: [number, number, number] = [run.x - 0.9, 0.45, run.z + 0.3];
		const subRight: [number, number, number] = [SUB_AT.x + 0.05, 0.6, SUB_AT.z - 0.5];
		const subLeft: [number, number, number] = [SUB_AT.x - 1.05, 0.6, SUB_AT.z - 0.5];
		const filesSide: [number, number, number] = [-SIDE_X + 0.08, FILES_AT.y - 0.1, FILES_AT.z + 0.3];
		fitting(leads, runFiles, [-1, 0, 0], 0.05);
		fitting(leads, filesFront, [1, 0, 0], 0.05);
		fitting(leads, runSub, [-1, 0, 0], 0.05);
		fitting(leads, subRight, [1, 0, 0], 0.05);
		fitting(leads, subLeft, [-1, 0, 0], 0.05);
		fitting(leads, filesSide, [1, 0, 0], 0.05);
		this.runToFiles = curve([...leaving(runFiles, [-1, 0, 0], 0.05), [-5.4, 0.06, 1.0], [-6.5, 0.06, 0.3], ...leaving(filesFront, [1, 0, 0], 0.05).reverse()]);
		this.runToSub = curve([...leaving(runSub, [-1, 0, 0], 0.05), [-5.0, 0.06, 3.0], [-4.82, 0.21, 3.36], [-4.62, 0.22, 3.62], ...leaving(subRight, [1, 0, 0], 0.05).reverse()]);
		this.subToFiles = curve([...leaving(subLeft, [-1, 0, 0], 0.05), [-6.7, 0.06, 3.2], [-6.75, 0.06, 1.6], ...leaving(filesSide, [1, 0, 0], 0.05).reverse()]);
		this.group.add(leads.build('room-leads'));
		this.group.add(tube(this.runToFiles, 0.05, m.rubber, 60), tube(this.runToSub, 0.05, m.rubber, 60), tube(this.subToFiles, 0.05, m.rubber, 60));
	}

	/** The gate over the loop: three lamps, a striped arm, and a socket where your hooks plug in. */
	private buildGate() {
		const m = mats();
		const g = new THREE.Group();
		const b = new Batch();
		for (const s of [-1, 1]) {
			b.add(rbox(0.26, 1.9, 0.26, 0.06, 3), m.cream, { p: [0, 0.95, s * GATE_HALF] });
			b.add(rbox(0.42, 0.12, 0.42, 0.04, 2), m.steelSoft, { p: [0, 0.06, s * GATE_HALF] });
		}
		b.add(rbox(0.34, 0.44, GATE_HALF * 2 + 0.36, 0.08, 3), m.cream, { p: [0, 2.0, 0] });
		g.add(b.build('gate'));
		// Allow on the left as it's seen, then Ask, then Deny.
		['Allow', 'Ask', 'Deny'].forEach((name, i) => {
			const z = 0.4 - i * 0.4;
			const lamp = new Lamp(rbox(0.05, 0.17, 0.17, 0.04, 3), [color.green, color.amber, color.red][i], 0.15);
			lamp.mesh.position.set(0.18, 2.06, z);
			g.add(lamp.mesh);
			this.gateLamps.push(lamp);
			const lbl = plate(0.38, 0.12, (c, pw, ph) => {
				c.fillStyle = color.ink;
				c.font = `700 ${ph * 0.62}px ${font.sans}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(name, pw / 2, ph * 0.55);
			});
			lbl.position.set(0.172, 1.86, z);
			lbl.rotation.y = Math.PI / 2;
			g.add(lbl);
		});
		const sign = createSign('Check', 0.18);
		sign.position.set(0, 2.42 + grown(0.18), 0);
		sign.rotation.y = Math.PI / 2;
		g.add(sign);
		// The arm swings up from the inner post to let the turn through.
		this.gateArm = new THREE.Group();
		const arm = new THREE.Mesh(rbox(0.08, 0.1, GATE_HALF * 2, 0.03, 2), stripes('#f0473c', '#fbfaf5', 3));
		arm.position.z = GATE_HALF;
		arm.castShadow = true;
		this.gateArm.add(arm);
		this.gateArm.position.set(0.17, 0.66, -GATE_HALF);
		g.add(this.gateArm);
		return g;
	}

	/** Where the pages of what's sent stack, on top of Write down. */
	private bed() {
		const write = placeOf('Write down');
		return new THREE.Vector3(write.x + 0.2, 0.14 + station('Write down').h, write.z + 0.08);
	}

	private drawTicker(reply: number, n: number) {
		const [said, call] = REPLIES[reply];
		const shown = (said + '\n' + call).slice(0, n);
		const key = `${reply}:${shown}`;
		if (key === this.tickerShown) return;
		this.tickerShown = key;
		const done = n >= said.length + call.length + 1;
		this.ticker.draw((c, w, h) => {
			c.fillStyle = '#0d1b33';
			c.fillRect(0, 0, w, h);
			c.textBaseline = 'alphabetic';
			const [a, b = ''] = shown.split('\n');
			c.font = `600 ${h * 0.2}px ${font.mono}`;
			c.fillStyle = '#e8eefa';
			c.fillText(a, w * 0.05, h * 0.4);
			c.fillStyle = '#ffb35c';
			c.font = `700 ${h * 0.2}px ${font.mono}`;
			c.fillText(b, w * 0.05, h * 0.74);
			if (!done && n > 0) {
				const last = b || a;
				c.font = `600 ${h * 0.2}px ${font.mono}`;
				const x = w * 0.05 + c.measureText(last).width + 4;
				c.fillStyle = '#7fe0a8';
				c.fillRect(x, (b ? h * 0.74 : h * 0.4) - h * 0.17, h * 0.09, h * 0.2);
			}
		});
	}

	/**
	 * A sheet on its way to its place in Pack's row: straight up out of where it was, across at a height, and straight
	 * down into its place. k 0 not yet out, 1 standing there.
	 */
	private toSlot(card: Card, k: number, from: THREE.Vector3, slot: number, over: number) {
		if (k <= 0) {
			card.mesh.visible = false;
			return;
		}
		const e = inOut(k);
		const u = 1 - e;
		const tx = PACK_SLOTS[slot];
		const tz = PACK_Z - 0.1;
		const a = u * u * u;
		const b = 3 * u * u * e;
		const c = 3 * u * e * e;
		const d = e * e * e;
		const hinge = this.v.set(a * from.x + b * from.x + c * tx + d * tx, a * from.y + (b + c) * over + d * PACK_TOP, a * from.z + b * from.z + c * tz + d * tz);
		// Upright while it travels, settling back into its lean as it lands.
		this.stand(card, hinge, lerp(1.1, 1, e), Math.min(1, k * 4), 0);
	}

	/** Lays a card flat at a point, with a little turn, so a stack looks stacked by hand. */
	private lay(mesh: THREE.Object3D, p: THREE.Vector3, turn = 0, scale = 1) {
		mesh.position.copy(p);
		mesh.rotation.set(-Math.PI / 2, 0, turn);
		mesh.scale.setScalar(Math.max(0.001, scale));
	}

	/** Stands a card on a point, hinged at its bottom edge and leaning back a little. up: 0 lying, 1 standing. */
	private stand(card: Card, hinge: THREE.Vector3, up: number, scale: number, yaw = FACING) {
		const mesh = card.mesh;
		const angle = -(0.18 + (1 - Math.min(up, 1.1)) * (Math.PI / 2 - 0.18));
		const half = (card.h * scale) / 2;
		mesh.position.set(hinge.x + half * Math.sin(angle) * Math.sin(yaw), hinge.y + 0.012 + half * Math.cos(angle), hinge.z + half * Math.sin(angle) * Math.cos(yaw));
		mesh.rotation.set(angle, yaw, 0, 'YXZ');
		mesh.scale.setScalar(Math.max(0.001, scale));
		mesh.visible = scale > 0.002;
	}

	/** A glowing slug travelling along a cable or pipe, s from 0 at its start to 1 at its end. */
	private pulseAlong(path: THREE.Curve<THREE.Vector3>, s: number, glow: string, girth = 1) {
		if (s <= 0 || s >= 1) return;
		const i = this.pulsing++ % this.pulses.length;
		const pulse = this.pulses[i];
		const u = Math.min(0.995, Math.max(0.005, s));
		path.getPointAt(u, pulse.position);
		pulse.quaternion.setFromUnitVectors(this.up, path.getTangentAt(u, this.v));
		// The whole slug stays above the floor, or the subagent's pad, however steeply the line it's on is climbing.
		const p = pulse.position;
		const ground = Math.abs(p.x - SUB_AT.x) < 1.3 && Math.abs(p.z - SUB_AT.z) < 1.1 ? 0.14 : 0;
		const low = ground + (0.085 + 0.1 * Math.abs(this.v.y)) * girth + 0.01;
		pulse.position.y += Math.max(0, low - pulse.position.y);
		this.pulseMats[i].emissive.set(glow);
		pulse.scale.setScalar(Math.max(0.001, Math.min(1, s / 0.06, (1 - s) / 0.06)) * girth);
		pulse.visible = true;
	}

	/** Everything in the room, as a pure function of the trip's time t, one unit per card. */
	update(t: number, time: number) {
		for (const p of this.pulses) p.visible = false;
		this.pulsing = 0;

		/* ---- the turn, going round ---- */
		const deg = keyed(PUCK, t);
		onLoop(deg, LOOP_R, this.puck.position);
		this.puck.position.y = 0.3;
		this.puck.rotation.y = -deg * DEG;
		// How close the turn is to a station, 1 when it's there.
		const near = (i: number) => {
			const d = ((((deg - STATIONS[i].at) % 360) + 540) % 360) - 180;
			return Math.max(0, 1 - Math.abs(d) / 16);
		};
		this.stationLamps.forEach((lamp, i) => lamp.set(color.green, 0.2 + (t >= 1 ? near(i) : 0) * 1.1 + Math.sin(time * 1.3 + i) * 0.04));
		this.stationBodies.forEach((body, i) => {
			if (STATIONS[i].name === 'Check') return;
			const jolt = t >= 1 ? bell(near(i), 0.7, 1) * 0.5 : 0;
			body.scale.set(1 + jolt * 0.015, 1 - jolt * 0.025, 1 + jolt * 0.015);
		});

		/* ---- out to the model and back, on every turn the trip watches ---- */
		// The pipes are thick, so what goes through them is too.
		this.pulseAlong(this.outPipe, Math.max(at(t, 1, 0.14, 0.22), at(t, 3, 0.12, 0.2)), '#ff8a1a', 1.75);
		this.pulseAlong(this.inPipe, Math.max(at(t, 1, 0.24, 0.32), at(t, 3, 0.22, 0.3)), '#22d36b', 1.75);
		const reply = t < 3 ? 0 : t < 5 ? 1 : 2;
		const typing = t < 1 ? 0 : t < 3 ? at(t, 1, 0.3, 0.4) : t < 5 ? at(t, 3, 0.28, 0.36) : at(t, 5, 0.1, 0.16);
		this.drawTicker(reply, Math.floor(typing * (REPLIES[reply][0].length + REPLIES[reply][1].length + 1)));

		/* ---- card 3: packing. Each hatch hands over its sheet, then a skill is unpacked ---- */
		this.hatches.forEach((hatch, i) => {
			const a = 0.08 + i * 0.12;
			const out = inOut(at(t, 2, a, a + 0.05)) * (1 - inOut(at(t, 2, a + 0.1, a + 0.15)));
			hatch.position.z = BACK_Z + 0.14 + out * 0.45;
			this.hatchLamps[i].mix(color.amber, color.green, t >= 2 ? at(t, 2, a + 0.05, a + 0.08) : 0, 0.3 + out * 0.7);
			// Out of its hatch standing, down in an arc, and into its place in the row on Pack.
			const fly = t >= 2 ? at(t, 2, a + 0.04, a + 0.12) : 0;
			this.toSlot(this.sheets[i], fly, this.w.set(0, HATCH_Y[i] - 0.1, BACK_Z + 0.3), i, HATCH_Y[i] + 0.6);
		});
		const lift = t >= 2 ? bell(at(t, 2, 0.6, 0.86), 0, 1) : 0;
		this.skillFolder.position.y = 0.14 + lift * 0.3;
		const folder = this.skillFolder.position;
		this.toSlot(this.skill, t >= 2 ? at(t, 2, 0.66, 0.78) : 0, this.w.set(folder.x, folder.y + 0.5, folder.z + 0.1), 4, PACK_TOP + 0.75);

		/* ---- card 4: the gate. The reply asks for a tool, a hook runs, and the arm lifts ---- */
		const ride = t >= 3 && t < 4.3 ? at(t, 3, 0.3, 0.38) * (1 - at(t, 4, 0.1, 0.16)) : 0;
		if (ride > 0.002) this.stand(this.call, this.v.copy(this.puck.position).setY(0.43), Math.min(1, ride * 1.4), ride);
		else this.call.mesh.visible = false;
		this.pulseAlong(this.hookCable, at(t, 3, 0.44, 0.54), '#5aa2ff', 1.3);
		this.hookLamp.set(color.cobalt, 0.3 + (t >= 3 ? bell(at(t, 3, 0.52, 0.62), 0, 1) : 0) * 1.4);
		// Outside card 4 the gate simply opens for the turn as it comes, as for any allowed call.
		const gateNear = Math.max(0, 1 - Math.abs(((((deg - 90) % 360) + 540) % 360) - 180) / 26);
		const scripted = t >= 3 && t < 4;
		const ask = scripted ? bell(at(t, 3, 0.5, 0.66), 0, 1) : 0;
		const allow = scripted ? at(t, 3, 0.62, 0.66) * (1 - at(t, 3, 0.9, 0.96)) : inOut(gateNear);
		this.gateLamps[0].set(color.green, 0.15 + allow * 1.4);
		this.gateLamps[1].set(color.amber, 0.15 + ask * 1.4);
		this.gateLamps[2].set(color.red, 0.15);
		const open = scripted ? outBack(at(t, 3, 0.64, 0.72), 1.2) * (1 - inOut(at(t, 3, 0.88, 0.96))) : inOut(Math.min(1, gateNear * 1.6));
		this.gateArm.rotation.x = -open * 1.4;

		/* ---- Run: whichever tool the turn asked for comes out, and does its work ---- */
		const run = placeOf('Run');
		const pop = (name: string, k: number) => {
			this.cartridges.get(name)!.position.z = run.z + 0.5 + k * 0.2;
		};
		pop('Read', t >= 1 ? bell(at(t, 1, 0.64, 0.72), 0, 1) : 0);
		pop('Edit', t >= 4 ? bell(at(t, 4, 0.12, 0.26), 0, 1) : 0);
		pop('Agent', t >= 5 ? inOut(at(t, 5, 0.2, 0.26)) * (1 - inOut(at(t, 5, 0.86, 0.92))) : 0);
		this.pulseAlong(this.runToFiles, Math.max(at(t, 1, 0.65, 0.72), at(t, 4, 0.14, 0.22)), '#ffb35c', 1.3);
		this.filesLamp.set(color.amber, 0.3 + Math.max(bell(at(t, 1, 0.7, 0.78), 0, 1), bell(at(t, 4, 0.2, 0.28), 0, 1), bell(at(t, 5, 0.54, 0.62), 0, 1)) * 1.2);

		/* ---- card 5: written down. The reel keeps everything; what's sent gets squeezed ---- */
		const write = placeOf('Write down');
		const wound = (t >= 1 ? at(t, 1, 0.8, 0.88) * 0.15 : 0) + (t >= 4 ? at(t, 4, 0.3, 0.9) : 0);
		const r = 0.38 + wound * 0.08;
		this.reel.scale.set(r / 0.38, r / 0.38, 1);
		this.reel.rotation.z = wound * 7;
		this.tapeMat.map!.offset.x = wound * 3.2;
		// From the slot to the bottom of the reel, where the tape winds on.
		const sx = write.x - 0.9;
		const ex = this.reel.position.x;
		const ey = this.reel.position.y - r;
		this.tape.scale.set(Math.hypot(sx - ex, ey - 0.62), 1, 1);
		this.tape.position.set((sx + ex) / 2, (0.62 + ey) / 2, write.z);
		this.tape.rotation.z = Math.atan2(ey - 0.62, ex - sx) + Math.PI;
		const bed = this.bed();
		const squeeze = t >= 4 ? inOut(at(t, 4, 0.62, 0.7)) : 0;
		this.pages.forEach((pg, i) => {
			const a = 0.32 + i * 0.05;
			const k = t >= 4 ? at(t, 4, a, a + 0.04) : 0;
			pg.mesh.visible = k > 0 && squeeze < 1;
			if (!pg.mesh.visible) return;
			// Up out of the top, and over onto the pile.
			const e = inOut(k);
			const p = this.v.set(bed.x, bed.y + 0.012 + i * 0.016 * (1 - squeeze) + Math.sin(e * Math.PI) * 0.2, bed.z + (i % 2 ? 0.02 : -0.02) + (1 - e) * 0.3);
			this.lay(pg.mesh, p, (i - 2) * 0.03, Math.min(1, k * 3) * (1 - squeeze * 0.999));
		});
		this.summary.mesh.visible = squeeze > 0;
		if (this.summary.mesh.visible) this.lay(this.summary.mesh, this.v.set(bed.x, bed.y + 0.014, bed.z), 0, Math.max(0.001, squeeze));
		const pressDown = t >= 4 ? inOut(at(t, 4, 0.58, 0.66)) * (1 - inOut(at(t, 4, 0.72, 0.8))) : 0;
		this.press.position.set(bed.x, lerp(bed.y + 0.86, bed.y + 0.1 + 4 * 0.016, pressDown), bed.z);

		/* ---- card 6: the subagent. A brief out, its own laps, the same files, and a report back ---- */
		const sub = this.w.set(SUB_AT.x - 0.5, 0.14, SUB_AT.z + 0.45);
		const briefUp = t >= 5 ? at(t, 5, 0.32, 0.38) * (1 - at(t, 5, 0.6, 0.64)) : 0;
		const reportUp = t >= 5 ? at(t, 5, 0.62, 0.68) * (1 - at(t, 5, 0.72, 0.76)) : 0;
		const reportBack = t >= 5 ? at(t, 5, 0.78, 0.84) : 0;
		this.pulseAlong(this.runToSub, at(t, 5, 0.24, 0.34), '#5aa2ff', 1.3);
		this.pulseAlong(this.runToSub, 1 - at(t, 5, 0.7, 0.8), '#22d36b', 1.3);
		this.pulseAlong(this.subToFiles, at(t, 5, 0.46, 0.56), '#ffb35c', 1.3);
		if (briefUp > 0.002) this.stand(this.brief, sub, Math.min(1, briefUp * 1.4), briefUp);
		else this.brief.mesh.visible = false;
		if (reportBack > 0) this.stand(this.report, this.v.set(run.x - 0.2, 0.14 + station('Run').h, run.z), Math.min(1, reportBack * 1.4), reportBack);
		else if (reportUp > 0.002) this.stand(this.report, sub, Math.min(1, reportUp * 1.4), reportUp);
		else this.report.mesh.visible = false;
		const working = t >= 5 ? at(t, 5, 0.38, 0.62) : 0;
		const subDeg = working * 720 - 90;
		this.subPuck.position.set(SUB_AT.x + 0.6 + Math.cos(subDeg * DEG) * 0.41, 0.25, SUB_AT.z + 0.55 + Math.sin(subDeg * DEG) * 0.41);
		this.subPuck.rotation.y = -subDeg * DEG;
		this.subLamp.set(color.green, 0.2 + (working > 0 && working < 1 ? 0.6 + Math.abs(Math.sin(time * 8)) * 0.6 : 0));
	}
}
