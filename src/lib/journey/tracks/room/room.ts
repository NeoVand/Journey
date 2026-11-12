import * as THREE from 'three';
import { Batch } from '../../kit/batch';
import { extrude, rbox, roundedRect } from '../../kit/geometry';
import { shadowOn } from '../../kit/machines';
import { Lamp, color, mats } from '../../kit/materials';
import { clamp, inOut, lerp } from '../../kit/math';
import { createSign } from '../../kit/parts';
import { drawIcon, font, Surface } from '../../kit/print';
import { ROOM_AT } from '../harness';
import { buildBenches, buildLedge, buildRail, Cart } from './acts';
import { buildHooks, Gate, printed, Screen } from './checks';
import { BACK_Z, D, LIP, PAD, SHELF, SIDE_X, skillAt, SKILLS, SUB, TRAY, TRAY_Z, W, WALL_H } from './layout';
import { buildChute, buildTube, Capsule } from './loop';
import { SubRoom } from './subagent';
import { KEPT, SLOTS, TILE_COLOR, trayAt, type Tray } from './tray';
import { coveredAt, loadingAt, PITCH, SLOT_X0, slotX, TILE } from './turns';
import { Play } from './play';

/*
 * The inside of the harness, as plan f3 lays it out (concepts/harness/plan-f3.png and plan-f3.md). The model asks;
 * the harness remembers (the back), checks (the left, by you) and acts (the right, by your machine). Room units: x to
 * the right, z toward the camera, y up. The room is 14.4 wide and 12 deep, open at the front.
 *
 * This file builds the room's shell and everything that remembers: the tray with its tiles, cover, ruler, end stop and
 * press, the lip along its front, the writer and its ribbon out to your disk, the four drawers and the skill shelf.
 * The loop's two ends are in loop.ts, what checks in checks.ts, what acts in acts.ts, and the subagent in subagent.ts;
 * where everything stands is in layout.ts.
 */


/** The slot in the back wall where the record goes out to your disk. */
const SLOT_AT = new THREE.Vector3(5.1, 1.35, BACK_Z);
/** The four drawers, stacked in the back wall over the tray's start, as on the cabinet's front. */
const DRAWERS = ['Instructions', 'Environment', 'Tools', 'Conversation'];
const DRAWER_ICONS = ['doc', 'cube', 'wrench', 'chat'];
const DRAWER_Y = [4.95, 4.0, 3.05, 2.1];
const DRAWER_X = -3.1;
const DRAWER_W = 3.0;
/** How long a tile takes to settle once it drops into its slot, in trip time: a tiny click. */
const SETTLE = 0.016;
/** Which drawer each of the first slots comes from, in the order the request is read: tools, instructions, environment. */
const DRAWER_OF_SLOT = [2, 0, 1];
/** The press's work, as parts of the squeeze: the ram comes up to the tiles, pushes them together, and goes back. */
const RAM_MEETS = 0.2;
const RAM_PUSHED = 0.75;
/** The ram's plate fits between the tray's rims, so the writer on the back rim and the ram never touch. */
const INNER = { z0: -3.82, z1: -2.98 };

const plate = printed;

/** A flat strip of paper along a curve: the record on its way out. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, segments = 60) {
	const pos: number[] = [];
	const uv: number[] = [];
	const up = new THREE.Vector3();
	const side = new THREE.Vector3();
	const tan = new THREE.Vector3();
	for (let i = 0; i <= segments; i++) {
		const u = i / segments;
		const p = curve.getPointAt(u);
		curve.getTangentAt(u, tan);
		// The paper lies flat where it runs along the tray, and stands against the wall as it climbs.
		up.set(0, 1, 0);
		side.crossVectors(tan, up);
		if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
		side.normalize().multiplyScalar(width / 2);
		pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
		uv.push(u, 0, u, 1);
	}
	const index: number[] = [];
	for (let i = 0; i < segments; i++) {
		const a = i * 2;
		index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	geo.setIndex(index);
	geo.computeVertexNormals();
	return geo;
}

/** The record's paper: a strip of tiny copies of tiles, in the gauge's colours, that can be wound on. */
function recordMaterial() {
	const s = new Surface(512, 64);
	s.draw((c, w, h) => {
		c.fillStyle = color.paper;
		c.fillRect(0, 0, w, h);
		const kinds = ['tools', 'instructions', 'environment', 'prompt', 'text', 'call', 'result', 'result', 'text', 'call', 'result'] as const;
		for (let i = 0; i < 26; i++) {
			c.fillStyle = TILE_COLOR[kinds[i % kinds.length]];
			c.fillRect(8 + i * 19.4, 20, 13, 24);
		}
	});
	s.texture.wrapS = THREE.RepeatWrapping;
	s.texture.repeat.set(6, 1);
	return new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.85, side: THREE.DoubleSide });
}

