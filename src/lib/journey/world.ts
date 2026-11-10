import * as THREE from 'three';
import { breathe, Stage } from './stage';
import { Rig, type Shot } from './rig';
import { bell, inOut, lerp, outBack, outCubic, seg, smooth, smoother, spring, inCubic } from './kit/math';
import { contactShadow, Label, loadFonts, Surface } from './kit/print';
import { bends, extrude, frameAt, PartOf, rbox, ring, roundedRect } from './kit/geometry';
import { mats, color } from './kit/materials';
import { Batch } from './kit/batch';
import { fitting, leaving } from './kit/parts';
import { curve } from './kit/machines';
import { createCastShadow, createIsland } from './props/island';
import { Cloudscape } from './props/sky';
import { LAPTOP_PORT, Laptop } from './props/laptop';
import { McpServer } from './props/mcp';
import { Brain, BRAIN_FOOT, BRAIN_SEAT } from './props/brain';
import { SkillShelf } from './props/skills';
import { Poker } from './poke';
import { Harness, HW, PORT_KEYS_Z, PORT_MCP_Z, PORT_OUT_Z, PORT_Y } from './props/harness';
import { createEasel, DOC_H, RequestDoc, SLOT_Y, Strip } from './props/request';
import { createTunnelStand, Tunnel } from './props/tunnel';
import { Gateway, GW } from './props/gateway';
import { createBelt, createChatTemplate, Gantry, GANTRY_REAR, SafetyArch, Tile, TILE_D, TILE_H } from './props/tokenizer';
import { HARNESSES, PROMPT, TOKENS, type HarnessId, type TrackId } from './content';
import { McpTrack, MCP_SHOTS, type HarnessPose } from './tracks/mcp';
import { HarnessRoom, ROOF, ROOM_AT, ROOM_SHOTS, ROOM_SKY } from './tracks/harness';
import { GLASS_ROOF, SandboxStage, STAGE_AT, STAGE_SHOTS, STAGE_SKY } from './tracks/sandbox';
import { CABINET_ROOF, MemoryStage, MEMORY_AT, MEMORY_SHOTS, MEMORY_SKY } from './tracks/memory';
import { PlansStage, PLANS_AT, PLANS_SHOTS, PLANS_SKY, SCREEN_ROOF } from './tracks/plans';
import { hitBox } from './poke';
import { Visits } from './visit';
import { MiniMap } from './minimap';
import { Voyage, type Flight } from './voyage';
import { Cluster, CLUSTER_SHOTS, DIVE_T } from './cluster';
import { AXIS_X, LOWER, MODEL_ISLAND_Y, MODEL_X, MODEL_Z, STREAM_BOTTOM, STREAM_TOP } from './layout';
import { CALL_ROLLER, HOME, HOME_OUTLINE, RETURN_ROLLER, returnPath, slab } from './cables';
import { buildRoller, buildWheel, hang, type Solid } from './kit/cable';
import { Back, BACK_SHOTS } from './chapters/back';
import { Finale, FINALE_T } from './chapters/finale';

export const EXIT_T = 19;

type V3 = [number, number, number];

/*
 * ---------- layout: a pinwheel in the sky, turning about your laptop ----------
 * The request leaves your island to the right, level, over the wire, through the front door and the tokenizer, all at
 * your laptop's height; a glass lift carries the tokens up and back along the top to the model, which stands at the top
 * of the axis through the harness. The reply comes straight down that axis. Below and to the left, the same shape the
 * other way round: your tools (see layout.ts). Every position is derived from these.
 */
const LINE_Z = 0.9;
/** The wire and the front door, right of your island, at its height: a shift of the islands they were first drawn on. */
const WIRE_X = 2;
const TUNNEL_X = 9.6 + WIRE_X;
const TUNNEL_L = 4.8;
const TUNNEL_Y = 2.4;
/** A hair below your island, so the pipe out of it runs dead level into the foot of the wire. */
const ISLET_Y = -0.175;
const ISLAND_B_Y = 0;
const GATEWAY_X = TUNNEL_X + TUNNEL_L + 0.04 + GW / 2;
/** The islands of the row, from above, each about its own position. */
const ISLET_OUTLINE: [number, number][] = [
	[8.0, 0.2],
	[8.6, -2.0],
	[10.6, -2.3],
	[11.4, -0.8],
	[11.2, 1.0],
	[9.6, 1.7]
];
const B_OUTLINE: [number, number][] = [
	[13.2, 1.4],
	[13.0, -2.2],
	[15.4, -3.3],
	[18.8, -3.1],
	[19.9, -1.2],
	[19.8, 1.6],
	[17.8, 3.0],
	[14.8, 2.9]
];
const C_OUTLINE: [number, number][] = [
	[-5.9, 0.4],
	[-5.3, -2.0],
	[-1.0, -3.2],
	[8.2, -3.2],
	[13.5, -2.4],
	[13.7, 1.3],
	[9.2, 3.1],
	[-2.0, 3.2]
];
/** The tokenizer's island, next along the row. Everything on it is measured from here. */
const C_X = 28.8;
const ISLAND_C_Y = 0.25;
const BELT_Y = ISLAND_C_Y + 0.5;
const TEMPLATE_X = C_X - 3.4;
const SLOT_X = TEMPLATE_X + 1.06;
const BELT_END = C_X + 10.7;
// As far along the path as both its feet still stand on the island.
const SAFETY_X = C_X + 11.45;
/** The roof of the model's brain, at the top of the axis, where the intake stands. */
const MODEL_ROOF = MODEL_ISLAND_Y + BRAIN_FOOT + BRAIN_SEAT;
/** The intake's mouth: its inner half-width, and how tall it stands on the roof. */
const INTAKE_HALF = 1.15;
const INTAKE_H = 1.45;
const INTAKE_TOP = MODEL_ROOF + INTAKE_H;
/**
 * The token hose: its radius, and where it climbs, clamped up a mast at the end of the row. At the top it goes over a
 * wheel, hangs across the sky to a second wheel over the model's intake, and drops off that into a nozzle above the well.
 */
