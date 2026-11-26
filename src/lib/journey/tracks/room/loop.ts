import * as THREE from 'three';
import { Batch } from '../../kit/batch';
import { rbox, sweep } from '../../kit/geometry';
import { shadowOn } from '../../kit/machines';
import { mats } from '../../kit/materials';
import { BACK_Z, CAPSULE, CHUTE, DOCK, PAD, READER, SIDE_X, TRAY, TUBE, WALL_H } from './layout';
import { roomSign } from './signs';
import { TILE_COLOR } from './tiles';
import type { Tray } from './tray';

/*
 * The loop's two ends, as the lanes outside run: a copy of the tray goes up the send tube in the back-left corner, in a
 * capsule loaded at the reader behind the tray's start, and the reply comes down the chute in the back-right corner
 * onto the pad at the lip's right end.
 */

/** Clear glass, for the chute and the tube: you can watch what rides in them. */
export function glass(opacity = 0.16) {
	return new THREE.MeshPhysicalMaterial({
		color: '#cfe3fa',
		roughness: 0.06,
		clearcoat: 1,
		clearcoatRoughness: 0.05,
		transparent: true,
		opacity,
		depthWrite: false,
		side: THREE.DoubleSide
	});
}

/** An open trough: what the reply's tiles slide down from the chute's foot to the pad. Its floor runs along the path. */
function trough(path: THREE.Curve<THREE.Vector3>, w: number, wall: number, segments = 80) {
	const t = 0.03;
	const profile: [number, number][] = [
		[-w, wall],
		[-w + t, wall],
		[-w + t, t],
		[w - t, t],
		[w - t, wall],
		[w, wall],
		[w, -t],
		[-w, -t]
	];
	return sweep(path, profile, segments);
}

/** The reply's way down: a glass shaft in the corner, a cream foot it lands in, and a slide out to the pad. */
export function buildChute() {
	const m = mats();
	const group = new THREE.Group();
	const cx = (CHUTE.x0 + CHUTE.x1) / 2;
	const cz = (CHUTE.z0 + CHUTE.z1) / 2;
	const w = CHUTE.x1 - CHUTE.x0;
	const d = CHUTE.z1 - CHUTE.z0;
	const b = new Batch();
	// The foot: a cream block the shaft stands on, open on the room's side where the tiles come out.
	b.add(rbox(w, CHUTE.foot, d, 0.08, 3), m.creamLight, { p: [cx, CHUTE.foot / 2, cz] });
	// The shaft's frame: brass edges at the two corners that stand in the room, and bands where it passes the wall's top.
	const tall = CHUTE.top - CHUTE.foot;
	for (const [x, z] of [
		[CHUTE.x0, CHUTE.z1],
		[CHUTE.x0, CHUTE.z0 + 0.04],
		[CHUTE.x1 - 0.04, CHUTE.z1]
	])
		b.add(rbox(0.07, tall, 0.07, 0.025, 2), m.gold, { p: [x + 0.035, CHUTE.foot + tall / 2, z - 0.035] });
	for (const y of [1.55, WALL_H, CHUTE.top - 0.04]) {
		b.add(rbox(w + 0.04, 0.07, 0.07, 0.025, 2), m.gold, { p: [cx, y, CHUTE.z1 - 0.035] });
		b.add(rbox(0.07, 0.07, d + 0.04, 0.025, 2), m.gold, { p: [CHUTE.x0 + 0.035, y, cz] });
	}
	group.add(b.build('chute'));
	// Glass on the two faces that stand in the room; the room's side is open at the bottom, where the tiles come out.
	const pane = glass();
	const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, CHUTE.top - 1.55), pane);
	front.position.set(cx, (CHUTE.top + 1.55) / 2, CHUTE.z1 - 0.035);
	const side = new THREE.Mesh(new THREE.PlaneGeometry(d - 0.06, tall), pane);
	side.rotation.y = Math.PI / 2;
	side.position.set(CHUTE.x0 + 0.035, CHUTE.foot + tall / 2, cz);
	front.renderOrder = side.renderOrder = 3;
	group.add(front, side);

	// The slide: out of the foot's open face, down along the wall, and round to the left onto the pad, its floor just
	// above the pad's top. It turns in a wide curve, so a tile can ride it without touching its sides.
	const slide = new THREE.CatmullRomCurve3([
		new THREE.Vector3(cx - 0.02, CHUTE.foot + 0.02, CHUTE.z1 - 0.25),
		new THREE.Vector3(cx - 0.05, CHUTE.foot - 0.06, CHUTE.z1 + 0.25),
		new THREE.Vector3(cx - 0.12, 0.62, CHUTE.z1 + 0.85),
		new THREE.Vector3(cx - 0.32, 0.4, PAD.z0 - 0.02),
		new THREE.Vector3(cx - 0.68, 0.24, PAD.z0 + 0.24),
		// Its end rests on the pad, just short of the lip, pointing along it to the left.
		new THREE.Vector3(PAD.x1 - 0.65, PAD.y + 0.04, PAD.z0 + 0.29)
	]);
	const slideMat = (m.creamLight as THREE.MeshPhysicalMaterial).clone();
	slideMat.side = THREE.DoubleSide;
	const chuteSlide = new THREE.Mesh(trough(slide, 0.28, 0.14), slideMat);
	chuteSlide.castShadow = true;
	group.add(chuteSlide);
	// Two brass posts hold the slide up where it is high.
	const posts = new Batch();
	for (const u of [0.42, 0.68]) {
		const p = slide.getPointAt(u);
		posts.add(rbox(0.07, p.y - 0.04, 0.07, 0.02, 2), m.gold, { p: [p.x, (p.y - 0.04) / 2, p.z] });
		posts.add(rbox(0.2, 0.03, 0.2, 0.01, 2), m.gold, { p: [p.x, 0.015, p.z] });
	}
	group.add(posts.build('chute-posts'));
	shadowOn(group, cx, 0, cz, w + 0.4, d + 0.4, 0.3);

	// High on the back wall beside the chute, over the slot to your disk.
	const sign = roomSign('From the model', 0.17);
	sign.position.set(CHUTE.x0 - 1.4, 5.3, BACK_Z + 0.05);
	group.add(sign);
	return { group, slide };
}

