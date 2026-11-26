import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect, sharedRbox } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { drawIcon, Label, Surface, font, roundRectPath } from '../kit/print';
import { Card } from '../kit/machines';
import { fitting, screw, ventX } from '../kit/parts';
import { hitBox } from '../poke';
import { palette } from '../sky/palette';
import { resolve } from '$app/paths';

/*
 * The harness: the program you installed, everything around the model but the thinking, and the biggest thing on your
 * desk. Seen from outside it is the room the side trip goes into (tracks/room), at about a third of its size: the four
 * drawers in its front by your laptop, and beside them a window into the room itself; your screen in its left flank,
 * where the checks are, and the MCP server's lead coming in under it; in its right flank the ports the calls leave by and
 * their results come home to, to and from the gates and the sandbox; at its back corners the glass tube the request goes
 * up, onto its lane, and the chute the reply comes down, off its lane; a barrel roof with the hatch the trip dives in
 * through.
 */

export const HW = 4.5;
export const HH = 3.5;
export const HD = 3.6;
/** How high its barrel roof rises over the top of its walls. */
export const ROOF_RISE = 0.62;
/** The top of its walls, and the crown of its roof, from the desk. */
export const WALL_TOP = 0.14 + HH;
export const CROWN = WALL_TOP + ROOF_RISE;

const OPEN_W = 2.14;
const OPEN_H = 2.5;
const OPEN_Y = 1.62;
/** The drawers' bank, right of the window into the room. */
export const DRAWER_X = 1.0;
/** The window into the room, left of the drawers. */
const WIN = { x: -1.2, y: 1.72, w: 1.7, h: 2.06, deep: 1.25 };
/**
 * The room's plan, at the harness's own scale: its x from wall to wall, its z from back to front, its y from floor to
 * the walls' tops. Where the room puts the tube, the chute, your screen and the benches' ports, the outside does too.
 */
const ROOM = { sx: HW / 14.4, sz: HD / 12, sy: HH / 6.1 };
/**
 * The send tube, standing against the back at the left corner, under the request's lane; the reply chute at the right,
 * under the reply's. (The lanes keep their sides the whole way to the provider: the request on the left.)
 */
export const TUBE = { x: -HW / 2 + 0.12, z: -HD / 2 - 0.36, r: 0.3 };
export const CHUTE = { x: HW / 2 - 0.12, z: -HD / 2 - 0.33, r: 0.27 };

/** Where the lines enter, in the harness's own coordinates. The pipes in the world are drawn to these. */
export const PORT_Y = 0.42;
/** The MCP server's lead comes in low in the left flank, towards its front, under your screen. */
export const PORT_MCP_Z = 1.05;
/** Your keys come in at the front, low under the drawers' right-hand end, clear of the lowest drawer, from the laptop. */
export const PORT_KEYS_X = DRAWER_X + 0.82;
export const PORT_KEYS_Y = 0.27;
/**
 * The right flank's two ports, where the room's benches send their wires out: the calls leave by the high one, for the
 * gates, and their results come home by the low one, from the sandbox.
 */
export const PORT_CALLS = { y: 2.2, z: 0.25 };
export const PORT_RESULTS = { y: 1.25, z: -0.75 };
/** The tube's top, over the roof, where the request's lane begins; the chute's funnel, where the reply's lane ends. */
export const TUBE_TOP = 0.14 + HH + ROOF_RISE + 1.3;
export const CHUTE_TOP = 0.14 + HH + ROOF_RISE + 0.74;

const ROWS = 4;
const ROW_H = OPEN_H / ROWS;
const DRAWER_TRAVEL = 1.25;
/** How far a drawer comes out when the reader pulls it. */
const PULL = 0.96;
/** A sheet may only stand once its drawer is this far out, or it would swing into the drawer above. */
const CLEAR = 0.9;
/** How far back a standing sheet leans. */
const LEAN = 0.14;

