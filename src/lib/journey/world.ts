import * as THREE from 'three';
import { Stage } from './stage';
import { Rig, type Shot } from './rig';
import { bell, inOut, lerp, outBack, outCubic, seg, smooth, smoother, spring } from './kit/math';
import { contactShadow, Label, loadFonts } from './kit/print';
import { extrude, frameAt, rbox, roundedRect, sweep } from './kit/geometry';
import { mats, color } from './kit/materials';
import { Batch } from './kit/batch';
import { createCastShadow, createIsland } from './props/island';
import { Laptop } from './props/laptop';
import { McpServer } from './props/mcp';
import { Brain, BRAIN_SEAT } from './props/brain';
import { Harness, HW, PORT_KEYS_Z, PORT_MCP_Z, PORT_OUT_Z, PORT_Y } from './props/harness';
import { createEasel, DOC_H, RequestDoc, SLOT_Y, Strip } from './props/request';
import { createTunnelStand, Tunnel } from './props/tunnel';
import { Gateway, GW } from './props/gateway';
import { createBelt, createChatTemplate, Gantry, Tile, TILE_D, TILE_H } from './props/tokenizer';
import { HARNESSES, PROMPT, TOKENS, type HarnessId } from './content';
import { Cluster, CLUSTER_SHOTS, DIVE_T } from './cluster';
import { RETURN_POINTS } from './layout';
import { Back, BACK_SHOTS } from './chapters/back';

export const EXIT_T = 19;

/* ---------- layout: one world descending through the sky, every position derived from these ---------- */
const LINE_Z = 0.9;
const TUNNEL_X = 9.6;
const TUNNEL_L = 4.8;
const TUNNEL_Y = -6;
const ISLET_Y = -7.6;
const ISLAND_B_Y = -8.4;
const GATEWAY_X = TUNNEL_X + TUNNEL_L + 0.04 + GW / 2;
const ISLAND_C_Y = -17;
const BELT_Y = ISLAND_C_Y + 0.5;
const TEMPLATE_X = -3.4;
const SLOT_X = TEMPLATE_X + 1.06;
const BELT_END = 10.7;
const DARK = '#060f26'; // the inside of the machine, and the colour of the fade
const REST = 66; // tiles behind the named ones, and their spacing
const REST_GAP = 0.54;
const ROW_START = SLOT_X + 0.9;

const HARNESS_POS = new THREE.Vector3(1.1, 0, -0.65);
const DOC_POS = new THREE.Vector3(5.75, 0.2 + DOC_H / 2, LINE_Z);
const DOC_TILT = -0.13;
const ROLL_AXIS = 1.45; // how far below the page's centre the finished roll lies
const STRIPS_PRINTED = 3.62;

/* ---------- beat timeline. T counts sections; see Journey.svelte for the mapping ---------- */
export const HOLD = { type: [1.02, 1.56], send: [1.56, 1.66] };

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const hold = (from: number, to: number, shot: Omit<Shot, 'T'>, drift: Partial<Omit<Shot, 'T'>> = {}): Shot[] => [
	{ T: from, ...shot },
	{ T: to, ...shot, ...drift }
];

const HERO = { az: 29, el: 17, target: [1.9, 1.35, 0.4] as [number, number, number], radius: 6.25, wide: box(0.4, 0.02, 0.61, 0.94), tall: box(0, 0.42, 1, 0.56) };
const LAPTOP = { az: 13, el: 14, target: [-3.25, 1.12, 0.35] as [number, number, number], radius: 2.3, wide: box(0.42, 0.1, 0.56, 0.84), tall: box(0.02, 0.08, 0.96, 0.5) };
const ASSEMBLY = { az: 27, el: 17, target: [3.1, 1.9, 0.6] as [number, number, number], radius: 4.7, ry: 4.15, wide: box(0.0, 0.14, 0.58, 0.86), tall: box(0.02, 0.07, 0.96, 0.46) };
const REQUEST = { az: 7, el: 7, target: [5.75, 1.78, 0.95] as [number, number, number], radius: 2.05, wide: box(0.12, 0.08, 0.46, 0.86), tall: box(0.05, 0.07, 0.9, 0.5) };
const WIRE = { az: -24, el: 11, target: [11.9, -5.7, 0.9] as [number, number, number], radius: 3.9, wide: box(0.38, 0.12, 0.62, 0.8), tall: box(0, 0.1, 1, 0.44) };
const DOOR = { az: 22, el: 9, target: [GATEWAY_X, -6.7, 1.0] as [number, number, number], radius: 3.1, wide: box(0.03, 0.1, 0.5, 0.88), tall: box(0.02, 0.06, 0.96, 0.5) };
const TOKENS_SHOT = { tallTarget: [8.2, -16.42, 0.9] as [number, number, number], tallRadius: 2.7, az: 3, el: 38, target: [3.2, -16.42, 0.9] as [number, number, number], radius: 7.95, ry: 1.8, wide: box(0.03, 0.44, 0.94, 0.5), tall: box(0, 0.1, 1, 0.42) };
const CUT = {
	az: 11,
	el: 36,
	target: [3, -16.1, 0.9] as [number, number, number],
	radius: 3.5,
	ry: 1.75,
	wide: box(0.05, 0.46, 0.9, 0.5),
	tall: box(0, 0.1, 1, 0.42),
	tallTarget: [-0.6, -16.42, 0.9] as [number, number, number],
	tallRadius: 2.7
};
const NEXT = { az: 18, el: 22, target: [7.6, -18.0, 5.5] as [number, number, number], radius: 6.2, wide: box(0.38, 0.06, 0.6, 0.88), tall: box(0, 0.06, 1, 0.5) };
const INTAKE = { az: 26, el: 38, target: [1.4, -25.9, 1.0] as [number, number, number], radius: 3.3, ry: 2.3, wide: box(0.38, 0.08, 0.62, 0.84), tall: box(0, 0.08, 1, 0.48) };
const ARRIVE = { az: 24, el: 25, target: [0.8, -30.6, 1.2] as [number, number, number], radius: 10, ry: 8.6, wide: box(0.38, 0.03, 0.62, 0.92), tall: box(0, 0.05, 1, 0.5) };

const SHOTS: Shot[] = [
	...hold(0, 0.5, HERO),
	...hold(1, 1.6, LAPTOP),
	...hold(2, 2.74, ASSEMBLY, { az: 24, radius: 4.6, ry: 4.05 }),
	...hold(3, 3.58, REQUEST, { az: 11 }),
	...hold(4, 4.64, WIRE, { az: 20, el: 13, target: [12.3, -5.7, 0.9] }),
	...hold(5, 5.64, DOOR, { az: 18 }),
	{ T: 6, ...CUT, target: [-0.3, -16.1, 0.9] },
	{ T: 6.16, ...CUT, target: [-0.3, -16.1, 0.9] },
	{ T: 6.56, ...CUT, target: [7.1, -16.1, 0.9], az: 7, tallTarget: [8.2, -16.42, 0.9] },
	...hold(6.68, 6.8, TOKENS_SHOT, { az: 1 }),
	{ T: 7, ...NEXT },
	{ T: 7.44, ...ARRIVE },
	{ T: 7.68, ...ARRIVE, az: 22 },
	{ T: 7.81, ...INTAKE },
	{ T: 7.89, ...INTAKE, az: 18, el: 50, radius: 2.5, ry: 1.9 },
	{ T: 7.985, az: 10, el: 80, target: [1.4, -27.0, 1.2], radius: 0.3, ry: 0.22, wide: box(0, 0, 1, 1), tall: box(0, 0, 1, 1) },
	...CLUSTER_SHOTS,
	...BACK_SHOTS
];

