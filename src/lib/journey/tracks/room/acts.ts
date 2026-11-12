import * as THREE from 'three';
import { Batch } from '../../kit/batch';
import { hang, type Solid } from '../../kit/cable';
import { rbox, sweep } from '../../kit/geometry';
import { shadowOn, tube } from '../../kit/machines';
import { Lamp, color, mats } from '../../kit/materials';
import { createSign, fitting, standSign } from '../../kit/parts';
import { font, roundRectPath } from '../../kit/print';
import { printed } from './checks';
import { BENCH, BENCHES, FENCE, FLOOR, LEDGE, PEDESTAL, PORT, railPath, SIDE_X, WALL_T } from './layout';
import { glass } from './loop';
import { TILE_COLOR } from './tiles';

/*
 * What acts, on the right by your machine: the cart's rail from the gate along the front and down past the benches,
 * the cart, three benches wired through the right wall, and the ledge outside it with the real things on it.
 */

/** The cart's paint: the turn marker, orange like the tool call it carries. */
const paint = () => new THREE.MeshPhysicalMaterial({ color: '#f39327', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.18 });

const RAIL_Y = 0.07;
const BED_TOP = 0.035;

export function buildRail() {
	const m = mats();
	const group = new THREE.Group();
	const path = railPath();
	const bedMat = (m.creamDeep as THREE.MeshPhysicalMaterial).clone();
	bedMat.side = THREE.DoubleSide;
	const bed = new THREE.Mesh(
		sweep(
			path,
			// Each corner twice, so the top and the sides keep their own normals and the edges stay crisp.
			[
				[-0.23, BED_TOP],
				[0.23, BED_TOP],
				[0.23, BED_TOP],
				[0.25, 0.006],
				[0.25, 0.006],
				[-0.25, 0.006],
				[-0.25, 0.006],
				[-0.23, BED_TOP]
			],
			400
		),
		bedMat
	);
	bed.receiveShadow = true;
	group.add(bed);
	const b = new Batch();
	const lifted = new THREE.CatmullRomCurve3(path.getSpacedPoints(300).map((p) => p.clone().setY(RAIL_Y)));
	b.add(new THREE.TubeGeometry(lifted, 600, 0.028, 10), m.gold);
	// Brass studs along it, and a buffer at each end.
	const len = path.getLength();
	const n = Math.round(len / 1.15);
	for (let i = 1; i < n; i++) b.add(new THREE.SphereGeometry(0.05, 14, 10), m.gold, { p: path.getPointAt(i / n).setY(RAIL_Y).toArray() });
	for (const u of [0, 1]) b.add(new THREE.SphereGeometry(0.07, 16, 12), m.gold, { p: path.getPointAt(u).setY(RAIL_Y).toArray() });
	group.add(b.build('rail'));
	return { group, path };
}

/** The cart: the turn marker. It carries a call to the gate and on to a bench, and the result back to the open end. */
export class Cart {
	group = new THREE.Group();
	/** What it carries: a card standing on its deck. Hidden when it carries nothing. */
	card = new THREE.Group();
	wheels: THREE.Mesh[] = [];
	static readonly deck = 0.34;