const LIFT_R = 0.42;
const LIFT_X = C_X + 13.65;
const WHEEL_R = 0.6;
const WRAP = WHEEL_R + LIFT_R;
const MODEL_WHEEL: V3 = [MODEL_X + WRAP, INTAKE_TOP + 2.4, LINE_Z];
const MAST_WHEEL: V3 = [LIFT_X - WRAP, MODEL_WHEEL[1] + 0.8, LINE_Z];
const LIFT_TOP = MAST_WHEEL[1] - 0.3;
const NOZZLE_Y = INTAKE_TOP + 0.95;
/** Where the tokens leave the nozzle and fall free into the well. */
const LIP_Y = INTAKE_TOP + 0.5;
/** The token path lies in one upright plane, so its side is always the same: what a token shows faces you all the way up. */
const FLOW_SIDE = new THREE.Vector3(0, 0, -1);
const GANTRY_SCALE = 1.18;
/** When each letter of the sentence lands after the page opens, once the lid is up. Uneven, with a breath between words, as people type. */
const LETTER_AT = (() => {
	let at = 1.7;
	return [...PROMPT].map((ch, i) => {
		const landed = at;
		at += 0.04 + (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * 0.04 + (ch === ' ' ? 0.05 : 0);
		return landed;
	});
})();
let WELL_FLOOR_Y = -Infinity;
const HOLD_SHADOWS_T = 32.36;
const DARK = '#060f26'; // the inside of the machine, and the colour of the fade
const REST = 66; // tiles behind the named ones, and their spacing
const REST_GAP = 0.54;
const ROW_START = SLOT_X + 0.9;

const HARNESS_POS = new THREE.Vector3(1.1, 0, -0.65);

/** The trips that drop into a place of their own: where each place is, and its sky. */
type Inside = 'harness' | 'sandbox' | 'memory' | 'plans';
const INSIDE: Record<Inside, { at: THREE.Vector3; sky: { top: THREE.Color; mid: THREE.Color; low: THREE.Color } }> = {
	harness: { at: ROOM_AT, sky: ROOM_SKY },
	sandbox: { at: STAGE_AT, sky: STAGE_SKY },
	memory: { at: MEMORY_AT, sky: MEMORY_SKY },
	plans: { at: PLANS_AT, sky: PLANS_SKY }
};
const insideOf = (id: TrackId | null): Inside => (id && id !== 'mcp' ? id : 'harness');
const DOC_POS = new THREE.Vector3(5.75, 0.2 + DOC_H / 2, LINE_Z);
const DOC_TILT = -0.13;
const ROLL_AXIS = 1.45; // how far below the page's centre the finished roll lies
const STRIPS_PRINTED = 3.62;

/* ---------- beat timeline. T counts sections; see Journey.svelte for the mapping ---------- */
export const HOLD = { type: [1.02, 1.56], send: [1.56, 1.66] };
/** What your screen says the agent is doing, from when it says it. Seen at the start, when the reply lands, and round the loop. */
const LAPTOP_SAYS: [number, string][] = [
	[0, 'Building the request'],
	[3.6, 'Waiting for the reply'],
	[19.0, 'Reading the reply'],
	[19.62, 'Checking the tool call'],
	[25.04, 'Sending the result back'],
	[25.9, 'On to the next turn'],
	// The tenth turn ends with a summary and no call: two files changed, the fix and its new test, and the whole suite green.
	[30, 'Done: 2 files changed, 418 passed']
];
const laptopSays = (T: number) => LAPTOP_SAYS.findLast(([from]) => T >= from)![1];

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const hold = (from: number, to: number, shot: Omit<Shot, 'T'>, drift: Partial<Omit<Shot, 'T'>> = {}): Shot[] => [
	{ T: from, ...shot },
	{ T: to, ...shot, ...drift }
];

const HERO = { az: 29, el: 17, target: [1.9, 1.35, 0.4] as [number, number, number], radius: 6.25, wide: box(0.4, 0.02, 0.61, 0.94), tall: box(0, 0.42, 1, 0.56) };
const LAPTOP = { az: 13, el: 14, target: [-3.25, 1.12, 0.35] as [number, number, number], radius: 2.3, wide: box(0.42, 0.1, 0.56, 0.84), tall: box(0.02, 0.08, 0.96, 0.5) };
const ASSEMBLY = { az: 27, el: 17, target: [3.1, 1.9, 0.6] as [number, number, number], radius: 4.7, ry: 4.15, wide: box(0.0, 0.14, 0.58, 0.86), tall: box(0.02, 0.07, 0.96, 0.46) };
const REQUEST = { az: 7, el: 7, target: [5.75, 1.78, 0.95] as [number, number, number], radius: 2.05, wide: box(0.12, 0.08, 0.46, 0.86), tall: box(0.05, 0.07, 0.9, 0.5) };
const WIRE = { az: -24, el: 11, target: [TUNNEL_X + 2.3, TUNNEL_Y + 0.3, 0.9] as [number, number, number], radius: 3.9, wide: box(0.38, 0.12, 0.62, 0.8), tall: box(0, 0.1, 1, 0.44) };
const DOOR = { az: 22, el: 9, target: [GATEWAY_X, ISLAND_B_Y + 1.7, 1.0] as [number, number, number], radius: 3.1, wide: box(0.03, 0.1, 0.5, 0.88), tall: box(0.02, 0.06, 0.96, 0.5) };
// A phone can't hold the whole row at a size you can read, so it comes back from the cutter to the middle, where both "the"
// tiles turn into the same number side by side.
const C_TOP = ISLAND_C_Y + 0.58;
const TOKENS_SHOT = { tallTarget: [C_X + 3.4, C_TOP, 0.9] as [number, number, number], tallRadius: 2.7, az: 3, el: 38, target: [C_X + 3.2, C_TOP, 0.9] as [number, number, number], radius: 7.95, ry: 1.8, wide: box(0.03, 0.44, 0.94, 0.5), tall: box(0, 0.1, 1, 0.42) };
const CUT = {
	az: 11,
	el: 36,
	target: [C_X + 3, ISLAND_C_Y + 0.9, 0.9] as [number, number, number],
	radius: 3.5,
	ry: 1.75,
	wide: box(0.05, 0.46, 0.9, 0.5),
	tall: box(0, 0.1, 1, 0.42),
	tallTarget: [C_X - 0.6, C_TOP, 0.9] as [number, number, number],
	tallRadius: 2.7
};
// Up the lift with the tokens, from out in front, the model far up and to the left.
const NEXT = { az: 8, el: 3, target: [LIFT_X - 3, BELT_Y + 9, 0.9] as [number, number, number], radius: 10, ry: 11, wide: box(0.38, 0.06, 0.6, 0.88), tall: box(0, 0.06, 1, 0.5) };
const INTAKE = { az: 26, el: 38, target: [MODEL_X, MODEL_ROOF + 1.2, MODEL_Z - 0.2] as [number, number, number], radius: 3.3, ry: 2.3, wide: box(0.38, 0.08, 0.62, 0.84), tall: box(0, 0.08, 1, 0.48) };
// The model from outside, at the top of the axis: the lift coming along the top into it, and the glass column going down from it.
const ARRIVE = { az: 16, el: 8, target: [MODEL_X + 7, MODEL_ROOF - 1.4, MODEL_Z] as [number, number, number], radius: 15, ry: 12, wide: box(0.38, 0.03, 0.62, 0.92), tall: box(0, 0.05, 1, 0.5) };
/** The hose's whole span, from the mast's wheel to the model's, with the tokens riding across. */
const GARLAND = { az: 9, el: 5, target: [(MODEL_X + LIFT_X) / 2, MODEL_ROOF - 0.5, MODEL_Z] as [number, number, number], radius: 27, ry: 20, wide: box(0.38, 0.06, 0.62, 0.88), tall: box(0, 0.06, 1, 0.5) };

const SHOTS: Shot[] = [
	...hold(0, 0.5, HERO),
	...hold(1, 1.6, LAPTOP),
	...hold(2, 2.74, ASSEMBLY, { az: 24, radius: 4.6, ry: 4.05 }),
	...hold(3, 3.58, REQUEST, { az: 11 }),
	...hold(4, 4.64, WIRE, { az: 20, el: 13, target: [TUNNEL_X + 2.7, TUNNEL_Y + 0.3, 0.9] }),
	...hold(5, 5.64, DOOR, { az: 18 }),
	{ T: 6, ...CUT, target: [C_X - 0.3, ISLAND_C_Y + 0.9, 0.9] },
	{ T: 6.16, ...CUT, target: [C_X - 0.3, ISLAND_C_Y + 0.9, 0.9] },
	{ T: 6.56, ...CUT, target: [C_X + 7.1, ISLAND_C_Y + 0.9, 0.9], az: 7, tallTarget: [C_X + 8.2, C_TOP, 0.9] },
	...hold(6.68, 6.8, TOKENS_SHOT, { az: 1 }),
	{ T: 7, ...NEXT },
	{ T: 7.14, ...GARLAND },
	{ T: 7.3, ...ARRIVE },
	{ T: 7.68, ...ARRIVE, az: 21 },
	{ T: 7.81, ...INTAKE },
	{ T: 7.89, ...INTAKE, az: 18, el: 50, radius: 2.5, ry: 1.9 },
	{ T: 7.985, az: 10, el: 80, target: [MODEL_X, MODEL_ROOF + 0.1, MODEL_Z], radius: 0.3, ry: 0.22, wide: box(0, 0, 1, 1), tall: box(0, 0, 1, 1) },
	...CLUSTER_SHOTS,
	...BACK_SHOTS
];

const SKY_A = { top: new THREE.Color('#9fd0f8'), mid: new THREE.Color('#c6e5fd'), low: new THREE.Color('#ecf7ff') };
const SKY_B = { top: new THREE.Color('#5da2ee'), mid: new THREE.Color('#93c7f7'), low: new THREE.Color('#cfe8fc') };
const SKY_IN = { top: new THREE.Color('#060f26'), mid: new THREE.Color('#0a1a3c'), low: new THREE.Color('#0d2150') };
/** The end of the day's work: blue still overhead, a warm glow rising from below. */
const SKY_DUSK = { top: new THREE.Color('#9cc8f4'), mid: new THREE.Color('#f2e2dc'), low: new THREE.Color('#ffe6c8') };

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
	/** 0..1 how far the light has gone over to late afternoon, at the very end. */
	dusk: number;
}

export class World {
	stage: Stage;
	rig: Rig;
	/** The side trip the reader is on, how far along it they are, and how far it has taken over the picture. */
	trackId: TrackId | null = null;
	trackT = 0;
	trackBlend = 0;
	onTrack: (id: TrackId) => void = () => {};
	/** Something in the scene was pressed, and where it is: for its sound. */
	onPoked: (what: string, x: number, y: number, z: number) => void = () => {};
	private trackRigs!: Record<TrackId, Rig>;
	private mcpTrack!: McpTrack;
	private mcpLead!: THREE.Curve<THREE.Vector3>;
	private mcpHit = hitBox(1.5, 1.5, 1.3);
	private harnessHit = hitBox(2.9, 3.9, 2.4);
	/**
	 * Inside a trip's own place: once the reader has dropped in, through the harness's roof or into the sandbox's glass,
	 * the world shows that place instead of everything else. arrive is the drop from above, 0 to 1, which the page plays.
	 */
	trackIn = false;
	trackArrive = 1;
	/**
	 * The places side trips drop into. Each is built the first time a reader goes there, not before: together they cost
	 * tens of megabytes of textures and geometry, and a phone's browser closes a page that holds too much.
	 */
	private places: { harness?: HarnessRoom; sandbox?: SandboxStage; memory?: MemoryStage; plans?: PlansStage } = {};
	/**
	 * Where an inside trip's way in is, in the story: the harness's roof hatch, the top of the glass, the memory cabinet,
	 * the laptop's screen.
	 */
	private roofRigs!: Record<Inside, Rig>;
	private above = new THREE.Vector3();
	private harnessPose: HarnessPose = { opens: [0, 0, 0, 0], filled: [0, 0, 0, 0], wake: 0.1 };
	private camFrom = new THREE.Vector3();
	private focusFrom = new THREE.Vector3();
	private focusTo = new THREE.Vector3();
	/** What the camera is looking at this frame, and a scratch point: where sounds are heard from. */
	private ear = new THREE.Vector3();
	private hear = new THREE.Vector3();
	/** The conversation's visits to things it names: see visit.ts. */
	private visits!: Visits;
	private bounds = new THREE.Box3();
	private part = new THREE.Box3();
	private piece = new THREE.Box3();
	root = new THREE.Group();

	// The machines, built a few at a time as the page opens: see create().
	private laptop!: Laptop;
	private harness!: Harness;
	private brain!: Brain;
	private skills!: SkillShelf;
	private doc!: RequestDoc;
	private strips!: Strip[];
	private tunnel!: Tunnel;
	private gateway!: Gateway;
	private gantry!: Gantry;
	private tiles!: Tile[];
	private mcp!: McpServer;
	private upstairs = new THREE.Group();
	private cluster!: Cluster;
	private back!: Back;
	private bulges: THREE.Mesh[] = [];
	private easelLegs!: THREE.Object3D;
	private downCurve!: THREE.Curve<THREE.Vector3>;
	private downLen = 1;
	private downTight: THREE.Vector3[] = [];
	private beltTicks!: THREE.CanvasTexture;
	private flow!: THREE.Curve<THREE.Vector3>;
	private flowLen = 1;
	private lipS = 1e9;
	private sagAt: V3 = [0, Infinity, 0];
	private rest!: THREE.InstancedMesh;
	private chevron!: THREE.Texture;
	private loopMeshes: THREE.Mesh[] = [];
	private routeCable!: THREE.Curve<THREE.Vector3>;
	private routeOut!: THREE.Curve<THREE.Vector3>;
	private stream!: THREE.Curve<THREE.Vector3>;
	private finale!: Finale;
	private clouds = new Cloudscape();

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
	private opened = 0;
	/**
	 * The page holds the opening (the lid shut, nothing typed) until the reader is there to hear it, when their sound
	 * is on: a browser plays nothing before the first click or key.
	 */
	waitIntro = false;
	/** The opening's own sounds: the lid starting to lift, and each letter of the sentence landing. */
	onIntro: ((what: 'lid' | 'key', i: number) => void) | null = null;
	private soundedKeys = 0;
	/** T value of the last frame, for one-shot logic. */
	state: WorldState = { form: 1, dive: 0, inside: false, dusk: 0 };

	/**
	 * Builds the world a piece at a time, with a frame between pieces, so the page stays alive while it's built and the
	 * loader can show how far it has got: `progress` hears 0 to 1.
	 */
	static async create(canvas: HTMLCanvasElement, progress: (k: number) => void = () => {}) {
		await Promise.all([loadFonts(), Brain.load()]);
		const w = new World(canvas);
		let done = 0;
		for (const [share, step] of w.steps()) {
			await breathe();
			step();
			done += share;
			progress(Math.min(1, done / 100));
		}
		return w;
	}