const SKY_A = { top: new THREE.Color('#9fd0f8'), mid: new THREE.Color('#c6e5fd'), low: new THREE.Color('#ecf7ff') };
const SKY_B = { top: new THREE.Color('#5da2ee'), mid: new THREE.Color('#93c7f7'), low: new THREE.Color('#cfe8fc') };
const SKY_IN = { top: new THREE.Color('#060f26'), mid: new THREE.Color('#0a1a3c'), low: new THREE.Color('#0d2150') };

const FORM_FROM = [0, 2.68, 4.1, 6.16, 14.17, 14.56, 14.89, 15.78, 18.14, 19.34, 22.06, 25.04];
const formAt = (T: number) => {
	let f = 1;
	FORM_FROM.forEach((from, i) => {
		if (T >= from) f = i + 1;
	});
	return f;
};

export interface WorldState {
	form: number;
	/** 0..1 how far the screen has faded while passing through the machine's roof. */
	dive: number;
	inside: boolean;
}

export class World {
	stage: Stage;
	rig: Rig;
	root = new THREE.Group();

	private laptop = new Laptop();
	private harness = new Harness();
	private brain = new Brain();
	private doc = new RequestDoc();
	private strips = [0, 1, 2, 3].map((i) => new Strip(i));
	private tunnel = new Tunnel(TUNNEL_L);
	private gateway = new Gateway();
	private gantry = new Gantry();
	private tiles: Tile[] = TOKENS.map((t) => new Tile(t));
	private mcp = new McpServer();
	private lower = new THREE.Group();
	private cluster = new Cluster();
	private back = new Back();
	private bulges: THREE.Mesh[] = [];
	private easelLegs!: THREE.Object3D;
	private downCurve!: THREE.CatmullRomCurve3;
	private beltTicks!: THREE.CanvasTexture;
	private flow!: THREE.CatmullRomCurve3;
	private flowLen = 1;
	private lipS = 1e9;
	private rest!: THREE.InstancedMesh;
	private chevron!: THREE.Texture;
	private ribbonArrows!: THREE.CanvasTexture;
	private loopMeshes: THREE.Mesh[] = [];
	private clouds: { sprite: THREE.Sprite; drift: number; base: THREE.Vector3 }[] = [];

