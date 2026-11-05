import * as THREE from 'three';
import { Batch } from './kit/batch';
import { rbox } from './kit/geometry';
import { mats } from './kit/materials';
import { contactShadow } from './kit/print';
import { createSign } from './kit/parts';
import { inOut, lerp, seg, smooth } from './kit/math';
import { createBoard, createPad, createRacks } from './props/board';
import { BlockTray } from './props/tray';
import { KvCache } from './props/kv';
import { BatchLanes, STEPS } from './props/lanes';
import { Router, ROUTER_PAD, ROUTER_X } from './props/router';
import { Node3D } from './props/node';
import { Pools } from './props/pools';
import { createBelt, Tile, TILE_H } from './props/tokenizer';
import { TOKENS } from './content';
import type { Shot } from './rig';
import { ORIGIN, PAD_Y, RAIL_Y, RAIL_Z } from './layout';
import { Forward, FORWARD_SHOTS } from './chapters/forward';
import type { HarnessId } from './content';

export const DIVE_T = 8;
const DARKEST = 13.98; // the dive into the prefill chip, fully under its veil
const ZONE = { node: 0, kv: 30, tray: 60, lanes: 90, pools: 120 };

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [ORIGIN.x + x, ORIGIN.y + y, ORIGIN.z + z];
const TALL = box(0, 0.06, 1, 0.47);

const NODE: Omit<Shot, 'T'> = { az: 13, el: 36, target: at(0, 1.3, 1), radius: 8.2, ry: 5.0, wide: box(0.36, 0.06, 0.62, 0.9), tall: TALL };
const KV: Omit<Shot, 'T'> = { az: -9, el: 13, target: at(ZONE.kv + 2.5, 2.6, 2), radius: 6.2, ry: 3.3, wide: box(0.38, 0.08, 0.6, 0.86), tall: TALL };
const TRAY: Omit<Shot, 'T'> = { az: -5, el: 40, target: at(ZONE.tray - 2.3, 0.8, 1.6), radius: 10, ry: 5.0, wide: box(0.4, 0.08, 0.59, 0.86), tall: TALL };
const ROUTER: Omit<Shot, 'T'> = { az: -26, el: 25, target: at(ROUTER_X + 1, 0.9, 3), radius: 7.6, ry: 4.7, wide: box(0, 0.1, 0.57, 0.82), tall: TALL, tallTarget: at(ROUTER_X + 1, 1.7, 2.6) };
const TURN2: Omit<Shot, 'T'> = { az: 6, el: 36, target: at(ZONE.tray - 2, 0.9, 2.4), radius: 9.8, ry: 5.0, wide: box(0, 0.12, 0.57, 0.84), tall: TALL };
const LANES: Omit<Shot, 'T'> = { az: 9, el: 44, target: at(ZONE.lanes, 0.9, -0.5), radius: 9.1, ry: 5.2, wide: box(0.44, 0.06, 0.55, 0.9), tall: TALL, tallRadius: 9.5 };
const POOLS: Omit<Shot, 'T'> = { az: -7, el: 13, target: at(ZONE.pools, 2.1, 1.2), radius: 8.9, ry: 3.6, wide: box(0, 0.1, 0.6, 0.82), tall: TALL };
// One chip in the prefill pool, high enough that the way in passes over the sign and the table, not through them.
const INTO: Omit<Shot, 'T'> = { az: -2, el: 7, target: at(ZONE.pools - 6.51, 2.4, 1.6), radius: 3.4, ry: 2.4, wide: box(0.1, 0.1, 0.8, 0.8), tall: box(0, 0.08, 1, 0.84) };

export const CLUSTER_SHOTS: Shot[] = [
	{ T: 8.04, ...NODE, az: 22, el: 52, radius: 9 },
	{ T: 8.2, ...NODE },
	{ T: 8.66, ...NODE, az: 8, el: 32 },
	{ T: 8.8, ...NODE, az: 12, el: 44, target: at(1.6, 0.5, -0.4), radius: 3.6, ry: 2.5 },
	{ T: 9.04, ...KV },
	{ T: 9.9, ...KV, az: -5 },
	{ T: 10.04, ...TRAY },
	{ T: 10.84, ...TRAY, az: -3 },
	{ T: 11.02, ...ROUTER },
	{ T: 11.28, ...ROUTER, az: -22 },
	{ T: 11.4, ...TURN2 },
	{ T: 11.86, ...TURN2, az: 4 },
	{ T: 12.04, ...LANES },
	{ T: 12.9, ...LANES, az: 5 },
	{ T: 13.06, ...POOLS },
	{ T: 13.8, ...POOLS, az: -4 },
	{ T: 13.9, ...INTO },
	{ T: 13.975, ...INTO, az: 0, el: 3, radius: 0.5, ry: 0.36 },
	...FORWARD_SHOTS
];

/** The inside of the machine. All coordinates are local to `group`. */
export class Cluster {
	group = new THREE.Group();
	private node = new Node3D();
	private kv = new KvCache();
	private tray: BlockTray;
	private lanes = new BatchLanes();
	private router = new Router(RAIL_Z, RAIL_Y - PAD_Y);
	private pools = new Pools();
	private tiles: Tile[] = TOKENS.map((t) => new Tile(t));
	private offsets: number[] = [];
	private rowLen = 0;
	private fabric: THREE.MeshStandardMaterial;
	private forward = new Forward();
	/** Everything before the dive into the prefill chip. Once we are in there, none of it can still be in view. */
	private before = new THREE.Group();

