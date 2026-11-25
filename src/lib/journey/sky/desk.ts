import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { hazed, palette } from './palette';
import { span } from './aqueduct';
import * as P from './masterplan';

/*
 * Your desk: where the agent works, on your laptop. A grand writing desk of glossy honey wood with a gold band round its
 * edge, standing on a cream base carried on arches like the aqueduct's, warmly lit. Everything on it is yours.
 *
 * Front middle, your laptop; behind it, wired into it, the harness: the program on your laptop that packs every request
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
	/** The gates' lamps and the test bench's lamps, which glow as the work goes on. */
	private gateLamps: THREE.MeshStandardMaterial[] = [];
	private testLamps: THREE.MeshStandardMaterial[] = [];
	private ring!: THREE.Object3D;

	constructor() {
		this.group.name = 'desk';
		const b = new Batch();
		this.furniture(b);
		this.leftWing(b);
		this.sandbox(b);
		this.archive(b);
		this.finish(b);
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

	/** The left wing: the easel and its page, the skills in a walnut shelf, the three local MCP servers, and your controls. */
	private leftWing(b: Batch) {
		const c = palette();
		// The easel: an A-frame of brass tubes, two legs in front leaning back and one behind, a ledge the request page
		// stands on and a clamp that holds its top. The page leans back with the legs.
		const E = P.EASEL.at;
		const lean = EASEL_LEAN;
		const top = 4.35;
		const eb = new Batch();
		for (const s of [-1, 1]) this.pipe(eb, [[E.x + s * 1.45, 0.02, E.z + 0.35], [E.x + s * 1.2, top * 0.5, E.z + 0.35 - top * 0.5 * Math.tan(-lean)], [E.x + s * 0.95, top, E.z + 0.35 - top * Math.tan(-lean)]], 0.07);
		this.pipe(eb, [[E.x, top - 0.1, E.z + 0.25 - top * Math.tan(-lean)], [E.x, top * 0.5, E.z - 0.9], [E.x, 0.02, E.z - 1.7]], 0.06);
		for (const s of [-1, 1]) eb.add(new THREE.SphereGeometry(0.1, 12, 8), c.gold, { p: [E.x + s * 0.95, top + 0.05, E.z + 0.35 - top * Math.tan(-lean)] });
		eb.add(rbox(3.2, 0.12, 0.34, 0.04), c.brass, { p: [E.x, 0.92, E.z + 0.35 - 0.92 * Math.tan(-lean) + 0.06] });
		eb.add(rbox(1.4, 0.14, 0.2, 0.04), c.brass, { p: [E.x, top - 0.28, E.z + 0.33 - (top - 0.28) * Math.tan(-lean)] });
		// The easel stands up from its foot: scaling it from there makes it grow out of the desk.
		const frame = eb.build('easel');
		frame.position.set(-E.x, 0, -E.z);
		this.easel.position.set(E.x, 0, E.z);
		this.easel.add(frame);
		b.add(rbox(3.4, 0.08, 2.5, 0.04), c.brass, { p: [E.x, 0.04, E.z - 0.65] });
		// The skills: today's shelf of folders, in a walnut case open at the front.
		const S = P.SKILLS.at;
		b.add(rbox(3.4, 0.18, 1.6, 0.06), c.walnut, { p: [S.x, 0.09, S.z] });
		for (const s of [-1, 1]) b.add(rbox(0.18, 1.9, 1.6, 0.06), c.walnut, { p: [S.x + s * 1.6, 0.95, S.z] });
		b.add(rbox(3.4, 0.18, 1.6, 0.06), c.walnut, { p: [S.x, 1.9, S.z] });
		b.add(rbox(3.2, 1.8, 0.1, 0.04), c.walnut, { p: [S.x, 0.95, S.z - 0.75] });
		b.add(rbox(3.0, 0.05, 0.05, 0.02), c.brass, { p: [S.x, 0.5, S.z + 0.82] });
		// The three local MCP servers: gadgets in their colours on walnut bases, each with a brass dial, piped to the laptop.
		const L = P.LAPTOP.at;
		[c.mint, c.coral, c.skyBlue].forEach((mat, i) => {
			const g = P.LOCAL_MCP[i];
			// The third is the story's own MCP server, which the harness wakes: it stands here, wired to the harness.
			if (i === 2) return;
			b.add(rbox(1.5, 0.2, 1.4, 0.06), c.walnut, { p: [g.x, 0.1, g.z] });
			b.add(rbox(1.25, 1.25, 1.15, 0.24), mat, { p: [g.x, 0.84, g.z] });
			b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 28), c.brass, { p: [g.x, 0.9, g.z + 0.6], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 24), c.amberWindow, { p: [g.x, 0.9, g.z + 0.63], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.SphereGeometry(0.12, 12, 8), c.brass, { p: [g.x, 1.52, g.z] });
			this.pipe(b, [[g.x, 0.16, g.z + 0.72], [g.x, 0.16, 2.4 + i * 0.22], [L.x - 1.7, 0.16, 2.4 + i * 0.22], [L.x - 1.45, 0.12, L.z - 0.4]], 0.07);
		});
		// The control panel: a brass plate with four controls, each its own shape.
		const C = P.CONTROLS.at;
		b.add(rbox(6.6, 0.24, 1.7, 0.1), c.brass, { p: [C.x, 0.12, C.z] });
		b.add(rbox(6.3, 0.06, 1.45, 0.04), c.cream, { p: [C.x, 0.27, C.z] });
		// Steer: a ship's wheel.
		const wx = C.x - 2.4;
		b.add(new THREE.TorusGeometry(0.5, 0.06, 10, 36), c.gold, { p: [wx, 0.95, C.z], r: [-0.5, 0, 0] });
		for (let i = 0; i < 8; i++) b.add(rbox(0.05, 1.2, 0.05, 0.02), c.gold, { p: [wx, 0.95, C.z], r: [-0.5, 0, (i / 8) * Math.PI] });
		b.add(new THREE.CylinderGeometry(0.1, 0.16, 0.55, 16), c.brass, { p: [wx, 0.55, C.z - 0.1] });
		// Cancel: a red button in a brass cup.
		b.add(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 28), c.brass, { p: [C.x - 0.8, 0.4, C.z] });
		b.add(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.mastRed, { p: [C.x - 0.8, 0.5, C.z] });
		// Terminate: a pull handle under a hinged guard.
		b.add(rbox(1.0, 0.1, 0.7, 0.03), c.brass, { p: [C.x + 0.8, 0.35, C.z] });
		b.add(new THREE.TorusGeometry(0.3, 0.06, 10, 24, Math.PI), c.mastRed, { p: [C.x + 0.8, 0.42, C.z] });
		b.add(rbox(1.1, 0.5, 0.06, 0.03), c.glass, { p: [C.x + 0.8, 0.62, C.z + 0.38], r: [-0.35, 0, 0] });
		b.add(rbox(1.1, 0.06, 0.8, 0.03), c.brass, { p: [C.x + 0.8, 0.86, C.z], r: [0, 0, 0] });
		// Roll back: a crank on a drum.
		b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24), c.brass, { p: [C.x + 2.4, 0.6, C.z], r: [0, 0, Math.PI / 2] });
		b.add(rbox(0.08, 0.6, 0.08, 0.03), c.brass, { p: [C.x + 2.75, 0.75, C.z + 0.15], r: [0.6, 0, 0] });
		b.add(new THREE.SphereGeometry(0.1, 12, 8), c.walnut, { p: [C.x + 2.75, 0.98, C.z + 0.35] });
	}

	/** The sandbox: the glass cabinet and what runs in it, the four gates in front, the chute beside them. */
	private sandbox(b: Batch) {
		const c = palette();
		const S = P.SANDBOX;
		const at = S.at;
		const wall = S.h - S.d / 2;
		// The cabinet: a brass plinth, a brass frame, glass walls and a glass barrel roof.
		b.add(rbox(S.w + 0.3, 0.24, S.d + 0.3, 0.08), c.brass, { p: [at.x, 0.12, at.z] });
		b.add(rbox(S.w, 0.12, S.d, 0.04), c.cream, { p: [at.x, 0.3, at.z] });
		for (const sx of [-1, 1])
			for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.07, 0.07, wall, 12), c.brass, { p: [at.x + (sx * S.w) / 2, wall / 2 + 0.24, at.z + (sz * S.d) / 2] });
		for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.06, 0.06, S.w, 12), c.brass, { p: [at.x, wall + 0.24, at.z + (sz * S.d) / 2], r: [0, 0, Math.PI / 2] });
		b.add(new THREE.BoxGeometry(S.w, wall, S.d), c.glass, { p: [at.x, wall / 2 + 0.24, at.z] });
		const roof = new THREE.CylinderGeometry(S.d / 2, S.d / 2, S.w, 48, 1, true, -Math.PI / 2, Math.PI);
		b.add(roof, c.glass, { p: [at.x, wall + 0.24, at.z], r: [Math.PI / 2, 0, Math.PI / 2] });
		for (const x of [-S.w / 2, 0, S.w / 2]) b.add(new THREE.TorusGeometry(S.d / 2, 0.06, 10, 40, Math.PI), c.brass, { p: [at.x + x, wall + 0.24, at.z], r: [0, Math.PI / 2, 0] });
		b.add(new THREE.SphereGeometry(0.14, 14, 10), c.gold, { p: [at.x, wall + 0.24 + S.d / 2 + 0.1, at.z] });
		// Inside: the repository, a wall of walnut drawers with brass pulls.
		const rx = at.x - 1.4;
		const rz = at.z - 1.2;
		b.add(rbox(3.6, 2.7, 1.2, 0.1), c.walnut, { p: [rx, 1.7, rz] });
		for (let row = 0; row < 4; row++)
			for (let col = 0; col < 5; col++) {
				const x = rx - 1.36 + col * 0.68;
				const y = 0.75 + row * 0.6;
				b.add(rbox(0.56, 0.5, 0.06, 0.03), c.woodEdge, { p: [x, y, rz + 0.62] });
				b.add(new THREE.SphereGeometry(0.04, 8, 6), c.brass, { p: [x, y, rz + 0.67] });
			}
		// The reading ring on its rail, over the drawers: it slides along and searches them.
		b.add(new THREE.CylinderGeometry(0.05, 0.05, S.w - 0.6, 10), c.brass, { p: [at.x, 3.35, rz + 0.95], r: [0, 0, Math.PI / 2] });
		this.ring = new THREE.Group();
		const ring = new Batch();
		ring.add(new THREE.TorusGeometry(0.42, 0.07, 12, 36), c.gold, { p: [0, -0.55, 0] });
		ring.add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), c.brass, { p: [0, -0.18, 0] });
		ring.add(rbox(0.3, 0.16, 0.2, 0.04), c.brass, { p: [0, 0.02, 0] });
		this.ring.add(ring.build('reading ring'));
		this.ring.position.set(rx - 0.6, 3.35, rz + 0.95);
		this.group.add(this.ring);
		// The shell: a little cream terminal with a green prompt.
		const sx = at.x + 1.1;
		b.add(rbox(1.3, 1.1, 1.0, 0.16), c.cream, { p: [sx, 0.95, at.z - 0.2] });
		b.add(rbox(0.95, 0.66, 0.04, 0.03), c.prompt, { p: [sx, 1.02, at.z + 0.31] });
		b.add(rbox(1.2, 0.08, 0.6, 0.03), c.cream, { p: [sx, 0.42, at.z + 0.5] });
		// The test bench: a cream base with a row of lamps that go green when the tests pass.
		const tx = at.x + 2.75;
		b.add(rbox(1.4, 0.5, 0.9, 0.08), c.cream, { p: [tx, 0.6, at.z - 0.5] });
		for (let i = 0; i < 4; i++) {
			const lamp = new THREE.MeshStandardMaterial({ color: '#173b22', emissive: '#2bdc63', emissiveIntensity: 0.4 });
			b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12), c.brass, { p: [tx - 0.5 + i * 0.33, 0.95, at.z - 0.5] });
			b.add(new THREE.SphereGeometry(0.11, 14, 10), lamp, { p: [tx - 0.5 + i * 0.33, 1.12, at.z - 0.5] });
			this.testLamps.push(lamp);
		}
		// The four gates in a row in front of it: slim brass frames, each with its lamp on top.
		const G = P.GATES;
		for (let i = 0; i < G.n; i++) {
			const x = G.x0 + i * G.gap;
			for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 12), c.brass, { p: [x + s * 0.42, 0.8, G.z] });
			b.add(new THREE.TorusGeometry(0.42, 0.06, 10, 24, Math.PI), c.brass, { p: [x, 1.6, G.z] });
			for (let k = -2; k <= 2; k++) b.add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), c.gold, { p: [x + k * 0.15, 0.85, G.z] });
			b.add(rbox(1.0, 0.12, 0.5, 0.04), c.brass, { p: [x, 0.06, G.z] });
			const lamp = new THREE.MeshStandardMaterial({ color: '#173b22', emissive: '#2bdc63', emissiveIntensity: 0.4 });
			b.add(new THREE.SphereGeometry(0.13, 14, 10), lamp, { p: [x, 2.15, G.z] });
			b.add(new THREE.CylinderGeometry(0.1, 0.07, 0.16, 12), c.brass, { p: [x, 2.0, G.z] });
			this.gateLamps.push(lamp);
		}
		// The chute: a brass slide that carries a refused call back towards the harness.
		const K = P.CHUTE.at;
		const chute = new THREE.Shape();
		chute.moveTo(0, 0);
		chute.lineTo(1.4, 0);
		chute.lineTo(1.4, 0.2);
		chute.quadraticCurveTo(0.4, 0.3, 0, 1.2);
		chute.closePath();
		b.add(extrude(chute, 0.7, 0.05, 2, 16), c.brass, { p: [K.x - 0.4, 0.02, K.z], r: [0, Math.PI, 0] });
	}

	/** The archive: a walnut filing cabinet, its lower drawer pulled out full of cards. */
	private archive(b: Batch) {
		const c = palette();
		const A = P.ARCHIVE;
		b.add(rbox(A.w, A.h, A.d, 0.18), c.walnut, { p: [A.at.x, A.h / 2, A.at.z] });
		b.add(rbox(A.w + 0.1, 0.14, A.d + 0.1, 0.05), c.brass, { p: [A.at.x, A.h + 0.07, A.at.z] });
		for (const y of [A.h * 0.72]) {
			b.add(rbox(A.w - 0.3, A.h * 0.36, 0.1, 0.04), c.woodEdge, { p: [A.at.x, y, A.at.z + A.d / 2 + 0.02] });
			b.add(new THREE.TorusGeometry(0.2, 0.05, 8, 24), c.brass, { p: [A.at.x, y, A.at.z + A.d / 2 + 0.1] });
		}
		const drawerZ = A.at.z + A.d / 2 + 0.9;
		b.add(rbox(A.w - 0.3, A.h * 0.36, 2.0, 0.08), c.walnut, { p: [A.at.x, A.h * 0.26, drawerZ - 0.4] });
		for (let i = 0; i < 9; i++) b.add(rbox(A.w - 0.7, 0.7, 0.04, 0.02), c.paper, { p: [A.at.x, A.h * 0.36 + 0.1, drawerZ - 1.2 + i * 0.18] });
		b.add(new THREE.TorusGeometry(0.2, 0.05, 8, 24), c.brass, { p: [A.at.x, A.h * 0.26, drawerZ + 0.66] });
	}

	/** Five brass stations in a rising row along the front: the ways to finish a piece of work. */
	private finish(b: Batch) {
		const c = palette();
		const F = P.FINISH;
		for (let i = 0; i < 5; i++) {
			const x = F.x0 + i * F.gap;
			const h = 0.45 + i * 0.22;
			b.add(rbox(1.5, 0.12, 1.3, 0.05), c.brass, { p: [x, 0.06, F.z] });
			b.add(new THREE.CylinderGeometry(0.55, 0.6, h, 32), c.brass, { p: [x, 0.12 + h / 2, F.z] });
			// Its cap: a brass bezel round a lamp that lights when this way of finishing is taken; the last, deploy, is blue.
			b.add(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 32), c.gold, { p: [x, 0.19 + h, F.z] });
			b.add(new THREE.TorusGeometry(0.36, 0.05, 8, 32), c.brass, { p: [x, 0.27 + h, F.z], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 28), i === 4 ? c.skyBlue : c.amberWindow, { p: [x, 0.27 + h, F.z] });
			b.add(new THREE.CylinderGeometry(0.05, 0.08, 0.36, 10), c.brass, { p: [x, 0.45 + h, F.z] });
			b.add(new THREE.SphereGeometry(0.09, 12, 8), c.gold, { p: [x, 0.66 + h, F.z] });
			if (i < 4) b.add(rbox(F.gap - 1.1, 0.08, 0.5, 0.03), c.brass, { p: [x + F.gap / 2, 0.08, F.z] });
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
		b.add(new THREE.TubeGeometry(curve, 48, r, 10), palette().brass);
	}

	/** The reading ring searches, the gates and tests light in turn. */
	update(time: number) {
		this.ring.position.x = P.SANDBOX.at.x - 1.4 + Math.sin(time * 0.6) * 1.3;
		this.gateLamps.forEach((m, i) => (m.emissiveIntensity = 0.4 + 2 * Math.max(0, Math.sin(time * 1.2 - i * 0.6))));
		this.testLamps.forEach((m, i) => (m.emissiveIntensity = 0.4 + 2 * Math.max(0, Math.sin(time * 0.8 - i * 0.4))));
	}
}
