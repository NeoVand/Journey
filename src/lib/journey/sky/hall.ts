import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { Label } from '../kit/print';
import { createBelt, createChatTemplate, Gantry, Tile, TILE_D, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { palette } from './palette';
import * as P from './masterplan';

/*
 * The hall behind the front door, where text becomes tokens and tokens become text again. Long walls of rose glazed tile
 * with arched windows glowing warm and brass sconces between them, a terracotta floor, and over it a vault of glass held
 * on gold ribs, so the work inside can be watched from above; brass lamps hang down the middle.
 *
 * Beside the request's lane, on the left, the tokenizer as it was built and kept: the chat template lays the request out
 * as one long strip, the belt carries it under the gantry, and the gantry cuts it into tiles at every token boundary.
 * Beside the reply's lane, on the right, its mirror: the detokenizer, which takes the reply's pearl tiles in at its mouth,
 * turns them back into text on its roller, and seals the text into pearl capsules for the trip home.
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
/** The two machines' belts: how far from the middle, and how high their tops stand over the floor. */
const BELT_X = 2.75;
const BELT_Y = 0.52;

type V3 = [number, number, number];

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

export class Hall {
	group = new THREE.Group();
	gantry: Gantry;
	private strip: Tile[] = [];
	private roller!: THREE.Mesh;

	constructor() {
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
					b.add(extrude(archShape(1.15, 2.3), 0.06, 0.015, 2, 16), c.amberWindow, { p: [fx, 1.1, z], r: [0, (face * Math.PI) / 2, 0] });
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

		// The vault: glass on gold ribs, purlins along it and a ridge, brass lamps hanging down the middle.
		const rx = INNER + THICK / 2;
		const vault = new THREE.CylinderGeometry(rx, rx, LEN, 64, 1, true, -Math.PI / 2, Math.PI);
		vault.scale(1, 1, H.vault / rx);
		b.add(vault, c.glass, { p: [0, H.wall, MID], r: [Math.PI / 2, 0, 0] });
		const ribs = 7;
		for (let i = 0; i < ribs; i++) {
			const rib = new THREE.TorusGeometry(rx, 0.11, 10, 64, Math.PI);
			rib.scale(1, H.vault / rx, 1);
			b.add(rib, c.gold, { p: [0, H.wall, H.from - (LEN * i) / (ribs - 1)] });
		}
		for (const a of [0.35, 0.8, Math.PI / 2, Math.PI - 0.8, Math.PI - 0.35]) {
			const at: V3 = [rx * Math.cos(a), H.wall + H.vault * Math.sin(a), MID];
			b.add(new THREE.CylinderGeometry(0.045, 0.045, LEN, 10), c.brass, { p: at, r: [Math.PI / 2, 0, 0] });
		}
		for (let i = 1; i < ribs - 1; i++) {
			const z = H.from - (LEN * i) / (ribs - 1);
			const top = H.wall + H.vault - 0.1;
			const drop = 2.4;
			b.add(new THREE.CylinderGeometry(0.025, 0.025, drop, 8), c.brass, { p: [0, top - drop / 2, z] });
			b.add(new THREE.ConeGeometry(0.42, 0.34, 28, 1, true), c.brass, { p: [0, top - drop - 0.1, z] });
			b.add(new THREE.SphereGeometry(0.15, 14, 10), c.amberWindow, { p: [0, top - drop - 0.22, z] });
		}

		// The far end, where the hall meets the tower: a rose wall the shape of the vault, an arch let into it for the lanes,
		// a gold band round the arch and a round window over it.
		const end = new THREE.Shape();
		const doorW = 3.4;
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
		const endWall = extrude(end, 0.5, 0.06, 2, 32);
		const uv = endWall.attributes.uv;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.55, uv.getY(i) / 0.55);
		b.add(endWall, rose, { p: [0, 0, H.to + 0.3] });
		b.add(new THREE.TorusGeometry(doorW / 2 + 0.16, 0.14, 10, 40, Math.PI), c.gold, { p: [0, spring, H.to + 0.58] });
		for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.14, 0.14, spring, 12), c.gold, { p: [s * (doorW / 2 + 0.16), spring / 2, H.to + 0.58] });
		b.add(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 40), c.amberWindow, { p: [0, H.wall + 1.2, H.to + 0.56], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(0.95, 0.1, 10, 48), c.gold, { p: [0, H.wall + 1.2, H.to + 0.6] });

		// Both lanes' beds through the hall: a dark belt between brass kerbs on short brass legs.
		for (const s of [-1, 1]) {
			const x = s * P.LANE;
			b.add(rbox(1.1, 0.12, LEN, 0.03), c.iron, { p: [x, 0.34, MID] });
			for (const k of [-1, 1]) b.add(rbox(0.12, 0.16, LEN, 0.03), c.brass, { p: [x + k * 0.6, 0.44, MID] });
			for (let i = 0; i < 6; i++) b.add(rbox(0.6, 0.26, 0.16, 0.03), c.brass, { p: [x, 0.13, H.from - 0.8 - (i * (LEN - 1.6)) / 5] });
		}
		this.group.add(b.build('hall'));

		this.gantry = this.tokenizer();
		this.detokenizer();
	}

	/**
	 * The tokenizer, kept as it was built: the chat template, its belt along the request's lane, the gantry over the belt,
	 * and the strip on it, cut into tiles past the gantry and still paper before it. It stands turned so its belt runs
	 * from the door towards the tower and its front faces the lanes.
	 */
	private tokenizer() {
		const g = new THREE.Group();
		g.rotation.y = Math.PI / 2;
		g.position.set(-BELT_X, BELT_Y, H.from - 1.6);
		const template = createChatTemplate();
		template.position.set(0, -BELT_Y, 0);
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
	 * The detokenizer, the tokenizer's mirror across the lanes, in its style: the reply's pearl tiles ride a belt from the
	 * tower towards the door and go in at an arched mouth; a brass roller on top turns them back into a slip of text; a
	 * press at its far end seals the text into a pearl capsule, and the capsule goes out onto the reply's lane.
	 */
	private detokenizer() {
		const m = mats();
		const c = palette();
		const g = new THREE.Group();
		// Turned so its belt runs from the tower towards the door, its front to the lanes.
		g.rotation.y = -Math.PI / 2;
		g.position.set(BELT_X, BELT_Y, H.to + 1.6);
		const beltTo = LEN - 6.2;
		g.add(createBelt(0, beltTo));
		const b = new Batch();
		const W = 2.4;
		const BH = 1.7;
		const D = 1.9;
		const at = beltTo + W / 2 - 0.1;
		// The block: cream, rounded, an arched mouth over the belt where the tiles go in.
		b.add(rbox(W + 0.24, 0.12, D + 0.24, 0.05), m.steelSoft, { p: [at, -BELT_Y + 0.06, 0] });
		const body = new THREE.Shape();
		body.moveTo(-D / 2, 0);
		body.lineTo(-0.62, 0);
		body.lineTo(-0.62, 0.5);
		body.absarc(0, 0.5, 0.62, Math.PI, 0, true);
		body.lineTo(0.62, 0);
		body.lineTo(D / 2, 0);
		body.lineTo(D / 2, BH);
		body.lineTo(-D / 2, BH);
		body.closePath();
		b.add(extrude(body, W, 0.06, 3, 24), m.cream, { p: [at, -BELT_Y + 0.12, 0], r: [0, Math.PI / 2, 0] });
		b.add(rbox(0.06, 1.2, 1.3, 0.02), m.recess, { p: [at - W / 2 + 0.2, -BELT_Y + 0.62, 0] });
		// The roller on top, brass, in two cheeks; the slip of text curling off it.
		for (const s of [-1, 1]) b.add(rbox(0.5, 0.6, 0.12, 0.04), m.cream, { p: [at, -BELT_Y + 0.12 + BH + 0.25, s * 0.62] });
		b.add(extrude(roundedRect(1.5, 0.42, 0.13), 0.1, 0.026, 3, 10), m.creamLight, { p: [at - 0.1, -BELT_Y + 0.12 + BH * 0.62, D / 2 + 0.06] });
		// The press at its far end: a brass drum that seals each slip into a capsule.
		b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 32), c.brass, { p: [at + W / 2 + 0.5, -BELT_Y + 0.85, 0] });
		b.add(rbox(0.9, 0.34, 0.9, 0.08), m.cream, { p: [at + W / 2 + 0.5, -BELT_Y + 0.29, 0] });
		g.add(b.build('detokenizer'));
		this.roller = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 24), c.brass);
		this.roller.rotation.x = Math.PI / 2;
		this.roller.position.set(at, -BELT_Y + 0.12 + BH + 0.32, 0);
		g.add(this.roller);
		const label = new Label('Detokenizer', 0.19, { weight: 700 });
		label.mesh.position.set(at - 0.1, -BELT_Y + 0.12 + BH * 0.62, D / 2 + 0.118);
		g.add(label.mesh);
		// The reply's tiles on the belt, pearl, on their way in.
		const tile = palette().pearl;
		for (let i = 0; i < 7; i++) {
			const w = 0.6 + ((i * 37) % 5) * 0.12;
			const mesh = new THREE.Mesh(rbox(w, TILE_H, TILE_D, 0.055, 3), tile);
			mesh.position.set(0.8 + i * 1.05, TILE_H / 2, 0);
			mesh.castShadow = true;
			g.add(mesh);
		}
		this.group.add(g);
	}

	update(time: number) {
		this.gantry.update(0.5 + 0.5 * Math.sin(time * 3), true);
		this.roller.rotation.y = time * 2;
	}
}