/** How far the capsule's way bends round from the tube's door to the reader. */
const FEED_R = 0.42;
/** The capsule's way out of the tube to the reader and back: east out of its door along the back wall, then round to the tray. */
export function feederPath() {
	const r = FEED_R;
	const pts: THREE.Vector3[] = [];
	const y = CAPSULE.restY;
	for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(TUBE.x + ((DOCK.x - r - TUBE.x) * i) / 8, y, TUBE.z));
	for (let i = 1; i <= 10; i++) {
		const a = (i / 10) * (Math.PI / 2);
		pts.push(new THREE.Vector3(DOCK.x - r + Math.sin(a) * r, y, TUBE.z + r - Math.cos(a) * r));
	}
	pts.push(new THREE.Vector3(DOCK.x, y, DOCK.z));
	const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
	c.arcLengthDivisions = 400;
	return c;
}

/**
 * The capsule: a glass pill that carries a copy of the tray up to the model. It holds the copy as a row of tiny tiles,
 * as many as the tray had when it was loaded.
 */
export class Capsule {
	group = new THREE.Group();
	private tiles: THREE.InstancedMesh;
	private m4 = new THREE.Matrix4();
	private c = new THREE.Color();
	private shown = -1;

	constructor() {
		const m = mats();
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(CAPSULE.r, CAPSULE.len - CAPSULE.r * 2, 8, 24), glass(0.3));
		body.rotation.x = Math.PI / 2;
		body.renderOrder = 3;
		const b = new Batch();
		for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(CAPSULE.r * 0.98, 0.028, 10, 32), m.gold, { p: [0, 0, s * (CAPSULE.len / 2 - CAPSULE.r)] });
		// A cradle along its floor, that the copy lies in.
		b.add(rbox(0.2, 0.03, CAPSULE.len - CAPSULE.r * 1.4, 0.012, 2), m.creamLight, { p: [0, -0.1, 0] });
		this.group.add(b.build('capsule'), body);
		this.tiles = new THREE.InstancedMesh(rbox(0.12, 0.09, 1, 0.012, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), 64);
		this.tiles.count = 0;
		this.group.add(this.tiles);
	}

	/** Lays the copy in: the tray's tiles in order, each in its own colour, packed along the cradle; `k` of them so far. */
	load(tray: Tray, k = 1) {
		const n = Math.min(tray.tiles.length, Math.ceil(tray.tiles.length * k - 1e-6));
		if (tray.used === this.shown && this.tiles.count === n) return;
		this.shown = tray.used;
		const room = CAPSULE.len - CAPSULE.r * 1.5;
		const pitch = room / Math.max(tray.used, 8);
		let slot = 0;
		tray.tiles.forEach((tile, i) => {
			const len = pitch * tile.span * 0.84;
			this.m4.makeScale(1, 1, len).setPosition(0, -0.04, -room / 2 + (slot + tile.span / 2) * pitch);
			this.tiles.setMatrixAt(i, this.m4);
			this.tiles.setColorAt(i, this.c.set(TILE_COLOR[tile.kind]));
			slot += tile.span;
		});
		this.tiles.count = n;
		this.tiles.instanceMatrix.needsUpdate = true;
		if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
	}
}

/** The capsule lies in the tube's foot pointing out of its door, toward the tray: along x. */
export const REST_YAW = Math.PI / 2;

