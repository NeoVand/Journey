import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect, sharedRbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { Label } from '../kit/print';
import { fitting, plinth } from '../kit/parts';
import { LAPTOP_LEFT_PORTS, LEFT_PORT_R } from '../props/laptop';
import { hazed, palette } from './palette';
import { span } from './aqueduct';
import { layRug } from './crafts';
import * as P from './masterplan';

/*
 * Your desk: where the agent works, on your laptop. A grand writing desk of glossy honey wood with a gold band round its
 * edge, standing on a cream base carried on arches like the aqueduct's, warmly lit. Everything on it is yours.
 *
 * Front middle, your laptop, on a Persian rug as at home, a glass of tea beside it; behind it, wired into it, the harness: the program on your laptop that packs every request
 * and reads every reply, a butter-cream cabinet under a barrel roof with its four drawers in its face (what it packs:
 * instructions, environment, tools, conversation). The aqueduct's lanes leave from behind its roof.
 *
 * The left wing holds what goes into each request: the brass easel with the request page, the walnut shelf of skills,
 * the three local MCP servers, small gadgets in mint, coral and sky blue piped to the laptop's ports; and near your hand
 * the control panel, four different controls: a wheel to steer, a red button to cancel, a guarded handle to terminate, a
 * crank to roll back.
 *
 * The right wing is where the tools run, in a sandbox: a glass cabinet in a brass frame, inside it your repository as a
 * wall of small walnut drawers, a brass reading ring on a rail over them, a shell with a green prompt, and a test bench
 * whose lamps go green. Every call reaches it through four slim brass gates in a row, each with its lamp: well formed,
 * path allowed, policy, your yes; beside them a chute sends a refused call back. Behind, the walnut archive: transcripts
 * and memory. In front, five brass stations rising: present, commit, pull request, merge, deploy.
 *
 * Drawn from concepts/aqueduct/desk (whole, plan, sandbox, left). Its frame is the world's: the desk's top is y = 0.
 */

const D = P.DESK;
const EASEL_LEAN = -0.17;
/** The easel's brass foot on the desk: its legs stand on it, and grow up out of it. */
const FOOT = 0.08;

/**
 * The desk itself and what stands on it for good. The story's own things (your laptop, the harness, the request page, the
 * skills, the MCP server it wakes) are its own, which it moves, and stand where the masterplan says: see scenery.ts.
 */
export class Desk {
	group = new THREE.Group();
	/** The easel's brass frame: it stands only while it has a page to hold. */
	easel = new THREE.Group();
	/** Where the request page stands on the easel, and how far it leans back. */
	static PAGE = new THREE.Vector3(P.EASEL.at.x, 0.98 + 3.1 / 2, P.EASEL.at.z + 0.3 - 2.5 * Math.tan(-EASEL_LEAN));
	static PAGE_LEAN = EASEL_LEAN;

	constructor() {
		this.group.name = 'desk';
		this.easel.name = 'easel';
		const b = new Batch();
		this.furniture(b);
		this.home(b);
		this.leftWing(b);
		this.archive(b);
		this.posts(b);
		this.group.add(b.build('desk'), this.easel);
	}