export class RoomF3 {
	group = new THREE.Group();
	/** For looking closely while building: pose the room at this trip time, whatever the camera is doing. */
	debugT: number | null = null;
	private tiles: THREE.InstancedMesh;
	private cover: THREE.Mesh;
	private ram: THREE.Group;
	private rod: THREE.Mesh;
	/** Where the last tile ends, as laid this frame: the open end, where the writer sits and the ram meets the tiles. */
	private edge = 0;
	private writer: THREE.Group;
	private record: THREE.Mesh;
	private recordMat: THREE.MeshStandardMaterial;
	private drawerLamps: Lamp[] = [];
	private skillCards: THREE.Object3D[] = [];
	private play: Play;
	/** The loop's two ends, what checks, what acts, and the subagent: handles for the motion to come. */
	capsule: Capsule;
	gate: Gate;
	screen: Screen;
	cart: Cart;
	benchLamps: Lamp[];
	subagent: SubRoom;
	chuteSlide: THREE.Curve<THREE.Vector3>;
	feeder: THREE.Curve<THREE.Vector3>;
	rail: THREE.Curve<THREE.Vector3>;
	hookCable: THREE.Curve<THREE.Vector3>;
	private m4 = new THREE.Matrix4();
	private q = new THREE.Quaternion();
	private p = new THREE.Vector3();
	private s = new THREE.Vector3();
	private c = new THREE.Color();
	private summaryColor = new THREE.Color(TILE_COLOR.summary);

