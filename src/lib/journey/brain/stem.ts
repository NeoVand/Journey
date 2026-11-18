/*
 * The brainstem: what the middle of the brain is as a machine, and how the brain stands on its stand.
 *
 * The brain hangs in a fork. A turned plug sits in a seat on the stand. From the plug a neck rises, leaning forward:
 * two chrome cheeks with a dark spine between them, which goes up into the fissure and is bolted through the keel, the
 * plate both halves ride on. The neck's head carries an axle across the brain, and each half slides on that axle when
 * the halves draw apart. Two tines spring from a pin across the neck's foot and carry the axle's two ends, each with a
 * strip of light let into it. So everything here ends in something: the plug in its seat, the neck on the plug and on
 * the keel, the tines on their pin and on the axle, the halves on the axle.
 *
 * The shapes are those of Neo Mohsenvand's drawings: from the side a chrome wishbone with a dark panel of lights in it
 * and a lit branch sweeping forward under the brain; from behind and from in front, chrome either side of a dark lit
 * spine, branches spreading out under the halves, and a stepped chrome plug with a ring of light where it is seated.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox } from '../kit/geometry';
import { AXLE } from './design';
import { rod, turned, turnedZ } from './shapes';
import type { V3 } from './shell';
import type { Finish } from './works';

type P2 = [number, number];

/** Where the plug stands, and how high the top of its seat on the stand is. */
export const STEM = { x: -1.4, seat: -4.56 };
/** The ring of light let into the seat's top, round the plug: its radius and its height. */
export const SEAT_LIGHT = { r: 0.66, y: STEM.seat - 0.012 };
/** Where the neck is bolted through the keel, and where the pin across its foot is (in the fissure's plane). */
export const KEEL_BOLT: P2 = [-1.14, -1.74];
const PIN: P2 = [-1.42, -3.7];
const HEAD: P2 = [AXLE.x, AXLE.y];
/** A cheek: how far from the fissure's middle its inner face is, and its outer; and the dark spine between the two. */
const CHEEK = [0.15, 0.29];
const SPINE = 0.146;
const BEVEL = 0.012;
/** The stretch of the axle a half's bearing has to slide on: from the hub on the neck's cheek out to the tine's eye. */
export const SLIDE = { from: CHEEK[1] + 0.05, to: AXLE.reach - 0.085 };
/** How far out along the pin each tine's knuckle is, and how thick a tine is. */
const KNUCKLE = 0.43;
const TINE = 0.1;

/** One part of the stem: what it is called, what it is made of, and its shape. */
export interface Piece {
	name: string;
	finish: Finish;
	geo: THREE.BufferGeometry;
}

/** Edges where two faces meet at more than a slight angle stay edges; the rest is smooth. Turned and cut metal, not cast. */
const crisp = (g: THREE.BufferGeometry) => toCreasedNormals(g, 0.5);

/** Places round a circle, by their angles in degrees. */
const round = (c: P2, r: number, degrees: number[]): P2[] => degrees.map((d): P2 => [c[0] + r * Math.cos((d * Math.PI) / 180), c[1] + r * Math.sin((d * Math.PI) / 180)]);

/** A smooth line through some places, as many short straight pieces. */
function through(pts: P2[], closed: boolean, per = 8): P2[] {
	const curve = new THREE.CatmullRomCurve3(
		pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
		closed,
		'centripetal'
	);
	const line = curve.getPoints(pts.length * per).map((p): P2 => [p.x, p.y]);
	if (closed) line.pop();
	return line;
}

/**
 * The neck's outline, seen from the side. Up its back from the plug to the boss it is bolted to the keel by; down the
 * front of that horn into the crotch; forward along the top of the other horn to the boss the axle goes through, and
 * round it; and back along its underside, in one long hollow sweep, to the plug. (Its foot is sunk in the plug's top.)
 */
const NECK: P2[] = through(
	[
		[-1.72, -3.99],
		[-1.71, -3.6],
		[-1.66, -3.2],
		[-1.57, -2.8],
		[-1.46, -2.4],
		[-1.38, -2.05],
		...round(KEEL_BOLT, 0.23, [180, 135, 90, 45, 0]),
		[-0.93, -2.05],
		[-0.94, -2.35],
		[-0.86, -2.58],
		[-0.62, -2.68],
		[-0.25, -2.66],
		[0.08, -2.6],
		...round(HEAD, 0.27, [110, 60, 10, -40, -90]),
		[0.05, -3.13],
		[-0.35, -3.22],
		[-0.72, -3.4],
		[-0.98, -3.65],
		[-1.07, -3.99]
	],
	false
);
/** The window in each cheek, where the dark spine shows with its row of lights: the space between the two horns and the sweep under them. */
const WINDOW: P2[] = through(
	[
		[0.0, -2.89],
		[-0.35, -2.82],
		[-0.75, -2.84],
		[-1.05, -2.95],
		[-1.22, -3.2],
		[-1.2, -3.46],
		[-0.99, -3.5],
		[-0.75, -3.27],
		[-0.38, -3.08]
	],
	true
);