	constructor() {
		const m = mats();
		const b = new Batch();
		const body = paint();
		b.add(rbox(0.62, 0.18, 0.42, 0.06, 3), body, { p: [0, 0.25, 0] });
		b.add(rbox(0.66, 0.03, 0.46, 0.015, 2), m.gold, { p: [0, Cart.deck - 0.01, 0] });
		this.group.add(b.build('cart'));
		for (const x of [-0.2, 0.2])
			for (const z of [-0.17, 0.17]) {
				const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 20), m.rubber);
				wheel.rotation.x = Math.PI / 2;
				wheel.position.set(x, 0.12, z);
				this.group.add(wheel);
				this.wheels.push(wheel);
			}
		const card = new Batch();
		card.add(rbox(0.46, 0.5, 0.05, 0.03, 3), m.amber, { p: [0, 0.25, 0] });
		this.card.add(card.build('call-card'));
		const face = printed(0.4, 0.2, (c, w, h) => {
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.42}px ${font.sans}`;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillText('Tool call', w / 2, h * 0.52);
		});
		face.position.set(0, 0.3, 0.027);
		this.card.add(face);
		this.card.position.y = Cart.deck;
		this.group.add(this.card);
		this.group.traverse((o) => (o.castShadow = true));
	}
}

/** Where a bench's card goes in: the slot along its top, on the rail's side. */
export const benchSlot = (z: number) => new THREE.Vector3(BENCH.x0 + 0.12, BENCH.h, z);

export function buildBenches() {
	const m = mats();
	const group = new THREE.Group();
	const lamps: Lamp[] = [];
	const floor: Solid = { min: [-FLOOR.x, -0.5, FLOOR.z0], max: [FLOOR.x, 0, FLOOR.z1] };
	const ledge: Solid = { min: [LEDGE.x0, -0.5, LEDGE.z0], max: [LEDGE.x1, LEDGE.y, LEDGE.z1] };
	const cx = (BENCH.x0 + BENCH.x1) / 2;
	const bw = BENCH.x1 - BENCH.x0;
	const wires: THREE.Curve<THREE.Vector3>[] = [];
	BENCHES.forEach((bench) => {
		const b = new Batch();
		b.add(rbox(bw + 0.04, 0.1, BENCH.len + 0.04, 0.03, 2), m.slate, { p: [cx, 0.05, bench.z] });
		b.add(rbox(bw, BENCH.h - 0.1, BENCH.len, 0.07, 3), m.creamLight, { p: [cx, 0.1 + (BENCH.h - 0.1) / 2, bench.z] });
		// The slot the call goes in, along the top on the rail's side.
		b.add(rbox(0.09, 0.03, BENCH.len * 0.62, 0.012, 2), m.recess, { p: [BENCH.x0 + 0.12, BENCH.h - 0.005, bench.z] });
		b.add(rbox(0.13, 0.015, BENCH.len * 0.66, 0.006, 2), m.gold, { p: [BENCH.x0 + 0.12, BENCH.h + 0.002, bench.z] });
		// Its wire: up out of its top, over and into a port high in the wall. On the far side a short lead goes down
		// to the real thing; the wall hides the run between.
		const top: [number, number, number] = [BENCH.x1 - 0.15, BENCH.h, bench.z + 0.2];
		const port: [number, number, number] = [SIDE_X - 0.04, PORT.inside, bench.z + 0.2];
		const far: [number, number, number] = [SIDE_X + WALL_T + 0.04, PORT.outside, bench.z];
		fitting(b, top, [0, 1, 0], 0.045);
		b.add(rbox(0.04, 0.3, 0.3, 0.03, 2), m.steelSoft, { p: [SIDE_X - 0.02, port[1], port[2]] });
		b.add(rbox(0.04, 0.26, 0.26, 0.03, 2), m.steelSoft, { p: [SIDE_X + WALL_T + 0.02, far[1], far[2]] });
		fitting(b, port, [-1, 0, 0], 0.045);
		fitting(b, far, [1, 0, 0], 0.045, { low: true });
		group.add(b.build(`bench:${bench.name}`));
		shadowOn(group, cx, 0, bench.z, bw + 0.4, BENCH.len + 0.4, 0.3);

		// Its board, on the front: its name, and what goes in and what comes out.
		const board = printed(0.52, 0.27, (c, w, h) => {
			c.fillStyle = color.paper;
			roundRectPath(c, 0, 0, w, h, 14);
			c.fill();
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.36}px ${font.sans}`;
			c.textBaseline = 'middle';
			c.fillText(bench.name, w * 0.07, h * 0.5);
			c.fillStyle = TILE_COLOR.call;
			roundRectPath(c, w * 0.6, h * 0.25, h * 0.5, h * 0.5, 6);
			c.fill();
			c.fillStyle = TILE_COLOR.result;
			roundRectPath(c, w * 0.6 + h * 0.62, h * 0.25, h * 0.5, h * 0.5, 6);
			c.fill();
		});
		board.position.set(cx, 0.4, bench.z + BENCH.len / 2 + 0.006);
		group.add(board);
		const lamp = new Lamp(rbox(0.12, 0.04, 0.12, 0.02, 2), color.amber, 0.12);
		lamp.mesh.position.set(BENCH.x1 - 0.15, BENCH.h + 0.02, bench.z - BENCH.len / 2 + 0.2);
		group.add(lamp.mesh);
		lamps.push(lamp);

		const benchBox: Solid = { min: [BENCH.x0, 0, bench.z - BENCH.len / 2], max: [BENCH.x1, BENCH.h, bench.z + BENCH.len / 2] };
		const wireMat = new THREE.MeshPhysicalMaterial({ color: bench.wire, roughness: 0.4, clearcoat: 0.6 });
		const inside = hang({
			from: { at: top, out: [0, 1, 0] },
			to: { at: port, out: [-1, 0, 0] },
			r: 0.045,
			slack: 1.1,
			bend: 0.18,
			on: [floor, benchBox]
		});
		group.add(tube(inside, 0.045, wireMat, 60));
		wires.push(inside);
		const thing = OUTSIDE[bench.name](group, bench.z);
		const lead = hang({
			from: { at: far, out: [1, 0, 0], low: true },
			to: { at: thing.socket, out: [-1, 0, 0], low: true },
			via: thing.via ? [{ at: thing.via, slack: 1.04 }] : undefined,
			r: 0.045,
			slack: 1.1,
			bend: 0.12,
			on: [ledge, floor, thing.solid]
		});
		group.add(tube(lead, 0.045, wireMat, 40));
		wires.push(lead);
	});
	return { group, lamps, wires };
}