	private constructor(canvas: HTMLCanvasElement) {
		this.stage = new Stage(canvas);
		this.rig = new Rig(this.stage.camera, SHOTS);
		this.voyage = new Voyage(this.rig);
		this.visits = new Visits(this.stage, () => (this.trackIn && this.trackId ? [this.places[this.trackId as 'harness']?.group] : [this.root, this.cluster.group]));
	}

	/**
	 * The pieces of the world in the order they're built, each with its share of a hundred of the time it takes, for
	 * the loader. Each is built before the next is asked for, so a piece can hand on its own parts.
	 */
	private *steps(): Generator<[number, () => void]> {
		yield [
			9,
			() => {
				this.laptop = new Laptop();
				this.harness = new Harness();
				this.brain = new Brain();
				this.skills = new SkillShelf();
				this.doc = new RequestDoc();
			}
		];
		yield [
			8,
			() => {
				this.strips = [0, 1, 2, 3].map((i) => new Strip(i));
				this.tunnel = new Tunnel(TUNNEL_L);
				this.gateway = new Gateway();
				this.gantry = new Gantry();
				this.tiles = TOKENS.map((t) => new Tile(t));
				this.mcp = new McpServer();
			}
		];
		yield [27, () => (this.cluster = new Cluster())];
		yield [3, () => (this.back = new Back())];
		const back = this.back.steps();
		for (const step of back) yield [25 / back.length, step];
		yield [20, () => this.buildSky()];
		yield [8, () => this.finish()];
	}

	/** The sky and the islands in it, with everything that stands on them and the cables between. */
	private buildSky() {
		this.clouds.lay(
			[
				{ shots: SHOTS, sky: (T) => T < DIVE_T || T >= EXIT_T },
				{ shots: MCP_SHOTS, sky: () => true }
			],
			this.stage.camera.fov
		);
		this.stage.scene.add(this.root, this.cluster.group);
		this.assemble();
	}

	/** What needs the whole world standing: the upstairs split, the finale's route, the map, the side trips' rigs. */
	private finish() {
		this.splitUpstairs();
		this.root.add(this.back.group);
		// Its route is the pipes already standing, so it can only be built once they all are.
		this.finale = new Finale({
			cable: this.routeCable,
			out: this.routeOut,
			down: this.downCurve,
			flow: this.flow,
			flowLip: this.flowLipU(),
			...this.back.finaleRoute,
			slotX: SLOT_X,
			beltEnd: BELT_END,
			beltY: BELT_Y,
			lineZ: LINE_Z,
			tunnel: [TUNNEL_X, TUNNEL_X + TUNNEL_L, TUNNEL_Y],
			stream: this.stream
		});
		this.root.add(this.finale.group);
		this.buildMapPipes();
		this.mcpTrack = new McpTrack(this.harness, this.mcp, this.mcpLead);
		this.root.add(this.mcpTrack.group);

		this.trackRigs = {
			mcp: new Rig(this.stage.camera, MCP_SHOTS),
			harness: new Rig(this.stage.camera, ROOM_SHOTS),
			sandbox: new Rig(this.stage.camera, STAGE_SHOTS),
			memory: new Rig(this.stage.camera, MEMORY_SHOTS),
			plans: new Rig(this.stage.camera, PLANS_SHOTS)
		};
		this.roofRigs = {
			harness: new Rig(this.stage.camera, [
				{ T: 0, ...ROOF },
				{ T: 1, ...ROOF }
			]),
			sandbox: new Rig(this.stage.camera, [
				{ T: 0, ...GLASS_ROOF },
				{ T: 1, ...GLASS_ROOF }
			]),
			memory: new Rig(this.stage.camera, [
				{ T: 0, ...CABINET_ROOF },
				{ T: 1, ...CABINET_ROOF }
			]),
			plans: new Rig(this.stage.camera, [
				{ T: 0, ...SCREEN_ROOF },
				{ T: 1, ...SCREEN_ROOF }
			])
		};
		this.mcpHit.position.set(7.2, 0.7, -0.72);
		this.harnessHit.position.set(HARNESS_POS.x, 2.0, HARNESS_POS.z);
		this.root.add(this.mcpHit, this.harnessHit);
		this.setHarness('claude');
		this.wirePokes();
	}

	/**
	 * Everything upstairs, from the wire to the model, in a group of its own: the provider's side of the loop, which
	 * stands at rest outside the model once the request has gone through it.
	 */
	private splitUpstairs() {
		this.root.updateMatrixWorld(true);
		const box = new THREE.Box3();
		const centre = new THREE.Vector3();
		[...this.root.children].forEach((child) => {
			if ((child as THREE.Sprite).isSprite || child === this.upstairs || child === this.clouds.group) return;
			if (this.loopMeshes.includes(child as THREE.Mesh)) return;
			box.setFromObject(child);
			if (box.isEmpty()) return;
			box.getCenter(centre);
			if (centre.y > 4.5 || centre.x > 9) this.upstairs.add(child);
		});
		this.root.add(this.upstairs);
	}

	private assemble() {
		const r = this.root;

		// Islands, stepping up through the sky: your laptop, the far end of the wire, the tokenizer. The model's is its own.
		const islandA = createIsland(HOME_OUTLINE);
		r.add(islandA);

		const islet = createIsland(ISLET_OUTLINE, 0.46);
		islet.position.set(WIRE_X, ISLET_Y, 0);
		r.add(islet);

		const islandB = createIsland(B_OUTLINE);
		islandB.position.set(WIRE_X, ISLAND_B_Y, 0);
		r.add(islandB);

		const islandC = createIsland(C_OUTLINE);
		islandC.position.set(C_X, ISLAND_C_Y, 0);
		r.add(islandC);

		const zone = (text: string, x: number, y: number, z: number) => {
			const l = new Label(text, 0.27, { color: '#7f8fa8', weight: 700, tracking: -0.012, align: 'left' });
			l.mesh.rotation.x = -Math.PI / 2;
			l.mesh.position.set(x, y + 0.004, z);
			r.add(l.mesh);
		};
		zone('Your laptop', -3.6, 0, 2.75);
		zone('The provider', 14.2 + WIRE_X, ISLAND_B_Y, 2.5);
		zone('The provider', C_X - 1.4, ISLAND_C_Y, 2.5);

		const shade = (x: number, y: number, z: number, w: number, d: number, o: number) => {
			const m = createCastShadow(w, d, o);
			m.position.set(x, y, z);
			r.add(m);
		};
		// A soft shadow under each island of the row, out in the haze. Your own island's is off to its right, clear of the
		// pipes that go down the axis and along to the left.
		shade(4.5, -6.5, 0.2, 12, 10, 0.22);
		shade(16.6 + WIRE_X, ISLAND_B_Y - 5.6, 0.4, 11, 9, 0.22);
		shade(C_X + 3, ISLAND_C_Y - 5.6, 0.4, 19, 9, 0.22);

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
		this.mcp.group.position.set(7.2, 0, -0.72);
		r.add(this.mcp.group);
		this.skills.group.position.set(3.05, 0, 2.5);
		this.skills.group.rotation.y = 0.26;
		this.skills.group.scale.setScalar(0.76);
		r.add(this.skills.group);
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
		// The rail the tokenizer's gantry runs on, behind the belt.
		const railZ = LINE_Z + GANTRY_REAR * GANTRY_SCALE;
		const railLen = BELT_END - SLOT_X + 0.2;
		const gantryRail = new Batch();
		gantryRail.add(rbox(railLen, 0.05, 0.62, 0.02, 2), mats().steelSoft, { p: [SLOT_X + railLen / 2, ISLAND_C_Y + 0.025, railZ] });
		for (const s of [-1, 1]) gantryRail.add(rbox(railLen, 0.03, 0.05, 0.012, 1), mats().steel, { p: [SLOT_X + railLen / 2, ISLAND_C_Y + 0.06, railZ + s * 0.26] });
		r.add(gantryRail.build('gantry-rail'));
		const belt = createBelt(SLOT_X - 0.02, BELT_END);
		belt.position.set(0, BELT_Y, LINE_Z);
		r.add(belt);
		const bc = contactShadow(BELT_END - SLOT_X, 1.4, 0.16, 0.4);
		bc.position.set((SLOT_X + BELT_END) / 2, ISLAND_C_Y + 0.006, LINE_Z);
		r.add(bc);
		this.gantry.group.scale.setScalar(GANTRY_SCALE);
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
		this.root.add(this.clouds.group);
	}

