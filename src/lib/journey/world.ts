import * as THREE from 'three';
import { breathe, Stage } from './stage';
import { Rig, type Shot } from './rig';
import { bell, inOut, lerp, outBack, outCubic, seg, smooth, smoother, spring, inCubic } from './kit/math';
import { contactShadow, loadFonts, Surface } from './kit/print';
import { bends, PartOf, rbox, ring } from './kit/geometry';
import { mats, color } from './kit/materials';
import { Batch } from './kit/batch';
import { leaving } from './kit/parts';
import { curve } from './kit/machines';
import { Cloudscape } from './props/sky';
import { LAPTOP_PORT, Laptop } from './props/laptop';
import { McpServer, MCP_W } from './props/mcp';
import { Brain, STEM_LANE } from './props/brain';
import { SkillShelf } from './props/skills';
import { Poker } from './poke';
import { Harness, HD, HW, PORT_KEYS_Z, PORT_MCP_Z, PORT_Y } from './props/harness';
import { RequestDoc, SLOT_Y, Strip } from './props/request';
import { createBelt, createChatTemplate, Gantry, GANTRY_REAR, SafetyArch, Tile, TILE_D, TILE_H } from './props/tokenizer';
import { HARNESSES, PROMPT, TOKENS, type HarnessId, type TrackId } from './content';
import { McpTrack, MCP_SHOTS, type HarnessPose } from './tracks/mcp';
import { ROOM_AT, ROOM_SKY } from './tracks/room/layout';
import { HarnessRoom } from './tracks/room/room';
import { ROOF, ROOM_SHOTS, TOUR } from './tracks/room/shots';
import { GLASS_ROOF, SandboxStage, STAGE_AT, STAGE_SHOTS, STAGE_SKY } from './tracks/sandbox';
import { CABINET_ROOF, MemoryStage, MEMORY_AT, MEMORY_SHOTS, MEMORY_SKY } from './tracks/memory';
import { PlansStage, PLANS_AT, PLANS_SHOTS, PLANS_SKY, SCREEN_ROOF } from './tracks/plans';
import { hitBox } from './poke';
import { Visits } from './visit';
import { MiniMap } from './minimap';
import { Voyage, type Flight } from './voyage';
import { Cluster, CLUSTER_SHOTS, DIVE_T } from './cluster';
import { low } from './layout';
import { returnPath } from './cables';
import * as P from './sky/masterplan';
import { placeModel, placeOnDesk, Scenery } from './sky/scenery';
import { Capsule, CopilotArch } from './sky/capsule';
import { Desk } from './sky/desk';
import { AQUEDUCT_CURVE, MASTS } from './sky/aqueduct';
import { Back, BACK_SHOTS } from './chapters/back';
import { SLIP_TEXT } from './chapters/forward';
import { HOME, HomeStream } from './sky/stream';
import { Finale, FINALE_T } from './chapters/finale';

export const EXIT_T = 19;

type V3 = [number, number, number];

/*
 * ---------- layout: desk to sky, as the masterplan has it (sky/masterplan.ts) ----------
 * Your desk at the front and the bottom; from behind the harness the aqueduct climbs away to the provider. The request
 * rides its left lane in a sealed capsule, through the gatehouse into the hall, where the tokenizer lies along that lane;
 * past it the tokens ride on into the tower, up its shaft and into the brainstem from below.
 *
 * The tokenizer keeps the coordinates it was built in: a row along x, its template at TEMPLATE_X, its belt's line at
 * LINE_Z, on a floor at ISLAND_C_Y. TOKENIZER stands that row on the request's lane, running from the door towards the
 * tower with its front turned to the lanes' middle; everything of it is placed in its own coordinates under that frame.
 */
const LINE_Z = 0.9;
const C_X = 28.8;
const ISLAND_C_Y = 0.25;
const BELT_Y = ISLAND_C_Y + 0.5;
const TEMPLATE_X = C_X - 3.4;
const SLOT_X = TEMPLATE_X + 1.06;
const BELT_END = C_X + 10.7;
// Over the path just before the hall's end wall, square to it.
const SAFETY_X = C_X + 11.45;
const TOKENIZER = new THREE.Matrix4()
	.makeRotationY(Math.PI / 2)
	.setPosition(-P.HALL_LANE, P.PLATFORM_Y, P.HALL.from - 1.6)
	.multiply(new THREE.Matrix4().makeTranslation(-TEMPLATE_X, -ISLAND_C_Y, -LINE_Z));
const FROM_TOKENIZER = TOKENIZER.clone().invert();
/** A point in the tokenizer's own coordinates, in the world. */
const tok = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z).applyMatrix4(TOKENIZER).toArray() as V3;
/** A point in the world, in the tokenizer's own coordinates. */
const inTokenizer = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z).applyMatrix4(FROM_TOKENIZER).toArray() as V3;
/** A shot composed in the tokenizer's own coordinates, as it is in the world: turned with it. */
function turned<S extends Omit<Shot, 'T'>>(shot: S): S {
	const out = { ...shot, az: shot.az + 90, target: tok(...shot.target) };
	if (shot.tallTarget) out.tallTarget = tok(...shot.tallTarget);
	return out;
}
/** A curve carried somewhere else whole: the same curve, every point moved by m. */
class Moved extends THREE.Curve<THREE.Vector3> {
	constructor(
		private curve: THREE.Curve<THREE.Vector3>,
		private m: THREE.Matrix4
	) {
		super();
	}
	getPoint(u: number, target = new THREE.Vector3()) {
		return this.curve.getPoint(u, target).applyMatrix4(this.m);
	}
}
/** Where the tokens climb: the request's lane up the shaft and the glass pedestal, and the brainstem's seat at its top. */
const SHAFT_X = -STEM_LANE;
const SEAT_Y = P.SEAT_Y;
/** The request's lane in the world, from behind the harness's roof to the brainstem: the capsule rides its first part. */
const UP_LANE = new THREE.CatmullRomCurve3(P.upLane(), false, 'centripetal');
UP_LANE.arcLengthDivisions = 2000;
/** How far along the request's lane things are: the door, just short of the template, and under the last mast's reader. */
const LANE_AT = (() => {
	const n = 2000;
	const len = UP_LANE.getLength();
	const at = (z: number) => {
		for (let i = 0; i <= n; i++) if (UP_LANE.getPointAt(i / n).z <= z) return (i / n) * len;
		return len;
	};
	return { len, door: at(P.DOOR_Z), template: at(P.HALL.from + 1.2), mast: at(AQUEDUCT_CURVE.getPointAt(MASTS[MASTS.length - 1].u).z) };
})();
/** The capsule's foot over the lane's line: on the belt's top, with a little to spare where the lane bends and climbs over its crest. */
const BELT_TOP = 0.14;
/**
 * A cable that lies on your desk: a smooth curve through its points overshoots a little between them, and would sink
 * into the desk's top there. Resampled with nowhere lower than lying on it.
 */
