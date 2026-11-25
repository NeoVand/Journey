import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox } from '../kit/geometry';
import { palette } from './palette';
import * as P from './masterplan';

/*
 * The data center: where the model actually runs, as a round tower of midnight-blue enamel and silver. Five floors, each a
 * ring of curved glass between slender enamel mullions, a silver slab with a brass bead between one floor and the next.
 * Inside each floor, a ring of racks of chips faces out through the glass, their doors a grid of cobalt lights; brass
 * cable trays hang under each ceiling and a ring of lamps lights the room.
 *
 * Up the middle runs the shaft: a glass tube the two lanes climb, the request's amber tokens going up on the left and the
 * reply's pearl ones coming down on the right. A narrow slot down the tower's front, framed in silver, shows it from
 * outside, and at its foot the lanes come in level from the hall through a doorway and turn straight up. At the top they
 * go on through the roof inside the glass pedestal the brain stands on (props/brain.ts, fed from below).
 *
 * The roof is a silver disc with brass inlays and a ring of golden petals round its edge, curling outward: the crown.
 *
 * Drawn from concepts/aqueduct/tower (front, section, crown, floor). The tower's own frame has its foot on the
 * platform at the origin, its front (the slot) towards +z. Angles round it are measured from the front, as a cylinder's are.
 */

const R = P.TOWER.r;
const H = P.TOWER.floorH;
const N = P.TOWER.floors;
const SLAB = 0.3;
/** The roof's top, over the tower's foot. */
const ROOF = P.ROOF_Y - P.TOWER.at.y;
/** The shaft: its glass tube's radius, and how high its open frame stands at the foot, where the lanes come in. */
const SHAFT_R = 1.05;
const FRAME = 1.7;
/** Half the front slot's width, as an angle round the tower: nothing stands in front of the shaft within it. */
const SLOT = Math.asin(P.SHAFT.slot / 2 / R);
/** The racks' ring: how far out their backs stand from the middle, how many to a floor, and their size. */
const RACK = { r: R - 1.75, n: 22, w: 1.18, d: 0.86 };

type V3 = [number, number, number];
/** A point round the tower: at radius r, angle a from the front (+z), height y. */
const round = (r: number, a: number, y: number): V3 => [r * Math.sin(a), y, r * Math.cos(a)];
/** Whether an angle round the tower is within the front slot, with some room either side. */
const inSlot = (a: number, room = 0) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < SLOT + room;

/** A rack door's face: a dark panel with a grid of small lights, some bright, some dim, that tiles top to bottom. */
function doorLights() {
	const c = document.createElement('canvas');
	c.width = 64;
	c.height = 256;
	const g = c.getContext('2d')!;
	g.fillStyle = '#050b1f';
	g.fillRect(0, 0, 64, 256);
	let seed = 7;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let y = 4; y < 256; y += 8)
		for (let x = 6; x < 60; x += 9) {
			const on = rand();
			g.fillStyle = on > 0.78 ? '#bfe0ff' : on > 0.3 ? '#3c7dff' : '#0f2a6b';
			g.fillRect(x, y, 6, 3);
		}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/**
 * A petal of the crown, in the plane of its own radius (x outward, y up): a broad flame that rises from a wide foot,
 * swells, and curls outward to a point, its inner edge a long S and its outer edge a short one.
 */
function petal(h: number, w: number) {
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.bezierCurveTo(-w * 0.85, h * 0.35, -w * 0.55, h * 0.78, w * 0.95, h);
	s.bezierCurveTo(w * 0.32, h * 0.86, w * 0.78, h * 0.5, w * 0.42, h * 0.28);
	s.bezierCurveTo(w * 0.3, h * 0.16, w * 0.5, h * 0.06, w / 2, 0);
	s.closePath();
	return extrude(s, 0.36, 0.12, 4, 28);
}

export class Tower {
	group = new THREE.Group();
	private doors: THREE.MeshStandardMaterial;
	private lamps: THREE.MeshStandardMaterial;

	constructor() {
		this.group.name = 'data center';
		this.group.position.copy(P.TOWER.at);
		const c = palette();
		const b = new Batch();
		this.doors = new THREE.MeshStandardMaterial({ color: '#0a1230', roughness: 0.25, metalness: 0.3, emissive: '#ffffff', emissiveMap: doorLights(), emissiveIntensity: 1.6 });
		this.lamps = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe8bd', emissiveIntensity: 1.4 });
		const rackBody = new THREE.MeshPhysicalMaterial({ color: '#141c3c', roughness: 0.3, metalness: 0.4, clearcoat: 0.8 });
		const floorFinish = new THREE.MeshPhysicalMaterial({ color: '#dfe6f0', roughness: 0.18, metalness: 0.2, clearcoat: 1 });

		// The plinth it stands on: a low silver step with a brass bead round it.
		this.lathe(b, [[SHAFT_R, -0.42], [R + 1.0, -0.42], [R + 1.15, -0.32], [R + 1.15, -0.1], [R + 1.1, 0.02], [SHAFT_R, 0.02]], c.silver);
		b.add(new THREE.TorusGeometry(R + 1.15, 0.05, 8, 128), c.brass, { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0] });