/** The send tube: a glass pneumatic tube in the back-left corner, with a door at its foot facing the tray. */
export function buildTube() {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	const seat = CAPSULE.restY - CAPSULE.r - 0.02;
	// Its foot: a cream drum with a brass seat the capsule rests on.
	b.add(new THREE.CylinderGeometry(TUBE.r + 0.1, TUBE.r + 0.14, seat - 0.04, 48), m.creamLight, { p: [TUBE.x, (seat - 0.04) / 2, TUBE.z] });
	b.add(new THREE.CylinderGeometry(TUBE.r + 0.04, TUBE.r + 0.04, 0.04, 48), m.gold, { p: [TUBE.x, seat - 0.02, TUBE.z] });
	// Brass collars: the door's lintel, one halfway, one at the walls' top and one at its own.
	for (const y of [TUBE.door, 2.2, 3.4, 4.6, WALL_H, TUBE.top]) b.add(new THREE.CylinderGeometry(TUBE.r + 0.05, TUBE.r + 0.05, 0.1, 48, 1, true), m.gold, { p: [TUBE.x, y, TUBE.z] });
	b.add(new THREE.TorusGeometry(TUBE.r + 0.05, 0.05, 10, 48), m.gold, { p: [TUBE.x, TUBE.top + 0.05, TUBE.z], r: [Math.PI / 2, 0, 0] });
	// The door's jambs, either side of the gap that faces the tray.
	const gap = 0.44;
	for (const s of [-1, 1]) {
		const a = REST_YAW + s * gap;
		b.add(rbox(0.07, TUBE.door - seat, 0.07, 0.02, 2), m.gold, {
			p: [TUBE.x + Math.sin(a) * TUBE.r, (TUBE.door + seat) / 2, TUBE.z + Math.cos(a) * TUBE.r],
			r: [0, a, 0]
		});
	}
	// Brackets that hold it to the back wall.
	for (const y of [2.0, 4.8]) b.add(rbox(0.08, 0.08, TUBE.z - TUBE.r - BACK_Z + 0.04, 0.02, 2), m.gold, { p: [TUBE.x, y, (BACK_Z + TUBE.z - TUBE.r) / 2] });
	group.add(b.build('tube'));
	const pane = glass(0.12);
	const low = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r, TUBE.r, TUBE.door - seat, 48, 1, true, REST_YAW + gap, Math.PI * 2 - gap * 2), pane);
	low.position.set(TUBE.x, (TUBE.door + seat) / 2, TUBE.z);
	const high = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r, TUBE.r, TUBE.top - TUBE.door, 48, 1, true), pane);
	high.position.set(TUBE.x, (TUBE.top + TUBE.door) / 2, TUBE.z);
	low.renderOrder = high.renderOrder = 3;
	group.add(low, high);
	shadowOn(group, TUBE.x, 0, TUBE.z, 1.9, 1.9, 0.32);

	// The feeder: two brass rails from the tube's door round to a socket in the reader.
	const path = feederPath();
	const rails = new Batch();
	const railY = CAPSULE.restY - CAPSULE.r - 0.035;
	const from = 0.2;
	for (const s of [-1, 1]) {
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= 40; i++) {
			const u = from + ((1 - from) * i) / 40;
			const p = path.getPointAt(u);
			const t = path.getTangentAt(u);
			pts.push(new THREE.Vector3(p.x - t.z * 0.12 * s, railY, p.z + t.x * 0.12 * s));
		}
		rails.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.025, 10), m.gold);
	}
	for (const u of [0.3, 0.62, 0.92]) {
		const p = path.getPointAt(u);
		const t = path.getTangentAt(u);
		const turn = Math.atan2(t.x, t.z);
		rails.add(rbox(0.34, 0.04, 0.06, 0.015, 2), m.gold, { p: [p.x, railY - 0.03, p.z], r: [0, turn, 0] });
		rails.add(rbox(0.06, railY - 0.05, 0.06, 0.015, 2), m.gold, { p: [p.x, (railY - 0.05) / 2, p.z] });
	}
	group.add(rails.build('feeder'));
	// The reader: a cream block against the tray's back, under the drawers, with a brass socket the capsule's nose docks
	// in. It reads the tray from its first tile to its last.
	const reader = new Batch();
	const rx = (READER.x0 + READER.x1) / 2;
	const rd = TRAY.z0 - READER.z0 - 0.005;
	reader.add(rbox(READER.x1 - READER.x0, READER.h, rd, 0.1, 3), m.creamLight, { p: [rx, READER.h / 2, READER.z0 + rd / 2] });
	reader.add(new THREE.TorusGeometry(CAPSULE.r + 0.03, 0.04, 10, 32), m.gold, { p: [rx, CAPSULE.restY, READER.z0 - 0.01] });
	reader.add(new THREE.CylinderGeometry(CAPSULE.r, CAPSULE.r, 0.03, 32), m.recess, { p: [rx, CAPSULE.restY, READER.z0 - 0.005], r: [Math.PI / 2, 0, 0] });
	group.add(reader.build('reader'));
	shadowOn(group, rx, 0, READER.z0 + rd / 2, READER.x1 - READER.x0 + 0.4, rd + 0.4, 0.26);

	const capsule = new Capsule();
	capsule.group.rotation.order = 'YXZ';
	capsule.group.position.set(TUBE.x, CAPSULE.restY, TUBE.z);
	capsule.group.rotation.y = REST_YAW;
	group.add(capsule.group);

	// On the left wall just in front of the tube, facing into the room: the back wall beside it is the drawers'.
	const sign = roomSign('To the model', 0.17);
	sign.rotation.y = Math.PI / 2;
	sign.position.set(-SIDE_X + 0.05, 4.7, TUBE.z + TUBE.r + 1.0);
	group.add(sign);
	return { group, capsule, feeder: path };
}
