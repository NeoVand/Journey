import * as THREE from 'three';
import { Batch } from '../../kit/batch';
import { extrude, rbox } from '../../kit/geometry';
import { Lamp, color, mats } from '../../kit/materials';
import { createSign, standSign } from '../../kit/parts';
import { Cart } from './acts';
import { archShape } from './checks';
import { CHILD, DOOR, LAYERS, railShape, WALL_H, type Rect } from './layout';
import { glass } from './loop';
import { clamp, inOut, lerp } from '../../kit/math';
import { SLOTS, TILE_COLOR, TURN_ONE, type TileKind } from './tiles';
import type { Nest } from './turns';

/** How far along a curve (0 to 1) is the point nearest (x, z). */
function nearestU(c: THREE.Curve<THREE.Vector3>, x: number, z: number) {
	const pts = c.getSpacedPoints(400);
	let best = 0;
	let d = Infinity;
	pts.forEach((q, i) => {
		const e = (q.x - x) ** 2 + (q.z - z) ** 2;
		if (e < d) [d, best] = [e, i];
	});
	return best / (pts.length - 1);
}

/*
 * The subagent: the room again, in small. Its own tray, drawers, tube and chute, gate, rail and benches, and in the
 * middle of its front, its own subagent: the room again, smaller still. Three layers below the main conversation, and
 * the last has no room inside, because at the limit the harness takes the subagent tool away.
 *
 * Each small room is laid out by the parts of its width (u) and depth (v), so all three are drawn by the same code.
 */

/** What each room's tray comes to hold: the brief as its prompt, a reply with one call, the result, and its report. */
const TRAY: TileKind[] = [...TURN_ONE, 'text', 'call', 'result', 'text'];
/** Before its brief arrives, a room's tray holds what every request starts with. */
const STANDING_TILES = TURN_ONE.length - 1;

const tileMats = new Map<string, THREE.Material>();
const tileMat = (kind: TileKind) => {
	let m = tileMats.get(kind);
	if (!m) tileMats.set(kind, (m = new THREE.MeshPhysicalMaterial({ color: TILE_COLOR[kind], roughness: 0.34, clearcoat: 0.8 })));
	return m;
};
const flats = new Map<string, THREE.Material>();
const flat = (hex: string) => {
	let m = flats.get(hex);
	if (!m) flats.set(hex, (m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5 })));
	return m;
};

export class SubRoom {
	group = new THREE.Group();
	/** Its own cart, on its own rail. */
	cart: Cart;
	rail: THREE.Curve<THREE.Vector3>;
	beacon: Lamp;
	/** Its tray's tiles, shown as they arrive; its capsule; the two tiles of its reply, in its chute. */
	private tiles: THREE.InstancedMesh;
	private pill: THREE.Mesh;
	private drops: THREE.Mesh[] = [];
	private pillAt: THREE.Vector3;
	private chuteAt: THREE.Vector3;
	/** Where its cart waits, and where it goes: the next room's door, or (in the last room) a bench. */
	private homeU = 0;
	private farU = 1;
	private carry: THREE.Mesh;
	private p = new THREE.Vector3();
	private tan = new THREE.Vector3();
	/** The room inside it, unless this is the last layer. */
	child: SubRoom | null = null;
	/** How tall its walls are, and what one unit of the big room is in it. */
	readonly H: number;
	readonly k: number;