/** An outline drawn in by so much all round. (It is to be smooth, or its corners out of sight.) */
function inset(line: P2[], by: number): P2[] {
	let area = 0;
	for (let i = 0; i < line.length; i++) {
		const a = line[i];
		const b = line[(i + 1) % line.length];
		area += a[0] * b[1] - b[0] * a[1];
	}
	// Going round anticlockwise, the inside is on the left.
	const turn = area > 0 ? 1 : -1;
	return line.map((p, i): P2 => {
		const a = line[(i + line.length - 1) % line.length];
		const b = line[(i + 1) % line.length];
		const far = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		return [p[0] - ((b[1] - a[1]) / far) * by * turn, p[1] + ((b[0] - a[0]) / far) * by * turn];
	});
}

const shapeOf = (line: P2[], hole?: P2[]) => {
	const shape = new THREE.Shape(line.map(([x, y]) => new THREE.Vector2(x, y)));
	if (hole) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
	return shape;
};

/** The spine's own outline: the cheeks stand a little proud of it all round. */
const CORE = inset(NECK, 0.04);

/** The place on the spine's edge nearest a point, the way out of the spine there, and the way along its edge. */
function onEdge(near: P2) {
	let best = 0;
	CORE.forEach((p, i) => {
		if (Math.hypot(p[0] - near[0], p[1] - near[1]) < Math.hypot(CORE[best][0] - near[0], CORE[best][1] - near[1])) best = i;
	});
	const a = CORE[Math.max(0, best - 1)];
	const b = CORE[Math.min(CORE.length - 1, best + 1)];
	const far = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
	const along: P2 = [(b[0] - a[0]) / far, (b[1] - a[1]) / far];
	// The outline runs up the back and comes round clockwise: the way out is on its left.
	return { at: CORE[best], along, out: [-along[1], along[0]] as P2 };
}

/** A light let into the spine's edge: so long along the edge, so wide across the neck, at a place a little way off the middle. */
function inlay(near: P2, long: number, wide: number, z = 0) {
	const { at, along, out } = onEdge(near);
	const x = new THREE.Vector3(along[0], along[1], 0);
	const y = new THREE.Vector3(out[0], out[1], 0);
	const place = new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)).setPosition(at[0] + out[0] * 0.004, at[1] + out[1] * 0.004, z);
	return rbox(long, 0.022, wide, 0.008, 1).applyMatrix4(place);
}

/** A bolt's head on a face that looks along the axle, to one side or the other: a washer, and a low head with its edge broken. */
function bolt(x: number, y: number, z: number, side: number, r = 0.105) {
	const outline: P2[] = [
		[r + 0.05, 0],
		[r + 0.05, 0.016],
		[r + 0.04, 0.024],
		[r, 0.024],
		[r, 0.058],
		[r - 0.014, 0.072],
		[0.001, 0.072]
	];
	return crisp(turnedZ([x, y, z], side > 0 ? outline : outline.map(([q, h]): P2 => [q, -h]).reverse(), 32));
}

/** A ring on the axle or the pin: from its bore out to its rim, so thick, its edges broken. */
const collar = (x: number, y: number, z: number, bore: number, r: number, half: number) =>
	crisp(
		turnedZ(
			[x, y, z],
			[
				[bore, -half],
				[r - 0.015, -half],
				[r, -half + 0.015],
				[r, half - 0.015],
				[r - 0.015, half],
				[bore, half]
			],
			36
		)
	);

/**
 * The plug: a stepped chrome body in six plates, riveted at their corners, on a dark drum that shows in the seams
 * between them; under them a hairline of light, a plain ring, and the foot that goes down into the seat.
 */
