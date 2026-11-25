import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { Label } from '../kit/print';
import { createBelt, createChatTemplate, Gantry, Tile, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { palette } from './palette';
import * as P from './masterplan';

/*
 * The hall behind the front door, where text becomes tokens and tokens become text again. Long walls of rose glazed tile
 * with arched windows glowing warm and brass sconces between them, a gold cresting along their tops, a terracotta floor,
 * and no roof: a court open to the sky, so the work inside can be watched from above. At its far end a tiled wall rises
 * in a great arch, with a round window, and an arched way through it for the lanes into the tower.
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


/** A glazed tile surface: square tiles of one colour, each a little different, with pale grout between. */
function tiles(base: string, grout: string, spread: number) {
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const g = c.getContext('2d')!;
	g.fillStyle = grout;
	g.fillRect(0, 0, 256, 256);
	const col = new THREE.Color(base);
	let seed = 3;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let y = 0; y < 4; y++)
		for (let x = 0; x < 4; x++) {
			const k = 1 + (rand() - 0.5) * spread;
			g.fillStyle = `#${col.clone().multiplyScalar(k).getHexString()}`;
			g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
		}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** A plane w by h whose texture repeats every `tile` units. */
function tiled(w: number, h: number, tile: number) {
	const g = new THREE.PlaneGeometry(w, h);
	const uv = g.attributes.uv;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
	return g;
}

/** An arched window's shape: straight sides and a round head. */
function archShape(w: number, h: number) {
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-w / 2, h - w / 2);
	s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
	s.lineTo(w / 2, 0);
	s.closePath();
	return s;
}

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
		const rose = new THREE.MeshPhysicalMaterial({ map: tiles('#ef9d93', '#fbe3dc', 0.12), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
		const floor = new THREE.MeshPhysicalMaterial({ map: tiles('#d1704f', '#e9b79a', 0.16), roughness: 0.38, clearcoat: 0.6 });

		// The floor, tiled in terracotta.
		b.add(tiled(H.w - 0.4, LEN, 1.1), floor, { p: [0, 0.02, MID], r: [-Math.PI / 2, 0, 0] });

		// The two long walls: a rose core, tiled faces in and out, a brass base and cornice, five arched windows each, lit.
		for (const s of [-1, 1]) {
			const x = s * (INNER + THICK / 2);
			b.add(rbox(THICK, H.wall, LEN, 0.08), c.rose, { p: [x, H.wall / 2, MID] });
			for (const face of [-1, 1]) {
				b.add(tiled(LEN, H.wall - 0.5, 0.55), rose, { p: [x + face * (THICK / 2 + 0.005), 0.25 + (H.wall - 0.5) / 2, MID], r: [0, (face * Math.PI) / 2, 0] });
			}
			b.add(rbox(THICK + 0.16, 0.24, LEN + 0.1, 0.06), c.brass, { p: [x, 0.12, MID] });
			b.add(rbox(THICK + 0.3, 0.22, LEN + 0.2, 0.06), c.gold, { p: [x, H.wall + 0.11, MID] });
			for (let i = 0; i < 5; i++) {
				const z = H.from - (LEN * (i + 0.5)) / 5;
				for (const face of [-1, 1]) {
					const fx = x + face * (THICK / 2 + 0.02);
					b.add(extrude(archShape(1.15, 2.3), 0.06, 0.015, 2, 8), c.amberWindow, { p: [fx, 1.1, z], r: [0, (face * Math.PI) / 2, 0] });
					b.add(new THREE.TorusGeometry(0.62, 0.06, 8, 24, Math.PI), c.brass, { p: [fx + face * 0.03, 1.1 + 2.3 - 0.575, z], r: [0, (face * Math.PI) / 2, 0] });
				}
				// A brass sconce on the inner face, between this window and the next.
				if (i < 4) {
					const sz = z - LEN / 10;
					const sx = x - s * (THICK / 2 + 0.12);
					b.add(rbox(0.08, 0.36, 0.14, 0.03), c.brass, { p: [sx, 2.6, sz] });
					b.add(new THREE.SphereGeometry(0.13, 16, 12), c.amberWindow, { p: [sx - s * 0.1, 2.88, sz] });
				}
			}
		}

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

		// The far end, where the hall meets the tower: a rose wall the shape of the vault, an arch let into it for the lanes,
		// a gold band round the arch and a round window over it.
		const end = new THREE.Shape();
		const doorW = 4.0;
		const spring = 1.9;
		end.moveTo(-rx, 0);
		end.lineTo(-doorW / 2, 0);
		end.lineTo(-doorW / 2, spring);
		end.absarc(0, spring, doorW / 2, Math.PI, 0, true);
		end.lineTo(doorW / 2, 0);
		end.lineTo(rx, 0);
		end.lineTo(rx, H.wall);
		for (let i = 1; i < 32; i++) {
			const a = (i / 32) * Math.PI;
			end.lineTo(rx * Math.cos(a), H.wall + H.vault * Math.sin(a));
		}
		end.lineTo(-rx, H.wall);
		end.closePath();
		// Tiled like the long walls: the extruder lays its face's texture one unit to a repeat, the walls' every 0.55.
		const endWall = extrude(end, 0.5, 0.06, 2, 24);
		const uv = endWall.attributes.uv;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.55, uv.getY(i) / 0.55);
		b.add(endWall, rose, { p: [0, 0, H.to + 0.3] });
		b.add(new THREE.TorusGeometry(doorW / 2 + 0.16, 0.14, 10, 40, Math.PI), c.gold, { p: [0, spring, H.to + 0.58] });
		for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.14, 0.14, spring, 12), c.gold, { p: [s * (doorW / 2 + 0.16), spring / 2, H.to + 0.58] });
		b.add(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 40), c.amberWindow, { p: [0, H.wall + 1.2, H.to + 0.56], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(0.95, 0.1, 10, 48), c.gold, { p: [0, H.wall + 1.2, H.to + 0.6] });

		// Both lanes' beds through the hall: a dark belt between brass kerbs on short brass legs.
		// The reply's lane only: the request's bed through the hall is the tokenizer's own belt.
		for (const s of [1]) {
			const x = s * P.HALL_LANE;
			b.add(rbox(1.1, 0.12, LEN, 0.03), c.iron, { p: [x, 0.34, MID] });
			for (const k of [-1, 1]) b.add(rbox(0.12, 0.16, LEN, 0.03), c.brass, { p: [x + k * 0.6, 0.44, MID] });
			for (let i = 0; i < 6; i++) b.add(rbox(0.6, 0.26, 0.16, 0.03), c.brass, { p: [x, 0.13, H.from - 0.8 - (i * (LEN - 1.6)) / 5] });
		}
		this.group.add(b.build('hall'));

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
		this.gantry?.update(0.5 + 0.5 * Math.sin(time * 3), true);
		// The drum turns slowly while it waits, and rolls round once over each piece as it seals it.
		this.drum.rotation.x = -(time * 0.6 + sealed * Math.PI * 2);
	}
}
