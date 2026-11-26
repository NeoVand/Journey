import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { Label } from '../kit/print';
import { createBelt, createChatTemplate, Gantry, Tile, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { palette } from './palette';
import { fitted, laid, orosi, rect, ribbon, stainedGlass } from './persian';
import { brickFloor, glint, layRug, mirrorWork, painted, RUGS } from './crafts';
import * as P from './masterplan';

/*
 * The hall behind the front door, where text becomes tokens and tokens become text again: a reception hall of a Persian
 * palace. Long walls of painted tile, a rose spray on each turquoise tile over a dado of white tulips on cobalt, a frieze
 * of roses and nightingales along their tops, sash windows of coloured glass in walnut let right through them and brass
 * sconces between, a gold cresting along their tops, and no roof: a court open to the sky, so the work inside can be
 * watched from above. Its brick floor is laid with carpets, a great medallion carpet down the middle, the machines
 * standing on it, and a runner along each wall. At its far end a wall of mirror work glitters, the lanes going through
 * it into the tower under a gold lintel, a wide sash window over them.
 *
 * Beside the request's lane, on the left, the tokenizer as it was built and kept: the chat template lays the request out
 * as one long strip, the belt carries it under the gantry, and the gantry cuts it into tiles at every token boundary.
 * On the reply's lane, on the right, by the door: the press that seals the reply for the trip home. What the model wrote
 * comes out of the tower as text (the detokenizer is inside, with the chips, and token IDs never leave), rides the lane
 * down the hall, and goes through the press, which seals each piece into a little pearl capsule of its own.
 *
 * Drawn from concepts/aqueduct/door (above, section, inside). Its frame is the platform's: z runs along the world's, from
 * the door towards the tower.
 */

const H = P.HALL;
const LEN = H.from - H.to;
const MID = (H.from + H.to) / 2;
/** The walls' inner faces either side, and their thickness. */
const INNER = H.w / 2 - 0.7;
const THICK = 0.6;
/** The tokenizer's belt, on the request's lane: as high over the floor as it was built to stand. */
const TOKENIZER_BELT = 0.5;
/** The long walls' windows: how wide and tall, and how high their sills are. */
const WIN = { w: 1.15, h: 2.2, y: 1.2 };
/** A rectangle's outline, as a window's or a door's hole. */
const hole = (x0: number, y0: number, x1: number, y1: number) => new THREE.Path([new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)]);
/** A sash window's frame: a rectangle's ring of wood, `t` wide, its foot at the origin. */
function sashFrame(w: number, h: number, t: number) {
	const s = rect(-w / 2 - t, -t, w / 2 + t, h + t);
	s.holes.push(hole(-w / 2, 0, w / 2, h));
	return s;
}
/**
 * How the tile is set out on the walls, in metres: the star field's repeat (a quarter of the windows' spacing), the
 * dado's and the low frieze's heights, where the field stops under the top frieze (a whole number of half-repeats up),
 * the friezes' repeats along the wall (a whole number of times along it), and the floor's repeat (a whole number of
 * half-repeats across the hall and along it).
 */
const SET = { field: 0.875, dado: [0.25, 0.95], low: [0.95, 1.075], fieldTop: 1.075 + 6 * 0.4375, frieze: 0.5, topFrieze: 3.5, floor: 1.7 } as const;
/** The carpets: the great one down the middle and the runners along the walls, how wide, how far out, how far short of the ends. */
const CARPET = { w: 9.4, runner: 1.4, runnerX: 5.75, margin: 1.45 };



/**
 * tokenizer: whether the hall stands its own tokenizer, as the lab shows it. The story brings its own, which it drives,
 * and lays it on the request's lane where this one stands; its belt is that lane's bed through the hall.
 */
export class Hall {
	group = new THREE.Group();
	gantry: Gantry | null = null;
	private strip: Tile[] = [];
	private drum!: THREE.Object3D;