function plug(): Piece[] {
	const at: V3 = [STEM.x, 0, 0];
	const out: Piece[] = [];
	const top = -3.94;
	out.push({
		name: 'plug',
		finish: 'chrome',
		geo: crisp(
			turned(
				at,
				[
					[0.001, STEM.seat - 0.2],
					[0.42, STEM.seat - 0.2],
					[0.42, -4.5],
					[0.47, -4.46],
					[0.47, -4.362],
					[0.438, -4.362],
					[0.438, -4.334],
					[0.546, -4.334],
					[0.546, -4.318],
					[0.5, -4.318]
				],
				72
			)
		)
	});
	// The rim over the plates, and the plug's top, that the neck stands in.
	out.push({
		name: 'plug rim',
		finish: 'chrome',
		geo: crisp(
			turned(
				at,
				[
					[0.5, -4.004],
					[0.578, -4.004],
					[0.578, -3.974],
					[0.546, top],
					[0.001, top]
				],
				72
			)
		)
	});
	const low = -4.314;
	const high = -4.008;
	const rAt = (y: number) => 0.536 + ((0.57 - 0.536) * (y - low)) / (high - low);
	out.push({
		name: 'plug drum',
		finish: 'dark',
		geo: turned(
			at,
			[
				[rAt(low) - 0.016, low - 0.006],
				[rAt(high) - 0.016, high + 0.006]
			],
			48
		)
	});
	const plates = 6;
	const gap = 0.07;
	for (let k = 0; k < plates; k++) {
		const from = (k / plates) * Math.PI * 2 + gap / 2;
		const wide = (Math.PI * 2) / plates - gap;
		out.push({
			name: 'plug plate',
			finish: 'chrome',
			geo: crisp(
				turned(
					at,
					[
						[rAt(low) - 0.016, low],
						[rAt(low), low],
						[rAt(high), high],
						[rAt(high) - 0.016, high]
					],
					12,
					from,
					wide
				)
			)
		});
		// A rivet at each corner of the plate. (A turned part's angle is counted from the fissure's plane, towards the front.)
		for (const a of [from + 0.1, from + wide - 0.1])
			for (const y of [low + 0.05, high - 0.05]) {
				const way: V3 = [Math.sin(a), 0, Math.cos(a)];
				const r = rAt(y);
				out.push({ name: 'plug rivet', finish: 'chrome', geo: rod([STEM.x + way[0] * (r - 0.006), y, way[2] * (r - 0.006)], [STEM.x + way[0] * (r + 0.008), y, way[2] * (r + 0.008)], 0.017, 10, 0.012) });
			}
	}
	out.push({ name: 'plug light', finish: 'amber', geo: new THREE.TorusGeometry(0.452, 0.012, 8, 72).rotateX(Math.PI / 2).translate(STEM.x, -4.348, 0) });
	return out;
}

/** The seat on the stand that the plug goes down into: a chrome ring with a groove in its top for the ring of light. */
export function seat() {
	const y = STEM.seat;
	const r = SEAT_LIGHT.r;
	return crisp(
		turned(
			[STEM.x, 0, 0],
			[
				[0.8, y - 0.15],
				[0.825, y - 0.13],
				[0.825, y - 0.04],
				[0.79, y],
				[r + 0.055, y],
				[r + 0.055, y - 0.035],
				[r - 0.055, y - 0.035],
				[r - 0.055, y],
				[0.505, y],
				[0.48, y - 0.025],
				[0.48, y - 0.19]
			],
			72
		)
	);
}

/** The neck: two chrome cheeks, the dark spine between them with its lights, and the bolt through the keel. */
function neck(): Piece[] {
	const out: Piece[] = [];
	const cheek = () => crisp(new THREE.ExtrudeGeometry(shapeOf(NECK, WINDOW), { depth: CHEEK[1] - CHEEK[0] - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 1, steps: 1, curveSegments: 1 }));
	for (const side of [1, -1]) {
		out.push({ name: 'cheek', finish: 'chrome', geo: cheek().translate(0, 0, side > 0 ? CHEEK[0] + BEVEL : -CHEEK[1] + BEVEL) });
		out.push({ name: 'keel bolt', finish: 'chrome', geo: bolt(KEEL_BOLT[0], KEEL_BOLT[1], side * CHEEK[1], side, 0.11) });
		// Where the axle comes through a cheek, and where the pin does: a hub for each.
		out.push({ name: 'hub', finish: 'chrome', geo: collar(HEAD[0], HEAD[1], side * (CHEEK[1] + 0.025), AXLE.r, 0.2, 0.025) });
		out.push({ name: 'hub', finish: 'chrome', geo: collar(PIN[0], PIN[1], side * (CHEEK[1] + 0.012), 0.06, 0.2, 0.012) });
		// The row of lights in the window, as the drawing has them from the side: three, leaning.
		for (let k = 0; k < 3; k++) out.push({ name: 'side light', finish: 'cyan', geo: rbox(0.034, 0.1, 0.02, 0.008, 1).applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.3).setPosition(-0.52 + k * 0.12, -2.985 + k * 0.012, side * (SPINE + 0.004))) });
	}
	out.push({ name: 'spine', finish: 'dark', geo: new THREE.ExtrudeGeometry(shapeOf(CORE), { depth: SPINE * 2, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, -SPINE) });
	// Down its back, as the drawing has it from behind: two bars side by side, a point, and a bar.
	for (const z of [-0.062, 0.062]) out.push({ name: 'back light', finish: 'amber', geo: inlay([-1.6, -2.8], 0.22, 0.05, z) });
	out.push({ name: 'back light', finish: 'amber', geo: inlay([-1.67, -3.12], 0.05, 0.05) });
	out.push({ name: 'back light', finish: 'amber', geo: inlay([-1.7, -3.44], 0.2, 0.05) });
	// Under its sweep, as the drawing has it from in front: four bars across, each shorter than the one above.
	const rungs: [P2, number, Finish][] = [
		[[-0.62, -3.35], 0.27, 'cyan'],
		[[-0.74, -3.42], 0.23, 'amber'],
		[[-0.85, -3.5], 0.19, 'cyan'],
		[[-0.94, -3.6], 0.15, 'amber']
	];
	for (const [near, wide, finish] of rungs) out.push({ name: 'front light', finish, geo: inlay(near, 0.04, wide) });
	return out;
}