	constructor() {
		this.group.position.copy(ORIGIN);
		const g = this.group;
		g.add(createBoard(-40, 330, -18, 9.5));
		g.add(createRacks(-70, 380, -30));

		const before = this.before;
		g.add(before);
		const stand = (x: number, z: number, w: number, d: number, what: THREE.Object3D, wx = 0, wz = 0) => {
			const pad = createPad(w, d);
			pad.position.set(x, PAD_Y, z);
			before.add(pad);
			what.position.set(x + wx, PAD_Y, z + wz);
			before.add(what);
		};
		const shadow = (x: number, z: number, w: number, d: number, o = 0.42) => {
			const c = contactShadow(w, d, 0.16, o);
			c.position.set(x, PAD_Y + 0.006, z);
			before.add(c);
		};

		// The same belt that carried the tiles in the sky, running the length of the machine.
		const belt = createBelt(-38, 320);
		belt.position.set(0, RAIL_Y, RAIL_Z);
		g.add(belt);

		// Node, with one more directly behind it, joined by a straight run of cable.
		stand(0, -5, 16.2, 19.4, this.node.group, 0, 5);
		shadow(0, 0, 14.2, 7.4);
		const far = this.node.farCopy();
		far.position.set(0, PAD_Y, -10);
		before.add(far);
		shadow(0, -10, 14.2, 7.4);

		this.fabric = new THREE.MeshStandardMaterial({ color: '#2a78ff', emissive: '#2a78ff', emissiveIntensity: 0.8, roughness: 0.4 });
		const m = mats();
		const link = new Batch();
		for (const x of [-2.1, -0.7, 0.7, 2.1]) {
			link.add(rbox(0.14, 0.1, 3.2, 0.04, 2), this.fabric, { p: [x, PAD_Y + 0.15, -5] });
			for (const z of [-3.56, -6.44]) link.add(rbox(0.4, 0.26, 0.34, 0.06, 3), m.steel, { p: [x, PAD_Y + 0.15, z] });
		}
		before.add(link.build('fabric'));
		const fabricSign = createSign('InfiniBand', 0.2);
		fabricSign.position.set(0, PAD_Y + 0.62, -5);
		fabricSign.rotation.x = -0.5;
		before.add(fabricSign);

		// KV cache.
		stand(ZONE.kv + 2.6, 0, 13.4, 6.6, this.kv.group, -2.6, 0);
		shadow(ZONE.kv, 0, 4.6, 2.6);
		shadow(ZONE.kv + 5.2, 0, 4.1, 2.9);

		let cursor = 0;
		this.tiles.forEach((t) => {
			this.offsets.push(cursor);
			cursor += t.width + 0.07;
			before.add(t.group);
		});
		this.rowLen = cursor;

		// Tray.
		this.tray = new BlockTray(RAIL_Z - 0, RAIL_Y - PAD_Y);
		stand(ZONE.tray - 2.3, 0, 19, 8.8, this.tray.group, 2.3, 0);
		shadow(ZONE.tray, 0, 12, 3.9);

		stand(ROUTER_X, 0, ROUTER_PAD, 8.8, this.router.group);
		stand(ZONE.lanes, -0.4, 17.4, 11, this.lanes.group, 0, 0.4);
		stand(ZONE.pools, 0.8, 19.6, 8.2, this.pools.group, 0, -0.8);
		g.add(this.forward.group);
	}

	setHarness(id: HarnessId) {
		this.forward.setHarness(id);
	}

	setTemperature(temperature: number) {
		this.forward.setTemperature(temperature);
	}

	spinWheel(reduced: boolean) {
		return this.forward.spinWheel(reduced);
	}

	get wheelDisc() {
		return this.forward.wheelDisc;
	}

	update(T: number, time: number) {
		this.forward.update(T, time);
		// Things leave the frame when the camera leaves them. The one exception is the dive, under the veil at its darkest.
		this.before.visible = T < DARKEST;
		if (T < 9.1) this.node.update(smooth(seg(T, 8.06, 8.22)), seg(T, 8.26, 8.7), seg(T, 8.62, 8.74), time);
		this.fabric.emissiveIntensity = 0.7 + Math.sin(time * 3) * 0.3;

		// The token row rides the belt from the node to the attention machine, and in.
		const rideK = inOut(seg(T, 8.5, 9.1));
		const feed = seg(T, 9.1, 9.56) * this.rowLen * 1.04;
		const end = ZONE.kv + 5.2;
		const rowX = lerp(end - this.rowLen - 34, end - this.rowLen - 2, rideK) + feed;
		const rowOn = T > 8.5 && T < 9.98;
		this.tiles.forEach((tile, i) => {
			tile.update(1, 1);
			const x = rowX + this.offsets[i] + tile.width / 2;
			tile.group.position.set(x, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
			tile.group.visible = rowOn;
		});

		if (T > 8.9 && T < 10.3) this.kv.update(seg(T, 9.1, 9.56), seg(T, 9.58, 9.9), time);
		if (T > 8.9 && T < 12.3) {
			this.tray.update(seg(T, 10.12, 10.62), seg(T, 11.03, 11.14), seg(T, 11.3, 11.41), seg(T, 11.41, 11.7), seg(T, 11.7, 11.86), time);
		}
		if (T < 12.3) this.router.update(seg(T, 11.12, 11.18), seg(T, 11.17, 11.3));
		if (T > 11.8 && T < 13.2) this.lanes.update(seg(T, 12.08, 12.92) * STEPS);
		if (T > 12.8 && T < 14.1) this.pools.update(seg(T, 13.08, 13.3), seg(T, 13.28, 13.44), seg(T, 13.4, 13.74), seg(T, 13.46, 13.68), seg(T, 13.7, 13.76), time);
	}
}
