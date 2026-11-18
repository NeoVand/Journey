/*
 * The core of one half, as a mesh: the shell itself (see shell.ts) and its flat inner face, with a notch let into the
 * crown for the intake. The intake stands in the fissure and is wider than the fissure is, so each half makes room for
 * its share of it: a round notch about the intake's axis, with a wall and a floor of its own. The shell's own points that
 * would fall inside the notch are moved out onto its edge, so the shell ends there in a clean round edge and nothing of
 * it is left inside.
 */
import { ShapeUtils, Vector2 } from 'three';
import { over, PORT } from './design';
import { FISSURE, RIM, shell, type V3 } from './shell';

/** The notch each core makes for the intake: its radius about the intake's axis, and how deep it goes. */
export const NOTCH = { r: PORT.r + 0.055, floor: PORT.floor - 0.22, lip: 0.02 };

export interface CoreMesh {
	position: Float32Array;
	normal: Float32Array;
	index: Uint32Array;
}

/** The point of the core's rim, where the roll ends on the inner face, that is at a given x along the top. */
function rimAt(x: number, at: V3, out: V3) {
	// Over the top the rim runs from the front tip to the back: x falls as the angle grows.
	let lo = 0.02;
	let hi = Math.PI - 0.02;
	for (let i = 0; i < 40; i++) {
		const a = (lo + hi) / 2;
		shell(RIM * Math.cos(a), RIM * Math.sin(a), at, out);
		if (at[0] > x) lo = a;
		else hi = a;
	}
}

export function core(rings = 40, round = 144): CoreMesh {
	const pos: number[] = [];
	const nor: number[] = [];
	const idx: number[] = [];
	const p: V3 = [0, 0, 0];
	const n: V3 = [0, 0, 0];
	// Half the notch's width where it meets the inner face.
	const half = Math.sqrt(NOTCH.r * NOTCH.r - FISSURE * FISSURE);
	const moved: boolean[] = [];
	for (let i = 0; i <= rings; i++) {
		// Over the dome, then closer rings round the roll into the fissure.
		const rho = i <= rings - 8 ? i / (rings - 8) : 1 + ((i - rings + 8) / 8) * (RIM - 1);
		for (let j = 0; j < round; j++) {
			const a = (j / round) * Math.PI * 2;
			shell(rho * Math.cos(a), rho * Math.sin(a), p, n);
			const dx = p[0] - PORT.x;
			const far = Math.hypot(dx, p[2]);
			const inside = far < NOTCH.r && p[1] > NOTCH.floor;
			if (inside && i === rings) {
				// On the rim: to the corner where the notch's wall meets the inner face.
				rimAt(PORT.x + (dx < 0 ? -half : half), p, n);
			} else if (inside) {
				// Straight out from the intake's axis to the notch's edge, on the shell.
				const [u, v] = over(PORT.x + (dx / far) * NOTCH.r, (p[2] / far) * NOTCH.r, 0);
				shell(u, v, p, n);
			}
			moved.push(inside);
			pos.push(...p);
			nor.push(...n);
		}
	}
	for (let i = 0; i < rings; i++)
		for (let j = 0; j < round; j++) {
			const a = i * round + j;
			const b = i * round + ((j + 1) % round);
			// What lay wholly inside the notch is gone.
			if (!(moved[a] && moved[a + round] && moved[b + round])) idx.push(a, a + round, b + round);
			if (!(moved[a] && moved[b + round] && moved[b])) idx.push(a, b + round, b);
		}

	// The inner face, flat on the fissure, with the notch cut down into its top edge.
	const outline: Vector2[] = [];
	const corner: V3 = [0, 0, 0];
	let was = false;
	for (let j = 0; j < round; j++) {
		const a = (j / round) * Math.PI * 2;
		shell(RIM * Math.cos(a), RIM * Math.sin(a), p, n);
		const inside = Math.abs(p[0] - PORT.x) < half && p[1] > NOTCH.floor;
		if (inside && !was) {
			rimAt(PORT.x + half, corner, n);
			outline.push(new Vector2(corner[0], corner[1]), new Vector2(PORT.x + half, NOTCH.floor));
		}
		if (!inside && was) {
			rimAt(PORT.x - half, corner, n);
			outline.push(new Vector2(PORT.x - half, NOTCH.floor), new Vector2(corner[0], corner[1]));
		}
		if (!inside) outline.push(new Vector2(p[0], p[1]));
		was = inside;
	}
	const first = pos.length / 3;
	for (const q of outline) {
		pos.push(q.x, q.y, FISSURE);
		nor.push(0, 0, -1);
	}
	for (const [a, b, c] of ShapeUtils.triangulateShape(outline, [])) {
		// Facing the fissure, whichever way the outline was cut up.
		const ax = outline[b].x - outline[a].x;
		const ay = outline[b].y - outline[a].y;
		const bx = outline[c].x - outline[a].x;
		const by = outline[c].y - outline[a].y;
		if (ax * by - ay * bx > 0) idx.push(first + a, first + c, first + b);
		else idx.push(first + a, first + b, first + c);
	}

	// The notch's wall, facing the intake, from its floor up to the shell and a hair over; and its floor.
	const from = Math.asin(FISSURE / NOTCH.r);
	const steps = 48;
	const wall = pos.length / 3;
	for (let k = 0; k <= steps; k++) {
		const a = from + ((Math.PI - 2 * from) * k) / steps;
		const x = PORT.x + NOTCH.r * Math.cos(a);
		const z = NOTCH.r * Math.sin(a);
		if (k === 0 || k === steps) rimAt(x, p, n);
		else {
			const [u, v] = over(x, z, 0);
			shell(u, v, p, n);
		}
		pos.push(x, p[1] + NOTCH.lip, z, x, NOTCH.floor, z);
		nor.push(-Math.cos(a), 0, -Math.sin(a), -Math.cos(a), 0, -Math.sin(a));
		if (k) idx.push(wall + 2 * k - 2, wall + 2 * k - 1, wall + 2 * k + 1, wall + 2 * k - 2, wall + 2 * k + 1, wall + 2 * k);
	}
	const floor = pos.length / 3;
	pos.push(PORT.x, NOTCH.floor, FISSURE);
	nor.push(0, 1, 0);
	for (let k = 0; k <= steps; k++) {
		const a = from + ((Math.PI - 2 * from) * k) / steps;
		pos.push(PORT.x + NOTCH.r * Math.cos(a), NOTCH.floor, NOTCH.r * Math.sin(a));
		nor.push(0, 1, 0);
		if (k) idx.push(floor, floor + k + 1, floor + k);
	}
	return { position: new Float32Array(pos), normal: new Float32Array(nor), index: new Uint32Array(idx) };
}