	constructor(
		readonly rect: Rect,
		readonly layer: number,
		base = 0
	) {
		const m = mats();
		const Wm = rect.x1 - rect.x0;
		const Dm = rect.z1 - rect.z0;
		const k = (this.k = Wm / 14.4);
		const H = (this.H = Wm * 0.32);
		const hk = H / WALL_H;
		const wt = Math.max(0.014, 0.4 * k);
		const ft = Math.max(0.006, 0.06 * k);
		const y0 = base + ft;
		const X = (u: number) => rect.x0 + u * Wm;
		const Z = (v: number) => rect.z0 + v * Dm;
		const cx = X(0.5);
		const cz = Z(0.5);
		const b = new Batch();

		/* ---- the floor and three walls, with a doorway at the right wall's front, where its parent's rail comes in ---- */
		b.add(rbox(Wm + wt * 2, ft, Dm + wt, Math.min(0.2 * k, ft * 0.49), 2), m.creamLight, { p: [cx, base + ft / 2, cz - wt / 2] });
		const wall = (w: number, h: number, d: number, p: [number, number, number]) => b.add(rbox(w, h, d, Math.min(0.12 * k * 3, wt * 0.45), 2), m.cream, { p });
		wall(Wm + wt * 2, H, wt, [cx, y0 + H / 2, rect.z0 - wt / 2]);
		wall(wt, H, Dm, [rect.x0 - wt / 2, y0 + H / 2, cz]);
		wall(wt, H, DOOR.v0 * Dm, [rect.x1 + wt / 2, y0 + H / 2, Z(DOOR.v0 / 2)]);
		wall(wt, H, (1 - DOOR.v1) * Dm, [rect.x1 + wt / 2, y0 + H / 2, Z((1 + DOOR.v1) / 2)]);
		const lintel = H * 0.34;
		wall(wt, lintel, (DOOR.v1 - DOOR.v0) * Dm + 0.002, [rect.x1 + wt / 2, y0 + H - lintel / 2, Z((DOOR.v0 + DOOR.v1) / 2)]);
		b.add(rbox(wt + 0.01, Math.max(0.01, 0.06 * k), (DOOR.v1 - DOOR.v0) * Dm, 0.004, 1), m.gold, { p: [rect.x1 + wt / 2, y0 + H - lintel, Z((DOOR.v0 + DOOR.v1) / 2)] });

		/* ---- remembers: the tray, its drawers and shelf on the back wall ---- */
		const tx0 = X(0.18);
		const tw = 0.61 * Wm;
		const tz = Z(0.15);
		const td = 0.1 * Dm;
		const hb = 0.36 * k;
		b.add(rbox(tw, hb, td, Math.min(0.1 * k, hb * 0.45), 2), m.porcelain, { p: [tx0 + tw / 2, y0 + hb / 2, tz] });
		const pitch = (tw * 0.95) / SLOTS;
		const tile = { w: pitch * 0.82, h: 0.26 * k, d: td * 0.5 };
		this.tiles = new THREE.InstancedMesh(
			rbox(tile.w, tile.h, tile.d, Math.min(0.035 * k, tile.w * 0.3), 2),
			new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.34, clearcoat: 0.8 }),
			TRAY.length
		);
		const m4 = new THREE.Matrix4();
		const c = new THREE.Color();
		TRAY.forEach((kind, i) => {
			this.tiles.setMatrixAt(i, m4.makeTranslation(tx0 + tw * 0.02 + (i + 0.5) * pitch, y0 + hb + tile.h / 2, tz));
			this.tiles.setColorAt(i, c.set(TILE_COLOR[kind]));
		});
		this.tiles.count = STANDING_TILES;
		this.tiles.castShadow = true;
		this.group.add(this.tiles);
		// The end stop and its housing.
		b.add(rbox(0.08 * k, 0.56 * k, td * 0.8, 0.02 * k, 2), m.gold, { p: [tx0 + tw - 0.04 * k, y0 + hb + 0.1 * k, tz] });
		b.add(rbox(0.74 * k, 0.66 * k, td, 0.1 * k, 2), m.creamLight, { p: [tx0 + tw + 0.45 * k, y0 + 0.33 * k, tz] });
		// The four drawers, hatches stacked on the back wall: each with its part's colour, and a lamp.
		const dw = 0.21 * Wm;
		const dx = X(0.285);
		const face = rect.z0 + Math.max(0.008, 0.14 * k);
		(['instructions', 'environment', 'tools', 'text'] as TileKind[]).forEach((kind, i) => {
			const y = y0 + H * [0.81, 0.656, 0.5, 0.344][i];
			b.add(rbox(dw, 0.128 * H, Math.max(0.012, 0.16 * k), 0.04 * k, 2), m.creamLight, { p: [dx, y, face - Math.max(0.004, 0.04 * k)] });
			b.add(rbox(dw * 0.16, 0.07 * H, Math.max(0.006, 0.04 * k), 0.02 * k, 2), tileMat(kind), { p: [dx - dw * 0.34, y, face + Math.max(0.004, 0.04 * k)] });
			b.add(rbox(dw * 0.4, 0.025 * H, Math.max(0.004, 0.03 * k), 0.01 * k, 2), flat('#8b7a5c'), { p: [dx, y, face + Math.max(0.003, 0.035 * k)] });
			b.add(rbox(dw * 0.05, 0.035 * H, Math.max(0.006, 0.04 * k), 0.01 * k, 2), m.amber, { p: [dx + dw * 0.4, y, face + Math.max(0.004, 0.04 * k)] });
		});
		// The skill shelf.
		const sx = X(0.685);
		b.add(rbox(0.17 * Wm, 0.08 * k, 0.42 * k, 0.03 * k, 2), m.gold, { p: [sx, y0 + 2.0 * hk, rect.z0 + 0.21 * k] });
		for (let i = 0; i < 5; i++) b.add(rbox(0.38 * k, 0.52 * k, 0.06 * k, 0.02 * k, 2), m.cream, { p: [sx + (i - 2) * 0.47 * k, y0 + 2.0 * hk + 0.3 * k, rect.z0 + 0.24 * k] });
		// The record's slot to the disk.
		b.add(rbox(0.8 * k, 0.3 * k, Math.max(0.008, 0.06 * k), 0.03 * k, 2), m.recess, { p: [X(0.84), y0 + 1.35 * hk, rect.z0 + 0.01 * k] });

		/* ---- the loop: the tube in the back-right corner, the chute in the back-left ---- */
		const tr = 0.6 * k;
		const tubeX = rect.x1 - tr * 1.33;
		const tubeZ = rect.z0 + tr * 1.17;
		b.add(new THREE.CylinderGeometry(tr + 0.12 * k, tr + 0.14 * k, 0.2 * k, 32), m.creamLight, { p: [tubeX, y0 + 0.1 * k, tubeZ] });
		for (const y of [0.95 * k, H, H * 1.15]) b.add(new THREE.CylinderGeometry(tr + 0.05 * k, tr + 0.05 * k, 0.1 * k, 32, 1, true), m.gold, { p: [tubeX, y0 + y, tubeZ] });
		// Its capsule rests in its tube's foot, standing up, ready to go.
		this.pillAt = new THREE.Vector3(tubeX, y0 + 0.2 * k + 0.42 * k, tubeZ);
		this.pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * k, 0.44 * k, 6, 16), flat('#7fb2f0'));
		this.pill.position.copy(this.pillAt);
		this.group.add(this.pill);
		const chute = { w: 0.75 * k, d: 1.05 * k };
		b.add(rbox(chute.w, 0.95 * k, chute.d, 0.06 * k, 2), m.creamLight, { p: [rect.x0 + chute.w / 2, y0 + 0.475 * k, rect.z0 + chute.d / 2] });
		// The two tiles of its reply, that come down its chute.
		this.chuteAt = new THREE.Vector3(rect.x0 + chute.w / 2, y0 + 0.95 * k + 0.17 * k, rect.z0 + chute.d / 2);
		for (const kind of ['text', 'call'] as TileKind[]) {
			const drop = new THREE.Mesh(rbox(0.14 * k * 1.6, 0.26 * k * 1.3, 0.56 * k, 0.03 * k, 2), tileMat(kind));
			drop.visible = false;
			this.drops.push(drop);
			this.group.add(drop);
		}
		// The pad at the tray's start, where the reply lands.
		b.add(rbox(1.35 * k, 0.14 * k, 0.8 * k, 0.05 * k, 2), m.creamLight, { p: [tx0 - 0.7 * k, y0 + 0.07 * k, Z(0.2)] });

		/* ---- checks: the gate, and your screen in the left wall ---- */
		const gx = X(0.138);
		const gz = Z(0.4);
		const arch = archShape(1.5 * k, 2.15 * k, 0.36 * k, 1.55 * k);
		const slab = extrude(arch.outline, 0.2 * k, 0.04 * k, 2, 12);
		for (const s of [-1, 1]) b.add(slab, m.creamLight, { p: [gx, y0, gz + s * 0.4 * k] });
		b.add(rbox(1.44 * k, 0.55 * k, 0.64 * k, 0.03 * k, 2), m.cream, { p: [gx, y0 + 1.85 * k, gz] });
		b.add(rbox(0.36 * k, 2.1 * k, 0.64 * k, 0.03 * k, 2), m.cream, { p: [gx - 0.57 * k, y0 + 1.05 * k, gz] });
		[color.green, color.amber, color.red].forEach((hex, i) => b.add(new THREE.SphereGeometry(0.075 * k, 12, 8), flat(hex), { p: [gx + (i - 1) * 0.3 * k, y0 + 1.87 * k, gz + 0.5 * k] }));
		const sy0 = (1.4 / WALL_H) * H;
		const sy1 = (3.2 / WALL_H) * H;
		b.add(rbox(Math.max(0.008, 0.06 * k), sy1 - sy0 + 0.2 * k, 0.2 * Dm + 0.2 * k, 0.03 * k, 2), m.gold, { p: [rect.x0 + 0.02 * k, y0 + (sy0 + sy1) / 2, Z(0.4)] });
		b.add(rbox(Math.max(0.01, 0.08 * k), sy1 - sy0, 0.2 * Dm, 0.02 * k, 2), flat('#1c2b45'), { p: [rect.x0 + 0.04 * k, y0 + (sy0 + sy1) / 2, Z(0.4)] });

		/* ---- acts: the rail, and three benches against the right wall ---- */
		const railR = 0.45 * k;
		const xr = X(0.89);
		const zw = Z(DOOR.v);
		const last = layer >= LAYERS;
		const to = last ? X(0.72) : X(CHILD.u1) + 0.02 * k;
		this.rail = railShape({ from: gx, z: gz, x: xr, west: zw, to, r: railR, y: y0 });
		const rr = Math.max(0.006, 0.035 * k);
		const lifted = new THREE.CatmullRomCurve3(this.rail.getSpacedPoints(160).map((p) => p.clone().setY(y0 + rr * 1.6)));
		b.add(new THREE.TubeGeometry(lifted, 240, rr, 8), m.gold);
		// From the doorway in to the rail's corner: the parent's rail comes in here.
		b.add(rbox(rect.x1 + wt - (xr - railR), rr * 2, rr * 2, rr * 0.9, 1), m.gold, { p: [(rect.x1 + wt + xr - railR) / 2, y0 + rr * 1.6, zw] });
		if (last) {
			// The last layer's rail stops at a buffer: there is no room inside this one.
			b.add(rbox(0.3 * k, 0.4 * k, 0.6 * k, 0.06 * k, 2), m.red, { p: [to - 0.15 * k, y0 + 0.2 * k, zw] });
		}
		[0.5, 0.64, 0.78].forEach((v) => {
			const bx = X(0.9525);
			const bz = Z(v);
			b.add(rbox(0.69 * k, 0.1 * k, 1.04 * k, 0.03 * k, 2), m.slate, { p: [bx, y0 + 0.05 * k, bz] });
			b.add(rbox(0.65 * k, 0.52 * k, 1.0 * k, 0.07 * k, 2), m.creamLight, { p: [bx, y0 + 0.36 * k, bz] });
			b.add(rbox(0.22 * k, 0.04 * k, 0.22 * k, 0.02 * k, 2), tileMat('call'), { p: [bx, y0 + 0.64 * k, bz - 0.15 * k] });
			b.add(rbox(0.22 * k, 0.04 * k, 0.22 * k, 0.02 * k, 2), tileMat('result'), { p: [bx, y0 + 0.64 * k, bz + 0.15 * k] });
		});
		this.group.add(b.build(`subagent-${layer}`));

		// The glass: the tube, the chute's shaft, and the frosted cover over what's cached.
		const pane = glass(0.18);
		const tubeGlass = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr, H * 1.15 - 0.2 * k, 32, 1, true), pane);
		tubeGlass.position.set(tubeX, y0 + 0.2 * k + (H * 1.15 - 0.2 * k) / 2, tubeZ);
		const shaft = new THREE.Mesh(new THREE.BoxGeometry(chute.w * 0.96, H * 1.1 - 0.95 * k, chute.d * 0.96), pane);
		shaft.position.set(rect.x0 + chute.w / 2, y0 + 0.95 * k + (H * 1.1 - 0.95 * k) / 2, rect.z0 + chute.d / 2);
		const cover = new THREE.Mesh(rbox(STANDING_TILES * pitch + 0.08 * k, tile.h + 0.14 * k, tile.d + 0.18 * k, 0.06 * k, 2), glass(0.24));
		cover.position.set(tx0 + tw * 0.02 + (STANDING_TILES * pitch) / 2, y0 + hb + tile.h / 2 + 0.02 * k, tz);
		tubeGlass.renderOrder = shaft.renderOrder = cover.renderOrder = 3;
		this.group.add(tubeGlass, shaft, cover);
		this.beacon = new Lamp(new THREE.SphereGeometry(0.15 * k, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), color.green, 0.18);
		this.beacon.mesh.position.set(gx, y0 + 2.15 * k, gz);
		this.group.add(this.beacon.mesh);

		this.cart = new Cart();
		this.cart.group.scale.setScalar(k);
		this.cart.card.visible = false;
		this.group.add(this.cart.group);
		// What it brings back: the result, a jade tile on its deck.
		this.carry = new THREE.Mesh(rbox(0.56, 0.26, 0.135, 0.035, 2), tileMat('result'));
		this.carry.position.set(0, Cart.deck + 0.13, 0);
		this.carry.visible = false;
		this.cart.group.add(this.carry);
		// Its cart waits in its gate; it goes to the next room's door, or in the last room to its middle bench.
		this.homeU = 0;
		// Short of the next room's door, which is too narrow for it: the brief goes in on its own.
		this.farU = last ? nearestU(this.rail, X(0.9525) - 0.4 * k, Z(0.64)) : nearestU(this.rail, X(CHILD.u1) + 0.5 * k, zw);
		this.cartTo(this.homeU);

		if (layer === 1) {
			const sign = standSign(createSign('Subagent', 0.18), 0.18, 0.14);
			sign.position.set(cx, y0 + H + 0.14 + 0.18, rect.z0 - wt / 2);
			this.group.add(sign);
		}
		if (!last) {
			const child: Rect = { x0: X(CHILD.u0), x1: X(CHILD.u1), z0: Z(CHILD.v0), z1: Z(CHILD.v1) };
			this.child = new SubRoom(child, layer + 1, y0);
			this.group.add(this.child.group);
		}
	}

	/** Its cart at u along its rail, facing the way the rail runs. */
	private cartTo(u: number) {
		this.rail.getPointAt(clamp(u), this.p);
		this.rail.getTangentAt(clamp(u), this.tan);
		this.cart.group.position.copy(this.p);
		this.cart.group.rotation.set(0, Math.atan2(-this.tan.z, this.tan.x), 0);
	}

	/**
	 * This room at work, at trip time t, by its part of the trip's script: the brief arrives as its prompt, its capsule
	 * goes up and comes back, two tiles come down its chute, its gate lets the call through, its cart takes it on and
	 * brings the result back, and its report is the last thing in its tray. Then its child, if it has one.
	 */
	pose(t: number, nests: readonly Nest[]) {
		const n = nests.find((x) => x.layer === this.layer);
		this.child?.pose(t, nests);
		if (!n) return;
		// Its tray: what every request starts with, then each arrival in turn.
		const shown = t < n.brief ? STANDING_TILES : t < n.reply ? 4 : t < n.result ? 6 : t < n.report ? 7 : 8;
		this.tiles.count = shown;
		// Its capsule goes up and comes back down, empty.
		const up = clamp((t - n.send[0]) / (n.send[1] - n.send[0]));
		this.pill.position.copy(this.pillAt);
		this.pill.position.y += Math.sin(up * Math.PI) * this.H * 1.4;
		this.pill.visible = up < 0.4 || up > 0.6 || this.pill.position.y < this.pillAt.y + this.H * 1.15;
		// Its reply: two tiles drop down its chute's shaft, one after the other, and are gone into its foot.
		this.drops.forEach((drop, i) => {
			const a = n.send[1] + i * 0.005;
			const f = (t - a) / (n.reply - 0.004 - a);
			drop.visible = f > 0 && f < 1;
			drop.position.copy(this.chuteAt);
			drop.position.y += (1 - f * f) * this.H * 0.9;
		});
		// Its gate's beacon: bright as the call is let through.
		const lit = clamp(1 - Math.abs(t - n.gate - 0.006) / 0.012);
		this.beacon.set(color.green, 0.18 + lit * 0.8);
		// Its cart: out with the call, waits while the work is done, and back with the result.
		let u = this.homeU;
		if (t >= n.out[0] && t < n.out[1]) u = lerp(this.homeU, this.farU, inOut((t - n.out[0]) / (n.out[1] - n.out[0])));
		else if (t >= n.out[1] && t < n.back[0]) u = this.farU;
		else if (t >= n.back[0] && t < n.back[1]) u = lerp(this.farU, this.homeU, inOut((t - n.back[0]) / (n.back[1] - n.back[0])));
		this.cartTo(u);
		this.cart.card.visible = t >= n.gate && t < n.out[1] + 0.002;
		this.carry.visible = t >= n.back[0] - 0.002 && t < n.result;
		this.cart.wheels.forEach((w) => (w.rotation.y = -u * 40));
	}
}