	/** The top, its gold edge, the cream body under it, and the arches that carry it, their piers going down into the haze. */
	private furniture(b: Batch) {
		const c = palette();
		b.add(extrude(roundedRect(D.w, D.d, D.corner), D.top, 0.16, 4, 32), c.wood, { r: [-Math.PI / 2, 0, 0], p: [0, -D.top / 2, 0] });
		b.add(extrude(roundedRect(D.w + 0.1, D.d + 0.1, D.corner + 0.05), 0.12, 0.04, 2, 32), c.gold, { r: [-Math.PI / 2, 0, 0], p: [0, -D.top - 0.02, 0] });
		b.add(extrude(roundedRect(D.w - 0.6, D.d - 0.6, D.corner - 0.3), 0.9, 0.2, 3, 32), c.cream, { r: [-Math.PI / 2, 0, 0], p: [0, -D.top - 0.55, 0] });
		const pier = hazed(c.porcelain);
		const y = -D.top - 1.0;
		for (const z of [-D.d / 2 + 1.6, D.d / 2 - 1.6]) {
			for (let i = 0; i < 3; i++) {
				const x0 = -D.w / 2 + 2.4 + ((D.w - 4.8) * i) / 3;
				const x1 = -D.w / 2 + 2.4 + ((D.w - 4.8) * (i + 1)) / 3;
				span(b, new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z), 1.6, pier, i === 2 ? 'both' : 'pier');
			}
		}
	}

	/**
	 * Home: a hand-knotted rug under your laptop and the harness, madder red with an indigo medallion, and by your left
	 * hand a glass of tea, an estekan on its saucer, on a little brass tray with two lumps of sugar.
	 */
	private home(b: Batch) {
		const c = palette();
		const R = P.RUG;
		layRug(b, R.w, R.l, [R.at.x, 0, R.at.z], { pile: R.pile });
		const y = R.pile + 0.001;
		const [tx, tz] = [-1.95, 6.1];
		b.add(new THREE.CylinderGeometry(0.42, 0.4, 0.03, 40), c.brass, { p: [tx, y + 0.015, tz] });
		b.add(new THREE.TorusGeometry(0.415, 0.018, 6, 40), c.gold, { p: [tx, y + 0.03, tz], r: [Math.PI / 2, 0, 0] });
		const [gx, gz] = [tx + 0.06, tz - 0.04];
		const sy = y + 0.03;
		b.add(new THREE.CylinderGeometry(0.2, 0.15, 0.03, 32), c.porcelain, { p: [gx, sy + 0.015, gz] });
		b.add(new THREE.TorusGeometry(0.19, 0.01, 6, 32), c.gold, { p: [gx, sy + 0.03, gz], r: [Math.PI / 2, 0, 0] });
		// The estekan: a slim glass, pinched at its waist, and the tea in it, the colour of a sunset.
		const profile = [
			[0, 0],
			[0.11, 0],
			[0.12, 0.04],
			[0.11, 0.13],
			[0.085, 0.24],
			[0.095, 0.34],
			[0.12, 0.45],
			[0.125, 0.48]
		].map(([r, h]) => new THREE.Vector2(r, h));
		const gy = sy + 0.03;
		b.add(new THREE.LatheGeometry(profile, 24), c.glass, { p: [gx, gy, gz] });
		const tea = profile.filter((p) => p.y <= 0.4).map((p) => new THREE.Vector2(Math.max(0, p.x - 0.012), p.y + 0.012));
		tea.push(new THREE.Vector2(0, tea[tea.length - 1].y));
		b.add(new THREE.LatheGeometry(tea, 24), c.tea, { p: [gx, gy, gz] });
		// Two lumps of sugar on the tray.
		for (const [dx, dz, turn] of [
			[-0.24, 0.16, 0.3],
			[-0.12, 0.27, -0.4]
		])
			b.add(rbox(0.09, 0.08, 0.09, 0.015, 1), c.paper, { p: [tx + dx, y + 0.07, tz + dz], r: [0, turn, 0] });
	}

	/** The left wing: the easel and its page, the skills in a walnut shelf, the three local MCP servers, and your controls. */
	private leftWing(b: Batch) {
		const c = palette();
		// The easel: an A-frame of brass tubes, two legs in front leaning back and one behind, a ledge the request page
		// stands on and a clamp that holds its top. The page leans back with the legs.
		const E = P.EASEL.at;
		const lean = EASEL_LEAN;
		const top = 4.35;
		const eb = new Batch();
		// Wide enough that the page's tabs, sliding out at its sides, stay clear of its legs; standing on its brass foot.
		for (const s of [-1, 1]) this.pipe(eb, [[E.x + s * 1.85, FOOT + 0.07, E.z + 0.35], [E.x + s * 1.7, top * 0.5, E.z + 0.35 - top * 0.5 * Math.tan(-lean)], [E.x + s * 1.55, top, E.z + 0.35 - top * Math.tan(-lean)]], 0.07);
		this.pipe(eb, [[E.x, top - 0.1, E.z + 0.25 - top * Math.tan(-lean)], [E.x, top * 0.5, E.z - 0.9], [E.x, FOOT + 0.06, E.z - 1.7]], 0.06);
		for (const s of [-1, 1]) eb.add(new THREE.SphereGeometry(0.1, 12, 8), c.gold, { p: [E.x + s * 1.55, top + 0.05, E.z + 0.35 - top * Math.tan(-lean)] });
		eb.add(rbox(3.9, 0.12, 0.34, 0.04), c.brass, { p: [E.x, 0.92, E.z + 0.35 - 0.92 * Math.tan(-lean) + 0.06] });
		eb.add(rbox(1.4, 0.14, 0.2, 0.04), c.brass, { p: [E.x, top - 0.28, E.z + 0.33 - (top - 0.28) * Math.tan(-lean)] });
		// The easel stands up from its foot: scaling it from there makes it grow out of the desk.
		const frame = eb.build('easel');
		frame.position.set(-E.x, -FOOT, -E.z);
		this.easel.position.set(E.x, FOOT, E.z);
		this.easel.add(frame);
		b.add(rbox(4.2, FOOT, 2.5, 0.04), c.brass, { p: [E.x, FOOT / 2, E.z - 0.65] });
		// The skills: today's shelf of folders, in a walnut case open at the front.
		const S = P.SKILLS.at;
		b.add(rbox(3.4, 0.18, 1.6, 0.06), c.walnut, { p: [S.x, 0.09, S.z] });
		for (const s of [-1, 1]) b.add(rbox(0.18, 1.9, 1.6, 0.06), c.walnut, { p: [S.x + s * 1.6, 0.95, S.z] });
		b.add(rbox(3.4, 0.18, 1.6, 0.06), c.walnut, { p: [S.x, 1.9, S.z] });
		b.add(rbox(3.2, 1.8, 0.1, 0.04), c.walnut, { p: [S.x, 0.95, S.z - 0.75] });
		b.add(rbox(3.0, 0.05, 0.05, 0.02), c.brass, { p: [S.x, 0.5, S.z + 0.82] });
		// The three local MCP servers, each a small cabinet in its own colour, on a plinth, its name over three drawers
		// (what it offers: tools, resources, prompts), piped to your laptop from the fitting on its right side. The third
		// is the story's own, which the harness wakes: it stands here too (see scenery.ts).
		const L = P.LAPTOP.at;
		const names = ['Browser', 'Database'];
		[c.mint, c.coral].forEach((mat, i) => this.server(b, P.LOCAL_MCP[i], mat, names[i], i, L));
		this.controls(b);
	}

	/** One of the local MCP servers that isn't the story's: the same build as the story's own, in its own colour. */
	private server(b: Batch, g: THREE.Vector3, mat: THREE.Material, name: string, i: number, L: THREE.Vector3) {
		const m = mats();
		const sb = new Batch();
		plinth(sb, 1.42, 1.22, 0.1);
		sb.add(extrude(chamferRect(1.2, 1.32, 0.18, 0.07), 1.0, 0.05, 4, 10), mat, { p: [0, 0.1 + 0.66, 0] });
		sb.add(extrude(roundedRect(0.84, 0.34, 0.11), 0.06, 0.02, 3, 10), m.creamLight, { p: [0, 1.04, 0.52] });
		sb.add(rbox(0.9, 0.5, 0.02, 0.03, 2), m.recess, { p: [0, 0.5, 0.502] });
		for (const y of [0.66, 0.5, 0.34]) {
			sb.add(extrude(roundedRect(0.84, 0.13, 0.035), 0.035, 0.01, 2, 8), m.creamLight, { p: [0, y, 0.52] });
			sb.add(rbox(0.3, 0.025, 0.012, 0.006, 1), m.steel, { p: [0, y, 0.54] });
		}
		fitting(sb, [0.6, 0.34, 0.1], [1, 0, 0], 0.05);
		const parts = sb.build(`local-mcp-${i}`);
		parts.position.copy(g);
		this.group.add(parts);
		// Sized to leave its lamp room on the plate, however long its name.
		const label = new Label(name, name.length > 6 ? 0.12 : 0.15, { weight: 800 });
		label.mesh.position.set(g.x - 0.1, 1.038, g.z + 0.554);
		this.group.add(label.mesh);
		const lamp = new Lamp(sharedRbox(0.07, 0.07, 0.026, 0.024, 3), color.green, 0.9);
		lamp.mesh.position.set(g.x + 0.33, 1.038, g.z + 0.554);
		this.group.add(lamp.mesh);
		// Its pipe: out of its fitting, down beside it onto the desk, forward, along the desk, and into its own port on
		// your laptop's left side, clear of the lid. Each server has its own port, and the two pipes never cross.
		const r = 0.05;
		const out = g.x + 0.6 + 0.18;
		const lane = 2.4 + i * 0.22;
		const port = LAPTOP_LEFT_PORTS[i];
		const portX = L.x + port[0] - LEFT_PORT_R * 3.6;
		const portZ = L.z + port[2];
		const turn = L.x - 2.3 - i * 0.25;
		this.pipe(
			b,
			[
				[out, 0.34, g.z + 0.1],
				[out + 0.14, 0.24, g.z + 0.18],
				[out + 0.2, r + 0.004, g.z + 0.5],
				[out + 0.2, r + 0.004, lane - 0.3],
				[out + 0.5, r + 0.004, lane],
				[turn - 0.3, r + 0.004, lane],
				[turn, r + 0.004, lane + 0.3],
				[turn, r + 0.004, portZ - 0.3],
				[turn + 0.3, 0.06, portZ],
				[portX, 0.06, portZ]
			],
			r
		);
	}

	/**
	 * Your controls, near your hand: a walnut console, its cream face sloping up away from you in a brass frame, and in
	 * four bays the four ways to step in, each its own shape and named on a plate at its foot: a wheel to steer, a red
	 * button to cancel, a guarded T-handle to terminate, a crank to roll back.
	 */
	private controls(b: Batch) {
		const c = palette();
		const m = mats();
		const C = P.CONTROLS.at;
		const W = 6.4;
		const D = 1.7;
		const slope = 0.3;
		const base = 0.22;
		const lip = 0.1;
		const rise = D * Math.tan(slope);
		// The base, and on it a walnut wedge: low at the front, by your hand, high at the back.
		b.add(rbox(W + 0.24, base, D + 0.24, 0.08, 3), c.walnut, { p: [C.x, base / 2, C.z] });
		const side = new THREE.Shape();
		side.moveTo(-D / 2, 0);
		side.lineTo(D / 2, 0);
		side.lineTo(D / 2, lip);
		side.lineTo(-D / 2, lip + rise);
		side.closePath();
		b.add(extrude(side, W, 0.04, 2, 2), c.walnut, { p: [C.x, base, C.z], r: [0, -Math.PI / 2, 0] });
		/** The face's height over a point along the console, front (+) to back (-). */
		const surface = (z: number) => base + lip + (D / 2 - (z - C.z)) * Math.tan(slope) + 0.06;
		// The face: a brass frame and a cream panel lying on the slope, brass dividers between the bays.
		const face = new THREE.Group();
		face.position.set(C.x, surface(C.z) - 0.03, C.z);
		face.rotation.x = slope;
		this.group.add(face);
		const f = new Batch();
		f.add(rbox(W + 0.1, 0.06, D / Math.cos(slope) + 0.06, 0.03, 2), c.brass);
		f.add(rbox(W - 0.12, 0.04, D / Math.cos(slope) - 0.14, 0.02, 2), c.cream, { p: [0, 0.03, 0] });
		const bay = (W - 0.12) / 4;
		const at = (i: number) => -W / 2 + 0.06 + bay * (i + 0.5);
		for (let i = 1; i < 4; i++) f.add(rbox(0.04, 0.03, D / Math.cos(slope) - 0.3, 0.012, 1), c.brass, { p: [-W / 2 + 0.06 + i * bay, 0.06, 0] });
		const plateZ = D / 2 / Math.cos(slope) - 0.2;
		['Steer', 'Cancel', 'Terminate', 'Roll back'].forEach((name, i) => {
			f.add(extrude(roundedRect(1.12, 0.24, 0.07), 0.03, 0.01, 2, 8), m.creamLight, { p: [at(i), 0.06, plateZ], r: [-Math.PI / 2, 0, 0] });
			const label = new Label(name, 0.14, { weight: 700 });
			label.mesh.position.set(at(i), 0.077, plateZ);
			label.mesh.rotation.x = -Math.PI / 2;
			face.add(label.mesh);
		});
		face.add(f.build('controls-face'));
		// The controls stand upright on the slope, a little back from their plates, each seated in a brass foot.
		const z0 = C.z - 0.12;
		// The cream panel's top, which stands a little proud of its brass frame.
		const y0 = surface(z0) + 0.02;
		const foot = (x: number, r: number) => b.add(new THREE.CylinderGeometry(r, r + 0.03, 0.08, 28), c.brass, { p: [x, y0, z0] });
		// Steer: a ship's wheel facing you on a brass post, handles round its rim.
		const sx = C.x + at(0);
		foot(sx, 0.14);
		b.add(new THREE.CylinderGeometry(0.06, 0.09, 0.62, 14), c.brass, { p: [sx, y0 + 0.31, z0 - 0.06] });
		const wy = y0 + 0.78;
		const wz = z0 + 0.0;
		b.add(new THREE.TorusGeometry(0.34, 0.04, 10, 40), c.gold, { p: [sx, wy, wz] });
		b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16), c.brass, { p: [sx, wy, wz - 0.02], r: [Math.PI / 2, 0, 0] });
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * Math.PI * 2;
			b.add(rbox(0.035, 0.68, 0.035, 0.012, 1), c.gold, { p: [sx, wy, wz], r: [0, 0, a] });
			b.add(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 10), c.walnut, { p: [sx - Math.sin(a) * 0.45, wy + Math.cos(a) * 0.45, wz], r: [0, 0, a] });
		}
		// Cancel: a red mushroom button in a brass bezel on a yellow collar.
		// Square to the face, as a panel's button is.
		const cx = C.x + at(1);
		const up = (h: number): [number, number, number] => [cx, y0 + Math.cos(slope) * h, z0 + Math.sin(slope) * h];
		b.add(new THREE.CylinderGeometry(0.38, 0.42, 0.06, 32), c.amberWindow, { p: up(0.03), r: [slope, 0, 0] });
		b.add(new THREE.CylinderGeometry(0.26, 0.3, 0.18, 28), c.brass, { p: up(0.15), r: [slope, 0, 0] });
		b.add(new THREE.SphereGeometry(0.28, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.mastRed, { p: up(0.22), r: [slope, 0, 0] });
		// Terminate: a red T-handle on a steel rod, in a frame striped yellow and black, under a clear guard on a hinge.
		const tx = C.x + at(2);
		// Its striped frame lies on the slope, as the face does.
		b.add(rbox(0.9, 0.06, 0.7, 0.02, 1), c.iron, { p: [tx, y0 + 0.032, z0], r: [slope, 0, 0] });
		for (let k = 0; k < 8; k++) b.add(rbox(0.05, 0.065, 0.5, 0.01, 1), c.amberWindow, { p: [tx - 0.3 + k * 0.086, y0 + 0.036, z0], r: [slope, 0.6, 0] });
		b.add(rbox(0.7, 0.08, 0.5, 0.02, 1), c.cream, { p: [tx, y0 + 0.065, z0], r: [slope, 0, 0] });
		b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), m.steel, { p: [tx, y0 + 0.2, z0] });
		b.add(rbox(0.46, 0.09, 0.1, 0.03, 2), c.mastRed, { p: [tx, y0 + 0.38, z0] });
		b.add(rbox(0.86, 0.5, 0.64, 0.04, 2), c.glass, { p: [tx, y0 + 0.3, z0 + 0.02] });
		b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.86, 8), c.brass, { p: [tx, y0 + 0.55, z0 - 0.3], r: [0, 0, Math.PI / 2] });
		// Roll back: a crank on a brass drum on two cheeks, and over it a gold arrow curling back the way things came.
		const rx = C.x + at(3);
		for (const s of [-1, 1]) b.add(rbox(0.06, 0.4, 0.34, 0.02, 1), c.brass, { p: [rx + s * 0.3, y0 + 0.2, z0] });
		b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.54, 24), c.brass, { p: [rx, y0 + 0.32, z0], r: [0, 0, Math.PI / 2] });
		for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.205, 0.02, 6, 24), c.gold, { p: [rx + s * 0.18, y0 + 0.32, z0], r: [0, Math.PI / 2, 0] });
		b.add(rbox(0.05, 0.05, 0.34, 0.015, 1), m.steel, { p: [rx + 0.36, y0 + 0.32, z0 + 0.12] });
		b.add(rbox(0.05, 0.3, 0.05, 0.015, 1), m.steel, { p: [rx + 0.36, y0 + 0.45, z0 + 0.27] });
		b.add(new THREE.SphereGeometry(0.06, 12, 8), c.walnut, { p: [rx + 0.36, y0 + 0.62, z0 + 0.27] });
		b.add(new THREE.TorusGeometry(0.36, 0.025, 6, 32, Math.PI * 1.25), c.gold, { p: [rx, y0 + 0.36, z0 - 0.12], r: [0, 0, 0.3] });
		b.add(new THREE.ConeGeometry(0.06, 0.14, 12), c.gold, { p: [rx - 0.33 * Math.cos(1.25 * Math.PI + 0.3 - Math.PI), y0 + 0.36 - 0.36 * Math.sin(0.3 + 0.25 * Math.PI), z0 - 0.12], r: [0, 0, 2.9] });
	}

	/**
	 * The archive: a walnut filing cabinet on a plinth under a brass-edged top, two drawers, each with a brass frame
	 * holding a cream card with its name and a brass bar pull: the transcripts above, the memory files below, pulled
	 * half out, its index cards standing in it with their tabs up.
	 */
	private archive(b: Batch) {
		const c = palette();
		const m = mats();
		const A = P.ARCHIVE;
		const x = A.at.x;
		const z = A.at.z;
		const front = z + A.d / 2;
		// The carcass on its plinth, and its top: walnut over a brass edge.
		b.add(rbox(A.w + 0.16, 0.16, A.d + 0.16, 0.05, 2), c.walnut, { p: [x, 0.08, z] });
		b.add(rbox(A.w, A.h - 0.3, A.d, 0.1, 3), c.walnut, { p: [x, 0.16 + (A.h - 0.3) / 2, z] });
		b.add(rbox(A.w + 0.14, 0.06, A.d + 0.14, 0.02, 2), c.brass, { p: [x, A.h - 0.11, z] });
		b.add(rbox(A.w + 0.2, 0.12, A.d + 0.2, 0.05, 3), c.woodEdge, { p: [x, A.h - 0.02, z] });
		const dw = A.w - 0.3;
		const dh = (A.h - 0.62) / 2;
		const drawer = (y: number, name: string, out: number) => {
			const fz = front + out;
			// Its front: a raised walnut panel in a lighter frame.
			b.add(rbox(dw, dh, 0.1, 0.04, 2), c.woodEdge, { p: [x, y, fz + 0.03] });
			b.add(rbox(dw - 0.18, dh - 0.18, 0.06, 0.03, 2), c.walnut, { p: [x, y, fz + 0.09] });
			// The card in its brass frame, and the bar pull under it on two posts.
			const cardY = y + dh * 0.22;
			b.add(rbox(0.86, 0.3, 0.03, 0.01, 1), c.brass, { p: [x, cardY, fz + 0.125] });
			b.add(rbox(0.78, 0.22, 0.02, 0.008, 1), m.creamLight, { p: [x, cardY, fz + 0.135] });
			const label = new Label(name, 0.11, { weight: 700 });
			label.mesh.position.set(x, cardY, fz + 0.147);
			this.group.add(label.mesh);
			const pullY = y - dh * 0.2;
			b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 12), c.brass, { p: [x, pullY, fz + 0.24], r: [0, 0, Math.PI / 2] });
			for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), c.brass, { p: [x + s * 0.27, pullY, fz + 0.17], r: [Math.PI / 2, 0, 0] });
			return fz;
		};
		const upper = 0.3 + dh * 1.5 + 0.06;
		const lower = 0.3 + dh / 2;
		drawer(upper, 'Transcripts', 0);
		// The memory files' drawer, half out: its sides and floor, and the index cards standing in it, tabs up.
		const out = 0.9;
		const fz = drawer(lower, 'Memory', out);
		const inner = dw - 0.12;
		const floorY = lower - dh / 2 + 0.06;
		b.add(rbox(inner, 0.05, out + 0.1, 0.02, 1), c.walnut, { p: [x, floorY, front + out / 2 - 0.02] });
		for (const s of [-1, 1]) b.add(rbox(0.05, dh - 0.1, out + 0.1, 0.02, 1), c.walnut, { p: [x + s * (inner / 2 - 0.025), lower - 0.03, front + out / 2 - 0.02] });
		for (let i = 0; i < 6; i++) {
			const cz = fz - 0.12 - i * 0.13;
			b.add(rbox(inner - 0.16, dh - 0.24, 0.025, 0.01, 1), c.paper, { p: [x, floorY + (dh - 0.24) / 2 + 0.03, cz] });
			const tx = x - inner / 2 + 0.3 + ((i * 0.37) % 1) * (inner - 0.6);
			b.add(rbox(0.26, 0.1, 0.026, 0.01, 1), i % 3 === 0 ? c.amberWindow : m.creamLight, { p: [tx, floorY + dh - 0.16, cz] });
		}
	}

	/** Brass posts at the back corners, for the remote towers' cables. */
	private posts(b: Batch) {
		const c = palette();
		for (const p of P.POSTS) {
			b.add(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 24), c.brass, { p: [p.x, 0.1, p.z] });
			b.add(new THREE.CylinderGeometry(0.12, 0.18, 1.3, 20), c.brass, { p: [p.x, 0.8, p.z] });
			b.add(new THREE.SphereGeometry(0.22, 20, 14), c.gold, { p: [p.x, 1.55, p.z] });
		}
	}

	private pipe(b: Batch, pts: [number, number, number][], r: number) {
		const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
		// Where it lies on the desk it lies on it, or on the rug: never lower than its own radius over the top.
		const laid = new THREE.CatmullRomCurve3(curve.getSpacedPoints(160).map((p) => p.setY(Math.max(p.y, r + 0.004 + P.deskFloor(p.x, p.z)))), false, 'centripetal');
		b.add(new THREE.TubeGeometry(laid, 96, r, 10), palette().brass);
	}
}