let tubeGlass: THREE.MeshPhysicalMaterial | undefined;

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
		this.group.name = `drawer:${name}`;
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
		b.add(front, palette().cream, { p: [0, 0, 0.05] });
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
		// The front alone, without the tray behind it, is what the conversation points at.
		face.name = `front:${name}`;
		this.group.add(face);

		// State lamp on the front's right end.
		this.lamp = new Lamp(sharedRbox(0.1, 0.1, 0.034, 0.03, 3), color.amber, 0.4);
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
		this.group.position.set(DRAWER_X, this.y, HD / 2 - 0.06 + open * DRAWER_TRAVEL);
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
		// Its name lets the conversation point at it: see pointer.svelte.ts.
		this.group.name = 'Harness';
		const m = mats();
		const c = palette();
		const b = new Batch();
		// A brass plinth, and the butter-cream body of everything that is yours.
		b.add(rbox(HW + 0.34, 0.14, HD + 0.34, 0.05, 3), c.brass, { p: [0, 0.07, 0] });

		const Y0 = 0.14;
		const midY = Y0 + HH / 2;

		// Shell: an extruded block with two openings let through its front, the drawers' bay and the window into the
		// room, each a true recess with a soft inner lip.
		const profile = roundedRect(HW, HH, 0.3);
		const opening = (cx: number, cy: number, w: number, h: number, r: number) => {
			const hole = new THREE.Path();
			const hw = w / 2;
			const hh = h / 2;
			const y = cy - midY;
			hole.moveTo(cx - hw + r, y - hh);
			hole.lineTo(cx + hw - r, y - hh);
			hole.quadraticCurveTo(cx + hw, y - hh, cx + hw, y - hh + r);
			hole.lineTo(cx + hw, y + hh - r);
			hole.quadraticCurveTo(cx + hw, y + hh, cx + hw - r, y + hh);
			hole.lineTo(cx - hw + r, y + hh);
			hole.quadraticCurveTo(cx - hw, y + hh, cx - hw, y + hh - r);
			hole.lineTo(cx - hw, y - hh + r);
			hole.quadraticCurveTo(cx - hw, y - hh, cx - hw + r, y - hh);
			return hole;
		};
		profile.holes.push(opening(DRAWER_X, OPEN_Y, OPEN_W, OPEN_H, 0.08), opening(WIN.x, WIN.y, WIN.w, WIN.h, 0.12));
		b.add(extrude(profile, HD, 0.085, 6, 10), c.butter, { p: [0, midY, 0] });

		// The drawers' cavity, dark so drawers read against it, with a bay for each drawer: nothing stands in a tray's way
		// as it slides out.
		const LIP = HD / 2 - 0.12;
		const BACK = LIP - 1.9;
		const deep = LIP - BACK;
		const midZ = (LIP + BACK) / 2;
		const t = 0.012;
		b.add(new THREE.BoxGeometry(OPEN_W, OPEN_H, 0.03), m.recess, { p: [DRAWER_X, OPEN_Y, BACK] });
		for (const s of [-1, 1]) {
			b.add(new THREE.BoxGeometry(t, OPEN_H, deep), m.recess, { p: [DRAWER_X + s * (OPEN_W / 2 - t / 2), OPEN_Y, midZ] });
			b.add(new THREE.BoxGeometry(OPEN_W, t, deep), m.recess, { p: [DRAWER_X, OPEN_Y + s * (OPEN_H / 2 - t / 2), midZ] });
		}
		for (let row = 1; row < ROWS; row++) {
			b.add(new THREE.BoxGeometry(OPEN_W, 0.016, deep), m.recess, { p: [DRAWER_X, OPEN_Y + OPEN_H / 2 - ROW_H * row, midZ] });
		}
		// The window's reveal: cream, lined to its back, where the room is seen (see the picture, below).
		const wz = HD / 2 - WIN.deep / 2;
		for (const s of [-1, 1]) {
			b.add(new THREE.BoxGeometry(t, WIN.h, WIN.deep), m.creamDeep, { p: [WIN.x + s * (WIN.w / 2 - t / 2), WIN.y, wz] });
			b.add(new THREE.BoxGeometry(WIN.w, t, WIN.deep), m.creamDeep, { p: [WIN.x, WIN.y + s * (WIN.h / 2 - t / 2), wz] });
		}

		// Brass reveals lining both openings, a sill under the window, and the glass in it.
		const reveal = (cx: number, cy: number, w: number, h: number) => {
			const outer = roundedRect(w + 0.1, h + 0.1, 0.1);
			const hole = new THREE.Path();
			const q = 0.07;
			const hw = w / 2;
			const hh = h / 2;
			hole.moveTo(-hw + q, -hh);
			hole.lineTo(hw - q, -hh);
			hole.quadraticCurveTo(hw, -hh, hw, -hh + q);
			hole.lineTo(hw, hh - q);
			hole.quadraticCurveTo(hw, hh, hw - q, hh);
			hole.lineTo(-hw + q, hh);
			hole.quadraticCurveTo(-hw, hh, -hw, hh - q);
			hole.lineTo(-hw, -hh + q);
			hole.quadraticCurveTo(-hw, -hh, -hw + q, -hh);
			outer.holes.push(hole);
			b.add(extrude(outer, 0.06, 0.016, 2, 8), c.brass, { p: [cx, cy, HD / 2 + 0.002] });
		};
		reveal(DRAWER_X, OPEN_Y, OPEN_W, OPEN_H);
		reveal(WIN.x, WIN.y, WIN.w, WIN.h);
		b.add(rbox(WIN.w + 0.3, 0.08, 0.22, 0.03, 1), c.gold, { p: [WIN.x, WIN.y - WIN.h / 2 - 0.08, HD / 2 + 0.07] });
		// Its mullions: a gold cross, so it reads as a window and not a screen.
		b.add(rbox(0.05, WIN.h, 0.05, 0.015, 1), c.gold, { p: [WIN.x, WIN.y, HD / 2 - 0.02] });
		b.add(rbox(WIN.w, 0.05, 0.05, 0.015, 1), c.gold, { p: [WIN.x, WIN.y + WIN.h * 0.16, HD / 2 - 0.02] });

		// Nameplate above the drawers.
		const plateY = OPEN_Y + OPEN_H / 2 + 0.32;
		b.add(extrude(roundedRect(1.62, 0.5, 0.18), 0.05, 0.02, 3, 10), c.brass, { p: [DRAWER_X, plateY, HD / 2 + 0.01] });
		b.add(extrude(roundedRect(1.5, 0.4, 0.14), 0.07, 0.022, 3, 10), c.cream, { p: [DRAWER_X, plateY, HD / 2 + 0.03] });

		// A closed back: a panel let into the shell, screwed on at its corners.
		b.add(extrude(roundedRect(HW - 0.5, HH - 0.3, 0.2), 0.1, 0.03, 3, 8), c.butter, { p: [0, midY, -HD / 2 + 0.03] });
		for (const sx of [-1, 1]) for (const y of [0.5, HH - 0.2]) screw(b, sx * (HW / 2 - 0.42), y, -HD / 2 - 0.022, 'z');

		// Your screen, in its left flank where the checks are: a wide pane, lit, in a brass frame.
		const sz0 = -2.5 * ROOM.sz;
		const sz1 = -0.3 * ROOM.sz;
		const sy0 = Y0 + 1.4 * ROOM.sy;
		const sy1 = Y0 + 3.2 * ROOM.sy;
		b.add(rbox(0.06, sy1 - sy0 + 0.16, sz1 - sz0 + 0.16, 0.03, 1), c.brass, { p: [-HW / 2 - 0.01, (sy0 + sy1) / 2, (sz0 + sz1) / 2] });
		b.add(rbox(0.03, sy1 - sy0, sz1 - sz0, 0.012, 1), c.screen, { p: [-HW / 2 - 0.035, (sy0 + sy1) / 2, (sz0 + sz1) / 2] });

		// A fitting wherever a line enters, so every line ends at something. The MCP server's lead comes in on the left
		// flank, from the server beside the easel; your keys at the front, from the laptop; on the right flank the calls go
		// out to the gates and their results come home from the sandbox; and a vent by them.
		fitting(b, [-HW / 2, PORT_Y, PORT_MCP_Z], [-1, 0, 0], 0.042);
		fitting(b, [PORT_KEYS_X, PORT_KEYS_Y, HD / 2], [0, 0, 1], 0.04);
		fitting(b, [HW / 2, PORT_CALLS.y, PORT_CALLS.z], [1, 0, 0], 0.09);
		fitting(b, [HW / 2, PORT_RESULTS.y, PORT_RESULTS.z], [1, 0, 0], 0.115);
		ventX(b, HW / 2 + 0.002, 2.4, 1.15, 1.6, 0.8, 9);

		// Roof: a gold cornice, and a low barrel vault over it from front to back, gold-ribbed at its ends and across, with
		// the hatch let into its crown.
		const roofY = Y0 + HH;
		b.add(rbox(HW + 0.12, 0.12, HD + 0.12, 0.04, 2), c.gold, { p: [0, roofY - 0.02, 0] });
		const span = HD / 2 + 0.04;
		const R = (span * span + ROOF_RISE * ROOF_RISE) / (2 * ROOF_RISE);
		const a = Math.asin(span / R);
		const vault = new THREE.Shape();
		vault.moveTo(-span, 0);
		vault.absarc(0, ROOF_RISE - R, R, Math.PI / 2 + a, Math.PI / 2 - a, true);
		vault.closePath();
		b.add(extrude(vault, HW - 0.04, 0.03, 2, 40), c.butter, { p: [0, roofY + 0.04, 0], r: [0, Math.PI / 2, 0] });
		for (const x of [-HW / 2 + 0.02, -HW / 6, HW / 6, HW / 2 - 0.02]) b.add(new THREE.TorusGeometry(R, 0.05, 8, 48, 2 * a), c.gold, { p: [x, roofY + 0.04 + ROOF_RISE - R, 0], r: [0, Math.PI / 2, Math.PI / 2 - a] });
		const crown = roofY + 0.04 + ROOF_RISE + 0.03;
		b.add(rbox(1.3, 0.05, 0.62, 0.02, 2), c.brass, { p: [0, crown, 0] });
		for (let i = 0; i < 5; i++) b.add(rbox(1.02, 0.016, 0.05, 0.006, 1), m.recess, { p: [0, crown + 0.027, -0.2 + i * 0.1] });
		for (const s of [-1, 1]) for (const z of [-0.24, 0.24]) screw(b, s * 0.56, crown + 0.03, z, 'y');

		this.loop(b);
		this.group.add(b.build('harness'));

		for (let i = 0; i < 5; i++) {
			const lamp = new Lamp(sharedRbox(0.024, 0.3, 0.1, 0.01, 2), color.amber, 1.5);
			lamp.mesh.position.set(HW / 2 + 0.012, 0.6 + i * 0.26, 1.15);
			this.group.add(lamp.mesh);
			this.sideLamps.push(lamp);
		}

		this.roofLamp = new Lamp(sharedRbox(0.1, 0.1, 0.03, 0.03, 3), color.green, 1.2);
		this.roofLamp.mesh.position.set(DRAWER_X + 0.58, plateY, HD / 2 + 0.07);
		this.group.add(this.roofLamp.mesh);

		this.name = new Label('Harness', 0.21, { weight: 700 });
		this.name.mesh.position.set(DRAWER_X - 0.08, plateY - 0.004, HD / 2 + 0.068);
		this.group.add(this.name.mesh);

		// The room, seen through its window: a picture of it, taken from the trip, at the window's back.
		const view = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.MeshBasicMaterial({ color: '#f6ead2' }));
		view.position.set(WIN.x, WIN.y, HD / 2 - WIN.deep + 0.01);
		view.name = 'room-view';
		this.group.add(view);
		new THREE.TextureLoader().load(`${resolve('/')}harness/room.webp`, (tex) => {
			tex.colorSpace = THREE.SRGBColorSpace;
			const mat = view.material as THREE.MeshBasicMaterial;
			mat.map = tex;
			mat.color.set('#ffffff');
			mat.needsUpdate = true;
		});

		DRAWER_NAMES.forEach((n, i) => {
			const d = new Drawer(i, n, DRAWER_ICONS[i]);
			this.drawers.push(d);
			this.group.add(d.group);
		});
	}

	/**
	 * The loop's two ends: the glass send tube at the back's left corner, brass bands up it, rising over the roof to where
	 * the request's lane begins; and the reply's chute at its right corner, a glass shaft with a brass funnel at its top,
	 * where the reply's lane ends. Each is strapped to the back wall.
	 */
	private loop(b: Batch) {
		const c = palette();
		const top = TUBE_TOP;
		const foot = 0.14;
		// Glass a little tinted, so it reads as glass from across the desk, in a cage of four brass rods.
		const glass = (tubeGlass ??= new THREE.MeshPhysicalMaterial({ color: '#d8efff', roughness: 0.05, transparent: true, opacity: 0.38, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
		const rods = (x: number, z: number, r: number, y0: number, y1: number) => {
			for (let k = 0; k < 4; k++) {
				const a = Math.PI / 4 + (k * Math.PI) / 2;
				b.add(new THREE.CylinderGeometry(0.025, 0.025, y1 - y0, 6), c.brass, { p: [x + Math.cos(a) * (r + 0.02), (y0 + y1) / 2, z + Math.sin(a) * (r + 0.02)] });
			}
		};
		b.add(new THREE.CylinderGeometry(TUBE.r, TUBE.r, top - foot, 32, 1, true), glass, { p: [TUBE.x, (foot + top) / 2, TUBE.z] });
		rods(TUBE.x, TUBE.z, TUBE.r, foot + 0.2, top);
		for (let y = foot + 0.3; y < top - 0.1; y += 0.7) b.add(new THREE.TorusGeometry(TUBE.r + 0.02, 0.04, 8, 32), c.brass, { p: [TUBE.x, y, TUBE.z], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.CylinderGeometry(TUBE.r + 0.08, TUBE.r + 0.12, 0.2, 32), c.brass, { p: [TUBE.x, foot + 0.1, TUBE.z] });
		b.add(new THREE.CylinderGeometry(TUBE.r + 0.1, TUBE.r + 0.06, 0.18, 32, 1, true), c.gold, { p: [TUBE.x, top, TUBE.z] });
		const ctop = CHUTE_TOP;
		b.add(new THREE.CylinderGeometry(CHUTE.r, CHUTE.r, ctop - foot, 24, 1, true), glass, { p: [CHUTE.x, (foot + ctop) / 2, CHUTE.z] });
		rods(CHUTE.x, CHUTE.z, CHUTE.r, foot + 0.2, ctop);
		for (let y = foot + 0.3; y < ctop - 0.3; y += 0.7) b.add(new THREE.TorusGeometry(CHUTE.r + 0.02, 0.035, 8, 24), c.brass, { p: [CHUTE.x, y, CHUTE.z], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.CylinderGeometry(CHUTE.r + 0.07, CHUTE.r + 0.1, 0.2, 24), c.brass, { p: [CHUTE.x, foot + 0.1, CHUTE.z] });
		// The funnel at its top, wide to catch what comes down the lane.
		b.add(new THREE.CylinderGeometry(CHUTE.r + 0.32, CHUTE.r + 0.02, 0.4, 32, 1, true), c.brass, { p: [CHUTE.x, ctop + 0.2, CHUTE.z] });
		b.add(new THREE.TorusGeometry(CHUTE.r + 0.33, 0.04, 8, 32), c.gold, { p: [CHUTE.x, ctop + 0.4, CHUTE.z], r: [Math.PI / 2, 0, 0] });
		// Straps holding each to the back wall.
		for (const [x, z, r, h] of [
			[TUBE.x, TUBE.z, TUBE.r, top],
			[CHUTE.x, CHUTE.z, CHUTE.r, ctop]
		]) {
			const gap = -HD / 2 - (z + r);
			for (const y of [1.1, Math.min(h - 0.5, 0.14 + HH - 0.3)]) b.add(rbox(0.12, 0.1, gap + 0.06, 0.02, 1), c.brass, { p: [x, y, -HD / 2 - gap / 2] });
		}
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
		// When something lands in it, its roof lamp flares. It doesn't squash: its cables and pipes are plugged into its
		// sides, and a squash would push its walls through their fittings.
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
		this.roofLamp.set(color.green, 0.3 + wake * 0.7 + jolt * 2.2);
	}

	/** Where a drawer's contents lie once it is fully open, so something on its way there can aim at it before it has opened. */
	catchPoint(i: number, target: THREE.Vector3) {
		return this.group.localToWorld(target.set(DRAWER_X, this.drawers[i].y + 0.1, HD / 2 - 0.06 + DRAWER_TRAVEL - 0.7));
	}

	/** World position a drawer's contents lift from. */
	drawerTop(i: number, target: THREE.Vector3) {
		const d = this.drawers[i];
		return d.group.localToWorld(target.set(0, 0.1, -0.7));
	}

	/** A point on the paper in a drawer's tray, near its front: where something set in the drawer stands. */
	trayHinge(i: number, target: THREE.Vector3) {
		return this.drawers[i].group.localToWorld(target.set(0, -0.122, -0.55));
	}
}
