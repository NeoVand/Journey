import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { Label } from '../kit/print';
import { createBelt, createChatTemplate, Gantry, Tile, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { palette } from './palette';
import { ARCH_RISE, archFrame, dadoTiles, fitted, floorTiles, friezeTiles, laid, orosi, pointedArch, pointedArchHole, rect, ribbon, roseWindow, stainedGlass, wallTiles } from './persian';
import * as P from './masterplan';

/*
 * The hall behind the front door, where text becomes tokens and tokens become text again. Long walls of Persian glazed
 * tile, cobalt and turquoise stars over a dado of lozenges, with pointed windows of coloured glass let right through them
 * and brass sconces between, a gold cresting along their tops, a floor of bigger stars, and no roof: a court open to the
 * sky, so the work inside can be watched from above. At its far end a tiled wall rises in a great arch, with a rose
 * window, and an arched way through it for the lanes into the tower.
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
/**
 * How the tile is set out on the walls, in metres: the star field's repeat (a quarter of the windows' spacing), the
 * dado's and the low frieze's heights, where the field stops under the top frieze (a whole number of half-repeats up),
 * the friezes' repeats along the wall (a whole number of times along it), and the floor's repeat (a whole number of
 * half-repeats across the hall and along it).
 */
const SET = { field: 0.875, dado: [0.25, 0.95], low: [0.95, 1.075], fieldTop: 1.075 + 6 * 0.4375, frieze: 0.5, topFrieze: 1.75, floor: 1.7 } as const;



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
		// Persian glazed tile, inside and out, set out to the building as a tiler would: the star field's repeat is a
		// quarter of the windows' spacing, so a star sits on every window's centre; each band's edge falls on a line of
		// the pattern's symmetry, so whatever it cuts it cuts in half; every window is framed by a border; the dado and
		// friezes go a whole number of times along the wall. See persian.ts.
		const glaze = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
		const field = glaze(wallTiles());
		const dado = glaze(dadoTiles());
		const frieze = glaze(friezeTiles());
		const floor = new THREE.MeshPhysicalMaterial({ map: floorTiles(), roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2 });
		// What the walls are built of, seen in their tops and in the windows' reveals: a warm sandstone.
		const stone = new THREE.MeshPhysicalMaterial({ color: '#e7d3aa', roughness: 0.62, clearcoat: 0.15 });
		const glass = stainedGlass(orosi(WIN.w / WIN.h));

		// The floor: its stars on the hall's middle line and on the door's threshold, a whole number of half-repeats
		// across to each wall and along to the end wall.
		const floorGeo = new THREE.PlaneGeometry(H.w - 0.4, LEN).rotateX(-Math.PI / 2).translate(0, 0.02, MID);
		{
			const pos = floorGeo.attributes.position as THREE.BufferAttribute;
			const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
			for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SET.floor, (H.from - pos.getZ(i)) / SET.floor);
		}
		b.add(floorGeo, floor);

		// The two long walls, with five real windows each: a sandstone core with the arches cut through it, tiled faces in
		// and out, a brass base and a gold cornice, and in each arch a lattice of coloured glass the sky shows through.
		const along = Array.from({ length: 5 }, (_, i) => H.from - (LEN * (i + 0.5)) / 5 - MID);
		const pierced = (x0: number, x1: number, y0: number, y1: number) => {
			const sh = rect(x0, y0, x1, y1);
			for (const u of along) sh.holes.push(pointedArchHole(WIN.w, WIN.h, u, WIN.y));
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
				[laid(rect(a, l0, e, l1), (x, y) => [(m * x) / SET.frieze + 0.125, (y - l0) / (l1 - l0)]), frieze],
				[laid(pierced(a, e, l1, top), (x, y) => [(m * x) / SET.field, (y - l1) / SET.field]), field],
				[laid(rect(a, top, e, H.wall), (x, y) => [(m * x) / SET.topFrieze + 0.125, (y - top) / (H.wall - top)]), frieze]
			] as [THREE.BufferGeometry, THREE.Material][];
		};
		// The tower end of each wall's inner face stops on a line of the pattern under a brass pilaster: the end wall
		// covers the rest.
		const towerEnd = -LEN / 2 + 0.55;
		const stop = -Math.floor(-towerEnd / (SET.field / 2)) * (SET.field / 2) - SET.field / 2;
		const frameGeo = new THREE.ExtrudeGeometry(archFrame(WIN.w, WIN.h, 0.11), { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03);
		// A border round each window, outside its gold frame, over the field's cut.
		const outline = pointedArch(WIN.w + 0.22, WIN.h + 0.11, WIN.w * ARCH_RISE + 0.11)
			.getPoints(12)
			.slice(0, -1);
		const border = ribbon(outline, 0.15, 0.6);
		const pane = fitted(pointedArch(WIN.w, WIN.h));
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
					b.add(frameGeo, c.gold, { p: [fx, WIN.y, z], r: [0, (f * Math.PI) / 2, 0] });
					b.add(border, frieze, { p: [x + f * (THICK / 2 + 0.009), WIN.y, z], r: [0, (f * Math.PI) / 2, 0] });
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
		// A rose window over the arch, cut right through, the tower seen through its clear glass.
		const roseAt = H.wall + 1.2;
		end.holes.push(new THREE.Path().absarc(0, roseAt, 0.9, 0, Math.PI * 2, true));
		b.add(extrude(end, 0.5, 0.06, 1, 14), stone, { p: [0, 0, H.to + 0.3] });
		// Its inner face, tiled as the long walls are: the same bands at the same heights, the field's stars on the door's
		// middle line, stopping on a line of the pattern either side under a border strip that runs up into the vault, and
		// a border along the vault's curve.
		const face = H.to + 0.555;
		const edge = Math.floor((INNER - 0.1) / (SET.field / 2)) * (SET.field / 2);
		const vault = (x: number) => H.wall + H.vault * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
		const [d0, d1] = SET.dado;
		const [l0, l1] = SET.low;
		for (const sd of [-1, 1]) {
			const a = sd < 0 ? -edge : doorW / 2;
			const e = sd < 0 ? -doorW / 2 : edge;
			b.add(laid(rect(a, d0, e, d1), (x, y) => [x / (d1 - d0) + 0.5, (y - d0) / (d1 - d0)]), dado, { p: [0, 0, face] });
			b.add(laid(rect(a, l0, e, l1), (x, y) => [x / SET.frieze + 0.125, (y - l0) / (l1 - l0)]), frieze, { p: [0, 0, face] });
			// The strip at the corner, from the dado up into the vault.
			const strip = new THREE.Shape();
			const x0 = sd * edge;
			const steps = 8;
			strip.moveTo(x0, d0);
			strip.lineTo(sd * rx, d0);
			strip.lineTo(sd * rx, H.wall);
			for (let k = 1; k <= steps; k++) {
				const x = sd * (rx - ((rx - edge) * k) / steps);
				strip.lineTo(x, vault(x));
			}
			strip.closePath();
			const w = rx - edge;
			b.add(laid(strip, (x, y) => [y / (w * 4), (sd * x - edge) / w]), frieze, { p: [0, 0, face] });
		}
		const tiles = new THREE.Shape();
		tiles.moveTo(-edge, l1);
		tiles.lineTo(-doorW / 2, l1);
		tiles.lineTo(-doorW / 2, spring);
		tiles.absarc(0, spring, doorW / 2, Math.PI, 0, true);
		tiles.lineTo(doorW / 2, l1);
		tiles.lineTo(edge, l1);
		for (let k = 0; k <= 40; k++) {
			const x = edge - (2 * edge * k) / 40;
			tiles.lineTo(x, vault(x));
		}
		tiles.closePath();
		tiles.holes.push(new THREE.Path().absarc(0, roseAt, 0.92, 0, Math.PI * 2, true));
		b.add(laid(tiles, (x, y) => [x / SET.field, (y - l1) / SET.field], 24), field, { p: [0, 0, face] });
		const curve: THREE.Vector2[] = [];
		for (let k = 0; k <= 40; k++) {
			const x = edge - (2 * edge * k) / 40;
			curve.push(new THREE.Vector2(x, vault(x)));
		}
		b.add(ribbon(curve, 0.26, 1.04), frieze, { p: [0, 0, face + 0.003] });
		b.add(new THREE.TorusGeometry(doorW / 2 + 0.16, 0.14, 10, 40, Math.PI), c.gold, { p: [0, spring, H.to + 0.58] });
		for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.14, 0.14, spring, 12), c.gold, { p: [s * (doorW / 2 + 0.16), spring / 2, H.to + 0.58] });
		const rose = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), stainedGlass(roseWindow()));
		rose.position.set(0, H.wall + 1.2, H.to + 0.3);
		rose.renderOrder = 3;
		this.group.add(rose);
		for (const f of [-1, 1]) b.add(new THREE.TorusGeometry(0.95, 0.1, 10, 48), c.gold, { p: [0, H.wall + 1.2, H.to + 0.3 + f * 0.27] });

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
		this.gantry?.update(0.5 + 0.5 * Math.sin(time * 3), true);
		// The drum turns slowly while it waits, and rolls round once over each piece as it seals it.
		this.drum.rotation.x = -(time * 0.6 + sealed * Math.PI * 2);
	}
}