		for (let f = 0; f <= N; f++) {
			const y = f * H;
			const roof = f === N;
			// The slab: silver, its edge rounded, with a brass bead along it. The roof's is thicker.
			const t = roof ? ROOF - N * H : SLAB;
			const y0 = roof ? y : y - t / 2;
			this.lathe(b, [[SHAFT_R + 0.04, y0], [R + 0.32, y0], [R + 0.42, y0 + 0.07], [R + 0.42, y0 + t - 0.07], [R + 0.32, y0 + t], [SHAFT_R + 0.04, y0 + t]], c.silver);
			b.add(new THREE.TorusGeometry(R + 0.43, 0.05, 8, 128), c.brass, { p: [0, y0 + t / 2, 0], r: [Math.PI / 2, 0, 0] });
			if (roof) break;
			const top = y + H - SLAB / 2;
			const bottom = y + SLAB / 2;
			const room = top - bottom;
			// The floor: pale and polished, a gold ring let into it round the shaft.
			b.add(new THREE.RingGeometry(SHAFT_R + 0.04, R - 0.1, 96), floorFinish, { p: [0, bottom + 0.005, 0], r: [-Math.PI / 2, 0, 0] });
			b.add(new THREE.RingGeometry(SHAFT_R + 0.5, SHAFT_R + 0.62, 96), c.gold, { p: [0, bottom + 0.01, 0], r: [-Math.PI / 2, 0, 0] });
			// The glass, tinted the cobalt of the racks behind it, all the way round but for the slot.
			b.add(new THREE.CylinderGeometry(R, R, room, 128, 1, true, SLOT, Math.PI * 2 - 2 * SLOT), c.rackGlass, { p: [0, bottom + room / 2, 0] });
			// The mullions, midnight-blue enamel, each with a brass cap and foot; the slot's two are silver.
			const mullions = 26;
			for (let i = 0; i < mullions; i++) {
				const a = ((i + 0.5) / mullions) * Math.PI * 2;
				if (inSlot(a, 0.05)) continue;
				b.add(rbox(0.46, room, 0.5, 0.14), c.midnight, { p: round(R + 0.08, a, bottom + room / 2), r: [0, a, 0] });
				for (const at of [bottom + 0.08, top - 0.08]) b.add(rbox(0.56, 0.12, 0.58, 0.04), c.brass, { p: round(R + 0.08, a, at), r: [0, a, 0] });
			}
			// The racks: a ring round the room, their doors lit, none in front of the shaft.
			const rackH = room - 0.75;
			for (let i = 0; i < RACK.n; i++) {
				const a = ((i + 0.5) / RACK.n) * Math.PI * 2;
				if (inSlot(a, 0.28)) continue;
				// Leave the ground floor's front open for the lanes coming in.
				if (f === 0 && inSlot(a, 0.6)) continue;
				const mid = bottom + 0.12 + rackH / 2;
				b.add(rbox(RACK.w, rackH, RACK.d, 0.06), rackBody, { p: round(RACK.r, a, mid), r: [0, a, 0] });
				// A lit door on both faces: one out through the glass, one into the room round the shaft.
				b.add(new THREE.PlaneGeometry(RACK.w - 0.18, rackH - 0.22), this.doors, { p: round(RACK.r + RACK.d / 2 + 0.006, a, mid), r: [0, a, 0] });
				b.add(new THREE.PlaneGeometry(RACK.w - 0.18, rackH - 0.22), this.doors, { p: round(RACK.r - RACK.d / 2 - 0.006, a, mid), r: [0, a + Math.PI, 0] });
				b.add(rbox(0.05, rackH * 0.5, 0.06, 0.02), c.brass, { p: round(RACK.r + RACK.d / 2 + 0.04, a + 0.085, mid), r: [0, a, 0] });
				b.add(rbox(RACK.w, 0.1, RACK.d + 0.04, 0.03), c.silver, { p: round(RACK.r, a, bottom + 0.06), r: [0, a, 0] });
			}
			// Brass cable trays under the ceiling: a ring over the racks and spokes in to the shaft.
			const tray = top - 0.32;
			b.add(new THREE.TorusGeometry(RACK.r, 0.07, 8, 96), c.brass, { p: [0, tray, 0], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.TorusGeometry(RACK.r - 0.35, 0.07, 8, 96), c.brass, { p: [0, tray, 0], r: [Math.PI / 2, 0, 0] });
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
				const span = RACK.r - SHAFT_R - 0.2;
				b.add(rbox(0.14, 0.06, span, 0.02), c.brass, { p: round(SHAFT_R + 0.1 + span / 2, a, tray), r: [0, a, 0] });
			}
			// The ceiling's lamps, a ring of them between the trays and the shaft.
			for (let i = 0; i < 10; i++) {
				const a = ((i + 0.5) / 10) * Math.PI * 2;
				b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 20), this.lamps, { p: round(SHAFT_R + 1.5, a, top - 0.03) });
			}
		}

		// The slot's silver frame, from the plinth to the roof, either side of the gap in the glass.
		for (const s of [-1, 1]) {
			const a = s * (SLOT + 0.012);
			b.add(rbox(0.26, ROOF, 0.56, 0.08), c.silver, { p: round(R + 0.12, a, ROOF / 2), r: [0, a, 0] });
		}

		// The shaft: an open chrome frame at its foot, where the lanes come in, and a glass tube from there to the roof,
		// ringed in chrome at every floor.
		const tubeH = ROOF - FRAME;
		b.add(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, tubeH, 64, 1, true), c.glass, { p: [0, FRAME + tubeH / 2, 0] });
		for (const y of [FRAME, ...Array.from({ length: N - 1 }, (_, f) => (f + 1) * H)]) b.add(new THREE.TorusGeometry(SHAFT_R + 0.03, 0.08, 10, 64), c.chrome, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(SHAFT_R + 0.06, 0.09, 10, 64), c.chrome, { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] });
		// Three posts carry the tube over the open foot: either side and behind, clear of the lanes coming in at the front.
		for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) b.add(new THREE.CylinderGeometry(0.08, 0.08, FRAME, 12), c.chrome, { p: round(SHAFT_R + 0.02, a, FRAME / 2) });

		// The roof: brass rings let into the silver, a chrome boss the brain's pedestal bolts down to, and the crown.
		for (const r of [R - 0.8, R - 1.0, 2.6]) b.add(new THREE.RingGeometry(r - 0.06, r + 0.06, 128), c.brass, { p: [0, ROOF + 0.006, 0], r: [-Math.PI / 2, 0, 0] });
		// A ring: the lanes go on up through it into the pedestal.
		this.lathe(b, [[0.95, ROOF], [1.85, ROOF], [1.85, ROOF + 0.1], [1.75, ROOF + 0.18], [0.95, ROOF + 0.18], [0.95, ROOF]], c.chrome);
		// Petals in two rings, tall ones behind and short ones before them in the gaps, so the crown reads as one solid ring
		// of flame from anywhere; none over the slot, so the lanes are seen going up into the pedestal.
		const petals = 26;
		b.add(new THREE.TorusGeometry(P.CROWN.r, 0.2, 14, 160), c.gold, { p: [0, ROOF + 0.18, 0], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(P.CROWN.r - 0.55, 0.12, 12, 160), c.gold, { p: [0, ROOF + 0.12, 0], r: [Math.PI / 2, 0, 0] });
		const tall = petal(P.CROWN.h, 1.25);
		const short = petal(P.CROWN.h * 0.68, 1.0);
		for (let i = 0; i < petals; i++) {
			const a = ((i + 0.5) / petals) * Math.PI * 2;
			const b2 = a + Math.PI / petals;
			if (!inSlot(a, 0.12)) b.add(tall, c.gold, { p: round(P.CROWN.r + 0.05, a, ROOF + 0.15), r: [0, a - Math.PI / 2, 0] });
			if (!inSlot(b2, 0.12)) b.add(short, c.gold, { p: round(P.CROWN.r - 0.5, b2, ROOF + 0.12), r: [0, b2 - Math.PI / 2, 0] });
		}

		this.group.add(b.build('tower'));
	}

	/** A turned part round the tower's axis, from an outline of (radius, height) pairs: out along its underside, up its edge, in across its top. */
	private lathe(b: Batch, outline: [number, number][], mat: THREE.Material) {
		b.add(new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), 128), mat);
	}

	/** The racks' lights run on and breathe; brighter while the work is heavy. */
	update(time: number, busy = 0) {
		const map = this.doors.emissiveMap!;
		map.offset.y = (time * 0.04) % 1;
		this.doors.emissiveIntensity = 1.3 + 0.25 * Math.sin(time * 1.3) + busy * 0.8;
	}
}