const lying = (c: THREE.Curve<THREE.Vector3>, r: number) => curve(c.getSpacedPoints(200).map((p) => [p.x, Math.max(p.y, r + 0.004), p.z] as V3));
/** The reply's lane in the world, from the brainstem down to behind the harness's roof. */
const DOWN_LANE = new THREE.CatmullRomCurve3(P.downLane(), false, 'centripetal');
DOWN_LANE.arcLengthDivisions = 2000;
/** Where the capsule waits for the page: a little way along the lane, behind the harness's roof. */
const CRADLE_S = 0.9;
/**
 * The reply's way home along its lane: how far from the brainstem's seat the lane lies down at the shaft's foot, and how
 * far the press by the door is, where its text is sealed for the trip.
 */
const HOME_AT = (() => {
	const n = 3000;
	const len = DOWN_LANE.getLength();
	let foot = len;
	let seal = len;
	for (let i = 0; i <= n; i++) {
		const p = DOWN_LANE.getPointAt(i / n);
		if (foot === len && p.y < P.PLATFORM_Y + 0.4) foot = (i / n) * len;
		if (seal === len && p.z >= P.SEALER.z) seal = (i / n) * len;
	}
	// The reply's glass column begins this far under the seat: the text appears at its top, clear of the brainstem.
	return { len, top: 1.8, foot, seal, home: len - CRADLE_S };
})();
/** The stream on its way home, once it's built: the camera follows its first piece. */
let homeStream: HomeStream | null = null;
const followHome = (T: number, out: THREE.Vector3) => (homeStream ? homeStream.head(T, out).setY(out.y + 0.3) : out);
/** How the capsule rides the lane: from the cradle past the masts, resting by the last of them while you hear about the wire, to the door, and on to the template. */
function rideAt(T: number) {
	if (T <= 4.08) return CRADLE_S;
	if (T <= 4.648) return lerp(CRADLE_S, LANE_AT.mast, inOut(seg(T, 4.08, 4.648)));
	if (T <= 4.86) return lerp(LANE_AT.mast, LANE_AT.door, smooth(seg(T, 4.648, 4.86)));
	if (T <= 5.62) return LANE_AT.door;
	return lerp(LANE_AT.door, LANE_AT.template, inOut(seg(T, 5.62, 5.86)));
}
const capsuleAt = (T: number) => UP_LANE.getPointAt(Math.min(1, rideAt(T) / LANE_AT.len)).toArray() as V3;
const GANTRY_SCALE = 1.18;
/** The glass lift the tokens ride from the hall's end up to the brainstem, and the reply's column beside it. */
const LIFT_R = 0.42;
/** When each letter of the sentence lands after the page opens, once the lid is up. Uneven, with a breath between words, as people type. */
const LETTER_AT = (() => {
	let at = 1.7;
	return [...PROMPT].map((ch, i) => {
		const landed = at;
		at += 0.04 + (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * 0.04 + (ch === ' ' ? 0.05 : 0);
		return landed;
	});
})();
const HOLD_SHADOWS_T = 32.36;
const REST = 66; // tiles behind the named ones, and their spacing
const REST_GAP = 0.54;
const ROW_START = SLOT_X + 0.9;

const HARNESS_POS = P.HARNESS.at;
const HS = P.HARNESS.scale;

/** The trips that drop into a place of their own: where each place is, and its sky. */
type Inside = 'harness' | 'sandbox' | 'memory' | 'plans';
const INSIDE: Record<Inside, { at: THREE.Vector3; sky: { top: THREE.Color; mid: THREE.Color; low: THREE.Color } }> = {
	harness: { at: ROOM_AT, sky: ROOM_SKY },
	sandbox: { at: STAGE_AT, sky: STAGE_SKY },
	memory: { at: MEMORY_AT, sky: MEMORY_SKY },
	plans: { at: PLANS_AT, sky: PLANS_SKY }
};
const insideOf = (id: TrackId | null): Inside => (id && id !== 'mcp' ? id : 'harness');
const DOC_POS = Desk.PAGE;
const DOC_TILT = Desk.PAGE_LEAN;
const ROLL_AXIS = 1.45; // how far below the page's centre the finished roll lies
const STRIPS_PRINTED = 3.62;

/* ---------- beat timeline. T counts sections; see Journey.svelte for the mapping ---------- */
export const HOLD = { type: [1.02, 1.56], send: [1.56, 1.66] };
/** What your screen says the agent is doing, from when it says it. Seen at the start, when the reply lands, and round the loop. */
const LAPTOP_SAYS: [number, string][] = [
	[0, 'Building the request'],
	[3.6, 'Waiting for the reply'],
	[HOME.arrive, 'Reading the reply'],
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

/** The whole world from out in the sky, desk to brain, the title in the open sky beside it: then down to your laptop. */
const HERO = { az: 16, el: 13, target: [-1, 10, -15] as V3, radius: 37, wide: box(0.4, 0.02, 0.61, 0.94), tall: box(0, 0.42, 1, 0.56) };
const LAPTOP = { az: -2, el: 14, target: [0.087, 1.12, P.LAPTOP.at.z - 0.13] as V3, radius: 2.3, wide: box(0.42, 0.1, 0.56, 0.84), tall: box(0.02, 0.08, 0.96, 0.5) };
const ASSEMBLY = { az: 20, el: 17, target: [-2.5, 2.4, -1.5] as V3, radius: 5.6, ry: 4.3, wide: box(0.0, 0.14, 0.58, 0.86), tall: box(0.02, 0.07, 0.96, 0.46) };
const REQUEST = { az: 4, el: 7, target: [DOC_POS.x, DOC_POS.y + 0.03, DOC_POS.z + 0.05] as V3, radius: 2.05, wide: box(0.12, 0.08, 0.46, 0.86), tall: box(0.05, 0.07, 0.9, 0.5) };
/** Over the capsule as it rides the aqueduct, from behind and to the left: the lane leading on to the provider. */
/** The camera keeps the capsule where the shot puts it, all the way, rather than catching up with it at each shot. */
const followCapsule = (T: number, out: THREE.Vector3) => out.set(...capsuleAt(T)).setY(out.y + 0.75);
const riding = (T: number, radius: number, az: number, el: number): Shot => ({
	T,
	az,
	el,
	target: [0, 0, 0],
	radius,
	wide: box(0.38, 0.12, 0.62, 0.8),
	tall: box(0, 0.1, 1, 0.44),
	follow: followCapsule
});
// From up and to the right, over the masts and clear of them: the five checks, and the capsule under them.
const DOOR = { az: 28, el: 16, target: [-0.4, P.PLATFORM_Y + 2.0, P.DOOR_Z + 0.2] as V3, radius: 3.0, wide: box(0.03, 0.1, 0.5, 0.88), tall: box(0.02, 0.06, 0.96, 0.5) };
// A phone can't hold the whole row at a size you can read, so it comes back from the cutter to the middle, where both "the"
// tiles turn into the same number side by side.
const C_TOP = ISLAND_C_Y + 0.58;
const TOKENS_SHOT = turned({ tallTarget: [C_X + 3.4, C_TOP, 0.9] as V3, tallRadius: 2.7, az: 3, el: 38, target: [C_X + 3.2, C_TOP, 0.9] as V3, radius: 7.95, ry: 1.8, wide: box(0.03, 0.44, 0.94, 0.5), tall: box(0, 0.1, 1, 0.42) });
const CUT = {
	az: 11,
	el: 36,
	target: [C_X + 3, ISLAND_C_Y + 0.9, 0.9] as V3,
	radius: 3.5,
	ry: 1.75,
	wide: box(0.05, 0.46, 0.9, 0.5),
	tall: box(0, 0.1, 1, 0.42),
	tallTarget: [C_X - 0.6, C_TOP, 0.9] as V3,
	tallRadius: 2.7
};
const TZ = P.TOWER.at.z;
/** After the row, into the hall's far end: the tokens going through the end wall into the tower. */
const NEXT = { az: 42, el: 24, target: tok(BELT_END - 1.0, BELT_Y + 0.3, LINE_Z), radius: 5.2, wide: box(0.38, 0.06, 0.6, 0.88), tall: box(0, 0.06, 1, 0.5) };
/** Up out of the hall through its glass, the tower ahead, its shaft lit with the tokens climbing. */
const GARLAND = { az: 26, el: 18, target: [SHAFT_X, 15.5, TZ + 4] as V3, radius: 10, ry: 8, wide: box(0.38, 0.06, 0.62, 0.88), tall: box(0, 0.06, 1, 0.5) };
/** The tower from outside: the tokens climbing its shaft, seen through the slot, to the model on its roof. */
const ARRIVE = { az: 7, el: 7, target: [SHAFT_X, 23.5, TZ] as V3, radius: 14, ry: 12.5, wide: box(0.38, 0.03, 0.62, 0.92), tall: box(0, 0.05, 1, 0.5) };
/** The glass pedestal on the roof, the last tokens going up it into the brainstem's seat. */
const INTAKE = { az: 26, el: 18, target: [SHAFT_X, SEAT_Y - 1.0, TZ] as V3, radius: 3.4, ry: 2.6, wide: box(0.38, 0.08, 0.62, 0.84), tall: box(0, 0.08, 1, 0.48) };

/** No card is up on the way home: the picture has the whole screen. */
const WHOLE = box(0.05, 0.08, 0.9, 0.84);
const WHOLE_TALL = box(0, 0.1, 1, 0.7);
/** The brain on its pedestal as the picture comes out of the model: the reply leaving its seat into the column. */
const OUT_OF = { az: 22, el: 9, target: [-SHAFT_X, SEAT_Y + 1.6, TZ] as V3, radius: 4.2, ry: 3.8, wide: WHOLE, tall: WHOLE_TALL };
/** The tower from in front, over the hall's end wall: the reply falling down its column, lit, seen through the slot. */
const DOWN_TOWER = { az: 10, el: 8, target: [-SHAFT_X, 19, TZ] as V3, radius: 5.5, ry: 7.5, wide: WHOLE, tall: WHOLE_TALL };
/** The whole hall from high over the door: the reply's text riding the right lane from the tower's foot to the press. */
const HALL_RUN = { az: 22, el: 52, target: [1.1, 8.6, -31.5] as V3, radius: 7.5, ry: 6, wide: WHOLE, tall: WHOLE_TALL };
const homeShot = (T: number, az: number, el: number, radius: number, ry = radius * 0.75): Shot => ({ T, az, el, target: [0, 0, 0], radius, ry, wide: WHOLE, tall: WHOLE_TALL, follow: followHome });
/**
 * Home: out of the brainstem's seat, and down the column in the shaft, lit, seen through the tower's slot; the whole hall
 * from high over the door as the text rides out of the tower's foot to the press; then down over the gatehouse to the
 * first capsule coming out of the door, and along the aqueduct with the string of them, to the harness's roof.
 */
const HOME_SHOTS: Shot[] = [
	{ T: HOME.from, ...OUT_OF },
	{ T: HOME.from + 0.005, ...OUT_OF, az: 18, el: 7 },
	{ T: HOME.from + 0.011, ...DOWN_TOWER },
	{ T: HOME.from + 0.016, ...DOWN_TOWER, target: [-SHAFT_X, 16, TZ], az: 14 },
	{ T: HOME.from + 0.022, ...HALL_RUN },
	{ T: HOME.from + 0.043, ...HALL_RUN, az: 26, target: [1.1, 8.6, -29.5] },
	// Down in front of the gatehouse, waiting at its door for the first capsule to come out.
	{ T: HOME.from + 0.048, az: 26, el: 22, target: [0.7, 9.2, P.DOOR_Z], radius: 4, ry: 3, wide: WHOLE, tall: WHOLE_TALL },
	homeShot(HOME.from + 0.054, 30, 24, 3.8),
	homeShot(HOME.from + 0.062, 20, 18, 3.8),
	homeShot(HOME.from + 0.078, 24, 18, 3.8),
	homeShot(HOME.from + 0.092, 28, 22, 3.2),
	{ T: HOME.arrive, az: 30, el: 24, target: [0.7, 6.4, -5.2], radius: 2.6, ry: 2.2, wide: WHOLE, tall: WHOLE_TALL }
];

const SHOTS: Shot[] = [
	...hold(0, 0.5, HERO),
	...hold(1, 1.6, LAPTOP),
	...hold(2, 2.74, ASSEMBLY, { az: 17, radius: 5.5, ry: 4.2 }),
	...hold(3, 3.58, REQUEST, { az: 8 }),
	// Over the capsule as it rides, always on the side away from the mast it's passing, so no mast comes between: the
	// first stands on the left, the second on the right, the third on the left by the door.
	riding(4.0, 2.3, 20, 16),
	riding(4.3, 2.8, 26, 15),
	riding(4.46, 3.0, -12, 18),
	riding(4.64, 3.3, 58, 14),
	...hold(5, 5.64, DOOR, { az: 25 }),
	// Up over the gatehouse's corner tower, not through it, on the way in to the tokenizer.
	{ T: 5.8, az: 40, el: 46, target: [-0.6, P.PLATFORM_Y + 1.6, P.DOOR_Z - 3.2] as V3, radius: 4.4, wide: box(0.05, 0.46, 0.9, 0.5), tall: box(0, 0.1, 1, 0.42) },
	{ T: 6, ...turned({ ...CUT, target: [C_X - 0.3, ISLAND_C_Y + 0.9, 0.9] }) },
	{ T: 6.16, ...turned({ ...CUT, target: [C_X - 0.3, ISLAND_C_Y + 0.9, 0.9] }) },
	{ T: 6.56, ...turned({ ...CUT, target: [C_X + 7.1, ISLAND_C_Y + 0.9, 0.9], az: 7, tallTarget: [C_X + 8.2, C_TOP, 0.9] }) },
	...hold(6.68, 6.8, TOKENS_SHOT, { az: TOKENS_SHOT.az - 2 }),
	{ T: 7, ...NEXT },
	{ T: 7.14, ...GARLAND },
	{ T: 7.3, ...ARRIVE },
	{ T: 7.68, ...ARRIVE, az: 11 },
	{ T: 7.81, ...INTAKE },
	{ T: 7.89, ...INTAKE, az: 18, el: 24, radius: 2.4, ry: 1.9 },
	// In through the glass after the last of them, up into the seat.
	{ T: 7.985, az: 12, el: 8, target: [SHAFT_X, SEAT_Y - 0.35, TZ], radius: 0.3, ry: 0.22, wide: box(0, 0, 1, 1), tall: box(0, 0, 1, 1) },
	...CLUSTER_SHOTS,
	...HOME_SHOTS,
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
	/** While building: where to put the camera instead, set from the console as `__world.debugEye = { eye, look }`. */
	debugEye: { eye: [number, number, number]; look: [number, number, number]; fov?: number } | null = null;
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
	private capsule!: Capsule;
	/** The reply on its way home: its text down the tower, sealed by the door, a string of capsules down the right lane. */
	private home!: HomeStream;
	private homeCargo: THREE.Vector3[] = [];
	/** The reply's glass column up the shaft, which lights up while the reply pours down it. */
	private streamGlass!: THREE.MeshPhysicalMaterial;
	private copilotArch!: CopilotArch;
	private scenery!: Scenery;
	/** The tokenizer's own frame (see TOKENIZER), and the harness's holder, which carries its size (see placeOnDesk). */
	private tokenizer = new THREE.Group();
	private harnessHolder = new THREE.Group();
	private gantry!: Gantry;
	private tiles!: Tile[];
	private mcp!: McpServer;
	private cluster!: Cluster;
	private back!: Back;
	private downCurve!: THREE.Curve<THREE.Vector3>;
	private beltTicks!: THREE.CanvasTexture;
	private flow!: THREE.Curve<THREE.Vector3>;
	/** The token path in the world, for what follows it from outside the tokenizer's frame: the finale's lap. */
	private flowWorld!: THREE.Curve<THREE.Vector3>;
	private flowLen = 1;
	private lipS = 1e9;
	private rest!: THREE.InstancedMesh;
	private chevron!: THREE.Texture;
	private loopMeshes: THREE.Mesh[] = [];
	private routeCable!: THREE.Curve<THREE.Vector3>;
	private routeOut!: THREE.Curve<THREE.Vector3>;
	private stream!: THREE.Curve<THREE.Vector3>;
	private finale!: Finale;
	private clouds = new Cloudscape();

	private harnessId: HarnessId = 'claude';
	private docClip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e4);
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
		await loadFonts();
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
				// Fed from below: the tokens come up its stem, and nothing goes in at its crown.
				this.brain = new Brain('stem');
				this.skills = new SkillShelf();
				this.doc = new RequestDoc();
			}
		];
		yield [
			8,
			() => {
				this.strips = [0, 1, 2, 3].map((i) => new Strip(i));
				this.capsule = new Capsule();
				this.copilotArch = new CopilotArch(P.DECK_W - 0.1);
				this.gantry = new Gantry();
				this.tiles = TOKENS.map((t) => new Tile(t));
				this.mcp = new McpServer();
			}
		];
		yield [27, () => (this.cluster = new Cluster())];
		yield [3, () => (this.back = new Back())];
		const back = this.back.steps();
		for (const step of back) yield [25 / back.length, step];
		yield [14, () => (this.scenery = new Scenery({ tokenizer: false }))];
		yield [6, () => this.buildSky()];
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
		this.root.add(this.back.group);
		// Its route is the pipes already standing, so it can only be built once they all are.
		const reply = DOWN_LANE.getLength();
		const signAt = (p: V3, x: number, y: number, z = 0): V3 => [p[0] + x, p[1] + y, p[2] + z];
		this.finale = new Finale({
			keys: [P.LAPTOP.at.x, 0.85, P.LAPTOP.at.z + 0.5],
			cable: this.routeCable,
			out: this.routeOut,
			down: this.downCurve,
			flow: this.flowWorld,
			beltU: (BELT_END - SLOT_X) / this.flowLen,
			stream: new PartOf(DOWN_LANE, 0, 1 - CRADLE_S / reply),
			hatch: [HARNESS_POS.x, P.HARNESS.h - 0.2, HARNESS_POS.z],
			...this.back.finaleRoute,
			signs: [
				[P.LAPTOP.at.x - 2.2, 2.6, P.LAPTOP.at.z],
				[HARNESS_POS.x - 3.0, P.HARNESS.h + 1.0, HARNESS_POS.z],
				signAt(capsuleAt(4.62), -3.4, 3.4),
				tok(TEMPLATE_X + 6, ISLAND_C_Y + 4.2, LINE_Z),
				[SHAFT_X - 7.5, SEAT_Y + 3, TZ],
				// Over the deck in front of the door, where the reply's capsules set off home: clear of the masts and the walls.
				[P.LANE + 1.5, P.PLATFORM_Y + 4, P.DOOR_Z + 2.8],
				// Over the gates, to the right of the harness, clear of it.
				low([-44, -5, 3]),
				low([-14, -1.5, 0]),
				[8.5, 1.4, -5.6]
			]
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
		this.mcpHit.position.copy(P.LOCAL_MCP[2]).setY(0.7);
		this.harnessHit.position.set(HARNESS_POS.x, 2.0 * HS, HARNESS_POS.z);
		this.harnessHit.scale.setScalar(HS);
		this.root.add(this.mcpHit, this.harnessHit);
		this.setHarness('claude');
		this.wirePokes();
	}

	private assemble() {
		const r = this.root;
		r.add(this.scenery.group);

		// Your things, on your desk where the masterplan puts them.
		placeOnDesk({ laptop: this.laptop, harness: { holder: this.harnessHolder, harness: this.harness }, skills: this.skills, mcp: this.mcp });
		r.add(this.laptop.group, this.harnessHolder, this.skills.group, this.mcp.group);
		const shadow = (x: number, z: number, w: number, d: number, o: number) => {
			const s = contactShadow(w, d, 0.14, o);
			s.position.set(x, 0.006, z);
			r.add(s);
		};
		shadow(P.LAPTOP.at.x, P.LAPTOP.at.z, 3.4, 2.3, 0.42);
		shadow(HARNESS_POS.x, HARNESS_POS.z, (HW + 0.4) * HS, (HD + 0.4) * HS, 0.5);
		shadow(P.LOCAL_MCP[2].x, P.LOCAL_MCP[2].z, 1.4, 1.2, 0.42);

		// The request, on the easel, and the slips that fill it.
		r.add(this.doc.group);
		this.strips.forEach((s) => r.add(s.mesh));

		// The capsule, in its cradle behind the harness's roof; GitHub's arch over the deck further on, for Copilot.
		r.add(this.capsule.group, this.copilotArch.group);
		this.home = new HomeStream(
			{
				lane: DOWN_LANE,
				top: HOME_AT.top,
				shaftFoot: HOME_AT.foot,
				seal: HOME_AT.seal,
				home: HOME_AT.home,
				belt: BELT_TOP,
				hatch: new THREE.Vector3(HARNESS_POS.x, P.HARNESS.h + 0.3, HARNESS_POS.z),
				arc: 1.8
			},
			SLIP_TEXT
		);
		homeStream = this.home;
		r.add(this.home.group);
		const s = rideAt(4.74) / LANE_AT.len;
		const p = UP_LANE.getPointAt(s);
		const t = UP_LANE.getTangentAt(s);
		const right = new THREE.Vector3(-t.z, 0, t.x).normalize();
		this.copilotArch.group.position.copy(p).addScaledVector(right, P.LANE).setY(p.y + BELT_TOP);
		this.copilotArch.group.rotation.y = Math.atan2(t.x, t.z);

		// The tokenizer, in its own coordinates, on the request's lane in the hall: see TOKENIZER.
		const k = this.tokenizer;
		k.matrixAutoUpdate = false;
		k.matrix.copy(TOKENIZER);
		r.add(k);
		const template = createChatTemplate();
		template.position.set(TEMPLATE_X, ISLAND_C_Y, LINE_Z);
		k.add(template);
		const tc = contactShadow(2.3, 2.2, 0.16, 0.45);
		tc.position.set(TEMPLATE_X, ISLAND_C_Y + 0.006, LINE_Z);
		k.add(tc);
		// The rail the tokenizer's gantry runs on, behind the belt.
		const railZ = LINE_Z + GANTRY_REAR * GANTRY_SCALE;
		const railLen = BELT_END - SLOT_X + 0.2;
		const gantryRail = new Batch();
		gantryRail.add(rbox(railLen, 0.05, 0.62, 0.02, 2), mats().steelSoft, { p: [SLOT_X + railLen / 2, ISLAND_C_Y + 0.025, railZ] });
		for (const s of [-1, 1]) gantryRail.add(rbox(railLen, 0.03, 0.05, 0.012, 1), mats().steel, { p: [SLOT_X + railLen / 2, ISLAND_C_Y + 0.06, railZ + s * 0.26] });
		k.add(gantryRail.build('gantry-rail'));
		const belt = createBelt(SLOT_X - 0.02, BELT_END);
		belt.position.set(0, BELT_Y, LINE_Z);
		k.add(belt);
		const bc = contactShadow(BELT_END - SLOT_X, 1.4, 0.16, 0.4);
		bc.position.set((SLOT_X + BELT_END) / 2, ISLAND_C_Y + 0.006, LINE_Z);
		k.add(bc);
		this.gantry.group.scale.setScalar(GANTRY_SCALE);
		this.gantry.group.position.set(ROW_START, BELT_Y, LINE_Z);
		k.add(this.gantry.group);
		this.tiles.forEach((t) => {
			t.setClip([this.tileClip]);
			t.body.material.clearcoatRoughness = 0.5;
			k.add(t.group);
		});
		// Behind the template's slot the tiles are still inside it: a plane across the slot, in the world.
		this.tileClip.set(new THREE.Vector3(1, 0, 0), -SLOT_X).applyMatrix4(TOKENIZER);
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
	 * The token path, in the tokenizer's own coordinates: straight along the belt and on along the lane, through the
	 * hall's end wall into the tower, a step in to the pedestal's lane, round one bend, and straight up the shaft, through
	 * the roof and up the glass pedestal into the brainstem's seat. Drawn with a ruler and a compass: straights and circles.
	 */
	private buildFlow() {
		const m = mats();
		const y = BELT_Y + TILE_H / 2;
		const z = LINE_Z;
		const [mid] = inTokenizer(SHAFT_X, 0, TZ + P.RAIL_CLEAR);
		// They end inside the glass pedestal, just under the socket the brainstem's plug sits in: drawn up into it.
		const [, top, zIn] = inTokenizer(SHAFT_X, SEAT_Y - 1.75, TZ + P.RAIL_CLEAR);
		const bend = 1.0;
		const stepAt = mid - bend - 2.0;
		const flow = bends([[SLOT_X, y, z], [stepAt - 1.4, y, z], [stepAt, y, zIn], [mid, y, zIn], [mid, top, zIn]], [2.4, 2.4, bend]);
		this.flow = flow;
		flow.arcLengthDivisions = 3000;
		this.flowLen = flow.getLength();
		this.lipS = this.flowLen;
		this.flowWorld = new Moved(flow, TOKENIZER);

		// The safety check stands where the path is about to leave the hall, square to it.
		this.safety = new SafetyArch(0.2);
		this.safety.group.position.set(SAFETY_X, ISLAND_C_Y, z);
		this.tokenizer.add(this.safety.group);
		this.safetyS = SAFETY_X - SLOT_X;

		// The lift: warm clear glass from just past the arch, through the end wall and into the tower, up its shaft to the
		// roof and on up inside the pedestal to the seat.
		const mouth = (SAFETY_X + 0.75 - SLOT_X) / this.flowLen;
		const tube = new PartOf(flow, mouth, (this.flowLen - 0.25) / this.flowLen);
		const glass = new THREE.Mesh(
			new THREE.TubeGeometry(tube, Math.ceil(tube.getLength() / 0.07), LIFT_R, 28),
			new THREE.MeshPhysicalMaterial({ color: '#ffb466', transparent: true, opacity: 0.34, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.name = 'token-lift';
		glass.renderOrder = 4;
		this.tokenizer.add(glass);
		const hoops = new Batch();
		const collar = ring(LIFT_R + 0.22, LIFT_R + 0.02, 0.24);
		const q = new THREE.Quaternion();
		const e = new THREE.Euler();
		q.setFromUnitVectors(this.yAxis, tube.getTangentAt(0));
		e.setFromQuaternion(q);
		hoops.add(collar, m.steel, { p: tube.getPointAt(0).toArray() as V3, r: [e.x, e.y, e.z] });
		this.tokenizer.add(hoops.build('lift-hoops'));

		// A steel trough from the end of the belt over the arch's floor to the mouth of the lift, so nothing crosses the gap
		// on air, and a stand linking it to the floor.
		const b = new Batch();
		const trough = SAFETY_X + 0.75 - BELT_END;
		b.add(rbox(trough, 0.06, 1.1, 0.02, 2), m.steelSoft, { p: [BELT_END + trough / 2, BELT_Y - 0.03, z] });
		b.add(rbox(0.9, 0.5, 1.2, 0.08, 3), m.steelSoft, { p: [BELT_END + 0.1, BELT_Y - 0.28, z] });
		this.tokenizer.add(b.build('channel-mount'));

		// The rest of the request, thousands more tiles than anyone can draw.
		const geo = rbox(0.42, TILE_H * 0.9, TILE_D * 0.86, 0.05, 2);
		const restMat = (m.amber as THREE.MeshPhysicalMaterial).clone();
		restMat.clearcoatRoughness = 0.5;
		restMat.clearcoat = 0.5;
		this.rest = new THREE.InstancedMesh(geo, restMat, REST);
		this.rest.castShadow = true;
		this.rest.frustumCulled = false;
		this.tokenizer.add(this.rest);
	}

	/**
	 * Where a token on the path is, and which way it faces. Along the hall a token faces the lanes' middle, as it did on
	 * the belt; going up the shaft it turns to face out of the tower's slot, towards you.
	 */
	private flowFrame(u: number) {
		const p = this.flow.getPointAt(u);
		const t = this.flow.getTangentAt(u).normalize();
		const turn = smooth(seg(p.y, BELT_Y + 1.6, BELT_Y + 4.6)) * (Math.PI / 2);
		const side = new THREE.Vector3(Math.sin(turn), 0, -Math.cos(turn));
		side.addScaledVector(t, -side.dot(t)).normalize();
		const up = t.clone().cross(side).normalize();
		return { p, t, side, up };
	}

	private buildPipes() {
		const m = mats();
		this.root.updateMatrixWorld(true);
		const harnessPort = (x: number, z: number) => this.harness.group.localToWorld(new THREE.Vector3(x, PORT_Y, z)).toArray() as V3;

		// The request's way out of the harness: over its roof to the capsule's cradle, then the aqueduct's lane to the
		// template. Nothing is drawn for it: the capsule rides it.
		const cradle = capsuleAt(4.0);
		this.routeOut = curve([
			[HARNESS_POS.x, 2.2 * HS, HARNESS_POS.z],
			[HARNESS_POS.x - 0.3, P.HARNESS.h + 0.4, HARNESS_POS.z - 0.6],
			[cradle[0], cradle[1] + 0.4, cradle[2]]
		]);
		this.downCurve = new PartOf(UP_LANE, CRADLE_S / LANE_AT.len, LANE_AT.template / LANE_AT.len);

		// The MCP server's lead, from its port across the desk to the harness's left flank.
		const lead0 = this.mcp.group.localToWorld(new THREE.Vector3(MCP_W / 2, 0.9, -0.22)).toArray() as V3;
		const lead1 = harnessPort(-HW / 2, PORT_MCP_Z);
		// Along the desk in front of the easel, past the corner of its brass foot, and back to the harness's flank.
		const clear = P.EASEL.at.x + 2.35;
		const lead = lying(curve([
			...leaving(lead0, [1, 0, 0], 0.042),
			[lead0[0] + 0.45, 0.28, lead0[2] - 0.05],
			[lead0[0] + 0.9, 0.045, lead0[2] - 0.2],
			[clear - 0.6, 0.045, 0.3],
			[clear, 0.045, -0.4],
			[clear + 0.15, 0.045, lead1[2] + 0.9],
			[lead1[0] - 0.7, 0.06, lead1[2] + 0.05],
			[lead1[0] - 0.32, 0.25, lead1[2]],
			...leaving(lead1, [-1, 0, 0], 0.042).reverse()
		]), 0.042);
		this.mcpLead = lead;
		const leadTube = new THREE.Mesh(new THREE.TubeGeometry(lead, 120, 0.042, 10), m.cobalt);
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
		this.tokenizer.add(tread);

		// Laptop to harness: a plain cable, the keystrokes are not special yet. Out of the laptop's side, along the desk,
		// into the harness's right flank.
		const laptopTurn = this.laptop.group.rotation;
		const plug = new THREE.Vector3(...LAPTOP_PORT).applyEuler(laptopTurn).add(this.laptop.group.position);
		const away = new THREE.Vector3(1, 0, 0).applyEuler(laptopTurn);
		const keys = harnessPort(HW / 2, PORT_KEYS_Z);
		const cable = lying(curve([
			...leaving([plug.x, plug.y, plug.z], [away.x, away.y, away.z], 0.04),
			[plug.x + 0.5, 0.04, plug.z - 0.4],
			[keys[0] + 0.5, 0.04, lerp(plug.z, keys[2], 0.5)],
			[keys[0] + 0.55, 0.04, keys[2] + 0.5],
			[keys[0] + 0.42, 0.22, keys[2] + 0.05],
			...leaving(keys, [1, 0, 0], 0.04).reverse()
		]), 0.04);
		this.routeCable = cable;
		const cm = new THREE.Mesh(new THREE.TubeGeometry(cable, 80, 0.04, 10), m.rubber);
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
	 * The model, on the tower's roof: the brain on its glass pedestal, fed from below. Up the shaft beside the tokens'
	 * lift, the reply's own glass column comes down from the brainstem to the tower's floor; it stands from the first
	 * frame, and is explained when it's used.
	 */
	private buildModelTeaser() {
		placeModel(this.brain);
		this.root.add(this.brain.group);
		const x = -SHAFT_X;
		const z = TZ + P.RAIL_CLEAR;
		const stream = new THREE.LineCurve3(new THREE.Vector3(x, SEAT_Y - 1.75, z), new THREE.Vector3(x, P.PLATFORM_Y + 1.7, z));
		this.stream = stream;
		const glass = new THREE.Mesh(
			new THREE.TubeGeometry(stream, 2, LIFT_R, 28),
			new THREE.MeshPhysicalMaterial({ color: '#7fb4ea', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.name = 'stream';
		glass.renderOrder = 4;
		this.root.add(glass);
		this.streamGlass = glass.material;
	}

	/** The reply's way home, by the story's clock: when each piece is sealed by the door, and when it drops in at home. */
	get homeTimes() {
		return this.home.times;
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
	visit(cue: { names: string[]; together?: boolean; hold?: number; act?: string; index?: number; cutBack?: boolean; still?: boolean; wide?: boolean; front?: boolean; close?: boolean; pose?: string }) {
		return this.visits.start({
			names: cue.names,
			together: cue.together,
			hold: cue.hold,
			cutBack: cue.cutBack,
			still: cue.still,
			wide: cue.wide,
			front: cue.front,
			close: cue.close,
			pose: cue.pose && this.trackIn ? TOUR[cue.pose] : undefined,
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

	/** Tells the last chapter's lap stop by stop: the token goes round to stop i (9 finishes the lap). */
	tellStop(i: number) {
		this.finale.tell(i);
	}

	/** Names one of the four gates in "Intent is not authority": its beacon flares. */
	nameGate(i: number) {
		this.back.nameGate(i);
	}

	/** Names one of the front door's five checks: its blade nods out, its lamp flares. */
	nameCheck(i: number) {
		this.scenery.gatehouse.name(i);
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
		this.dt = dt;
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
		const easel = this.scenery.desk.easel;
		easel.visible = legs > 0.002;
		easel.scale.y = Math.max(0.002, legs);
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
			this.lookFromDebugEye();
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
			smooth(seg(T, 18.88, 18.98)) * (1 - smooth(seg(T, HOME.from, HOME.from + 0.006)))
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
				this.updateTokenizer(T, time);
				this.mcp.update(seg(T, 1.86, 2.0), time);
				this.skills.update(T);
				this.brain.update(T, time);
				// The masts read the capsule as it passes; the front door runs its checks once it's there.
				const riding = T > 4.0 && T < 5.9;
				this.scenery.update(time, riding ? [this.capsule.group.position] : [], T < 4.86 ? -1 : seg(T, 5.04, 5.62) * 5);
			} else {
				// Everything from the first half at rest upstairs, however the reader got here.
				this.updateCapsule(T, time);
				this.updateTokenizer(6, time);
				this.scenery.update(time, this.home.cargo(this.homeCargo), -1, this.home.sealed(T));
				this.brain.update(6.9 + this.finale.brainBusy * 0.8, time);
				// The first half of the journey is over: its travellers have gone, its machines stay.
				this.doc.group.visible = false;
				this.strips.forEach((s) => (s.mesh.visible = false));
				this.tiles.forEach((t) => (t.group.visible = false));
				this.rest.visible = false;
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
		this.lookFromDebugEye();
		this.stage.render();
	}

	/** While building: a camera of one's own, from the console. */
	private lookFromDebugEye() {
		if (!this.debugEye) return;
		const cam = this.stage.camera;
		cam.position.set(...this.debugEye.eye);
		cam.lookAt(...this.debugEye.look);
		if (this.debugEye.fov) cam.fov = this.debugEye.fov;
		cam.clearViewOffset();
		cam.updateProjectionMatrix();
		this.stage.focusLight(new THREE.Vector3(...this.debugEye.look), 8);
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
		// The harness stands behind your laptop: up off the screen first, a little towards you, and only once it's clear
		// over the lid's top does it go back across to the drawer.
		const y1 = from.y + 1.9;
		const y2 = to.y + 1.8;
		const across = smooth(seg(e, 0.28, 1));
		const toward = Math.sin(Math.min(1, e / 0.3) * Math.PI * 0.5) * 0.3 * (1 - across);
		strip.position.set(lerp(from.x, to.x, across), w0 * from.y + w1 * y1 + w2 * y2 + w3 * to.y, lerp(from.z, to.z, across) + toward);
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
		// It rolls up as it lifts off the easel, flies over to the capsule waiting open behind the harness's roof, and drops
		// in; it rides in it across the internet, and at the template the capsule opens and the roll goes in.
		const moveK = smoother(seg(T, 3.58, 3.94));
		const scale = lerp(1, 0.62, smooth(seg(T, 3.58, 3.76)));
		const rollUp = inOut(seg(T, 3.66, 3.9));
		const dg = this.doc.group;
		const rollLift = ROLL_AXIS * scale;
		this.updateCapsule(T, time);
		const inside = this.capsule.middle(this.v1);
		const thud = starts.reduce((sum, a) => sum + bell(seg(T, a + 0.14, a + 0.18), 0, 1), 0);
		const outK = seg(T, 5.92, 6.02);
		if (T < 3.58) {
			dg.position.copy(DOC_POS);
			dg.rotation.set(DOC_TILT + thud * 0.03, 0, 0);
		} else if (moveK < 1) {
			// Up off the easel, over to above the capsule, and down into it.
			const u = 1 - moveK;
			const P0 = DOC_POS;
			const to = this.v2.copy(inside).setY(inside.y + rollLift);
			const c1 = this.v3.copy(P0).setY(P0.y + 2.4);
			const c2 = this.v4.copy(to).setY(to.y + 2.0);
			dg.position.set(
				u * u * u * P0.x + 3 * u * u * moveK * c1.x + 3 * u * moveK * moveK * c2.x + moveK * moveK * moveK * to.x,
				u * u * u * P0.y + 3 * u * u * moveK * c1.y + 3 * u * moveK * moveK * c2.y + moveK * moveK * moveK * to.y,
				u * u * u * P0.z + 3 * u * u * moveK * c1.z + 3 * u * moveK * moveK * c2.z + moveK * moveK * moveK * to.z
			);
			this.qA.setFromEuler(new THREE.Euler(DOC_TILT, 0, 0));
			dg.quaternion.slerpQuaternions(this.qA, this.capsule.group.quaternion, smooth(seg(moveK, 0.1, 0.85)));
			dg.rotateZ(Math.sin(moveK * Math.PI) * -0.12);
		} else if (outK <= 0) {
			// Lying in the capsule, riding with it.
			dg.position.copy(inside).setY(inside.y + rollLift);
			dg.quaternion.copy(this.capsule.group.quaternion);
		} else {
			// Lifted out of the open capsule and into the template's top.
			// Its roll, at the page's foot, comes down to the slot's mouth: the page's middle stands that much higher.
			const into = this.v2.set(...tok(TEMPLATE_X, ISLAND_C_Y + 1.8, LINE_Z)).setY(this.v2.y + rollLift);
			const k = inOut(outK);
			const p = this.v3.copy(inside).setY(inside.y + rollLift).lerp(into, k);
			p.y += Math.sin(k * Math.PI) * 0.9;
			dg.position.copy(p);
			dg.quaternion.copy(this.capsule.group.quaternion);
		}
		// Rolled up until the harness has something to put in it, so the MCP server is in plain sight until then.
		this.doc.setRoll(inOut(seg(T, 1.97, 2.09)) * (1 - rollUp));
		this.doc.setFilled(T >= STRIPS_PRINTED);
		const gone = smooth(seg(outK, 0.6, 1));
		dg.scale.setScalar(Math.max(0.001, scale * (1 - gone)));
		// Under the ciphertext, nothing of it can be made out: the clouded glass and the blocks are all there is.
		dg.visible = outK < 1 && this.cipher < 0.55;
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

			m.visible = T >= (i === 3 ? 1.6 : a) && T < STRIPS_PRINTED;
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

	/** How clouded the capsule's glass is with ciphertext, this frame; and the frame's length. */
	private cipher = 0;
	private dt = 0;

	/**
	 * The capsule: open in its cradle for the page, shut and locked as the page goes in; the ciphertext fills it as it
	 * sets off along the lane; at the door the first check decrypts it and unlocks it; at the template it opens.
	 */
	private updateCapsule(T: number, time: number) {
		// Once the reply is home it rests in its cradle again, empty, for the next turn.
		const s = (T >= EXIT_T ? CRADLE_S : rideAt(T)) / LANE_AT.len;
		const at = UP_LANE.getPointAt(Math.min(1, s), this.v1);
		const along = UP_LANE.getTangentAt(Math.min(1, s), this.v2);
		this.capsule.sit(at.setY(at.y + BELT_TOP), along);
		this.capsule.group.visible = T < DIVE_T || T >= EXIT_T;
		const open = T >= EXIT_T ? 0 : inOut(seg(T, 3.56, 3.7)) * (1 - inOut(seg(T, 3.94, 4.0))) + inOut(seg(T, 5.86, 5.92));
		const checks = seg(T, 5.04, 5.62) * 5;
		const lock = T >= EXIT_T ? 0 : seg(T, 4.0, 4.06) * (1 - seg(checks, 0, 0.5));
		this.cipher = T >= EXIT_T ? 0 : smooth(seg(T, 4.04, 4.22)) * (1 - smooth(seg(checks, 0.1, 0.7)));
		this.capsule.update(open, lock, this.cipher, time);
		this.home.update(T, time);
		const pour = this.home.pouring(T);
		this.streamGlass.emissive.set('#5b9dff');
		this.streamGlass.emissiveIntensity = pour * 1.1;
		this.streamGlass.opacity = 0.42 + pour * 0.25;
		this.copilotArch.update(this.harnessId === 'copilot', seg(T, 4.72, 4.76), this.dt);
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
			const f = this.flowFrame(u);
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
			const left = this.sunk(s);
			tile.group.scale.set((1 + squash * 0.04) * size * left, low * size * left, (1 + squash * 0.12) * size * left);
			// Behind the slot it's still inside the template, and drawn nowhere: it isn't anywhere either.
			tile.group.visible = feed > 0 && s + tile.width / 2 > 0 && left > 0;
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
				d.scale.setScalar(size * this.sunk(s));
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

	/**
	 * How much of its size something riding the token path at s still has as it goes into the brainstem's seat at the
	 * top of the pedestal: all of it below, and less and less as it goes in, so nothing is left at the end of the path.
	 */
	private sunk(s: number) {
		return 1 - smooth(seg(s, this.lipS - 1.0, this.lipS - 0.05));
	}

	/* ---------- the map in the corner: the world itself, from far off ---------- */

	/** Where the page's map draws itself. Set by the page once it has one; null where there isn't one. */
	mapCanvas: HTMLCanvasElement | null = null;
	/** A phone draws its map only when the reader reaches another stop, not on a clock. */
	mapSeldom = false;
	private map = new MiniMap(new THREE.Vector3(-5, 13, -20), { x: 38, y: 23 }, 10, 8);
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
		const dock = low([-60.6, -10.7, 0.7]);
		const route: [number, V3][] = [
			[0, [P.LAPTOP.at.x, 1.2, P.LAPTOP.at.z]],
			[2, [HARNESS_POS.x, 2.6, HARNESS_POS.z]],
			[3.5, [DOC_POS.x, DOC_POS.y, DOC_POS.z]],
			[4, capsuleAt(4.0)],
			[4.65, capsuleAt(4.648)],
			[4.9, capsuleAt(4.9)],
			[5.3, [0, P.PLATFORM_Y + 1, P.DOOR_Z]],
			[6, tok(TEMPLATE_X, 0.9, LINE_Z)],
			[6.86, tok(BELT_END, 0.9, LINE_Z)],
			[7.3, [SHAFT_X, P.PLATFORM_Y + 1.5, TZ]],
			[7.95, [SHAFT_X, SEAT_Y, TZ]],
			[18.6, [SHAFT_X, SEAT_Y, TZ]],
			[HOME.from, [-SHAFT_X, SEAT_Y, TZ]],
			...[0.02, 0.045, 0.07].map((k): [number, V3] => [HOME.from + k, this.home.head(HOME.from + k, new THREE.Vector3()).toArray() as V3]),
			[HOME.arrive, this.home.head(HOME.arrive, new THREE.Vector3()).toArray() as V3],
			[19.3, [HARNESS_POS.x, P.HARNESS.h, HARNESS_POS.z]],
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