/**
 * A tine's middle line, on one side. It leaves its knuckle on the pin going up and forward, steeply, then turns over,
 * out under the half and forward, and comes level into the back of its eye on the axle: the sweep the drawing's
 * branches have, both from the side and from in front. (It comes to the axle outside where the half's bearing slides.)
 */
const tineLine = (side: number) =>
	new THREE.CatmullRomCurve3(
		(
			[
				[PIN[0], PIN[1], KNUCKLE],
				[-1.22, -3.5, 0.5],
				[-0.98, -3.22, 0.74],
				[-0.72, -3.0, 1.08],
				[-0.42, -2.88, 1.4],
				[-0.1, HEAD[1], 1.58],
				[HEAD[0], HEAD[1], AXLE.reach]
			] as V3[]
		).map(([x, y, z]) => new THREE.Vector3(x, y, z * side)),
		false,
		'centripetal'
	);

/** The fork: the pin across the neck's foot, the two tines with a strip of light let into each, and the axle they carry by its ends. */
function fork(): Piece[] {
	const out: Piece[] = [];
	const reach = KNUCKLE + 0.11;
	out.push({ name: 'pin', finish: 'chrome', geo: rod([PIN[0], PIN[1], -reach], [PIN[0], PIN[1], reach], 0.06, 20) });
	out.push({ name: 'axle', finish: 'chrome', geo: rod([HEAD[0], HEAD[1], -AXLE.reach - 0.085], [HEAD[0], HEAD[1], AXLE.reach + 0.085], AXLE.r, 20) });
	for (const side of [1, -1]) {
		const line = tineLine(side);
		out.push({ name: 'knuckle', finish: 'chrome', geo: collar(PIN[0], PIN[1], side * KNUCKLE, 0.06, 0.165, 0.1) });
		out.push({ name: 'pin end', finish: 'chrome', geo: bolt(PIN[0], PIN[1], side * reach, side, 0.085) });
		out.push({ name: 'tine', finish: 'chrome', geo: new THREE.TubeGeometry(line, 56, TINE, 16, false) });
		out.push({ name: 'eye', finish: 'chrome', geo: collar(HEAD[0], HEAD[1], side * AXLE.reach, AXLE.r, 0.185, AXLE.reach - SLIDE.to) });
		out.push({ name: 'axle end', finish: 'chrome', geo: bolt(HEAD[0], HEAD[1], side * (AXLE.reach + 0.085), side, 0.1) });
		// The strip of light: let into the tine's outer side, a little above its middle, from clear of the knuckle to clear of the eye.
		// It keeps to the side of the tine that looks outward and a little up and forward, whichever way the tine is running.
		const fore = new THREE.Vector3(0.25, 0.35, side * 0.9);
		const strip = new THREE.CatmullRomCurve3(
			Array.from({ length: 33 }, (_, k) => {
				const t = 0.14 + (0.7 * k) / 32;
				const along = line.getTangentAt(t);
				return line.getPointAt(t).add(fore.clone().addScaledVector(along, -fore.dot(along)).setLength(TINE - 0.004));
			})
		);
		out.push({ name: 'tine light', finish: 'amber', geo: new THREE.TubeGeometry(strip, 48, 0.024, 6, false) });
	}
	return out;
}

/** Every part of the stem that stays where it is when the halves draw apart. */
export const stem = (): Piece[] => [...plug(), ...neck(), ...fork()];