/* ---------- outside: the real things, on the ledge ---------- */

type Thing = { socket: [number, number, number]; solid: Solid; via?: [number, number, number] };
const THING_X = (PEDESTAL.x0 + PEDESTAL.x1) / 2;
const PED = { w: PEDESTAL.x1 - PEDESTAL.x0, h: PEDESTAL.h, d: PEDESTAL.d };

/** A pedestal on the ledge with a socket on its side facing the wall, for a real thing to stand on. */
function pedestal(b: Batch, z: number): Thing {
	const m = mats();
	const y0 = LEDGE.y;
	b.add(rbox(PED.w, PED.h, PED.d, 0.06, 3), m.creamLight, { p: [THING_X, y0 + PED.h / 2, z] });
	const socket: [number, number, number] = [PEDESTAL.x0, y0 + PED.h / 2, z];
	fitting(b, socket, [-1, 0, 0], 0.045, { low: true });
	return { socket, solid: { min: [PEDESTAL.x0, y0, z - PED.d / 2], max: [PEDESTAL.x1, y0 + PED.h, z + PED.d / 2] } };
}

function label(group: THREE.Group, text: string, x: number, top: number, z: number) {
	const sign = standSign(createSign(text, 0.11), 0.11, 0.18);
	sign.position.set(x, top + 0.18 + 0.11, z);
	group.add(sign);
}