	/**
	 * The token path: straight along the belt, round one bend into a glass lift at the end of the row, straight up it,
	 * round another and straight back along the top to the model, and down into its intake. Drawn with a ruler and a
	 * compass, so the tokens ride a pipe that is all straights and circles.
	 */
	private buildFlow() {
		const m = mats();
		const y = BELT_Y + TILE_H / 2;
		const z = LINE_Z;
		// Rigid along the belt and up the mast, where it's clamped; free from the top of the mast to the nozzle, hanging
		// over the two wheels under its own weight; then the fall into the well.
		const climb = bends([[SLOT_X, y, z], [LIFT_X, y, z], [LIFT_X, LIFT_TOP, z]], [1.6]);
		const top = (w: V3): V3 => [w[0], w[1] + WRAP, w[2]];
		const wheel = (w: V3): Solid => ({ roller: w, axis: [0, 0, 1], radius: WHEEL_R, half: 1 });
		const hose = hang({
			from: { at: [LIFT_X, LIFT_TOP, z], out: [0, 1, 0], bare: true },
			to: { at: [MODEL_X, NOZZLE_Y, z], out: [0, 1, 0], bare: true },
			via: [{ at: top(MAST_WHEEL), slack: 1.12 }, { at: top(MODEL_WHEEL), slack: 1.008 }],
			r: LIFT_R,
			slack: 1.14,
			bend: WRAP,
			on: [wheel(MAST_WHEEL), wheel(MODEL_WHEEL)]
		});
		const fall = new THREE.LineCurve3(new THREE.Vector3(MODEL_X, NOZZLE_Y, z), new THREE.Vector3(MODEL_X, INTAKE_TOP - 3, z));
		const flow = new THREE.CurvePath<THREE.Vector3>();
		flow.add(climb);
		flow.add(hose);
		flow.add(fall);
		this.flow = flow;
		this.flow.arcLengthDivisions = 3000;
		this.flowLen = this.flow.getLength();
		const nozzleS = climb.getLength() + hose.getLength();
		// The lowest the hose hangs between the wheels, for the map's mark.
		for (let i = 0; i <= 200; i++) {
			const p = hose.getPointAt(i / 200);
			if (p.x < MAST_WHEEL[0] && p.x > MODEL_WHEEL[0] && p.y < this.sagAt[1]) this.sagAt = p.toArray() as V3;
		}

		// The safety check stands where the path is about to leave the island, square to it.
		const archU = (SAFETY_X - SLOT_X) / this.flowLen;
		this.safety = new SafetyArch(0.2);
		this.safety.group.position.set(SAFETY_X, ISLAND_C_Y, z);
		this.root.add(this.safety.group);
		this.safetyS = archU * this.flowLen;

		// The hose: warm clear vinyl from just past the arch to the nozzle over the intake's mouth.
		const mouth = (SAFETY_X + 0.75 - SLOT_X) / this.flowLen;
		const lip = this.flowLipU();
		this.lipS = lip * this.flowLen;
		const tube = new PartOf(this.flow, mouth, nozzleS / this.flowLen);
		const glass = new THREE.Mesh(
			new THREE.TubeGeometry(tube, Math.ceil(tube.getLength() / 0.07), LIFT_R, 28),
			new THREE.MeshPhysicalMaterial({ color: '#ffb466', transparent: true, opacity: 0.34, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.name = 'token-lift';
		glass.renderOrder = 4;
		this.root.add(glass);
		const hoops = new Batch();
		const hoop = ring(LIFT_R + 0.1, LIFT_R + 0.02, 0.08);
		const Y = new THREE.Vector3(0, 1, 0);
		const q = new THREE.Quaternion();
		const e = new THREE.Euler();
		const len = tube.getLength();
		const at = (u: number, geo: THREE.BufferGeometry) => {
			q.setFromUnitVectors(Y, tube.getTangentAt(u));
			e.setFromQuaternion(q);
			hoops.add(geo, m.steel, { p: tube.getPointAt(u).toArray() as V3, r: [e.x, e.y, e.z] });
		};
		// Clamped up the mast: a ring round the hose every so often, on an arm back to the mast.
		const upFrom = LIFT_X - 1.6 - (SAFETY_X + 0.75) + Math.PI * 0.8;
		const climbFrom = (upFrom + 0.8) / len;
		const climbTo = (upFrom + LIFT_TOP - y - 1.6 - 0.4) / len;
		const poleZ = z - 1.15;
		const n = Math.round((climbTo - climbFrom) * len / 2.4);
		for (let i = 0; i <= n; i++) {
			const u = climbFrom + ((climbTo - climbFrom) * i) / n;
			at(u, hoop);
			const p = tube.getPointAt(u);
			hoops.add(rbox(0.08, 0.08, z - LIFT_R - 0.1 - poleZ, 0.02, 1), m.steelSoft, { p: [p.x, p.y, (z - LIFT_R - 0.1 + poleZ) / 2] });
			hoops.add(rbox(p.x - MAST_WHEEL[0], 0.08, 0.08, 0.02, 1), m.steelSoft, { p: [(p.x + MAST_WHEEL[0]) / 2, p.y, poleZ] });
		}
		const collar = ring(LIFT_R + 0.22, LIFT_R + 0.02, 0.24);
		at(0, collar);
		this.root.add(hoops.build('lift-hoops'));

		// The mast: a pole behind the hose from the island to the wheel's axle, and the wheel.
		const mast = new Batch();
		const mastTop = MAST_WHEEL[1] + 0.25;
		mast.add(new THREE.CylinderGeometry(0.13, 0.16, mastTop - ISLAND_C_Y, 16), m.steel, { p: [MAST_WHEEL[0], (mastTop + ISLAND_C_Y) / 2, poleZ] });
		mast.add(rbox(0.9, 0.12, 0.9, 0.04, 2), m.steelSoft, { p: [MAST_WHEEL[0], ISLAND_C_Y + 0.06, poleZ] });
		const axle = new THREE.CylinderGeometry(0.09, 0.09, z + 0.75 - poleZ, 14);
		mast.add(axle, m.steelSoft, { p: [MAST_WHEEL[0], MAST_WHEEL[1], (z + 0.75 + poleZ) / 2], r: [Math.PI / 2, 0, 0] });
		buildWheel(mast, MAST_WHEEL, WHEEL_R, 1.0);
		this.root.add(mast.build('mast'));

		// A steel trough from the end of the belt over the arch's floor to the mouth of the lift, so nothing crosses the gap
		// on air, and a stand linking it to the island.
		const b = new Batch();
		const trough = SAFETY_X + 0.75 - BELT_END;
		b.add(rbox(trough, 0.06, 1.1, 0.02, 2), m.steelSoft, { p: [BELT_END + trough / 2, BELT_Y - 0.03, z] });
		b.add(rbox(0.9, 0.5, 1.2, 0.08, 3), m.steelSoft, { p: [BELT_END + 0.1, BELT_Y - 0.28, z] });
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

	/** Where the tokens leave the nozzle over the intake's mouth and fall free into the well. */
	private flowLipU() {
		for (let i = 0; i <= 2000; i++) {
			const u = 0.7 + (i / 2000) * 0.3;
			if (this.flow.getPointAt(u).y < LIP_Y && Math.abs(this.flow.getPointAt(u).x - MODEL_X) < 0.01) return u;
		}
		return 1;
	}

	private buildPipes() {
		const m = mats();

		// The outbound line, warm: out of the harness, down onto the island, round the front of the easel, and straight off
		// the island's edge, dead level, into the foot of the wire on the next islet.
		const LINE_R = 0.078;
		const port: V3 = [HARNESS_POS.x + HW / 2, PORT_Y, HARNESS_POS.z + PORT_OUT_Z];
		const standFace: V3 = [TUNNEL_X + 0.1 - 0.25, ISLET_Y + 0.26, LINE_Z];
		const islet = slab(ISLET_OUTLINE, ISLET_Y, 0.46, [WIRE_X, 0]);
		const B = slab(B_OUTLINE, ISLAND_B_Y, 0.62, [WIRE_X, 0]);
		const C = slab(C_OUTLINE, ISLAND_C_Y, 0.62, [C_X, 0]);
		const harness: Solid = { min: [-0.42, 0, -1.92], max: [2.62, 3.9, 0.62] };
		const easel: Solid = { min: [4.45, 0, 0.17], max: [7.05, 3.4, 1.27] };
		const server: Solid = { min: [6.49, 0, -1.33], max: [7.91, 1.45, -0.11] };
		const R = LINE_R;
		// Lying on the floor round the front of the easel, then off your island's edge, across the gap, and up onto the
		// islet into the foot of the wire.
		const out = hang({
			from: { at: port, out: [1, 0, 0] },
			to: { at: standFace, out: [-1, 0, 0] },
			via: [
				{ at: [3.7, R, 0.9], slack: 1.03 },
				{ at: [5.75, R, 1.6], slack: 1.0 },
				{ at: [7.8, R, 1.2], slack: 1.0 }
			],
			r: R,
			slack: 1.015,
			bend: 0.5,
			on: [HOME, islet, harness, easel, server]
		});
		this.routeOut = out;
		const outTube = new THREE.Mesh(new THREE.TubeGeometry(out, Math.ceil(out.getLength() / 0.05), LINE_R, 16), m.orangeGlow);
		outTube.castShadow = true;
		this.root.add(outTube);
		const fittings = (parts: (b: Batch) => void) => {
			const b = new Batch();
			parts(b);
			this.root.add(b.build('fittings'));
		};
		fittings((b) => fitting(b, standFace, [-1, 0, 0], LINE_R, { flange: 1.9 }));

		// Gateway to the chat template: out of the rear wall, straight back, along behind both islands, and forward into the template.
		const gateRear: V3 = [GATEWAY_X, ISLAND_B_Y + 0.7, LINE_Z - 1.1];
		const templateRear: V3 = [TEMPLATE_X, ISLAND_C_Y + 0.45, LINE_Z - 0.95];
		fittings((b) => fitting(b, gateRear, [0, 0, -1], LINE_R));
		fittings((b) => fitting(b, templateRear, [0, 0, -1], LINE_R));
		// Down off the back of the gateway onto the floor, along behind it, across the gap between the islands, and up into
		// the template's back.
		const down = hang({
			from: { at: gateRear, out: [0, 0, -1] },
			to: { at: templateRear, out: [0, 0, -1] },
			via: [
				{ at: [GATEWAY_X + 1.2, ISLAND_B_Y + R, -1.35], slack: 1.03 },
				{ at: [TEMPLATE_X - 1.2, ISLAND_C_Y + R, -1.3], slack: 1.012 }
			],
			r: R,
			slack: 1.03,
			bend: 0.5,
			on: [B, C]
		});
		const downTube = new THREE.Mesh(new THREE.TubeGeometry(down, Math.ceil(down.getLength() / 0.05), LINE_R, 16), m.orangeGlow);
		downTube.castShadow = true;
		this.root.add(downTube);
		this.downCurve = down;
		this.downLen = down.getLength();
		this.downTight = [gateRear, templateRear].map((p) => new THREE.Vector3(...p));

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
		const lead = curve([
			...leaving([6.6, 0.9, -0.94], [-1, 0, 0], 0.042),
			[6.05, 0.62, -1.12],
			[5.7, 0.08, -1.7],
			[4.6, 0.045, -2.2],
			[3.3, 0.045, -2.25],
			[3.12, 0.05, -1.9],
			[2.98, 0.16, -1.45],
			[2.84, 0.36, -1.24],
			...leaving([HARNESS_POS.x + HW / 2, PORT_Y, HARNESS_POS.z + PORT_MCP_Z], [1, 0, 0], 0.042).reverse()
		]);
		this.mcpLead = lead;
		const leadTube = new THREE.Mesh(new THREE.TubeGeometry(lead, 100, 0.042, 10), m.cobalt);
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
		const laptopTurn = this.laptop.group.rotation;
		const plug = new THREE.Vector3(...LAPTOP_PORT).applyEuler(laptopTurn).add(this.laptop.group.position);
		const away = new THREE.Vector3(1, 0, 0).applyEuler(laptopTurn);
		const cable = curve([
			...leaving([plug.x, plug.y, plug.z], [away.x, away.y, away.z], 0.04),
			[-1.2, 0.04, -0.34],
			[-0.9, 0.04, -0.62],
			[-0.72, 0.14, -0.69],
			[-0.57, 0.37, -0.7],
			...leaving([HARNESS_POS.x - HW / 2, PORT_Y, HARNESS_POS.z + PORT_KEYS_Z], [-1, 0, 0], 0.04).reverse()
		]);
		this.routeCable = cable;
		const cm = new THREE.Mesh(new THREE.TubeGeometry(cable, 60, 0.04, 10), m.rubber);
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
		const ret = returnPath();
		const rollers = new Batch();
		buildRoller(rollers, RETURN_ROLLER);
		buildRoller(rollers, CALL_ROLLER);
		this.root.add(rollers.build('rollers'));
		const len = ret.getLength();
		const retMat = (m.greenGlow as THREE.MeshPhysicalMaterial).clone();
		retMat.emissiveMap = this.chevron;
		retMat.emissive.set('#b9ffd6');
		retMat.emissiveIntensity = 1.0;
		this.chevron.repeat.set(len / 0.62, 2);
		const segments = Math.ceil(len / 0.06);
		const backing = new THREE.Mesh(new THREE.TubeGeometry(ret, segments, 0.115, 20), retMat);
		backing.castShadow = true;
		backing.name = 'return-loop';
		this.root.add(backing);
		this.loopMeshes = [backing];
		const haze = new THREE.Mesh(
			new THREE.TubeGeometry(ret, segments, 0.115 * 1.3, 20),
			new THREE.MeshBasicMaterial({ color: color.green, transparent: true, opacity: 0.16, depthWrite: false })
		);
		this.root.add(haze);
		this.loopMeshes.push(haze);
	}

	/**
	 * The model, at the top of the axis through your laptop: the brain on its pedestal, the intake on its roof, and the
	 * reply's glass column, straight down out of the underside of its island into the harness's roof. The column stands
	 * from the first frame, like the green loop, and is explained when it's used.
	 */
	private buildModelTeaser() {
		const m = mats();
		const x = MODEL_X;
		const z = MODEL_Z;
		this.brain.group.position.set(x, MODEL_ROOF - BRAIN_SEAT, z);
		this.root.add(this.brain.group);
		this.buildIntake(x, MODEL_ROOF, z);
		// A gantry on the intake's rim: two legs, an axle across them with the hose's wheel on it, and a nozzle on an arm
		// below the wheel, where the hose ends and the tokens fall out into the well.
		const post = new Batch();
		const [wx, wy] = MODEL_WHEEL;
		const leg = wy + 0.2 - INTAKE_TOP;
		for (const s of [-1.48, 1.48]) post.add(rbox(0.14, leg, 0.14, 0.03, 2), m.steelSoft, { p: [wx, INTAKE_TOP + leg / 2, z + s] });
		post.add(new THREE.CylinderGeometry(0.08, 0.08, 3.1, 14), m.steelSoft, { p: [wx, wy, z], r: [Math.PI / 2, 0, 0] });
		buildWheel(post, MODEL_WHEEL, WHEEL_R, 1.0);
		const armY = NOZZLE_Y - 0.25;
		post.add(rbox(0.1, 0.1, 2.96, 0.03, 1), m.steelSoft, { p: [wx, armY, z] });
		post.add(rbox(wx - x - 0.45, 0.1, 0.1, 0.03, 1), m.steelSoft, { p: [(wx + x + 0.45) / 2, armY, z] });
		post.add(new THREE.CylinderGeometry(LIFT_R + 0.1, LIFT_R + 0.06, NOZZLE_Y - LIP_Y + 0.1, 28, 1, true), m.steel, { p: [x, (NOZZLE_Y + LIP_Y) / 2, z] });
		post.add(ring(LIFT_R + 0.2, LIFT_R + 0.02, 0.18), m.steel, { p: [x, NOZZLE_Y + 0.02, z] });
		this.root.add(post.build('chute-post'));

		const stream = new THREE.LineCurve3(new THREE.Vector3(...STREAM_TOP), new THREE.Vector3(...STREAM_BOTTOM));
		this.stream = stream;
		const glass = new THREE.Mesh(
			new THREE.TubeGeometry(stream, 2, 0.5, 36),
			new THREE.MeshPhysicalMaterial({ color: '#7fb4ea', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.name = 'stream';
		glass.renderOrder = 4;
		this.root.add(glass);
		const hoops = new Batch();
		const [ax, top, az] = STREAM_TOP;
		const bottom = STREAM_BOTTOM[1];
		for (let y = bottom + 2.8; y < top - 1; y += 2.8) hoops.add(ring(0.6, 0.52, 0.08), m.steel, { p: [ax, y, az] });
		hoops.add(ring(0.74, 0.52, 0.26), m.steel, { p: [ax, top + 0.05, az] });
		hoops.add(ring(0.68, 0.52, 0.2), m.steel, { p: [ax, bottom + 0.1, az] });
		this.root.add(hoops.build('stream-hoops'));
	}

	/**
	 * The way in. A hatch standing on the roof with a real well inside it: walls that step inward and
	 * fall away into the dark, lit rings, and at the bottom a first glimpse of the boards inside.
	 */
	private buildIntake(x: number, roof: number, z: number) {
		const m = mats();
		const H = INTAKE_H;
		const IX = INTAKE_HALF * 2;
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
		WELL_FLOOR_Y = floor.position.y;
		this.root.add(floor);
	}

	setTurn(turn: number) {
		this.back.setTurn(turn);
	}

	/** What the reader can press, and when. Tell the page about anything that belongs to it. */
	/** A press on the wheel or the finale's Enter; a conversation's spin can say which slice it lands in. */
	onPress: (what: 'wheel' | 'enter', want?: number) => void = () => {};
	/** On a phone, how far down the screen the words begin at this point in the story. The page measures it. */
	roomAt: ((T: number) => number) | null = null;
	/** During a peek at another moment of the story, the moment the reader is at: its card decides where the picture goes. */
	homeT: number | null = null;
	/** On a phone, where the header ends, as a share of the screen: no picture is framed under it. */
	ceiling = 0;
	/** On a phone, where the title page's words end, as a share of the screen: its picture has the room below. */
	titleFloor: number | null = null;
	/** The same, for the side trip the reader is on, by the trip's own time. */
	tripRoomAt: ((t: number) => number) | null = null;
	private poker = new Poker();
	private lastT = 0;
	/** A flight between far-apart moments of the story, while the page has one under way: see voyage.ts. */
	flight: Flight | null = null;
	private voyage!: Voyage;
	/** Which way up each tile has been turned by hand, and how far along that is. */
	private tileSide = TOKENS.map(() => 0);
	private tileFrom = TOKENS.map(() => 0);
	private tileAt = TOKENS.map(() => -1e6);
	private safety!: SafetyArch;
	private safetyS = 0;
	private pulledAtT = 0;

	private wirePokes() {
		const finale = (T: number) => T >= 32.3;
		this.poker.add({
			targets: this.harness.drawerHits,
			when: (T) => T > 2.04 && T < 2.78,
			press: (i) => {
				this.harness.pull(i % 4);
				this.pulledAtT = this.lastT;
			},
			sound: 'drawer'
		});
		this.poker.add({ targets: this.tiles.map((t) => t.body), when: (T) => T > 6.56 && T < 6.86, press: (i) => this.flipTile(i), sound: 'tile' });
		this.poker.add({ targets: [this.brain.hit], when: (T) => (T > 7.2 && T < 7.8) || finale(T), press: () => this.brain.excite(), sound: 'brain' });
		this.poker.add({ targets: [this.laptop.hit], when: finale, press: () => this.onPress('enter') });
		this.poker.add({ targets: [this.cluster.wheelDisc], when: (T) => T > 15.1 && T < 15.86, press: () => this.onPress('wheel') });
		// The server opens its own side trip, while the island it stands on is the story.
		this.poker.add({ targets: [this.mcpHit], when: (T) => T < 2.76, press: () => this.onTrack('mcp') });
		// So does the harness, until its drawers are the thing to press.
		this.poker.add({ targets: [this.harnessHit], when: (T) => T < 2.02, press: () => this.onTrack('harness') });
	}

	/**
	 * What the scene holds on the GPU, in megabytes: every texture at its printed size, and every geometry. A phone's
	 * browser closes a page that holds too much, so a test keeps these inside a budget.
	 */
	memory() {
		const textures = new Set<THREE.Texture>();
		const geometries = new Set<THREE.BufferGeometry>();
		this.stage.scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
			for (const m of list as (THREE.Material & Record<string, unknown>)[])
				for (const key of ['map', 'emissiveMap', 'alphaMap']) {
					const t = m[key] as THREE.Texture | null | undefined;
					if (t?.image) textures.add(t);
				}
			if (mesh.geometry) geometries.add(mesh.geometry);
		});
		let texture = 0;
		for (const t of textures) {
			const image = t.image as { width: number; height: number };
			const pixels = Surface.of.get(t)?.pixels ?? image.width * image.height;
			texture += pixels * 4 * (t.generateMipmaps ? 4 / 3 : 1);
		}
		let geometry = 0;
		for (const g of geometries) {
			for (const a of Object.values(g.attributes)) geometry += (a as THREE.BufferAttribute).array.byteLength;
			if (g.index) geometry += g.index.array.byteLength;
		}
		return { textureMB: Math.round(texture / 1e6), geometryMB: Math.round(geometry / 1e6) };
	}

	/** The agent the reader picked. */
	get agent() {
		return this.harnessId;
	}

	/** Starts or ends a side trip. The page moves trackT and trackBlend; this only says which trip. */
	setTrack(id: TrackId | null) {
		if (id) this.harness.pulled = -1;
		this.trackId = id;
		// Build its place now, while the camera is still on its way there, rather than in the middle of the drop.
		if (id && id !== 'mcp') this.place(id);
	}

	/** A side trip's place, built on first use, with its materials compiled before it is first seen. */
	private place<K extends Inside>(id: K) {
		let made = this.places[id];
		if (!made) {
			const built = id === 'harness' ? new HarnessRoom() : id === 'sandbox' ? new SandboxStage() : id === 'memory' ? new MemoryStage() : new PlansStage();
			if (!(built instanceof HarnessRoom)) built.setHarness(this.harnessId);
			built.group.visible = false;
			this.stage.scene.add(built.group);
			this.stage.renderer.compile(built.group, this.stage.camera);
			this.places[id] = built as never;
			made = built as never;
		}
		return made as NonNullable<(typeof this.places)[K]>;
	}

	/** Returns whether anything answered. */
	pressAt(x: number, y: number) {
		if (this.trackId) return false;
		const hit = this.poker.pick(this.lastT, x, y, this.stage.camera);
		if (hit) {
			hit.p.press(hit.index);
			if (hit.p.sound) {
				const p = hit.p.targets[hit.index].getWorldPosition(this.hear);
				this.onPoked(hit.p.sound, p.x, p.y, p.z);
			}
		}
		return !!hit;
	}

	overAt(x: number, y: number) {
		if (this.trackId) return false;
		return !!this.poker.pick(this.lastT, x, y, this.stage.camera);
	}

	/**
	 * How a sound made at a point is heard right now: from where it is on screen, left to right, and quieter the
	 * further it is beyond what the camera is looking at, or once it's out of the picture.
	 */
	heard(x: number, y: number, z: number) {
		const cam = this.stage.camera;
		const p = this.hear.set(x, y, z);
		const d = Math.max(0.1, p.distanceTo(cam.position));
		const ref = Math.max(1, this.ear.distanceTo(cam.position));
		p.project(cam);
		const behind = p.z > 1;
		const off = behind ? 1 : Math.max(0, Math.max(Math.abs(p.x), Math.abs(p.y)) - 1);
		return {
			pan: behind ? 0 : Math.max(-1, Math.min(1, p.x * 0.8)),
			gain: Math.min(1.2, Math.pow(ref / d, 0.7)) * (1 - Math.min(0.7, off * 0.9))
		};
	}

	private placed = new Map<string, [number, number, number]>();
	private placeBox = new THREE.Box3();
	/**
	 * The middle of a named thing on the story's road, for a sound to come from: found once, then remembered. Null if
	 * there's nothing by that name yet.
	 */
	placeOf(name: string): [number, number, number] | null {
		const known = this.placed.get(name);
		if (known) return known;
		const o = this.root.getObjectByName(name) ?? this.cluster.group.getObjectByName(name);
		if (!o) return null;
		o.updateWorldMatrix(true, true);
		const c = this.placeBox.setFromObject(o).getCenter(new THREE.Vector3());
		const p: [number, number, number] = [c.x, c.y, c.z];
		this.placed.set(name, p);
		return p;
	}

	/** The top of the model, wherever the world has it: a flight into it or up out of it looks down on it from there. */
	modelTop(): [number, number, number] {
		const box = this.part.setFromObject(this.brain.group);
		const c = box.getCenter(this.v4);
		return [c.x, box.max.y, c.z];
	}

	get pulledDrawer() {
		return this.harness.pulled;
	}

	/**
	 * Where things with these names are on screen now, in CSS pixels from the top left, and the middle of them in the
	 * world: the biggest one in view, or all of them in view together. Null when none is showing. Things are named where
	 * they're built: a machine and a sign by their words, a batch by its build name, a drawer by its label.
	 */
	whereIs(names: string[], together = false) {
		const cam = this.stage.camera;
		const scenes = this.trackIn && this.trackId ? [this.places[this.trackId as 'harness']?.group] : [this.root, this.cluster.group];
		const W = this.stage.width;
		const H = this.stage.height;
		let best: { x: number; y: number; w: number; h: number; area: number; mid: THREE.Vector3 } | null = null;
		const all = this.bounds.makeEmpty();
		for (const scene of scenes) {
			if (!scene) continue;
			for (const name of names) {
				for (const o of scene.getObjectsByProperty('name', name)) {
					let shown = true;
					for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) shown = false;
					if (!shown) continue;
					// Only what's drawn: a hidden stand-in for pressing doesn't count towards its size.
					const box = this.part.makeEmpty();
					o.traverseVisible((m) => {
						const g = (m as THREE.Mesh).geometry;
						if (!g) return;
						if (!g.boundingBox) g.computeBoundingBox();
						box.union(this.piece.copy(g.boundingBox!).applyMatrix4(m.matrixWorld));
					});
					if (box.isEmpty()) continue;
					if (together) {
						all.union(box);
						continue;
					}
					const r = this.onScreen(box, cam, W, H);
					if (r && (!best || r.area > best.area)) best = { ...r, mid: box.getCenter(new THREE.Vector3()) };
				}
			}
		}
		if (together && !all.isEmpty()) {
			const r = this.onScreen(all, cam, W, H);
			if (r) best = { ...r, mid: all.getCenter(new THREE.Vector3()) };
		}
		if (!best) return null;
		return { x: best.x, y: best.y, w: best.w, h: best.h, mid: [best.mid.x, best.mid.y, best.mid.z] as [number, number, number] };
	}

	/** A box's outline on screen, cut to the screen, or null if it's behind the camera or hardly in view. */
	private onScreen(box: THREE.Box3, cam: THREE.Camera, W: number, H: number) {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (let i = 0; i < 8; i++) {
			const p = this.v4.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
			if (p.z > 1) return null;
			const x = ((p.x + 1) / 2) * W;
			const y = ((1 - p.y) / 2) * H;
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
		const whole = (x1 - x0) * (y1 - y0);
		const cx0 = Math.max(0, x0);
		const cy0 = Math.max(0, y0);
		const cx1 = Math.min(W, x1);
		const cy1 = Math.min(H, y1);
		const seen = Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0);
		// Mostly in view, and big enough to see.
		if (seen < 600 || seen < whole * 0.6) return null;
		return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0, area: seen };
	}

	/**
	 * Takes the camera to something the conversation names, and does what it's doing there: pulls a drawer, flips the
	 * tiles, wakes the brain, spins the wheel. False if there's nothing by those names in the scene now. cutBack is for a
	 * peek at another moment of the story, which the page ends with a cut.
	 */
	visit(cue: { names: string[]; together?: boolean; hold?: number; act?: string; index?: number; cutBack?: boolean; still?: boolean; wide?: boolean; front?: boolean }) {
		return this.visits.start({
			names: cue.names,
			together: cue.together,
			hold: cue.hold,
			cutBack: cue.cutBack,
			still: cue.still,
			wide: cue.wide,
			front: cue.front,
			act: this.actFor(cue.act, cue.index),
			fly: !this.trackIn
		});
	}

	/** Whether something by one of these names is in the scene now, in the shot or not. */
	hasThing(names: string[]) {
		return this.visits.has(names);
	}

	/** Brings the camera back from a visit now; quick gives the shot back in a moment. */
	leaveVisit(quick = false) {
		this.visits.release(quick);
	}

	/** Drops a visit at once: the page has cut away. */
	endVisit() {
		this.visits.end();
	}

	get visiting() {
		return this.visits.busy;
	}

	/** A peek has stayed its time, and waits for the page to cut back. */
	get visitDone() {
		return this.visits.waiting;
	}

	/** What a visit does once it's there. */
	private actFor(act: string | undefined, index = 0) {
		if (act === 'pull') {
			return () => {
				this.harness.pull(index % 4);
				this.pulledAtT = this.lastT;
				const p = this.harness.group.getWorldPosition(this.v4);
				this.onPoked('drawer', p.x, p.y, p.z);
			};
		}
		if (act === 'flip') return () => this.tiles.forEach((_, i) => this.flipTile(i));
		if (act === 'excite') return () => this.brain.excite();
		if (act === 'spin') return () => this.onPress('wheel', index);
		return undefined;
	}



	private tileShown(i: number, now: number) {
		return lerp(this.tileFrom[i], this.tileSide[i], smooth(seg(now, this.tileAt[i], this.tileAt[i] + 560)));
	}

	private flipTile(i: number) {
		const now = performance.now();
		this.tileFrom[i] = this.tileShown(i, now);
		this.tileSide[i] = 1 - this.tileSide[i];
		this.tileAt[i] = now;
	}

	pressEnter(reduced: boolean) {
		this.finale.press(reduced);
	}

	get trip() {
		return { step: this.finale.running ? this.finale.step : -1, laps: this.finale.laps };
	}

	/** Names one of the four gates in "Intent is not authority": its beacon flares. */
	nameGate(i: number) {
		this.back.nameGate(i);
	}

	/** Names one of the front door's five checks: its blade nods out, its lamp flares. */
	nameCheck(i: number) {
		this.gateway.name(i);
	}

	/** Names one of the seven kinds of memory on its card: its drawer comes out. */
	nameMemory(i: number) {
		this.back.nameMemory(i);
	}

	setCache(on: boolean) {
		this.back.setCache(on);
	}

	setTemperature(temperature: number) {
		this.cluster.setTemperature(temperature);
	}

	spinWheel(reduced: boolean, want?: number) {
		return this.cluster.spinWheel(reduced, want);
	}

	setHarness(id: HarnessId) {
		this.harnessId = id;
		this.places.sandbox?.setHarness(id);
		this.places.memory?.setHarness(id);
		this.places.plans?.setHarness(id);
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
		this.lastT = T;
		// The whole world is in frame and only tokens move, too small to change a shadow anyone can see.
		this.stage.holdShadows(T >= HOLD_SHADOWS_T);
		// Whatever the reader pulled out goes back as soon as they scroll on.
		if (this.harness.pulled >= 0 && Math.abs(T - this.pulledAtT) > 0.06) this.harness.pulled = -1;
		const before = this.intro;
		if (introDone || !this.waitIntro) {
			this.intro = introDone ? 1 : Math.min(1, this.intro + dt / 1.5);
			this.opened = introDone ? Infinity : this.opened + dt;
		}
		if (!introDone && this.onIntro) {
			if (before < 0.28 && this.intro >= 0.28) this.onIntro('lid', 0);
			const typed = Math.floor(this.selfTyped());
			while (this.soundedKeys < typed) this.onIntro('key', this.soundedKeys++);
		}
		// The easel only stands while it has a page to hold: the request, then turn two.
		const legs = inOut(seg(T, 2.02, 2.09)) * (1 - inOut(seg(T, 3.64, 3.74))) + outBack(seg(T, 25.38, 25.47), 1.2) * (1 - inOut(seg(T, 25.92, 26)));
		this.easelLegs.visible = legs > 0.002;
		this.easelLegs.scale.y = Math.max(0.002, legs);
		const intro = this.intro;

		// The picture makes room before the words arrive, and only takes it back once they've gone.
		const home = this.homeT ?? undefined;
		this.rig.update(T, this.stage.width, this.stage.height, px, py, time, this.roomAt?.(home ?? T), this.titleFloor ?? undefined, this.ceiling, home);
		this.frameTrack(px, py, time);

		// Inside a trip's own place, nothing else exists.
		for (const [id, place] of Object.entries(this.places)) place.group.visible = this.trackIn && this.trackId === id;
		if (this.trackIn) {
			const id = insideOf(this.trackId);
			this.root.visible = false;
			this.cluster.group.visible = false;
			this.state.inside = false;
			this.state.dive = 0;
			this.state.dusk = 0;
			this.stage.setWarmth(0);
			this.stage.holdShadows(false);
			const sky = INSIDE[id].sky;
			this.stage.setSky(sky.top, sky.mid, sky.low);
			this.place(id).update(this.trackT, time);
			this.visits.apply(dt, time);
			this.stage.render();
			return;
		}

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
			sky.setWarmth(0);
			this.state.dusk = 0;
			this.cluster.update(T, time);
		} else {
			const k = T >= EXIT_T ? 0 : skyK;
			const top = this.c1.copy(SKY_A.top).lerp(SKY_B.top, k);
			const mid = this.c2.copy(SKY_A.mid).lerp(SKY_B.mid, k);
			const low = this.c3.copy(SKY_A.low).lerp(SKY_B.low, k);
			// As the camera pulls back to see the whole trip, the light goes over to late afternoon.
			const dusk = T >= FINALE_T ? smooth(seg(T, 32.04, 32.4)) : 0;
			this.state.dusk = dusk;
			if (dusk > 0) {
				top.lerp(SKY_DUSK.top, dusk);
				mid.lerp(SKY_DUSK.mid, dusk);
				low.lerp(SKY_DUSK.low, dusk);
			}
			sky.setSky(top, mid, low);
			sky.setWarmth(dusk);
			this.clouds.setWarmth(dusk);
			this.clouds.update(time);

			this.root.position.y = (1 - outCubic(seg(intro, 0, 0.8))) * -0.9;

			// Upstairs is always there, outside the model. Your tools' ring below stands from the first frame too, at rest
			// until the reply comes down and its chapters start.
			this.back.group.visible = true;
			if (T < DIVE_T) {
				this.back.idle(time);
				// However the reader got back here, the last chapter's things have gone: a cut from the end skips everything between.
				this.finale.update(T);
				this.laptop.finish(0);
				this.updateLaptop(T, time, intro);
				this.updateHarnessAndRequest(T, time);
				this.updateTunnel(T, time, dt);
				this.updateGateway(T, time);
				this.updateTokenizer(T, time);
				this.mcp.update(seg(T, 1.86, 2.0), time);
				this.skills.update(T);
				this.updateBulges(T);
				this.brain.update(T, time);
			} else {
				// Everything from the first half at rest upstairs, however the reader got here.
				this.updateTunnel(5.6, time, dt);
				this.updateGateway(6, time);
				this.updateTokenizer(6, time);
				this.brain.update(6.9 + this.finale.brainBusy * 0.8, time);
				// The first half of the journey is over: its travellers have gone, its machines stay.
				this.doc.group.visible = false;
				this.strips.forEach((s) => (s.mesh.visible = false));
				this.tiles.forEach((t) => (t.group.visible = false));
				this.rest.visible = false;
				this.bulges.forEach((b) => (b.visible = false));
				this.laptop.finish(smooth(seg(T, 31.3, 31.46)));
				this.laptop.say(laptopSays(T));
				this.laptop.update(PROMPT.length, 1, time, 1, false);
				this.mcp.update(1, time);
				this.finale.update(T);
				this.safety.update(1, 1, 1, 1, 0, time);
				this.harness.update(this.back.opens(T), [1, 1, 1, 1], 1, time, this.back.jolt(T) + this.finale.harnessPulse * 0.6);
				this.back.update(T, time, this.finale.onTrack);
			}

			this.chevron.offset.x = time * 0.42;
		}

		// A side trip borrows the first island, so it plays over whatever the story has posed there.
		if (!inside) this.mcpTrack.update(this.trackT, this.trackId === 'mcp' ? this.trackBlend : 0, time, this.harnessPose, seg(T, 1.86, 2.0));

		this.state.form = formAt(T);
		this.visits.apply(dt, time);
		this.maybeDrawMap(T, this.stopAt(T));
		if (this.flight) {
			const seen = this.voyage.apply(this.stage.camera, this.flight, this.stage.width, this.stage.height);
			this.stage.focusLight(seen.look, seen.reach);
		}
		this.stage.render();
	}

	/**
	 * The camera, when a side trip is taking over: part way through, it is between where the story had it and where the
	 * trip wants it, moving its eye and what it looks at together, so the flight never turns away from the subject.
	 */
	private frameTrack(px: number, py: number, time: number) {
		const k = this.trackId ? this.trackBlend : 0;
		if (k <= 0 || !this.trackId) {
			this.stage.focusLight(this.rig.focus, this.rig.radius);
			this.ear.copy(this.rig.focus);
			return;
		}
		const cam = this.stage.camera;
		const { width, height } = this.stage;
		this.camFrom.copy(cam.position);
		this.focusFrom.copy(this.rig.focus);
		const ox = cam.view?.offsetX ?? 0;
		const oy = cam.view?.offsetY ?? 0;
		const near = cam.near;
		const radius = this.rig.radius;
		if (this.trackIn) return this.frameRoom(px, py, time);
		// A trip into a place of its own first goes to where the way in is.
		const rig = this.trackId === 'mcp' ? this.trackRigs.mcp : this.roofRigs[this.trackId];
		rig.update(this.trackT, width, height, px, py, time, this.tripRoomAt?.(this.trackT), undefined, this.ceiling);
		if (k >= 1) {
			this.stage.focusLight(rig.focus, rig.radius);
			this.ear.copy(rig.focus);
			return;
		}
		cam.position.lerpVectors(this.camFrom, cam.position, k);
		this.focusTo.lerpVectors(this.focusFrom, rig.focus, k);
		this.ear.copy(this.focusTo);
		cam.lookAt(this.focusTo);
		cam.near = Math.min(near, cam.near);
		cam.setViewOffset(width, height, lerp(ox, cam.view?.offsetX ?? 0, k), lerp(oy, cam.view?.offsetY ?? 0, k), width, height);
		cam.updateProjectionMatrix();
		this.stage.focusLight(this.focusTo, lerp(radius, rig.radius, k));
	}

	/** In the room: the trip's own camera, which drops in from high above as the reader arrives, and rises back out. */
	private frameRoom(px: number, py: number, time: number) {
		const cam = this.stage.camera;
		const { width, height } = this.stage;
		const id = insideOf(this.trackId);
		const rig = this.trackRigs[id];
		const place = INSIDE[id].at;
		rig.update(this.trackT, width, height, px, py, time, this.tripRoomAt?.(this.trackT), undefined, this.ceiling);
		const k = this.trackArrive;
		if (k >= 1) {
			this.stage.focusLight(rig.focus, rig.radius);
			this.ear.copy(rig.focus);
			return;
		}
		const e = 1 - (1 - k) ** 3;
		// Straight down from over the middle of the room, turning to the trip's own view as it comes down.
		this.above.set(place.x + 0.4, place.y + 22, place.z + 1.6);
		cam.position.lerpVectors(this.above, cam.position, e);
		this.focusTo.copy(place).lerp(rig.focus, e);
		this.ear.copy(this.focusTo);
		cam.lookAt(this.focusTo);
		cam.near = 0.5;
		const ox = cam.view?.offsetX ?? 0;
		const oy = cam.view?.offsetY ?? 0;
		cam.setViewOffset(width, height, ox * e, oy * e, width, height);
		cam.updateProjectionMatrix();
		this.stage.focusLight(this.focusTo, lerp(12, rig.radius, e));
	}

	private c1 = new THREE.Color();
	private c2 = new THREE.Color();
	private c3 = new THREE.Color();

	/** How much of the sentence has typed itself on the title page, 0 to 1: that much of the typing beat has nothing new to show. */
	get typedAhead() {
		return this.selfTyped() / PROMPT.length;
	}

	/** How far the sentence has typed itself since the page opened, in letters. The fraction is the key on its way down. */
	private selfTyped() {
		const i = LETTER_AT.findLastIndex((at) => at <= this.opened);
		if (i < 0) return 0;
		if (i === PROMPT.length - 1 && this.opened >= LETTER_AT[i] + 0.08) return PROMPT.length;
		return i + Math.min(1, (this.opened - LETTER_AT[i]) / ((LETTER_AT[i + 1] ?? LETTER_AT[i] + 0.08) - LETTER_AT[i]));
	}

	private updateLaptop(T: number, time: number, intro: number) {
		const lid = spring(seg(intro, 0.28, 1), 2.6, 5);
		// It types itself as the page opens. Anyone who scrolls on before it's finished only hurries it along.
		const typedF = Math.max(seg(T, HOLD.type[0], HOLD.type[1]) * PROMPT.length, this.selfTyped());
		const sent = seg(T, HOLD.send[0], HOLD.send[1]);
		this.laptop.say(laptopSays(T));
		this.laptop.update(typedF, sent, time, lid, typedF < PROMPT.length || (T > 0.9 && T < 1.8));
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
		this.harnessPose = { opens, filled, wake: 0.1 + wake * 0.9 };
		this.harness.group.updateWorldMatrix(true, true);

		/* ----- the document ----- */
		// Same easing and window as the camera, so the page stays in frame all the way down.
		const moveK = smoother(seg(T, 3.58, 4.0));
		const enterK = seg(T, 4.0, 4.26);
		const scale = lerp(1, 0.62, smooth(seg(T, 3.58, 3.76)));
		const u = 1 - moveK;
		const P0 = DOC_POS;
		// Up and out over the stand and the island's edge, then level with the wire's mouth, on the next islet along.
		const dropX = u * u * u * P0.x + 3 * u * u * moveK * 8.2 + 3 * u * moveK * moveK * (TUNNEL_X - 3) + moveK * moveK * moveK * (TUNNEL_X - 1.05);
		const docY = u * u * u * P0.y + 3 * u * u * moveK * (P0.y + 2.2) + 3 * u * moveK * moveK * (TUNNEL_Y + 0.5) + moveK * moveK * moveK * TUNNEL_Y;
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
			// A slug's length apart, however long the pipe is.
			const u = inOut(k) * 1.18 - (i * 0.95) / this.downLen;
			slug.visible = u > 0 && u < 1;
			if (!slug.visible) return;
			slug.position.copy(this.downCurve.getPointAt(u));
			slug.quaternion.setFromUnitVectors(this.yAxis, this.downCurve.getTangentAt(u));
			// It swells the pipe where the pipe is free, and squeezes thin to get through a fitting, or where the pipe lies on
			// an island's floor.
			const free = Math.min(...this.downTight.map((at) => slug.position.distanceTo(at)));
			const { x, y } = slug.position;
			const floor = x > 14.7 && x < 22.1 ? ISLAND_B_Y : x > 22.75 ? ISLAND_C_Y : -Infinity;
			const room = Math.min(smooth(seg(free, 0.5, 1.4)), smooth(seg(y - floor, 0.1, 0.24)));
			const thin = THREE.MathUtils.lerp(0.078 / (slug.geometry as THREE.CapsuleGeometry).parameters.radius, 1, room);
			slug.scale.set(thin, 1, thin);
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

		// Past the belt they ride a little smaller, so that the longest can round a bend without touching a rail or each other.
		const small = (s: number) => 1 - 0.2 * smooth(seg(s, BELT_END - SLOT_X - 1.4, BELT_END - SLOT_X));
		const frame = (s: number, target: THREE.Object3D, y = 0) => {
			if (s <= 0) {
				target.position.set(SLOT_X + s, BELT_Y + y, LINE_Z);
				target.quaternion.identity();
				return;
			}
			// Past the lip nothing is carrying it any more: it falls, and pulls away from the one behind.
			const past = Math.max(0, s - this.lipS);
			const u = Math.min(1, (s + past * past * 0.5) / this.flowLen);
			const f = frameAt(this.flow, u, FLOW_SIDE);
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
			// Landing after the flip: a squash, then one small bounce to shake it off.
			const after = seg(T, 6.68 + i * 0.01, 6.74 + i * 0.01);
			const squash = bell(after, 0, 0.4);
			const bounce = bell(after, 0.3, 1) * 0.07;
			const idle = hopK >= 1 && D === 0 ? (Math.sin(time * 2.1 - i * 0.55) * 0.5 + 0.5) * 0.022 : 0;
			const low = 1 - squash * 0.3;
			// A tile the reader has pressed hops up, turns over, and lands the other way up. It rights itself before the row sets off.
			if ((T <= 6.56 || T >= 6.86) && this.tileSide[i]) this.flipTile(i);
			const now = performance.now();
			const turned = this.tileShown(i, now);
			const leap = bell(seg(now, this.tileAt[i], this.tileAt[i] + 560), 0, 1) * 0.92;
			const size = small(s);
			// A hair above the floor once it's in the channel, because the channel twists and a tile can't.
			frame(s, tile.group, rest * low * size + (1 - size) * 0.08 + pop + hop + bounce + idle + leap);
			tile.group.rotateX((flip + turned) * Math.PI);
			tile.group.scale.set((1 + squash * 0.04) * size, low * size, (1 + squash * 0.12) * size);
			// Behind the slot it's still inside the template, and drawn nowhere: it isn't anywhere either.
			tile.group.visible = feed > 0 && s + tile.width / 2 > 0 && !this.fallenIn(s, tile.group.position.y);
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
		// The stamp draws back a little, comes down hard, and takes its time going up.
		const blow = seg(stepF, 0.5, 1);
		const stamp =
			T <= CUT_A || T >= CUT_B
				? 0
				: blow < 0.2
					? -0.16 * smooth(blow / 0.2)
					: blow < 0.42
						? lerp(-0.16, 1, inCubic((blow - 0.2) / 0.22))
						: 1 - smooth((blow - 0.42) / 0.58);
		this.gantry.update(stamp, moving);

		// The rest of the request pours out behind the named tiles.
		const d = this.dummy;
		const count = this.rest.count;
		const started = seg(T, 6.86, 6.95);
		for (let j = 0; j < count; j++) {
			const s = start - (j + 1) * REST_GAP + D;
			if (s < 0.2 || started <= 0) {
				d.position.set(0, -500, 0);
				d.scale.setScalar(0);
				d.quaternion.identity();
			} else {
				const size = small(s);
				frame(s, d, TILE_H * 0.46 * size + (1 - size) * 0.08);
				d.scale.setScalar(this.fallenIn(s, d.position.y) ? 0 : size);
			}
			d.updateMatrix();
			this.rest.setMatrixAt(j, d.matrix);
		}
		this.rest.instanceMatrix.needsUpdate = true;
		this.rest.visible = started > 0;

		// The first token under the arch turns its light green, and it stays busy until the last one has gone through.
		const seen = seg(start + rowLen + D, this.safetyS - 0.5, this.safetyS);
		const through = seg(start - count * REST_GAP + D, this.safetyS, this.safetyS + 1.5);
		this.safety.update(seg(T, 6.84, 6.895), seg(T, 6.895, 6.935), outBack(seg(T, 6.9, 6.95), 2), seen, seen * (1 - through), time);
	}

	/** Which of the loop's nine stops a moment of the story is at. */
	private stopAt(T: number) {
		return [2, 4, 5, 7, 18, 20, 22, 25, 1e9].findIndex((from) => T < from);
	}

	/** Whether something riding the token path at s has gone over the lip and down past the bottom of the well. */
	private fallenIn(s: number, y: number) {
		return s > this.lipS && y < WELL_FLOOR_Y - 0.85;
	}

	/* ---------- the map in the corner: the world itself, from far off ---------- */

	/** Where the page's map draws itself. Set by the page once it has one; null where there isn't one. */
	mapCanvas: HTMLCanvasElement | null = null;
	/** A phone draws its map only when the reader reaches another stop, not on a clock. */
	mapSeldom = false;
	private map = new MiniMap(new THREE.Vector3(-5.5, 4, 0), { x: 51, y: 28 }, 6, 5);
	private mapAt = -Infinity;
	private mapStop = -1;
	/** The loop's thin pipes again, as thick as the glass, drawn only into the map: at its size the real ones are hairs. */
	private mapPipes = new THREE.Group();

	/** The page's map canvas, or none; a phone's is drawn only when the reader reaches another stop. */
	setMapCanvas(canvas: HTMLCanvasElement | null, seldom: boolean) {
		this.mapCanvas = canvas;
		this.mapSeldom = seldom;
		this.mapStop = -1;
	}

	private buildMapPipes() {
		const m = mats();
		const { gatePath, back } = this.back.finaleRoute;
		const thick = (path: THREE.Curve<THREE.Vector3>, mat: THREE.Material) => {
			const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.ceil(path.getLength() / 0.4), 0.42, 8), mat);
			this.mapPipes.add(mesh);
		};
		thick(this.routeOut, m.orangeGlow);
		thick(this.downCurve, m.orangeGlow);
		thick(gatePath, m.orangeGlow);
		thick(back, m.greenGlow);
		this.mapPipes.visible = false;
		this.root.add(this.mapPipes);
	}

	/**
	 * Where the reader's token is on the loop at a moment of the story, in the world: along the route the request takes,
	 * through the model, down the axis, round your tools and back up to the harness, where it stays for the turns after.
	 */
	private routeAt(T: number) {
		const low = (p: V3): V3 => [p[0] + LOWER[0], p[1] + LOWER[1], p[2] + LOWER[2]];
		const dock = low([-60.6, -10.7, 0.7]);
		const route: [number, V3][] = [
			[0, [-3.3, 1.2, 0.5]],
			[2, [HARNESS_POS.x, 2, HARNESS_POS.z]],
			[3.5, [DOC_POS.x, 1.6, LINE_Z]],
			[4, [TUNNEL_X, TUNNEL_Y, LINE_Z]],
			[4.9, [TUNNEL_X + TUNNEL_L, TUNNEL_Y, LINE_Z]],
			[5.3, [GATEWAY_X, 1.6, LINE_Z]],
			[6, [TEMPLATE_X, 0.9, LINE_Z]],
			[6.86, [BELT_END, 0.9, LINE_Z]],
			[7.25, [LIFT_X, LIFT_TOP, LINE_Z]],
			[7.5, this.sagAt],
			[7.75, [MODEL_WHEEL[0], MODEL_WHEEL[1] + WRAP, LINE_Z]],
			[7.95, [MODEL_X, MODEL_ROOF - 2, MODEL_Z]],
			[18.6, [MODEL_X, MODEL_ROOF - 2, MODEL_Z]],
			[18.95, [AXIS_X, STREAM_TOP[1], STREAM_TOP[2]]],
			[19.3, [AXIS_X, 3.5, -0.75]],
			[19.6, this.back.callCurve.getPointAt(0.12).toArray() as V3],
			[19.9, this.back.callCurve.getPointAt(0.6).toArray() as V3],
			[20.04, dock],
			[21.3, low([-41.4, -12.5, 0.7])],
			[22.4, low([-24.5, -13.5, 0.7])],
			[24.6, low([-13.5, -14.69, 3.6])],
			[25.1, returnPath().getPointAt(0.45).toArray() as V3],
			[25.42, [HARNESS_POS.x, 1.6, HARNESS_POS.z]]
		];
		let i = 0;
		while (i < route.length - 2 && T >= route[i + 1][0]) i++;
		const [ta, a] = route[i];
		const [tb, b] = route[i + 1];
		const k = Math.min(1, Math.max(0, (T - ta) / (tb - ta)));
		return this.v4.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
	}

	/** Where the reader is on the map, as shares of its width and height, at a moment of the story. */
	mapMark(T: number) {
		const c = this.mapCanvas;
		return c ? this.map.where(this.routeAt(T).clone(), c.width, c.height) : null;
	}

	/** Where the nine stops are on the map. */
	mapStops(): { x: number; y: number }[] {
		const c = this.mapCanvas;
		if (!c) return [];
		const at = [0.6, 2.4, 4.4, 5.6, 7.95, 18.97, 20.5, 22.6, 25.08];
		return at.map((T) => this.map.where(this.routeAt(T).clone(), c.width, c.height));
	}

	/**
	 * Draws the map now and then: on a clock outside the model, and whenever the reader reaches another stop. Inside the
	 * model, and on a side trip, it keeps what it last drew, which the world outside hasn't changed since.
	 */
	private maybeDrawMap(T: number, stop: number) {
		const c = this.mapCanvas;
		if (!c || this.trackIn) return;
		const now = performance.now();
		const inside = T >= DIVE_T && T < EXIT_T;
		const due = stop !== this.mapStop || (!this.mapSeldom && !inside && now - this.mapAt > 1500);
		if (!due) return;
		this.mapAt = now;
		this.mapStop = stop;
		this.drawMap(inside);
	}

	private drawMap(inside: boolean) {
		const saved: [THREE.Object3D, boolean][] = [this.root, this.cluster.group, this.clouds.group, this.finale.group, this.mapPipes, ...Object.values(this.places).map((p) => p!.group)].map((o) => [o, o.visible]);
		this.root.visible = true;
		this.cluster.group.visible = false;
		this.clouds.group.visible = false;
		this.finale.group.visible = false;
		this.mapPipes.visible = true;
		for (const p of Object.values(this.places)) p!.group.visible = false;
		const undo = this.back.showForMap();
		const back = this.back.group.visible;
		this.back.group.visible = true;
		// Inside the model the sky is the dark of the machine: the map is always the world outside, by day.
		if (inside) this.stage.setSky(SKY_A.top, SKY_A.mid, SKY_A.low);
		this.map.draw(this.stage.renderer, this.stage.scene, this.mapCanvas!);
		if (inside) this.stage.setSky(SKY_IN.top, SKY_IN.mid, SKY_IN.low);
		this.back.group.visible = back;
		undo();
		for (const [o, v] of saved) o.visible = v;
	}

	dispose() {
		this.map.dispose();
		this.stage.dispose();
	}
}