	constructor(tokenizer = true) {
		this.group.name = 'hall';
		this.group.position.y = P.PLATFORM_Y;
		const c = palette();
		const b = new Batch();
		// Painted tile, inside and out, set out to the building as a tiler would: the field's repeat is a quarter of the
		// windows' spacing, so a rose spray sits on every window's centre; each band's edge falls on a line of the pattern's
		// symmetry, so whatever it cuts it cuts in half; every window is framed by a border; the dado and friezes go a
		// whole number of times along the wall. See crafts.ts.
		const { field, dado, frieze, band } = painted();
		const floor = new THREE.MeshStandardMaterial({ map: brickFloor(), roughness: 0.78 });
		// What the walls are built of, seen in their tops and in the windows' reveals: a warm sandstone.
		const stone = new THREE.MeshPhysicalMaterial({ color: '#e7d3aa', roughness: 0.62, clearcoat: 0.15 });
		const glass = stainedGlass(orosi(WIN.w / WIN.h, 0.5));

		// The floor: square bricks, a whole number of half-repeats across to each wall and along to the end wall.
		const floorGeo = new THREE.PlaneGeometry(H.w - 0.4, LEN).rotateX(-Math.PI / 2).translate(0, 0.02, MID);
		{
			const pos = floorGeo.attributes.position as THREE.BufferAttribute;
			const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
			for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SET.floor, (H.from - pos.getZ(i)) / SET.floor);
		}
		b.add(floorGeo, floor);
		// The carpets on it: the great one down the middle, under the machines, and a blue runner along each wall.
		const carpetL = LEN - 2 * CARPET.margin;
		layRug(b, CARPET.w, carpetL, [0, 0.02, MID], { seed: 13 });
		for (const s of [-1, 1]) layRug(b, CARPET.runner, carpetL, [s * CARPET.runnerX, 0.02, MID], { design: RUGS.blue, seed: 4 });

		// The two long walls, with five real windows each: a sandstone core with the windows cut through it, tiled faces in
		// and out, a brass base and a gold cornice, and in each window a sash of coloured glass the sky shows through.
		const along = Array.from({ length: 5 }, (_, i) => H.from - (LEN * (i + 0.5)) / 5 - MID);
		const pierced = (x0: number, x1: number, y0: number, y1: number) => {
			const sh = rect(x0, y0, x1, y1);
			for (const u of along) sh.holes.push(hole(u - WIN.w / 2, WIN.y, u + WIN.w / 2, WIN.y + WIN.h));
			return sh;
		};
		const core = new THREE.ExtrudeGeometry(pierced(-LEN / 2, LEN / 2, 0, H.wall), { depth: THICK, bevelEnabled: false, curveSegments: 10 }).rotateY(-Math.PI / 2);
		// A face's tile, from x0 to x1 along the wall (from the tower end towards the door), laid to the setting-out. A
		// face turned the other way round reads the wall from its other end, so it's drawn mirrored.
		const faces = (x0: number, x1: number, mirrored: boolean) => {
			const m = mirrored ? -1 : 1;
			const a = mirrored ? -x1 : x0;
			const e = mirrored ? -x0 : x1;
			const [d0, d1] = SET.dado;
			const [l0, l1] = SET.low;
			const top = SET.fieldTop;
			return [
				[laid(rect(a, d0, e, d1), (x, y) => [(m * x) / (d1 - d0) + 0.5, (y - d0) / (d1 - d0)]), dado],
				[laid(rect(a, l0, e, l1), (x, y) => [(m * x) / SET.frieze + 0.125, (y - l0) / (l1 - l0)]), band],
				[laid(pierced(a, e, l1, top), (x, y) => [(m * x) / SET.field, (y - l1) / SET.field]), field],
				[laid(rect(a, top, e, H.wall), (x, y) => [(m * x) / SET.topFrieze + 0.125, (y - top) / (H.wall - top)]), frieze]
			] as [THREE.BufferGeometry, THREE.Material][];
		};
		// The tower end of each wall's inner face stops on a line of the pattern under a brass pilaster: the end wall
		// covers the rest.
		const towerEnd = -LEN / 2 + 0.55;
		const stop = -Math.floor(-towerEnd / (SET.field / 2)) * (SET.field / 2) - SET.field / 2;
		const frameGeo = new THREE.ExtrudeGeometry(sashFrame(WIN.w, WIN.h, 0.11), { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03);
		// A border round each window's sides and head, outside its walnut frame, over the field's cut.
		const V = (x: number, y: number) => new THREE.Vector2(x, y);
		const ow = WIN.w / 2 + 0.11;
		const border = ribbon([V(-ow, 0), V(-ow, WIN.h + 0.11), V(ow, WIN.h + 0.11), V(ow, 0)], 0.15, 0.6);
		const pane = fitted(rect(-WIN.w / 2, 0, WIN.w / 2, WIN.h));
		const panes = new Batch();
		for (const s of [-1, 1]) {
			const x = s * (INNER + THICK / 2);
			b.add(core, stone, { p: [x + THICK / 2, 0, MID] });
			// Laid so each face looks out of the wall: the inner one towards the lanes, the outer one to the sky.
			for (const f of [-1, 1]) {
				const inner = f === -s;
				for (const [geo, mat] of faces(inner ? stop : -LEN / 2, LEN / 2, f > 0)) b.add(geo, mat, { p: [x + f * (THICK / 2 + 0.005), 0, MID], r: [0, (f * Math.PI) / 2, 0] });
				if (inner) b.add(rbox(0.05, H.wall - 0.24, 0.2, 0.02, 1), c.brass, { p: [x + f * (THICK / 2 + 0.03), 0.24 + (H.wall - 0.24) / 2, MID + stop + 0.06] });
			}
			b.add(rbox(THICK + 0.16, 0.24, LEN + 0.1, 0.06), c.brass, { p: [x, 0.12, MID] });
			b.add(rbox(THICK + 0.3, 0.22, LEN + 0.2, 0.06), c.gold, { p: [x, H.wall + 0.11, MID] });
			along.forEach((u, i) => {
				const z = MID + u;
				panes.add(pane, glass, { p: [x, WIN.y, z], r: [0, Math.PI / 2, 0] });
				for (const f of [-1, 1]) {
					const fx = x + f * (THICK / 2 + 0.03);
					b.add(frameGeo, c.walnut, { p: [fx, WIN.y, z], r: [0, (f * Math.PI) / 2, 0] });
					b.add(border, band, { p: [x + f * (THICK / 2 + 0.009), WIN.y, z], r: [0, (f * Math.PI) / 2, 0] });
					// A sandstone sill under it.
					b.add(rbox(0.16, 0.07, WIN.w + 0.6, 0.02, 1), stone, { p: [x + f * (THICK / 2 + 0.06), WIN.y - 0.035, z] });
				}
				// A brass sconce on the inner face, between this window and the next.
				if (i < 4) {
					const sz = z - LEN / 10;
					const sx = x - s * (THICK / 2 + 0.12);
					b.add(rbox(0.08, 0.36, 0.14, 0.03), c.brass, { p: [sx, 2.6, sz] });
					b.add(new THREE.SphereGeometry(0.13, 16, 12), c.amberWindow, { p: [sx - s * 0.1, 2.88, sz] });
				}
			});
		}
		const windows = panes.build('hall-windows');
		windows.traverse((o) => (o.renderOrder = 3));

		// Open to the sky, so the work inside can be watched from above: along each wall's top a cresting of gold, a ball
		// on a short post every so often.
		const rx = INNER + THICK / 2;
		for (const s of [-1, 1]) {
			const n = Math.round(LEN / 1.2);
			for (let i = 0; i <= n; i++) {
				const z = H.from - (LEN * i) / n;
				b.add(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 10), c.gold, { p: [s * rx, H.wall + 0.39, z] });
				b.add(new THREE.SphereGeometry(0.1, 12, 8), c.gold, { p: [s * rx, H.wall + 0.62, z] });
			}
		}

