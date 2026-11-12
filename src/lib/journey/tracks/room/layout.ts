import * as THREE from 'three';

/*
 * Where everything stands in the new room, as plan f3 lays it out (concepts/harness/plan-f3.md). Room units: x to the
 * right, z toward the camera, y up; the floor's top is y 0. The room is 14.4 wide and 12 deep, open at the front.
 * The building, the motion and the cameras all read these numbers, so they can never disagree.
 */

export const W = 14.4;
export const D = 12;
export const WALL_H = 6.1;
export const BACK_Z = -6;
export const SIDE_X = 7.2;
/** The walls' thickness: their inner faces are at x ±SIDE_X and z BACK_Z. */
export const WALL_T = 0.4;
/** The floor slab, which the side walls stand on: it reaches out to the walls' outer faces. */
export const FLOOR = { x: SIDE_X + WALL_T, z0: BACK_Z - WALL_T, z1: -BACK_Z + WALL_T };

/* ---------- remembers: the back ---------- */

/** The tray: from under the drawers to just short of the back-right corner. */
export const TRAY = { x0: -4.6, x1: 4.2, z0: -4.0, z1: -2.8, base: 0.36 };
export const TRAY_Z = (TRAY.z0 + TRAY.z1) / 2;
/** The press's housing behind the end stop. */
export const HOUSING = { x0: TRAY.x1 + 0.08, x1: TRAY.x1 + 0.82, h: 0.66 };
/** The lip, along the tray's front: where new tiles arrive from the left. */
export const LIP = { z0: -2.72, z1: -2.5, y: 0.2 };
/** The pad at the lip's start, where the reply comes down. Its top is at PAD.y. */
export const PAD = { x0: -5.95, x1: -4.6, z0: -3.3, z1: -2.5, y: 0.14 };
/** The skill shelf, on the back wall right of the drawers: a name and a line each, until one is needed. */
export const SHELF = { x0: 1.4, x1: 3.9, y: 2.0 };
export const SKILLS = ['debugging', 'reviewing', 'migrating', 'testing', 'releasing'];
/** Where a skill's card stands on the shelf, by its place in the row. */
export const skillAt = (i: number) => new THREE.Vector3(SHELF.x0 + 0.32 + i * 0.47, SHELF.y + 0.04, BACK_Z + 0.24);

/* ---------- the loop: up in the back-right corner, down in the back-left ---------- */

/** The send tube: a pneumatic tube, floor to above the walls, standing in the back-right corner. */
export const TUBE = { x: 6.4, z: -5.3, r: 0.6, top: 7.0, door: 0.95 };
/** Where the capsule docks against the press's housing to be loaded with a copy of the tray. */
export const DOCK = new THREE.Vector3(HOUSING.x1 + 0.42, 0.42, TRAY_Z);
/** The capsule: a glass pill that carries the copy; it rests in the tube's foot. */
export const CAPSULE = { len: 0.84, r: 0.2, restY: 0.42 };
/** The reply chute, in the back-left corner: a glass shaft down the corner, and a slide from its foot to the pad. */
export const CHUTE = { x0: -7.2, x1: -6.45, z0: -6.0, z1: -4.95, foot: 0.95, top: 6.7 };

/* ---------- checks: the left, by you ---------- */

/** The gate: an arch the cart drives into from the east. Its big arch faces you (+z); a refusal leaves by the back. */
export const GATE = { x0: -5.95, x1: -4.45, z0: -2.1, z1: -1.1, h: 2.15, slab: 0.2, leg: 0.36, open: 1.55 };
export const GATE_X = (GATE.x0 + GATE.x1) / 2;
export const GATE_Z = (GATE.z0 + GATE.z1) / 2;
/** Your screen: a wide window in the left wall, facing the gate. */
export const SCREEN = { z0: -2.5, z1: -0.3, y0: 1.4, y1: 3.2 };
/** Where your hooks plug in: a port in the left wall, forward of the window. */
export const HOOK_PORT: [number, number, number] = [-SIDE_X, 0.42, 0.6];

/* ---------- acts: the right, by your machine ---------- */