	constructor() {
		const m = mats();
		this.group.position.copy(ROOM_AT);
		this.group.visible = false;

		/* ---- the room: a floor and three walls, open at the front ---- */
		const room = new Batch();
		room.add(extrude(roundedRect(W + 0.8, D + 0.8, 0.9), 0.5, 0.14, 4, 10), m.porcelain, { r: [-Math.PI / 2, 0, 0], p: [0, -0.25, 0] });
		room.add(rbox(W + 0.4, WALL_H, 0.4, 0.12, 3), m.cream, { p: [0, WALL_H / 2, BACK_Z - 0.2] });
		for (const s of [-1, 1]) room.add(rbox(0.4, WALL_H, D, 0.12, 3), m.cream, { p: [s * (SIDE_X + 0.2), WALL_H / 2, BACK_Z + D / 2] });
		const walls = room.build('room');
		walls.traverse((o) => (o.castShadow = false));
		this.group.add(walls);

		/* ---- the three zones, a faint tint on the floor each: remembers, checks, acts ---- */
		const tint = (x0: number, z0: number, x1: number, z1: number, hex: string, opacity: number) => {
			const shape = roundedRect(x1 - x0, z1 - z0, 0.5);
			const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false }));
			mesh.rotation.x = -Math.PI / 2;
			mesh.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
			mesh.renderOrder = -1;
			this.group.add(mesh);
		};
		tint(-6.9, -5.85, 6.9, -2.15, '#e9c98a', 0.22);
		tint(-6.95, -2.05, -3.9, 1.7, '#9fbde4', 0.2);
		tint(5.0, -2.75, 6.95, 5.9, '#9fd2ad', 0.22);
		tint(SUB.x0 - 0.4, SUB.z0 - 0.4, 4.9, 5.9, '#9fd2ad', 0.18);

		/* ---- the tray: the context, the request the model reads, left to right ---- */
		const tray = new Batch();
		const len = TRAY.x1 - TRAY.x0;
		const cx = (TRAY.x0 + TRAY.x1) / 2;
		tray.add(rbox(len, TRAY.base, TRAY.z1 - TRAY.z0, 0.1, 3), m.porcelain, { p: [cx, TRAY.base / 2, TRAY_Z] });
		// Rims along the front and back, and a cap at the start; the end stop closes the other end.
		tray.add(rbox(len, 0.12, 0.12, 0.04, 2), m.porcelain, { p: [cx, TRAY.base + 0.06, TRAY.z1 - 0.08] });
		tray.add(rbox(len, 0.12, 0.16, 0.04, 2), m.porcelain, { p: [cx, TRAY.base + 0.06, TRAY.z0 + 0.1] });
		tray.add(rbox(0.12, 0.12, TRAY.z1 - TRAY.z0, 0.04, 2), m.porcelain, { p: [TRAY.x0 + 0.08, TRAY.base + 0.06, TRAY_Z] });
		// The lip: a low rail along the front, where new tiles slide to the open end.
		tray.add(rbox(len + 1.35, 0.06, LIP.z1 - LIP.z0, 0.025, 2), m.creamDeep, { p: [cx - 0.67, LIP.y, (LIP.z0 + LIP.z1) / 2] });
		tray.add(rbox(len + 1.35, 0.04, 0.03, 0.01, 2), m.gold, { p: [cx - 0.67, LIP.y + 0.04, LIP.z1 - 0.01] });
		// The pad at the lip's start, where the chute lets the reply down.
		tray.add(rbox(PAD.x1 - PAD.x0, PAD.y, PAD.z1 - PAD.z0, 0.06, 3), m.creamLight, { p: [(PAD.x0 + PAD.x1) / 2, PAD.y / 2, (PAD.z0 + PAD.z1) / 2] });
		this.group.add(tray.build('tray'));
		shadowOn(this.group, cx + 0.3, 0, TRAY_Z, len + 1.4, 1.6, 0.38);

		// The ruler along the front rim: a tick per slot, a longer one every quarter of the window.
		const ruler = plate(len - 0.2, 0.1, (c, pw, ph) => {
			c.strokeStyle = '#8b7a5c';
			c.lineWidth = 2;
			for (let i = 0; i <= SLOTS; i++) {
				const x = ((SLOT_X0 - TRAY.x0 - 0.1 + i * PITCH) / (len - 0.2)) * pw;
				const quarter = i % (SLOTS / 4) === 0;
				c.beginPath();
				c.moveTo(x, 0);
				c.lineTo(x, quarter ? ph * 0.9 : ph * 0.45);
				c.stroke();
			}
		});
		ruler.rotation.x = -Math.PI / 2;
		ruler.position.set(cx, TRAY.base + 0.121, TRAY.z1 - 0.08);
		this.group.add(ruler);

		// The tiles: one instance each, in the gauge's colours.
		this.tiles = new THREE.InstancedMesh(
			rbox(TILE.w, TILE.h, TILE.d, 0.035, 3),
			new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
			SLOTS + 8
		);
		this.tiles.castShadow = true;
		this.tiles.count = 0;
		this.group.add(this.tiles);

		// The frosted cover over what hasn't changed since last turn: the provider keeps it cached.
		this.cover = new THREE.Mesh(
			rbox(1, TILE.h + 0.14, TILE.d + 0.18, 0.08, 3),
			new THREE.MeshPhysicalMaterial({ color: '#eaf3ff', roughness: 0.12, transparent: true, opacity: 0.24, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false })
		);
		this.cover.renderOrder = 2;
		this.group.add(this.cover);

		// The press is the end stop. Its plate is the window's limit, in brass; when the tray is full it pushes in on a
		// rod from its housing, squeezes the conversation against what never changes, and goes back.
		const housing = new Batch();
		housing.add(rbox(0.74, 0.66, TRAY.z1 - TRAY.z0, 0.12, 3), m.creamLight, { p: [TRAY.x1 + 0.45, 0.33, TRAY_Z] });
		housing.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 32), m.gold, { p: [TRAY.x1 + 0.46, 0.4, TRAY.z1 + 0.01], r: [Math.PI / 2, 0, 0] });
		this.group.add(housing.build('press'));
		shadowOn(this.group, TRAY.x1 + 0.45, 0, TRAY_Z, 1.0, 1.4, 0.3);
		this.ram = new THREE.Group();
		const rb = new Batch();
		rb.add(rbox(0.08, 0.56, INNER.z1 - INNER.z0, 0.03, 2), m.gold, { p: [0, TRAY.base + 0.2, 0] });
		this.ram.add(rb.build('ram'));
		this.ram.position.set(TRAY.x1 - 0.02, 0, TRAY_Z);
		this.group.add(this.ram);
		this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 20), m.steel);
		this.rod.rotation.z = Math.PI / 2;
		this.group.add(this.rod);

		/* ---- the record: the writer at the open end, and its ribbon out through the back wall to your disk ---- */
		this.writer = new THREE.Group();
		const wb = new Batch();
		wb.add(rbox(0.26, 0.2, 0.3, 0.06, 3), m.creamLight, { p: [0, 0.1, 0] });
		wb.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), m.gold, { p: [0, 0.24, 0] });
		this.writer.add(wb.build('writer'));
		this.group.add(this.writer);
		this.recordMat = recordMaterial();
		// From the tray's end, along its back edge, round behind the press and up the back wall into the slot.
		const path = new THREE.CatmullRomCurve3([
			new THREE.Vector3(TRAY.x1 - 0.1, TRAY.base + 0.125, TRAY.z0 + 0.1),
			new THREE.Vector3(TRAY.x1 + 0.55, TRAY.base + 0.05, TRAY.z0 - 0.48),
			new THREE.Vector3(SLOT_AT.x - 0.1, 0.35, BACK_Z + 0.35),
			new THREE.Vector3(SLOT_AT.x, SLOT_AT.y - 0.5, BACK_Z + 0.08),
			new THREE.Vector3(SLOT_AT.x, SLOT_AT.y, BACK_Z + 0.03)
		]);
		this.group.add(new THREE.Mesh(ribbon(path, 0.16), this.recordMat));
		// Along the back edge, from the writer to the tray's end: stretched as the open end moves.
		this.record = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), this.recordMat);
		this.record.rotation.x = -Math.PI / 2;
		this.group.add(this.record);
		// The slot itself: a dark mouth with a brass frame, in the back wall.
		const slot = new Batch();
		slot.add(rbox(0.92, 0.42, 0.06, 0.04, 2), m.gold, { p: [SLOT_AT.x, SLOT_AT.y, BACK_Z + 0.02] });
		slot.add(rbox(0.74, 0.24, 0.06, 0.03, 2), m.recess, { p: [SLOT_AT.x, SLOT_AT.y, BACK_Z + 0.05] });
		this.group.add(slot.build('record-slot'));
		const diskSign = createSign('To your disk', 0.14);
		diskSign.position.set(SLOT_AT.x, SLOT_AT.y + 0.5, BACK_Z + 0.05);
		this.group.add(diskSign);

		/* ---- the four drawers, seen from inside: hatches in the back wall over the tray's start ---- */
		DRAWERS.forEach((name, i) => {
			const recess = new THREE.Mesh(rbox(DRAWER_W + 0.2, 0.92, 0.06, 0.04, 2), m.recess);
			recess.position.set(DRAWER_X, DRAWER_Y[i], BACK_Z + 0.01);
			this.group.add(recess);
			const hatch = new THREE.Group();
			hatch.name = `front:${name}`;
			const hb = new Batch();
			hb.add(extrude(roundedRect(DRAWER_W, 0.78, 0.12), 0.16, 0.04, 3, 8), m.creamLight);
			hatch.add(hb.build('hatch'));
			const face = plate(DRAWER_W - 0.5, 0.5, (c, pw, ph) => {
				drawIcon(c, DRAWER_ICONS[i], 14, (ph - 120) / 2, 120, '#1f3e6e', 2);
				c.fillStyle = color.ink;
				c.font = `700 ${ph * 0.5}px ${font.sans}`;
				c.textBaseline = 'middle';
				c.fillText(name, 170, ph * 0.54);
			});
			face.position.set(-0.1, 0, 0.085);
			hatch.add(face);
			const lamp = new Lamp(rbox(0.12, 0.12, 0.04, 0.04, 3), color.amber, 0.3);
			lamp.mesh.position.set(DRAWER_W / 2 - 0.25, 0, 0.09);
			hatch.add(lamp.mesh);
			this.drawerLamps.push(lamp);
			hatch.position.set(DRAWER_X, DRAWER_Y[i], BACK_Z + 0.14);
			this.group.add(hatch);
		});
		const drawersSign = createSign('The four drawers', 0.2);
		drawersSign.position.set(DRAWER_X, 5.74, BACK_Z + 0.05);
		this.group.add(drawersSign);

		/* ---- the skill shelf: a name and a line each, until one is needed ---- */
		const shelf = new Batch();
		const sw = SHELF.x1 - SHELF.x0;
		const sx = (SHELF.x0 + SHELF.x1) / 2;
		shelf.add(rbox(sw, 0.08, 0.42, 0.03, 2), m.creamLight, { p: [sx, SHELF.y, BACK_Z + 0.22] });
		for (const k of [-1, 1]) shelf.add(rbox(0.06, 0.26, 0.3, 0.02, 2), m.gold, { p: [sx + k * (sw / 2 - 0.2), SHELF.y - 0.15, BACK_Z + 0.16] });
		this.group.add(shelf.build('skill-shelf'));
		SKILLS.forEach((name, i) => {
			const card = new Batch();
			card.add(rbox(0.38, 0.52, 0.06, 0.02, 2), m.cream, { p: [0, 0.26, 0] });
			const folder = card.build('skill-card');
			const label = plate(0.34, 0.1, (c, pw, ph) => {
				c.fillStyle = color.ink;
				c.font = `700 ${ph * 0.5}px ${font.sans}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(name, pw / 2, ph * 0.55);
			});
			label.position.set(0, 0.36, 0.032);
			folder.add(label);
			folder.position.copy(skillAt(i));
			folder.rotation.x = -0.08;
			this.group.add(folder);
			this.skillCards.push(folder);
		});
		const skillsSign = createSign('Skills', 0.17);
		skillsSign.position.set(sx, SHELF.y + 0.9, BACK_Z + 0.05);
		this.group.add(skillsSign);

		/* ---- the loop's ends, what checks, what acts, and the subagent ---- */
		const chute = buildChute();
		this.chuteSlide = chute.slide;
		const tube = buildTube();
		this.capsule = tube.capsule;
		this.feeder = tube.feeder;
		this.gate = new Gate();
		this.screen = new Screen();
		const hooks = buildHooks(this.gate);
		this.hookCable = hooks.cable;
		const rail = buildRail();
		this.rail = rail.path;
		this.cart = new Cart();
		const benches = buildBenches();
		this.benchLamps = benches.lamps;
		this.subagent = new SubRoom(SUB, 1);
		this.group.add(chute.group, tube.group, this.gate.group, this.screen.group, hooks.group, rail.group, this.cart.group, benches.group, buildLedge().group, this.subagent.group);
		this.play = new Play({
			group: this.group,
			capsule: this.capsule,
			feeder: this.feeder,
			chuteSlide: this.chuteSlide,
			gate: this.gate,
			screen: this.screen,
			hookCable: this.hookCable,
			cart: this.cart,
			benchLamps: this.benchLamps,
			wires: benches.wires,
			subagent: this.subagent,
			skillCards: this.skillCards
		});
	}

	update(trip: number, time: number) {
		const t = this.debugT ?? trip;
		const tray = trayAt(t);
		this.layTiles(tray, t);

		// The cover lies over what was in the last request sent: the provider still has that part.
		const covered = coveredAt(t);
		this.cover.visible = covered > 0;
		const coverW = covered * PITCH + 0.08;
		this.cover.scale.set(coverW, 1, 1);
		this.cover.position.set(SLOT_X0 + coverW / 2 - 0.04, TRAY.base + TILE.h / 2 + 0.02, TRAY_Z);

		// The ram comes up to the tiles, pushes them together, and goes back to being the end stop.
		const rest = TRAY.x1 - 0.02;
		let ramX = rest;
		const sq = tray.squeeze;
		if (sq) {
			const k = clamp(sq.k);
			if (k < RAM_MEETS) ramX = lerp(rest, this.edge + 0.06, inOut(k / RAM_MEETS));
			else if (k < RAM_PUSHED) ramX = this.edge + 0.06;
			else ramX = lerp(this.edge + 0.06, rest, inOut((k - RAM_PUSHED) / (1 - RAM_PUSHED)));
		}
		this.ram.position.x = ramX;
		const face = TRAY.x1 + 0.08;
		this.rod.visible = face - ramX > 0.08;
		this.rod.scale.y = Math.max(0.01, face - ramX - 0.04);
		this.rod.position.set((ramX + 0.04 + face) / 2, TRAY.base + 0.3, TRAY_Z);

		// The writer rides the open end on the back rim; the record runs from it along the rim to the tray's end.
		this.writer.position.set(Math.min(this.edge + 0.16, TRAY.x1 - 0.2), TRAY.base + 0.12, TRAY.z0 + 0.1);
		const runFrom = this.writer.position.x + 0.13;
		const runTo = TRAY.x1 - 0.1;
		this.record.visible = runTo - runFrom > 0.02;
		this.record.scale.set(Math.max(0.01, runTo - runFrom), 1, 1);
		this.record.position.set((runFrom + runTo) / 2, TRAY.base + 0.124, TRAY.z0 + 0.1);
		this.recordMat.map!.offset.x = -tray.used * 0.04;

		// While a copy is made, each drawer's lamp lights as the reading passes the part that came from it.
		const wave = loadingAt(t);
		this.drawerLamps.forEach((lamp, i) => {
			let on = 0;
			if (wave) {
				const slots = i === 3 ? [3, wave.copy] : [DRAWER_OF_SLOT.indexOf(i), DRAWER_OF_SLOT.indexOf(i) + 1];
				const at = wave.k * (wave.copy + 2) - 1;
				on = at >= slots[0] - 0.5 && at < slots[1] + 0.5 ? 1 : 0;
			}
			lamp.set(color.amber, 0.3 + on * 0.9 + Math.sin(time * 1.1 + i) * 0.03);
		});

		this.play.update(t, time);
	}

	/** Each tile in its slot; new ones slide in off the lip, and while the press works the old ones squeeze together. */
	private layTiles(tray: Tray, t: number) {
		const sq = tray.squeeze;
		const wave = loadingAt(t);
		let slot = 0;
		let n = 0;
		this.edge = SLOT_X0;
		tray.tiles.forEach((tile, i) => {
			let x = slotX(slot) + (tile.span - 1) * PITCH * 0.5;
			let width = 1 + (tile.span - 1) * (PITCH / TILE.w);
			const z = TRAY_Z;
			let y = TRAY.base + TILE.h / 2;
			this.c.set(TILE_COLOR[tile.kind]);
			if (sq && i >= sq.from && i < sq.to) {
				// Squeezed toward the start of the conversation, into the summary's few slots, turning orange, as the ram pushes.
				const k = inOut(clamp((sq.k - RAM_MEETS) / (RAM_PUSHED - RAM_MEETS)));
				const into = KEPT + ((i - sq.from + 0.5) / (sq.to - sq.from)) * sq.span;
				x = lerp(x, SLOT_X0 + into * PITCH, k);
				width = lerp(width, (sq.span / (sq.to - sq.from)) * (PITCH / TILE.w) * 1.02, k);
				this.c.lerp(this.summaryColor, clamp((k - 0.5) * 2));
			}
			const age = t - tile.born;
			// Just landed: a tiny click as it settles into its slot. (The summary doesn't land: it's what the squeeze made.)
			if (age >= 0 && age < SETTLE && tile.kind !== 'summary') y -= Math.sin((age / SETTLE) * Math.PI) * 0.025;
			// While a copy is made, a ripple runs along the tray as the reading passes each tile.
			if (wave && !sq) {
				const d = wave.k * (wave.copy + 2) - 1 - (slot + tile.span / 2);
				if (Math.abs(d) < 1.5) y += Math.cos((d / 1.5) * (Math.PI / 2)) * 0.06;
			}
			this.p.set(x, y, z);
			this.s.set(width, 1, 1);
			this.edge = Math.max(this.edge, x + (width * TILE.w) / 2);
			this.m4.compose(this.p, this.q, this.s);
			this.tiles.setMatrixAt(n, this.m4);
			this.tiles.setColorAt(n, this.c);
			n++;
			slot += tile.span;
		});
		this.tiles.count = n;
		this.tiles.instanceMatrix.needsUpdate = true;
		if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
	}
}