	private harnessId: HarnessId = 'claude';
	private docClip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), TUNNEL_X + 0.08);
	private tileClip = new THREE.Plane(new THREE.Vector3(1, 0, 0), -SLOT_X);
	private dummy = new THREE.Object3D();
	private yAxis = new THREE.Vector3(0, 1, 0);

	private v1 = new THREE.Vector3();
	private v2 = new THREE.Vector3();
	private v3 = new THREE.Vector3();
	private v4 = new THREE.Vector3();
	private qLie = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
	private qA = new THREE.Quaternion();
	private qB = new THREE.Quaternion();
	private mat = new THREE.Matrix4();
	private intro = 0;
	/** T value of the last frame, for one-shot logic. */
	state: WorldState = { form: 1, dive: 0, inside: false };

	static async create(canvas: HTMLCanvasElement) {
		await loadFonts();
		return new World(canvas);
	}

	private constructor(canvas: HTMLCanvasElement) {
		this.stage = new Stage(canvas);
		this.rig = new Rig(this.stage.camera, SHOTS);
		this.stage.scene.add(this.root, this.cluster.group);
		this.assemble();
		this.splitLower();
		this.root.add(this.back.group);
		this.setHarness('claude');
	}

	/**
	 * Once the request has gone, only your laptop's island is still in the sky. Everything
	 * that lies further along the first half moves to its own group, which leaves with it.
	 */
	private splitLower() {
		this.root.updateMatrixWorld(true);
		const box = new THREE.Box3();
		const centre = new THREE.Vector3();
		[...this.root.children].forEach((child) => {
			if ((child as THREE.Sprite).isSprite || child === this.lower) return;
			if (this.loopMeshes.includes(child as THREE.Mesh)) return;
			box.setFromObject(child);
			if (box.isEmpty()) return;
			box.getCenter(centre);
			if (centre.y < -6 || centre.x > 9) this.lower.add(child);
		});
		this.root.add(this.lower);
	}

	private assemble() {
		const r = this.root;

		// Islands, stepping down through the sky: your laptop, the far end of the wire, the tokenizer.
		const islandA = createIsland([
			[-6.1, 0.2],
			[-4.6, -2.7],
			[0.4, -3.3],
			[5.6, -3.0],
			[8.2, -1.2],
			[8.2, 1.3],
			[5.0, 3.2],
			[-1.2, 3.7],
			[-5.2, 2.7]
		]);
		r.add(islandA);

		const islet = createIsland([
			[8.0, 0.2],
			[8.6, -2.0],
			[10.6, -2.3],
			[11.4, -0.8],
			[11.2, 1.0],
			[9.6, 1.7]
		], 0.46);
		islet.position.y = ISLET_Y;
		r.add(islet);

		const islandB = createIsland([
			[13.2, 1.4],
			[13.0, -2.2],
			[15.4, -3.3],
			[18.8, -3.1],
			[19.9, -1.2],
			[19.8, 1.6],
			[17.8, 3.0],
			[14.8, 2.9]
		]);
		islandB.position.y = ISLAND_B_Y;
		r.add(islandB);

		const islandC = createIsland([
			[-5.9, 0.4],
			[-5.3, -2.0],
			[-1.0, -3.2],
			[8.2, -3.2],
			[12.2, -2.0],
			[12.4, 1.2],
			[9.2, 3.1],
			[-2.0, 3.2]
		]);
		islandC.position.y = ISLAND_C_Y;
		r.add(islandC);

		const zone = (text: string, x: number, y: number, z: number) => {
			const l = new Label(text, 0.27, { color: '#7f8fa8', weight: 700, tracking: -0.012, align: 'left' });
			l.mesh.rotation.x = -Math.PI / 2;
			l.mesh.position.set(x, y + 0.004, z);
			r.add(l.mesh);
		};
		zone('Your laptop', -3.6, 0, 2.75);
		zone('The provider', 14.2, ISLAND_B_Y, 2.5);
		zone('The provider', -1.4, ISLAND_C_Y, 2.5);

		const shade = (x: number, y: number, z: number, w: number, d: number, o: number) => {
			const m = createCastShadow(w, d, o);
			m.position.set(x, y, z);
			r.add(m);
		};
		shade(0.5, -6.5, 0.2, 18, 11, 0.26);
		shade(16.6, -14, 0.4, 11, 9, 0.22);
		shade(3, -24, 0.4, 22, 11, 0.24);

		// Laptop.
		this.laptop.group.position.set(-3.3, 0, 0.5);
		this.laptop.group.rotation.y = 0.26;
		r.add(this.laptop.group);
		const lc = contactShadow(3.4, 2.3, 0.14, 0.42);
		lc.position.set(-3.3, 0.006, 0.5);
		lc.rotation.z = 0.26;
		r.add(lc);

		// Harness.
		this.harness.group.position.copy(HARNESS_POS);
		r.add(this.harness.group);
		const hc = contactShadow(3.1, 2.6, 0.2, 0.5);
		hc.position.set(1.1, 0.006, -0.65);
		r.add(hc);

		// An MCP server the harness connects to as it wakes.
		this.mcp.group.position.set(6.7, 0, -1.0);
		r.add(this.mcp.group);
		const mc = contactShadow(1.4, 1.2, 0.14, 0.42);
		mc.position.set(6.7, 0.006, -1.0);
		r.add(mc);

		// The request and its easel.
		const easel = createEasel();
		easel.group.position.set(DOC_POS.x, 0, LINE_Z - 0.18);
		r.add(easel.group);
		this.easelLegs = easel.legs;
		const ec = contactShadow(2.6, 1.1, 0.12, 0.42);
		ec.position.set(DOC_POS.x, 0.006, LINE_Z - 0.18);
		r.add(ec);
		r.add(this.doc.group);
		this.strips.forEach((s) => r.add(s.mesh));

		// Tunnel from the islet to the gateway.
		this.tunnel.group.position.set(TUNNEL_X, TUNNEL_Y, LINE_Z);
		r.add(this.tunnel.group);
		const standA = createTunnelStand(TUNNEL_Y - ISLET_Y);
		standA.position.set(TUNNEL_X + 0.1, ISLET_Y, LINE_Z);
		r.add(standA);
		const sca = contactShadow(1.5, 1.3, 0.12, 0.4);
		sca.position.set(TUNNEL_X + 0.1, ISLET_Y + 0.006, LINE_Z);
		r.add(sca);
		const standB = createTunnelStand(TUNNEL_Y - ISLAND_B_Y);
		standB.position.set(TUNNEL_X + TUNNEL_L - 0.1, ISLAND_B_Y, LINE_Z);
		r.add(standB);
		const scb = contactShadow(1.5, 1.3, 0.12, 0.4);
		scb.position.set(TUNNEL_X + TUNNEL_L - 0.1, ISLAND_B_Y + 0.006, LINE_Z);
		r.add(scb);

		// Gateway.
		this.gateway.group.position.set(GATEWAY_X, ISLAND_B_Y, LINE_Z);
		r.add(this.gateway.group);
		const gc = contactShadow(GW + 0.4, 2.7, 0.2, 0.5);
		gc.position.set(GATEWAY_X, ISLAND_B_Y + 0.006, LINE_Z);
		r.add(gc);

		// Chat template, belt, gantry and tiles.
		const template = createChatTemplate();
		template.position.set(TEMPLATE_X, ISLAND_C_Y, LINE_Z);
		r.add(template);
		const tc = contactShadow(2.3, 2.2, 0.16, 0.45);
		tc.position.set(TEMPLATE_X, ISLAND_C_Y + 0.006, LINE_Z);
		r.add(tc);
		const belt = createBelt(SLOT_X - 0.02, BELT_END);
		belt.position.set(0, BELT_Y, LINE_Z);
		r.add(belt);
		const bc = contactShadow(BELT_END - SLOT_X, 1.4, 0.16, 0.4);
		bc.position.set((SLOT_X + BELT_END) / 2, ISLAND_C_Y + 0.006, LINE_Z);
		r.add(bc);
		this.gantry.group.scale.setScalar(1.18);
		this.gantry.group.position.set(ROW_START, BELT_Y, LINE_Z);
		r.add(this.gantry.group);
		this.tiles.forEach((t) => {
			t.setClip([this.tileClip]);
			t.body.material.clearcoatRoughness = 0.5;
			r.add(t.group);
		});
		this.doc.setClip([this.docClip]);
		this.strips.forEach((s) => {
			s.mesh.material.clippingPlanes = [this.docClip];
			s.mesh.material.clipShadows = true;
		});

		this.buildFlow();
		this.buildPipes();
		this.buildModelTeaser();
		this.buildClouds();
	}

	/** The token path: straight along the belt, then a long curl down to the next chapter. */
	private buildFlow() {
		const m = mats();
		const y = BELT_Y + TILE_H / 2;
		const z = LINE_Z;
		const pts: [number, number, number][] = [
			[SLOT_X, y, z],
			[0.5, y, z],
			[3.5, y, z],
			[6.5, y, z],
			[BELT_END - 0.4, y, z],
			[BELT_END + 0.5, y - 0.03, z + 0.32],
			[12.8, y - 0.55, z + 1.6],
			[14, y - 1.7, z + 3.8],
			[13.9, y - 3.2, z + 6.2],
			[12.3, y - 4.8, z + 7.9],
			[10, y - 6.1, z + 7.9],
			[8.5, y - 7, z + 6],
			[7.9, y - 7.6, z + 3.2],
			[7.6, y - 8, z],
			[6.6, y - 8.3, z - 3.4],
			[4.2, y - 8.5, z - 5],
			[2, y - 8.62, z - 4.2],
			[1.4, y - 8.72, z - 2.5],
			[1.4, y - 8.84, z - 1.5],
			[1.4, y - 8.98, z - 0.75],
			[1.4, y - 9.42, z - 0.12],
			[1.4, y - 10.2, z + 0.2],
			[1.4, y - 11.5, z + 0.3]
		];
		this.flow = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
		this.flow.arcLengthDivisions = 800;
		this.flowLen = this.flow.getLength();

		// Open channel for everything past the belt.
		const u0 = (BELT_END - 0.25 - SLOT_X) / this.flowLen;
		const samples: THREE.Vector3[] = [];
		const lip = this.flowLipU();
		this.lipS = lip * this.flowLen;
		for (let i = 0; i <= 160; i++) samples.push(this.flow.getPointAt(lerp(u0, lip, i / 160)));
		const ribbonCurve = new THREE.CatmullRomCurve3(samples, false, 'centripetal');
		ribbonCurve.arcLengthDivisions = 800;
		const W = 0.5;
		const down = -TILE_H / 2 - 0.015;
		const rail = 0.17;
		const profile: [number, number][] = [
			[-W, down + rail],
			[-W + 0.025, down + rail + 0.03],
			[-W + 0.06, down + rail],
			[-W + 0.07, down + 0.055],
			[-W + 0.11, down + 0.02],
			[W - 0.11, down + 0.02],
			[W - 0.07, down + 0.055],
			[W - 0.06, down + rail],
			[W - 0.025, down + rail + 0.03],
			[W, down + rail],
			[W - 0.03, down - 0.02],
			[W - 0.12, down - 0.055],
			[-W + 0.12, down - 0.055],
			[-W + 0.03, down - 0.02]
		];
		const arrows = document.createElement('canvas');
		arrows.width = arrows.height = 128;
		const ac = arrows.getContext('2d')!;
		ac.fillStyle = '#000';
		ac.fillRect(0, 0, 128, 128);
		ac.strokeStyle = '#fff';
		ac.lineWidth = 11;
		ac.lineCap = 'round';
		ac.lineJoin = 'round';
		ac.beginPath();
		ac.moveTo(46, 30);
		ac.lineTo(82, 64);
		ac.lineTo(46, 98);
		ac.stroke();
		this.ribbonArrows = new THREE.CanvasTexture(arrows);
		this.ribbonArrows.wrapS = THREE.RepeatWrapping;
		this.ribbonArrows.wrapT = THREE.ClampToEdgeWrapping;
		this.ribbonArrows.repeat.set(1 / 1.05, 1);
		this.ribbonArrows.anisotropy = 8;
		const ribbonMat = new THREE.MeshPhysicalMaterial({
			color: '#ff9226',
			roughness: 0.32,
			clearcoat: 0.7,
			clearcoatRoughness: 0.28,
			emissive: '#ffb066',
			emissiveMap: this.ribbonArrows,
			emissiveIntensity: 0.9,
			side: THREE.DoubleSide
		});
		const ribbon = new THREE.Mesh(sweep(ribbonCurve, profile, 320), ribbonMat);
		ribbon.castShadow = true;
		ribbon.receiveShadow = true;
		this.root.add(ribbon);

		// Stand linking the channel to the island so it never just floats out of the belt.
		const b = new Batch();
		b.add(rbox(0.9, 0.5, 1.2, 0.08, 3), m.steelSoft, { p: [BELT_END + 0.1, BELT_Y - 0.28, LINE_Z] });
		this.root.add(b.build('channel-mount'));

		// The rest of the request, thousands more tiles than anyone can draw.
		const geo = rbox(0.42, TILE_H * 0.9, TILE_D * 0.86, 0.05, 2);
		// Softer highlights than a tile at rest: tumbling over the lip, a sharp one flares across the whole tile.
		const restMat = (m.amber as THREE.MeshPhysicalMaterial).clone();
		restMat.clearcoatRoughness = 0.5;
		restMat.clearcoat = 0.5;
		this.rest = new THREE.InstancedMesh(geo, restMat, REST);
		this.rest.castShadow = true;
		this.rest.frustumCulled = false;
		this.root.add(this.rest);
	}

	/** Where the channel ends: just past the intake's back wall, tipping over into the well. */
	private flowLipU() {
		const zLip = LINE_Z - 0.32;
		for (let i = 400; i >= 0; i--) {
			const u = 0.6 + (i / 400) * 0.4;
			if (this.flow.getPointAt(u).z < zLip) return u;
		}
		return 1;
	}

	private buildPipes() {
		const m = mats();

		// Harness to the easel: warm, because this is the outbound direction.
		const out = new THREE.CatmullRomCurve3(
			[
				new THREE.Vector3(HARNESS_POS.x + HW / 2, PORT_Y, HARNESS_POS.z + PORT_OUT_Z),
				new THREE.Vector3(HARNESS_POS.x + HW / 2 + 0.34, PORT_Y - 0.02, HARNESS_POS.z + PORT_OUT_Z + 0.02),
				new THREE.Vector3(3.3, 0.14, 0.04),
				new THREE.Vector3(3.8, 0.1, 0.5),
				new THREE.Vector3(4.5, 0.12, 0.72)
			],
			false,
			'centripetal'
		);
		const outTube = new THREE.Mesh(new THREE.TubeGeometry(out, 48, 0.078, 16), m.orangeGlow);
		outTube.castShadow = true;
		this.root.add(outTube);
		// Easel: the line drains through a port in the island, and carries on underneath.
		const port = new Batch();
		port.add(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 28), m.steel, { p: [7.35, 0.02, LINE_Z - 0.12] });
		port.add(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), m.recess, { p: [7.35, 0.05, LINE_Z - 0.12] });
		this.root.add(port.build('port'));
		const tail = new THREE.CatmullRomCurve3(
			[new THREE.Vector3(7.0, 0.12, LINE_Z - 0.2), new THREE.Vector3(7.22, 0.11, LINE_Z - 0.16), new THREE.Vector3(7.35, 0.05, LINE_Z - 0.12)],
			false,
			'centripetal'
		);
		this.root.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 16, 0.078, 16), m.orangeGlow));
		const under = new THREE.CatmullRomCurve3(
			[
				new THREE.Vector3(7.35, -0.7, LINE_Z - 0.12),
				new THREE.Vector3(7.6, -1.8, 0.35),
				new THREE.Vector3(7.9, -3.4, -0.3),
				new THREE.Vector3(8.15, -5.4, -0.45),
				new THREE.Vector3(8.2, -6.9, -0.25),
				new THREE.Vector3(8.5, -7.4, 0.25),
				new THREE.Vector3(9.25, -7.46, 0.66)
			],
			false,
			'centripetal'
		);
		const underTube = new THREE.Mesh(new THREE.TubeGeometry(under, 90, 0.078, 16), m.orangeGlow);
		underTube.castShadow = true;
		this.root.add(underTube);

		// Gateway to the chat template, leaving from the rear and running along the back of the island.
		const down = new THREE.CatmullRomCurve3(
			[
				new THREE.Vector3(GATEWAY_X, ISLAND_B_Y + 0.7, LINE_Z - 1.1),
				new THREE.Vector3(GATEWAY_X - 0.1, ISLAND_B_Y + 0.42, LINE_Z - 2.1),
				new THREE.Vector3(15.2, -8.9, -3.5),
				new THREE.Vector3(14.0, -12, -3.7),
				new THREE.Vector3(12.4, -15.4, -3.2),
				new THREE.Vector3(10.2, -16.86, -2.3),
				new THREE.Vector3(5, -16.92, -2.2),
				new THREE.Vector3(-1.2, -16.92, -2.1),
				new THREE.Vector3(-3.0, -16.92, -1.5),
				new THREE.Vector3(TEMPLATE_X, -16.75, -0.1)
			],
			false,
			'centripetal'
		);
		const downTube = new THREE.Mesh(new THREE.TubeGeometry(down, 220, 0.078, 16), m.orangeGlow);
		downTube.castShadow = true;
		this.root.add(downTube);
		this.downCurve = down;

		// What travels down that pipe: a slug of request, swelling the tube as it goes.
		const slugMat = new THREE.MeshPhysicalMaterial({ color: '#ffb35c', roughness: 0.2, clearcoat: 1, emissive: '#ff8a1a', emissiveIntensity: 1.5 });
		[0.17, 0.135, 0.11].forEach((radius) => {
			const slug = new THREE.Mesh(new THREE.CapsuleGeometry(radius, radius * 2.6, 6, 16), slugMat);
			slug.castShadow = true;
			slug.visible = false;
			this.root.add(slug);
			this.bulges.push(slug);
		});

		// The MCP server's lead, along the back of the island to the harness flank.
		const lead = new THREE.CatmullRomCurve3(
			[
				new THREE.Vector3(6.09, 0.9, -1.22),
				new THREE.Vector3(5.85, 0.84, -1.3),
				new THREE.Vector3(5.6, 0.1, -1.75),
				new THREE.Vector3(4.6, 0.045, -2.2),
				new THREE.Vector3(3.3, 0.045, -2.25),
				new THREE.Vector3(3.05, 0.08, -1.82),
				new THREE.Vector3(2.72, 0.3, -1.3),
				new THREE.Vector3(HARNESS_POS.x + HW / 2, PORT_Y, HARNESS_POS.z + PORT_MCP_Z)
			],
			false,
			'centripetal'
		);
		const leadTube = new THREE.Mesh(new THREE.TubeGeometry(lead, 80, 0.042, 10), m.cobalt);
		leadTube.castShadow = true;
		this.root.add(leadTube);

		// Moving tread on the belt, so it visibly carries what is on it.
		const ticks = document.createElement('canvas');
		ticks.width = 64;
		ticks.height = 16;
		const tc = ticks.getContext('2d')!;
		tc.fillStyle = '#000';
		tc.fillRect(0, 0, 64, 16);
		tc.fillStyle = '#fff';
		tc.fillRect(30, 0, 4, 16);
		this.beltTicks = new THREE.CanvasTexture(ticks);
		this.beltTicks.wrapS = THREE.RepeatWrapping;
		const beltLen = BELT_END - SLOT_X;
		this.beltTicks.repeat.set(beltLen / 0.44, 1);
		this.beltTicks.anisotropy = 8;
		const tread = new THREE.Mesh(
			new THREE.PlaneGeometry(beltLen, 1.06),
			new THREE.MeshBasicMaterial({ color: '#8797b8', alphaMap: this.beltTicks, transparent: true, opacity: 0.32, depthWrite: false })
		);
		tread.rotation.x = -Math.PI / 2;
		tread.position.set(SLOT_X + beltLen / 2, BELT_Y + 0.0015, LINE_Z);
		this.root.add(tread);

		// Laptop to harness: a plain cable, the keystrokes are not special yet.
		const cable = new THREE.CatmullRomCurve3(
			[
				new THREE.Vector3(-1.7, 0.055, -0.1),
				new THREE.Vector3(-1.2, 0.04, -0.34),
				new THREE.Vector3(-0.9, 0.04, -0.62),
				new THREE.Vector3(-0.52, 0.2, -0.7),
				new THREE.Vector3(HARNESS_POS.x - HW / 2, PORT_Y, HARNESS_POS.z + PORT_KEYS_Z)
			],
			false,
			'centripetal'
		);
		const cm = new THREE.Mesh(new THREE.TubeGeometry(cable, 32, 0.04, 10), m.rubber);
		cm.castShadow = true;
		this.root.add(cm);

		// The return loop: results come back here from far below. Seen now, explained later.
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const c = canvas.getContext('2d')!;
		c.fillStyle = '#000';
		c.fillRect(0, 0, 128, 128);
		c.strokeStyle = '#fff';
		c.lineWidth = 16;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.beginPath();
		c.moveTo(82, 26);
		c.lineTo(46, 64);
		c.lineTo(82, 102);
		c.stroke();
		this.chevron = new THREE.CanvasTexture(canvas);
		this.chevron.wrapS = THREE.RepeatWrapping;
		this.chevron.wrapT = THREE.RepeatWrapping;
		const ret = new THREE.CatmullRomCurve3(RETURN_POINTS.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
		const len = ret.getLength();
		const retMat = (m.greenGlow as THREE.MeshPhysicalMaterial).clone();
		retMat.emissiveMap = this.chevron;
		retMat.emissive.set('#b9ffd6');
		retMat.emissiveIntensity = 1.0;
		this.chevron.repeat.set(len / 0.62, 2);
		const backing = new THREE.Mesh(new THREE.TubeGeometry(ret, 320, 0.115, 20), retMat);
		backing.castShadow = true;
		this.root.add(backing);
		this.loopMeshes = [backing];
		const haze = new THREE.Mesh(
			new THREE.TubeGeometry(ret, 320, 0.115 * 1.3, 20),
			new THREE.MeshBasicMaterial({ color: color.green, transparent: true, opacity: 0.16, depthWrite: false })
		);
		this.root.add(haze);
		this.loopMeshes.push(haze);
	}

	/** A glimpse of what comes next, so the last frame points somewhere. */
	private buildModelTeaser() {
		const m = mats();
		const y = BELT_Y - 13.2;
		const x = 1.4;
		this.brain.group.position.set(x, y + 2.6 - BRAIN_SEAT, 1.2);
		this.root.add(this.brain.group);
		this.buildIntake(x, y + 2.6, 1.2);
		// A steel post carrying the chute over the roof, so it is held up by something.
		const post = new Batch();
		post.add(rbox(1.4, 0.08, 0.34, 0.03, 2), m.steel, { p: [x, y + 4.18, -1.0] });
		for (const s of [-0.58, 0.58]) post.add(rbox(0.1, 1.56, 0.14, 0.03, 2), m.steelSoft, { p: [x + s, y + 3.38, -1.0] });
		this.root.add(post.build('chute-post'));
	}

	/**
	 * The way in. A hatch standing on the roof with a real well inside it: walls that step inward and
	 * fall away into the dark, lit rings, and at the bottom a first glimpse of the boards inside.
	 */
	private buildIntake(x: number, roof: number, z: number) {
		const m = mats();
		const H = 1.45;
		const IX = 2.3;
		const IZ = 2.5;
		const OX = 3.2;
		const OZ = 3.4;
		const top = roof + H;

		const collar = roundedRect(OX, OZ, 0.3);
		const opening = new THREE.Path();
		roundedRect(IX, IZ, 0.1).getPoints(6).reverse().forEach((p, i) => (i ? opening.lineTo(p.x, p.y) : opening.moveTo(p.x, p.y)));
		opening.closePath();
		collar.holes.push(opening);
		const b = new Batch();
		b.add(extrude(collar, H, 0.07, 4, 10), m.cream, { p: [x, roof + H / 2, z], r: [-Math.PI / 2, 0, 0] });
		b.add(rbox(OX + 0.34, 0.1, OZ + 0.34, 0.04, 3), m.steelSoft, { p: [x, roof + 0.05, z] });
		// A steel lip around the mouth, so its edge catches the light.
		for (const s of [-1, 1]) {
			b.add(rbox(IX + 0.26, 0.05, 0.13, 0.02, 2), m.steel, { p: [x, top + 0.01, z + s * (IZ / 2 + 0.065)] });
			b.add(rbox(0.13, 0.05, IZ + 0.26, 0.02, 2), m.steel, { p: [x + s * (IX / 2 + 0.065), top + 0.01, z] });
		}
		this.root.add(b.build('intake'));
		const c = contactShadow(OX + 0.5, OZ + 0.5, 0.18, 0.4);
		c.position.set(x, roof + 0.006, z);
		this.root.add(c);

		// The well: each tier narrower and darker than the last.
		const tiers: [number, number, number, string, string][] = [
			[IX, IZ, top, '#4b70c4', '#1f3478'],
			[1.96, 2.14, top - 0.36, '#1f3478', '#0e1c4a'],
			[1.64, 1.8, top - 0.72, '#0e1c4a', '#081233'],
			[1.34, 1.48, top - 1.04, '#081233', DARK],
			[1.06, 1.18, roof + 0.13, DARK, DARK]
		];
		const pos: number[] = [];
		const col: number[] = [];
		const a = new THREE.Color();
		for (let i = 0; i < tiers.length - 1; i++) {
			const [w0, d0, y0, c0] = tiers[i];
			const [w1, d1, y1] = tiers[i + 1];
			const c1 = tiers[i][4];
			const ring: [number, number][] = [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			];
			for (let k = 0; k < 4; k++) {
				const [sa, ta] = ring[k];
				const [sb, tb] = ring[(k + 1) % 4];
				const A = [x + (sa * w0) / 2, y0, z + (ta * d0) / 2];
				const B = [x + (sb * w0) / 2, y0, z + (tb * d0) / 2];
				const C = [x + (sb * w1) / 2, y1, z + (tb * d1) / 2];
				const D = [x + (sa * w1) / 2, y1, z + (ta * d1) / 2];
				// The far walls catch the light from the mouth, the near ones are in their own shade.
				const shade = k === 0 ? 1.12 : k === 2 ? 0.7 : 0.92;
				[A, B, C, A, C, D].forEach((v, n) => {
					pos.push(v[0], v[1], v[2]);
					a.set(n === 0 || n === 1 || n === 3 ? c0 : c1).multiplyScalar(shade);
					col.push(a.r, a.g, a.b);
				});
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
		this.root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

		// Rings of light in the throat, the deeper the dimmer.
		const rings = new Batch();
		[
			[1, 2.4],
			[2, 1.2],
			[3, 0.5]
		].forEach(([i, power]) => {
			const [w, d, yy] = tiers[i];
			const mat = new THREE.MeshStandardMaterial({ color: '#ffd9a8', emissive: color.orange, emissiveIntensity: power });
			for (const s of [-1, 1]) {
				rings.add(rbox(w + 0.02, 0.022, 0.03, 0.01, 1), mat, { p: [x, yy, z + s * (d / 2 - 0.012)] });
				rings.add(rbox(0.03, 0.022, d, 0.01, 1), mat, { p: [x + s * (w / 2 - 0.012), yy, z] });
			}
		});
		this.root.add(rings.build('intake-rings'));

		// At the bottom, nothing: the colour the screen fades to on the way in.
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.18), new THREE.MeshBasicMaterial({ color: DARK }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(x, roof + 0.13, z);
		this.root.add(floor);
	}

	private buildClouds() {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 256;
		const c = canvas.getContext('2d')!;
		const puffs = [
			[128, 150, 90],
			[80, 165, 60],
			[180, 165, 66],
			[120, 110, 62],
			[160, 124, 52]
		];
		c.filter = 'blur(14px)';
		c.fillStyle = '#fff';
		for (const [x, y, rad] of puffs) {
			c.beginPath();
			c.arc(x, y, rad * 0.8, 0, Math.PI * 2);
			c.fill();
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		const spots: [number, number, number, number, number][] = [
			[-12, 5, -30, 26, 0.3],
			[14, 9, -34, 30, 0.26],
			[-2, -7, -24, 24, 0.3],
			[26, -3, -24, 24, 0.28],
			[-12, -19, -20, 28, 0.32],
			[20, -18, -22, 26, 0.3],
			[-10, -32, -14, 30, 0.34],
			[14, -34, -14, 26, 0.32]
		];
		spots.forEach(([x, y, z, s, o], i) => {
			const sprite = new THREE.Sprite(
				new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: o, depthWrite: false, fog: false })
			);
			sprite.scale.set(s, s * 0.58, 1);
			sprite.position.set(x, y, z);
			sprite.renderOrder = -50;
			this.root.add(sprite);
			this.clouds.push({ sprite, drift: 0.04 + i * 0.01, base: new THREE.Vector3(x, y, z) });
		});
	}

	setHarness(id: HarnessId) {
		this.harnessId = id;
		this.cluster.setHarness(id);
		this.back.setHarness(id);
		const spec = HARNESSES[id];
		this.laptop.setHarness(spec);
		this.doc.setHarness(spec);
		this.strips.forEach((s) => s.setHarness(spec));
		this.doc.bake(this.strips.map((s) => s.canvas));
	}

	resize(width: number, height: number, dpr: number) {
		this.stage.resize(width, height, dpr);
	}

	/** Pure function of T (scroll) plus time (idle life). Any scroll position can be rendered directly. */
	update(T: number, time: number, dt: number, px = 0, py = 0, introDone = false) {
		this.intro = introDone ? 1 : Math.min(1, this.intro + dt / 1.5);
		// The easel only stands while it has a page to hold: the request, then turn two.
		const legs = inOut(seg(T, 2.02, 2.09)) * (1 - inOut(seg(T, 3.64, 3.74))) + outBack(seg(T, 25.38, 25.47), 1.2) * (1 - inOut(seg(T, 25.92, 26)));
		this.easelLegs.visible = legs > 0.002;
		this.easelLegs.scale.y = Math.max(0.002, legs);
		const intro = this.intro;

		this.rig.update(T, this.stage.width, this.stage.height, px, py, time);
		this.stage.focusLight(this.rig.focus, this.rig.radius);

		const inside = T >= DIVE_T && T < EXIT_T;
		this.root.visible = !inside;
		this.cluster.group.visible = inside;
		this.state.inside = inside;
		this.state.dive = Math.max(
			smooth(seg(T, 7.93, 7.985)) * (1 - smooth(seg(T, 8.0, 8.08))),
			smooth(seg(T, 13.9, 13.975)) * (1 - smooth(seg(T, 13.99, 14.05))),
			smooth(seg(T, 18.88, 18.98)) * (1 - smooth(seg(T, 19.0, 19.1)))
		);

		const skyK = smooth(seg(T, 6.7, 7.7));
		const sky = this.stage;
		if (inside) {
			sky.setSky(SKY_IN.top, SKY_IN.mid, SKY_IN.low);
			this.cluster.update(T, time);
		} else {
			const k = T >= EXIT_T ? 0 : skyK;
			const top = this.c1.copy(SKY_A.top).lerp(SKY_B.top, k);
			const mid = this.c2.copy(SKY_A.mid).lerp(SKY_B.mid, k);
			const low = this.c3.copy(SKY_A.low).lerp(SKY_B.low, k);
			sky.setSky(top, mid, low);
			this.clouds.forEach((cl) => {
				cl.sprite.position.x = cl.base.x + Math.sin(time * cl.drift) * 1.4;
			});

			this.root.position.y = (1 - outCubic(seg(intro, 0, 0.8))) * -0.9;

			this.lower.visible = T < DIVE_T;
			this.back.group.visible = T >= EXIT_T;
			if (T < DIVE_T) {
				this.updateLaptop(T, time, intro);
				this.updateHarnessAndRequest(T, time);
				this.updateTunnel(T, time, dt);
				this.updateGateway(T, time);
				this.updateTokenizer(T, time);
				this.mcp.update(seg(T, 1.86, 2.0), time);
				this.updateBulges(T);
				this.brain.update(T, time);
			} else {
				// The first half of the journey is over: its travellers have gone, its machines stay.
				this.doc.group.visible = false;
				this.strips.forEach((s) => (s.mesh.visible = false));
				this.tiles.forEach((t) => (t.group.visible = false));
				this.rest.visible = false;
				this.bulges.forEach((b) => (b.visible = false));
				this.laptop.finish(smooth(seg(T, 31.3, 31.46)));
				this.laptop.update(PROMPT.length, 1, time, 1, false);
				this.mcp.update(1, time);
				this.harness.update(this.back.opens(T), [1, 1, 1, 1], 1, time, this.back.jolt(T));
				if (this.back.group.visible) this.back.update(T, time);
			}

			this.chevron.offset.x = time * 0.42;
			this.ribbonArrows.offset.x = -time * 0.5;
			this.loopMeshes.forEach((l) => (l.visible = T < 3.9 || T >= EXIT_T));
		}

		this.state.form = formAt(T);
		this.stage.render();
	}

	private c1 = new THREE.Color();
	private c2 = new THREE.Color();
	private c3 = new THREE.Color();

	private updateLaptop(T: number, time: number, intro: number) {
		const lid = spring(seg(intro, 0.28, 1), 2.6, 5);
		const typedF = seg(T, HOLD.type[0], HOLD.type[1]) * PROMPT.length;
		const sent = seg(T, HOLD.send[0], HOLD.send[1]);
		this.laptop.update(typedF, sent, time, lid, T > 0.9 && T < 1.8);
	}

	/** Bezier-with-lift flight from where a slip is to where it is going. */
	private fly(strip: THREE.Mesh, from: THREE.Vector3, qFrom: THREE.Quaternion, to: THREE.Vector3, qTo: THREE.Quaternion, k: number, lift: number) {
		const e = inOut(k);
		const ctrl = this.v3.copy(from).lerp(to, 0.5);
		ctrl.y = Math.max(from.y, to.y) + lift;
		const a = (1 - e) * (1 - e);
		const b = 2 * (1 - e) * e;
		const c = e * e;
		strip.position.set(a * from.x + b * ctrl.x + c * to.x, a * from.y + b * ctrl.y + c * to.y, a * from.z + b * ctrl.z + c * to.z);
		strip.quaternion.slerpQuaternions(qFrom, qTo, e);
		// A little flutter in the air, none at either end.
		strip.rotateZ(Math.sin(k * Math.PI * 2) * 0.1 * Math.sin(k * Math.PI));
	}

	/**
	 * From the screen to an open drawer. It swings out past the machine's front before it gets there, lies flat,
	 * and comes straight down into the tray, so it never crosses the drawers above.
	 */
	private dropIntoDrawer(strip: THREE.Mesh, from: THREE.Vector3, qFrom: THREE.Quaternion, to: THREE.Vector3, k: number) {
		const e = inOut(k);
		const u = 1 - e;
		const w0 = u * u * u;
		const w1 = 3 * u * u * e;
		const w2 = 3 * u * e * e;
		const w3 = e * e * e;
		const x1 = lerp(from.x, to.x, 0.3);
		const y1 = from.y + 0.7;
		const z1 = to.z + 0.5;
		const y2 = to.y + 1.8;
		strip.position.set(w0 * from.x + w1 * x1 + w2 * to.x + w3 * to.x, w0 * from.y + w1 * y1 + w2 * y2 + w3 * to.y, w0 * from.z + w1 * z1 + w2 * to.z + w3 * to.z);
		strip.quaternion.slerpQuaternions(qFrom, this.qLie, smooth(seg(e, 0.12, 0.62)));
	}

	private updateHarnessAndRequest(T: number, time: number) {
		// Windows for the four drawers: open, the contents lift out, closed again.
		const starts = [2.04, 2.2, 2.36, 2.52];
		const opens = [0, 0, 0, 0];
		const filled = [0, 0, 0, 0];

		starts.forEach((a, i) => {
			const out = spring(seg(T, a, a + 0.07), 3, 7);
			const shut = inOut(seg(T, a + 0.11, a + 0.155));
			opens[i] = out * (1 - shut);
			filled[i] = seg(T, a + 0.08, a + 0.11);
		});

		// The conversation drawer also opens early, to catch the prompt as it comes from the laptop.
		const catchOut = spring(seg(T, 1.7, 1.8), 3, 7);
		const catchShut = inOut(seg(T, 1.9, 1.98));
		opens[3] = Math.max(opens[3], catchOut * (1 - catchShut));

		const wake = smooth(seg(T, 1.78, 2.0));
		const landed = bell(seg(T, 1.86, 1.94), 0, 1);
		const pulls = starts.reduce((sum, a) => sum + bell(seg(T, a + 0.02, a + 0.07), 0, 1) * 0.5, 0);
		this.harness.update(opens, filled, 0.1 + wake * 0.9, time, landed + pulls);
		this.harness.group.updateWorldMatrix(true, true);

		/* ----- the document ----- */
		// Same easing and window as the camera, so the page stays in frame all the way down.
		const moveK = smoother(seg(T, 3.58, 4.0));
		const enterK = seg(T, 4.0, 4.26);
		const scale = lerp(1, 0.62, smooth(seg(T, 3.58, 3.76)));
		const u = 1 - moveK;
		const P0 = DOC_POS;
		// Up and out first: it has to clear the stand and the island's edge before it starts to fall.
		const dropX = u * u * u * P0.x + 3 * u * u * moveK * 10.6 + 3 * u * moveK * moveK * 8.9 + moveK * moveK * moveK * (TUNNEL_X - 1.05);
		const docY = u * u * u * P0.y + 3 * u * u * moveK * 3.6 + 3 * u * moveK * moveK * -3 + moveK * moveK * moveK * TUNNEL_Y;
		const docX = lerp(dropX, TUNNEL_X + 1.1, inOut(enterK));
		const dg = this.doc.group;
		// It rolls up on the way down. The roll forms at the page's foot, so lifting the page by that much puts the roll on the tube's axis.
		const rollUp = inOut(seg(T, 3.66, 3.95));
		dg.position.set(docX, docY + rollUp * ROLL_AXIS * scale, LINE_Z);
		const thud = starts.reduce((sum, a) => sum + bell(seg(T, a + 0.14, a + 0.18), 0, 1), 0);
		dg.rotation.set(lerp(DOC_TILT, 0, smooth(seg(T, 3.58, 3.76))) + thud * 0.03, Math.sin(moveK * Math.PI) * 0.3, Math.sin(moveK * Math.PI) * -0.14);
		const appear = 1;
		// Rolled up until the harness has something to put in it, so the MCP server is in plain sight until then.
		this.doc.setRoll(inOut(seg(T, 1.97, 2.09)) * (1 - rollUp));
		this.doc.setFilled(T >= STRIPS_PRINTED);
		// Past the first ring the bytes are encrypted: the roll stops being paper there, and the ciphertext starts.
		this.docClip.constant = enterK > 0 ? TUNNEL_X + 0.22 : 1000;
		dg.scale.setScalar(scale);
		dg.visible = appear > 0.001 && enterK < 1;
		this.doc.setTabs(seg(T, 3.04, 3.3) * (1 - seg(T, 3.6, 3.68)));
		dg.updateWorldMatrix(true, true);

		/* ----- the slips ----- */
		this.qB.copy(dg.quaternion);
		this.strips.forEach((s, i) => {
			const m = s.mesh;
			const a = starts[i];
			const k = seg(T, a + 0.05, a + 0.145);
			const inDrawer = this.harness.drawerTop(i, this.v1);
			const slot = dg.localToWorld(this.v2.set(0, SLOT_Y[i], 0.045));

			m.visible = T >= (i === 3 ? 1.6 : a) && T < STRIPS_PRINTED && appear > 0.001;
			m.scale.setScalar(dg.scale.x);
			this.qA.copy(this.qLie);

			if (i === 3 && T < a) {
				// The prompt leaves the screen as a slip and drops into the open drawer.
				const launch = this.v3.clone();
				this.laptop.group.updateWorldMatrix(true, true);
				this.laptop.screenPoint(launch);
				const qScreen = this.laptop.group.quaternion;
				const f = seg(T, 1.62, 1.88);
				this.dropIntoDrawer(m, launch, qScreen, this.harness.catchPoint(i, this.v4), f);
				const pop = outBack(seg(T, 1.62, 1.66), 2);
				m.scale.setScalar(pop * lerp(0.84, 0.94, f));
				m.visible = f < 0.999 ? pop > 0.01 : false;
				return;
			}

			if (k <= 0) {
				m.position.copy(inDrawer);
				m.quaternion.copy(this.qLie);
				m.visible = false;
			} else if (k >= 1) {
				m.position.copy(slot);
				m.quaternion.copy(this.qB);
			} else {
				this.fly(m, inDrawer.clone(), this.qA, slot.clone(), this.qB, k, 0.9);
			}
		});
	}

	private updateTunnel(T: number, time: number, dt: number) {
		const flow = seg(T, 4.08, 4.86);
		const lock = seg(T, 3.97, 4.04);
		const copilot = this.harnessId === 'copilot';
		this.tunnel.update(flow, lock, time, dt, copilot, seg(T, 4.72, 4.76));
	}

	private updateBulges(T: number) {
		const k = seg(T, 5.6, 6.02);
		this.bulges.forEach((slug, i) => {
			const u = inOut(k) * 1.18 - i * 0.05;
			slug.visible = u > 0 && u < 1;
			if (!slug.visible) return;
			slug.position.copy(this.downCurve.getPointAt(u));
			slug.quaternion.setFromUnitVectors(this.yAxis, this.downCurve.getTangentAt(u));
		});
	}

	private updateGateway(T: number, time: number) {
		this.gateway.update(seg(T, 5.04, 5.62) * 5, time);
	}

	private updateTokenizer(T: number, time: number) {
		const n = this.tiles.length;
		const feed = inOut(seg(T, 6.02, 6.14));
		const CUT_A = 6.16;
		const CUT_B = 6.56;
		const p = seg(T, CUT_A, CUT_B) * n;
		const stepI = Math.min(n - 1, Math.floor(p));
		const stepF = p - stepI;

		// Row position of each tile, with gaps opening behind the cutter.
		const offsets: number[] = [];
		const cuts: number[] = [];
		let cursor = 0;
		for (let i = 0; i < n; i++) {
			const c = seg(p, i + 0.7, i + 0.95);
			cuts.push(c);
			offsets.push(cursor);
			cursor += this.tiles[i].width + 0.07 * smooth(c);
		}
		const rowLen = cursor;

		// Departure along the flow, once the whole row has flipped.
		const depK = seg(T, 6.86, 7.92);
		// Timed so the last tile goes over the lip just before the camera follows it in.
		const D = (smooth(depK) * (this.flowLen + REST * REST_GAP)) / 0.985;
		const start = ROW_START - SLOT_X + (feed - 1) * (rowLen + 1.6);
		this.beltTicks.offset.x = -(start + D) / 0.44;

		const frame = (s: number, target: THREE.Object3D, y = 0) => {
			if (s <= 0) {
				target.position.set(SLOT_X + s, BELT_Y + y, LINE_Z);
				target.quaternion.identity();
				return;
			}
			// Past the lip nothing is carrying it any more: it falls, and pulls away from the one behind.
			const past = Math.max(0, s - this.lipS);
			const u = Math.min(1, (s + past * past * 0.5) / this.flowLen);
			const f = frameAt(this.flow, u);
			target.position.copy(f.p);
			target.position.addScaledVector(f.up, y - TILE_H / 2);
			this.mat.makeBasis(f.t, f.up, f.side.clone().negate());
			target.quaternion.setFromRotationMatrix(this.mat);
		};

		this.tiles.forEach((tile, i) => {
			const hopK = seg(T, 6.6 + i * 0.01, 6.68 + i * 0.01);
			const flip = smooth(hopK);
			tile.update(cuts[i], 0);
			const s = start + offsets[i] + tile.width / 2 + D;
			const thick = lerp(0.024 / TILE_H, 1, outBack(Math.min(1, cuts[i] * 1.1), 2.2));
			const rest = (TILE_H * thick) / 2 + 0.002;
			const pop = bell(cuts[i], 0, 1) * 0.1;
			const hop = bell(hopK, 0, 1) * 0.92;
			const idle = hopK >= 1 && D === 0 ? (Math.sin(time * 2.1 - i * 0.55) * 0.5 + 0.5) * 0.022 : 0;
			frame(s, tile.group, rest + pop + hop + idle);
			tile.group.rotateX(flip * Math.PI);
			tile.group.visible = s < this.flowLen - 0.1 && feed > 0;
		});

		// The gantry walks from one boundary to the next, then stamps.
		const boundary = (i: number) => SLOT_X + start + (i < 0 ? -0.4 : offsets[i] + this.tiles[i].width);
		const moving = T >= CUT_A && T <= CUT_B + 0.02;
		const moveK = smooth(seg(stepF, 0, 0.55));
		const gx = !moving && T < CUT_A
			? SLOT_X + 0.5
			: T > CUT_B
				? boundary(n - 1) + smooth(seg(T, CUT_B, CUT_B + 0.1)) * 0.42
				: lerp(boundary(stepI - 1), boundary(stepI), moveK);
		this.gantry.group.position.x = gx;
		const stamp = T > CUT_A && T < CUT_B ? bell(stepF, 0.55, 1) : 0;
		this.gantry.update(smooth(stamp), moving);

		// The rest of the request pours out behind the named tiles.
		const d = this.dummy;
		const count = this.rest.count;
		const started = seg(T, 6.86, 6.95);
		for (let j = 0; j < count; j++) {
			const s = start - (j + 1) * REST_GAP + D;
			if (s < 0.2 || s > this.flowLen - 0.1 || started <= 0) {
				d.position.set(0, -500, 0);
				d.scale.setScalar(0);
				d.quaternion.identity();
			} else {
				frame(s, d, TILE_H * 0.46);
				d.scale.setScalar(1);
			}
			d.updateMatrix();
			this.rest.setMatrixAt(j, d.matrix);
		}
		this.rest.instanceMatrix.needsUpdate = true;
		this.rest.visible = started > 0;
	}

	dispose() {
		this.stage.dispose();
	}
}