/** The cart's rail: out of the gate, east along the front of the tray, south past the benches, and west to the subagent. */
export const RAIL = { z: -1.6, x: 5.45, r: 0.45 };
/** The three benches against the right wall, each wired through it to the real thing outside. */
export const BENCH = { x0: 5.95, x1: 6.6, len: 1.0, h: 0.62 };
/** A bench's wire: up out of its top, over, and into a port high in the wall; outside, a short lead down to the thing. */
export const PORT = { inside: 1.05, outside: 0.2 };
export const BENCHES = [
	{ name: 'Files', z: -1.7, wire: '#f39a2c', outside: 'Your files' },
	{ name: 'Shell', z: 0.3, wire: '#2fbf68', outside: 'Your shell' },
	{ name: 'MCP', z: 2.3, wire: '#2f6fe0', outside: 'MCP server' }
] as const;
/** The ledge outside the right wall, a step down: your files, your shell in its fence, an MCP server. */
export const LEDGE = { x0: FLOOR.x + 0.02, x1: 8.92, z0: -3.0, z1: 3.6, y: -0.1 };
/** Each real thing stands on a pedestal on the ledge, in line with its bench, plugged in on the side facing the wall. */
export const PEDESTAL = { x0: 8.1, x1: 8.76, d: 0.66, h: 0.24 };
/** The sandbox's fence round your shell, with the shell's lead through a grommet in its wall-side panel. */
export const FENCE = { x0: 7.86, x1: 8.86, z0: BENCHES[1].z - 0.55, z1: BENCHES[1].z + 0.62 };

/* ---------- the subagent: the room again, in small, in the middle of the front ---------- */

export type Rect = { x0: number; x1: number; z0: number; z1: number };
/** Layer 1, the subagent's room. Layers 2 and 3 sit inside it at the same place, so each is the room again. */
export const SUB: Rect = { x0: -2.4, x1: 2.55, z0: 2.75, z1: 5.65 };
/** Where a room's own subagent stands in it, as parts of its width and depth. */
export const CHILD = { u0: 0.333, u1: 0.677, v0: 0.48, v1: 0.95 };
/** The doorway in a small room's right wall, at its front corner: where its parent's rail comes in. As parts of its depth. */
export const DOOR = { v0: 0.86, v1: 0.97, v: 0.912 };
/** How many rooms deep the subagents go: three below the main conversation, and the last can't start another. */
export const LAYERS = 3;

/** Where the main rail turns west: level with the subagent's doorway. */
export const RAIL_WEST_Z = SUB.z0 + DOOR.v * (SUB.z1 - SUB.z0);

/** A rail's centre line on the floor: east from a gate, a corner, south, a corner, and west to an end. */
export function railShape(a: { from: number; z: number; x: number; west: number; to: number; r: number; y?: number }) {
	const { r } = a;
	const y = a.y ?? 0;
	const pts: THREE.Vector3[] = [];
	const line = (p: [number, number], q: [number, number], n: number) => {
		for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(p[0] + ((q[0] - p[0]) * i) / n, y, p[1] + ((q[1] - p[1]) * i) / n));
	};
	const arc = (cx: number, cz: number, from: number, to: number, n: number) => {
		for (let i = 0; i < n; i++) {
			const t = from + ((to - from) * i) / n;
			pts.push(new THREE.Vector3(cx + Math.cos(t) * r, y, cz + Math.sin(t) * r));
		}
	};
	line([a.from, a.z], [a.x - r, a.z], 24);
	arc(a.x - r, a.z + r, -Math.PI / 2, 0, 8);
	line([a.x, a.z + r], [a.x, a.west - r], 20);
	arc(a.x - r, a.west - r, 0, Math.PI / 2, 8);
	line([a.x - r, a.west], [a.to, a.west], 8);
	pts.push(new THREE.Vector3(a.to, y, a.west));
	const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
	c.arcLengthDivisions = 800;
	return c;
}

/** The main rail, from inside the gate to the subagent's doorway. */
export const railPath = () => railShape({ from: GATE_X, z: RAIL.z, x: RAIL.x, west: RAIL_WEST_Z, to: SUB.x1 + 0.18, r: RAIL.r });