const OUTSIDE: Record<(typeof BENCHES)[number]['name'], (group: THREE.Group, z: number) => Thing> = {
	/** Your files, in a folder, and behind them the checkpoints: a copy of each file from before it was edited. */
	Files(group, z) {
		const m = mats();
		const b = new Batch();
		const thing = pedestal(b, z);
		const top = LEDGE.y + PED.h;
		const folder = new THREE.MeshPhysicalMaterial({ color: '#ffc23a', roughness: 0.36, clearcoat: 0.6 });
		const folderDeep = new THREE.MeshPhysicalMaterial({ color: '#f2a91c', roughness: 0.4, clearcoat: 0.5 });
		b.add(rbox(0.6, 0.46, 0.04, 0.03, 2), folderDeep, { p: [THING_X, top + 0.23, z - 0.05] });
		b.add(rbox(0.24, 0.08, 0.04, 0.02, 2), folderDeep, { p: [THING_X - 0.17, top + 0.48, z - 0.05] });
		for (const [dx, dy] of [
			[-0.04, 0.05],
			[0.05, 0.02]
		])
			b.add(rbox(0.5, 0.4, 0.012, 0.004, 1), m.paper, { p: [THING_X + dx, top + 0.22 + dy, z - 0.02] });
		b.add(rbox(0.62, 0.38, 0.04, 0.03, 2), folder, { p: [THING_X, top + 0.19, z + 0.03], r: [-0.12, 0, 0] });
		// The checkpoints: thin cards stepping back behind the folder, one per edit.
		for (let i = 0; i < 4; i++) b.add(rbox(0.42, 0.3, 0.025, 0.01, 2), m.cream, { p: [THING_X + 0.06, top + 0.15 + i * 0.015, z - 0.15 - i * 0.05] });
		group.add(b.build('your-files'));
		label(group, 'Your files', THING_X, top + 0.52, z - 0.1);
		return thing;
	},
	/** Your shell: a terminal, inside a fence when it runs sandboxed. The wire passes through the fence in a grommet. */
	Shell(group, z) {
		const m = mats();
		const b = new Batch();
		const thing = pedestal(b, z);
		const top = LEDGE.y + PED.h;
		b.add(rbox(0.6, 0.42, 0.3, 0.06, 3), m.slate, { p: [THING_X, top + 0.29, z - 0.06] });
		b.add(rbox(0.16, 0.08, 0.12, 0.02, 2), m.slate, { p: [THING_X, top + 0.04, z - 0.06] });
		group.add(b.build('your-shell'));
		const screen = printed(0.5, 0.32, (c, w, h) => {
			c.fillStyle = '#10213a';
			roundRectPath(c, 0, 0, w, h, 14);
			c.fill();
			c.fillStyle = '#3cf08a';
			c.font = `700 ${h * 0.34}px ${font.mono}`;
			c.textBaseline = 'middle';
			c.fillText('>_', w * 0.1, h * 0.36);
		});
		screen.position.set(THING_X, top + 0.29, z + 0.092);
		group.add(screen);
		// The fence: brass posts, glass between, a rail along the top.
		const fence = new Batch();
		const H = 0.62;
		const posts: [number, number][] = [];
		for (const x of [FENCE.x0, (FENCE.x0 + FENCE.x1) / 2, FENCE.x1]) for (const zz of [FENCE.z0, FENCE.z1]) posts.push([x, zz]);
		posts.push([FENCE.x0, (FENCE.z0 + FENCE.z1) / 2], [FENCE.x1, (FENCE.z0 + FENCE.z1) / 2]);
		for (const [x, zz] of posts) fence.add(rbox(0.05, H, 0.05, 0.015, 2), m.gold, { p: [x, LEDGE.y + H / 2, zz] });
		const fw = FENCE.x1 - FENCE.x0;
		const fd = FENCE.z1 - FENCE.z0;
		for (const zz of [FENCE.z0, FENCE.z1]) fence.add(rbox(fw, 0.035, 0.035, 0.012, 2), m.gold, { p: [(FENCE.x0 + FENCE.x1) / 2, LEDGE.y + H, zz] });
		for (const x of [FENCE.x0, FENCE.x1]) fence.add(rbox(0.035, 0.035, fd, 0.012, 2), m.gold, { p: [x, LEDGE.y + H, (FENCE.z0 + FENCE.z1) / 2] });
		const grommet: [number, number, number] = [FENCE.x0, (PORT.outside + thing.socket[1]) / 2, z];
		fence.add(new THREE.TorusGeometry(0.075, 0.022, 10, 24), m.gold, { p: grommet, r: [0, Math.PI / 2, 0] });
		group.add(fence.build('shell-fence'));
		const pane = glass(0.2);
		for (const zz of [FENCE.z0, FENCE.z1]) {
			const p = new THREE.Mesh(new THREE.PlaneGeometry(fw, H - 0.04), pane);
			p.position.set((FENCE.x0 + FENCE.x1) / 2, LEDGE.y + H / 2, zz);
			group.add(p);
		}
		for (const x of [FENCE.x0, FENCE.x1]) {
			const p = new THREE.Mesh(new THREE.PlaneGeometry(fd, H - 0.04), pane);
			p.rotation.y = Math.PI / 2;
			p.position.set(x, LEDGE.y + H / 2, (FENCE.z0 + FENCE.z1) / 2);
			group.add(p);
		}
		label(group, 'Your shell', THING_X, LEDGE.y + H, FENCE.z0);
		return { ...thing, via: grommet };
	},
	/** An MCP server: a program of someone else's, running on your machine, that the harness talks to. */
	MCP(group, z) {
		const m = mats();
		const b = new Batch();
		const thing = pedestal(b, z);
		const top = LEDGE.y + PED.h;
		b.add(rbox(0.5, 0.72, 0.42, 0.07, 3), m.creamLight, { p: [THING_X, top + 0.36, z - 0.04] });
		for (let i = 0; i < 3; i++) {
			b.add(rbox(0.4, 0.12, 0.02, 0.02, 2), m.slate, { p: [THING_X, top + 0.18 + i * 0.19, z + 0.175] });
			b.add(new THREE.SphereGeometry(0.022, 10, 8), m.greenGlow, { p: [THING_X + 0.14, top + 0.18 + i * 0.19, z + 0.188] });
		}
		group.add(b.build('mcp-server'));
		label(group, 'MCP server', THING_X, top + 0.72, z - 0.1);
		return thing;
	}
};

/** The ledge outside the right wall: a step down, where your machine's own things stand. */
export function buildLedge() {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	const w = LEDGE.x1 - LEDGE.x0;
	const d = LEDGE.z1 - LEDGE.z0;
	b.add(rbox(w, 0.4, d, 0.12, 3), m.cream, { p: [(LEDGE.x0 + LEDGE.x1) / 2, LEDGE.y - 0.2, (LEDGE.z0 + LEDGE.z1) / 2] });
	group.add(b.build('ledge'));
	const sign = standSign(createSign('Your machine', 0.15), 0.15, 0.2);
	sign.position.set((LEDGE.x0 + LEDGE.x1) / 2, LEDGE.y + 0.2 + 0.15, LEDGE.z1 - 0.2);
	group.add(sign);
	return { group };
}