		// The far end, where the hall meets the tower: a wall of mirror work, as in a palace's hall of mirrors, rising a
		// little over the long walls. The lanes go through it into the tower under a gold lintel, and over them a wide sash
		// window of coloured glass in walnut lets the tower show through its clear panes.
		const doorW = 4.0;
		const doorH = 3.2;
		const top = H.wall + 1.3;
		const SASH = { w: 3.4, h: 1.5, y: doorH + 0.5 };
		const notched = (x0: number, y0: number, x1: number, y1: number, jamb: number) => {
			const sh = new THREE.Shape();
			sh.moveTo(x0, y0);
			sh.lineTo(-doorW / 2 - jamb, y0);
			sh.lineTo(-doorW / 2 - jamb, doorH + jamb);
			sh.lineTo(doorW / 2 + jamb, doorH + jamb);
			sh.lineTo(doorW / 2 + jamb, y0);
			sh.lineTo(x1, y0);
			sh.lineTo(x1, y1);
			sh.lineTo(x0, y1);
			sh.closePath();
			sh.holes.push(hole(-SASH.w / 2 - jamb, SASH.y - jamb, SASH.w / 2 + jamb, SASH.y + SASH.h + jamb));
			return sh;
		};
		b.add(extrude(notched(-rx, 0, rx, top, 0), 0.5, 0.06, 1, 4), stone, { p: [0, 0, H.to + 0.3] });
		// Its inner face: the long walls' dado and low band either side of the door, and over them, up to a gold cornice,
		// mirror work all round the door and the window.
		const face = H.to + 0.555;
		const [d0, d1] = SET.dado;
		const [l0, l1] = SET.low;
		const jamb = 0.18;
		for (const sd of [-1, 1]) {
			const a = sd < 0 ? -INNER : doorW / 2 + jamb;
			const e = sd < 0 ? -doorW / 2 - jamb : INNER;
			b.add(laid(rect(a, d0, e, d1), (x, y) => [x / (d1 - d0) + 0.5, (y - d0) / (d1 - d0)]), dado, { p: [0, 0, face] });
			b.add(laid(rect(a, l0, e, l1), (x, y) => [x / SET.frieze + 0.125, (y - l0) / (l1 - l0)]), band, { p: [0, 0, face] });
		}
		b.add(laid(notched(-INNER, l1, INNER, top - 0.16, jamb), (x, y) => [x / 0.9 + 0.5, (y - l1) / 0.9]), mirrorWork(), { p: [0, 0, face] });
		// The door's gold frame: two jambs and a lintel, standing proud of the mirror.
		for (const sd of [-1, 1]) b.add(rbox(jamb, doorH + jamb, 0.14, 0.04, 1), c.gold, { p: [sd * (doorW / 2 + jamb / 2), (doorH + jamb) / 2, face + 0.05] });
		b.add(rbox(doorW + 2 * jamb, jamb, 0.16, 0.04, 1), c.gold, { p: [0, doorH + jamb / 2, face + 0.06] });
		// The window: a walnut frame, a gold edge round it, and its glass in the wall's middle, the tower seen through it.
		b.add(extrude(sashFrame(SASH.w, SASH.h, jamb), 0.2, 0.02, 1, 4), c.walnut, { p: [0, SASH.y, face] });
		b.add(extrude(sashFrame(SASH.w + 2 * jamb, SASH.h + 2 * jamb, 0.05), 0.12, 0.01, 1, 4), c.gold, { p: [0, SASH.y - jamb, face + 0.04] });
		const sash = new THREE.Mesh(fitted(rect(-SASH.w / 2, 0, SASH.w / 2, SASH.h)), stainedGlass(orosi(SASH.w / SASH.h, 0.45 / (SASH.w / SASH.h))));
		sash.position.set(0, SASH.y, H.to + 0.3);
		sash.renderOrder = 3;
		this.group.add(sash);
		// Its cornice, and the long walls' gold cresting carried along its top.
		b.add(rbox(2 * rx + 0.3, 0.22, 0.8, 0.06), c.gold, { p: [0, top + 0.11, H.to + 0.3] });
		{
			const n = Math.round((2 * rx) / 1.2);
			for (let i = 0; i <= n; i++) {
				const x = -rx + (2 * rx * i) / n;
				b.add(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 10), c.gold, { p: [x, top + 0.39, H.to + 0.3] });
				b.add(new THREE.SphereGeometry(0.1, 12, 8), c.gold, { p: [x, top + 0.62, H.to + 0.3] });
			}
		}

		// Both lanes' beds through the hall: a dark belt between brass kerbs on short brass legs.
		// The reply's lane only: the request's bed through the hall is the tokenizer's own belt.
		for (const s of [1]) {
			const x = s * P.HALL_LANE;
			b.add(rbox(1.1, 0.12, LEN, 0.03), c.iron, { p: [x, 0.34, MID] });
			for (const k of [-1, 1]) b.add(rbox(0.12, 0.16, LEN, 0.03), c.brass, { p: [x + k * 0.6, 0.44, MID] });
			for (let i = 0; i < 6; i++) b.add(rbox(0.6, 0.26, 0.16, 0.03), c.brass, { p: [x, 0.13, H.from - 0.8 - (i * (LEN - 1.6)) / 5] });
		}
		this.group.add(b.build('hall'), windows);

		if (tokenizer) this.gantry = this.tokenizer();
		this.sealer();
	}

	/**
	 * The tokenizer, kept as it was built: the chat template, its belt along the request's lane, the gantry over the belt,
	 * and the strip on it, cut into tiles past the gantry and still paper before it. It stands turned so its belt runs
	 * from the door towards the tower and its front faces the lanes.
	 */
	private tokenizer() {
		const g = new THREE.Group();
		g.rotation.y = Math.PI / 2;
		g.position.set(-P.HALL_LANE, TOKENIZER_BELT, H.from - 1.6);
		const template = createChatTemplate();
		template.position.set(0, -TOKENIZER_BELT, 0);
		g.add(template);
		const beltFrom = 1.2;
		const beltTo = LEN - 2.8;
		g.add(createBelt(beltFrom, beltTo));
		const gantry = new Gantry();
		gantry.group.scale.setScalar(1.18);
		const cutAt = beltFrom + (beltTo - beltFrom) * 0.42;
		gantry.group.position.set(cutAt, 0, 0);
		gantry.update(0.2, true);
		g.add(gantry.group);
		// The strip: tiles cut and amber past the gantry, paper still before it.
		let x = beltFrom + 0.5;
		for (const def of TOKENS) {
			const tile = new Tile(def);
			x += tile.width / 2;
			tile.group.position.set(x, TILE_H / 2, 0);
			x += tile.width / 2 + (x > cutAt ? 0.14 : 0.0);
			tile.update(x > cutAt ? 1 : 0, 0);
			g.add(tile.group);
			this.strip.push(tile);
		}
		this.group.add(g);
		return gantry;
	}

	/**
	 * The press by the door, the tokenizer's gantry's mirror across the lanes: an open portal over the reply's lane, two
	 * cream posts and a beam, and under the beam a ribbed brass drum. What the model wrote comes out of the tower as text
	 * and rides under it; the drum turns once over each piece and it comes out sealed in a pearl capsule of its own.
	 * Encrypted again, as the request was on its way out: the beam says so on both faces, with a padlock. Open, so
	 * whatever stands beyond it, the chat template across the lanes, is seen through it.
	 */
	private sealer() {
		const m = mats();
		const c = palette();
		const g = new THREE.Group();
		g.name = 'sealer';
		g.position.set(P.SEALER.x, 0, P.SEALER.z);
		const b = new Batch();
		const span = 1.62;
		const postH = 1.66;
		const beamH = 0.36;
		const beamD = 0.46;
		for (const s of [-1, 1]) {
			b.add(rbox(0.5, 0.1, 0.62, 0.04, 2), m.steelSoft, { p: [s * span / 2, 0.05, 0] });
			b.add(rbox(0.2, postH, 0.26, 0.06, 2), m.cream, { p: [s * span / 2, 0.1 + postH / 2, 0] });
			b.add(new THREE.TorusGeometry(0.16, 0.03, 8, 20), c.brass, { p: [s * span / 2, 0.16, 0], r: [Math.PI / 2, 0, 0] });
		}
		const beamY = 0.1 + postH + beamH / 2;
		b.add(rbox(span + 0.36, beamH, beamD, 0.08, 3), m.cream, { p: [0, beamY, 0] });
		b.add(rbox(span + 0.42, 0.06, beamD + 0.06, 0.02, 2), c.brass, { p: [0, beamY + beamH / 2 + 0.02, 0] });
		// The drum's two brass hangers, from the beam's underside to its axle.
		const drumY = beamY - beamH / 2 - 0.3;
		for (const s of [-1, 1]) b.add(rbox(0.06, 0.34, 0.12, 0.02, 1), c.brass, { p: [s * 0.5, drumY + 0.14, 0] });
		// Its name, on a plate on each face of the beam.
		for (const s of [-1, 1]) b.add(extrude(roundedRect(1.2, 0.26, 0.09), 0.04, 0.012, 2, 8), m.creamLight, { p: [-0.1, beamY, s * (beamD / 2 + 0.02)] });
		g.add(b.build('sealer'));
		const drum = new Batch();
		drum.add(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 28), c.brass, { r: [0, 0, Math.PI / 2] });
		for (const x of [-0.3, 0, 0.3]) drum.add(new THREE.TorusGeometry(0.225, 0.02, 6, 28), c.gold, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] });
		this.drum = drum.build('sealer-drum');
		this.drum.position.set(0, drumY, 0);
		g.add(this.drum);
		for (const s of [-1, 1]) {
			const label = new Label('Encrypt', 0.16, { weight: 700 });
			label.mesh.position.set(-0.16, beamY, s * (beamD / 2 + 0.042));
			label.mesh.rotation.y = s < 0 ? Math.PI : 0;
			g.add(label.mesh);
			const lock = new Batch();
			lock.add(extrude(roundedRect(0.16, 0.13, 0.04), 0.05, 0.012, 2, 8), m.cobalt);
			lock.add(new THREE.TorusGeometry(0.048, 0.013, 8, 16, Math.PI), m.steel, { p: [0, 0.065, 0] });
			const l = lock.build('sealer-lock');
			l.position.set(s * 0.46 * (s < 0 ? -1 : 1) + 0.42, beamY - 0.01, s * (beamD / 2 + 0.05));
			l.rotation.y = s < 0 ? Math.PI : 0;
			g.add(l);
		}
		this.group.add(g);
	}

	/** sealed: how many pieces of the reply the press has sealed so far, counting smoothly through each. */
	update(time: number, sealed = 0) {
		glint(time);
		this.gantry?.update(0.5 + 0.5 * Math.sin(time * 3), true);
		// The drum turns slowly while it waits, and rolls round once over each piece as it seals it.
		this.drum.rotation.x = -(time * 0.6 + sealed * Math.PI * 2);
	}
}
