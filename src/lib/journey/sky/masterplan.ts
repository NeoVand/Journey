import * as THREE from 'three';
import { STEM_FOOT, STEM_LANE } from '../props/brain';
import { STEM } from '../brain/stem';

/*
 * ---------- Desk to sky, built as an aqueduct: the masterplan ----------
 * Height is distance from you. Your desk is at the bottom and the front. From the back of the harness a white aqueduct
 * climbs away in one gentle S, carrying the token's two lanes side by side: the request going up on the left, in amber,
 * and the reply coming down on the right, in pearl. Relay masts stand beside it: the internet. At its high end, on a
 * broad platform carried by its tallest arches, stands the provider: a jade gatehouse straddling both lanes (the front
 * door), a rose-tiled hall behind it (the tokenizer beside the left lane, the detokenizer beside the right), and a round
 * midnight-blue tower full of chips (the data center). There the lanes turn upwards and climb a shaft up the tower's
 * middle, seen through a tall glass slot in its front, and go into the model's brainstem from below: tokens in and
 * tokens out. The brain stands on the tower's roof in a ring of golden petals. The foundry, where the model was made,
 * stands on its own arches to the left, with the rail the finished model was carried up on; the proving ground, where
 * agents are tested, on its own pier to the right. Other companies' MCP servers are small towers on the horizon, each in
 * its own colours, hung with cables to your desk and one to the provider's tower.
 *
 * Every place takes its position from here. Units are the props' own (your laptop is 3.3 wide); y is up, your desk's
 * top is y = 0, and the centre line runs from the desk towards -z. The reader starts at +z looking along it, so left
 * is -x. Drawn from the four views in concepts/aqueduct: establishing, plan, section and reader. The brain is kept at
 * its built size, so the provider is a little grander around it than the pictures draw it.
 */

type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- your desk ---------- */

/** A rounded honey-wood desk top on a cream base. Its top is y = 0. */
export const DESK = { at: v(0, 0, 0), w: 21, d: 11, top: 0.45, corner: 3.2 };
/** Your laptop, at the front middle, facing you. */
export const LAPTOP = { at: v(0, 0, 2.7) };
/** The harness: the program running on your laptop that packs every request and reads every reply. Both lanes start and end in it. */
export const HARNESS = { at: v(0, 0, -2.5), w: 6.4, h: 4.6, d: 3.4 };
/** The permission gate, between the laptop and the harness. */
export const GATE = { at: v(0, 0, 0.35), w: 3.4 };
/** Local MCP servers: little programs on your own laptop, as gadgets piped to its ports, on the left. */
export const LOCAL_MCP = [v(-7.5, 0, 0.7), v(-5.9, 0, 0.7), v(-4.3, 0, 0.7)];
/** Your shell, your files, and the archive drawer of transcripts and memory, on the right. */
export const SHELL = { at: v(2.9, 0, 1.7) };
export const FILES = { at: v(4.6, 0, 1.0) };
export const ARCHIVE = { at: v(7.3, 0, 0.7), w: 2.6, h: 2.3, d: 3.0 };
/** Brass posts at the desk's back corners, where the remote towers' cables come down. */
export const POSTS = [v(-8.7, 0, -3.9), v(8.7, 0, -3.9)];

/* ---------- the aqueduct and the internet ---------- */

/** The provider's platform: the lanes run level along its top. */
export const PLATFORM_Y = 8;
/** The aqueduct's deck: as wide as two lanes and their kerbs. */
export const DECK_W = 3.4;
/** The two lanes, either side of the deck's middle: the request on the left, the reply on the right. */
export const LANE = 0.72;
/** Where the aqueduct reaches the provider's platform. Everything the provider has is measured back from here. */
export const DOOR_Z = -19.8;
const back = (dz: number) => DOOR_Z - dz;
/**
 * The aqueduct's middle line, from the back of the harness to the gatehouse's door: out level off the harness's roof,
 * then one gentle S, climbing all the way.
 */
export const AQUEDUCT: V3[] = [
	[0, HARNESS.h + 0.2, HARNESS.at.z - HARNESS.d / 2 - 0.4],
	[0, HARNESS.h + 0.4, -6.8],
	[-2.0, 5.7, -10.4],
	[0.5, 6.8, -14.0],
	[1.0, 7.6, -17.2],
	[0, PLATFORM_Y, DOOR_Z]
];
/** Where the aqueduct's arches stand: their piers go down out of sight into the haze. */
export const PIER_FOOT = -16;
/** Relay masts beside the aqueduct, each on a round pier of its own: the internet's routers. */
export const MASTS = [
	{ at: v(-6.4, 2.6, -9.6), h: 8.5 },
	{ at: v(6.2, 3.4, -13.2), h: 8.0 }
];

/* ---------- the provider ---------- */

/** The gatehouse: the provider's front door, jade enamel and brass, straddling both lanes. */
export const GATEHOUSE = { at: v(0, PLATFORM_Y, back(1.6)), w: 13.6, h: 5.6, d: 4.0, door: { w: 5.2, h: 4.8 } };
/** The hall behind it: rose-tiled walls under a glass vault, the tokenizer down its left side, the detokenizer down its right. */
export const HALL = { from: back(3.7), to: back(17.6), w: 15, wall: 4.2, vault: 3.6 };
export const TOKENIZER = { x: -3.9, from: back(5.4), to: back(15.8) };
export const DETOKENIZER = { x: 3.9, from: back(5.4), to: back(15.8) };
/** The data center: a round tower of midnight-blue enamel and silver, floors of chips behind glass. */
export const TOWER = { at: v(0, PLATFORM_Y, back(24.9)), r: 6.8, floors: 5, floorH: 3.3 };
export const ROOF_Y = TOWER.at.y + TOWER.floors * TOWER.floorH + 0.5;
/** The shaft up the tower's middle the lanes climb, seen from in front through a tall glass slot. */
export const SHAFT = { r: 1.3, slot: 2.8 };
/** The crown: a ring of golden petals round the edge of the roof. */
export const CROWN = { r: 5.9, petals: 16, h: 3.4 };
/** The model's brainstem stands on the middle of the roof, right over the shaft. The brain's own frame puts its stem 1.4 behind its middle. */
export const MODEL = { stem: v(0, ROOF_Y, TOWER.at.z), stemX: STEM.x };
/** How high the brainstem's seat stands over the roof, at the top of its glass pedestal: where the lanes end. */
const STEM_RISE = STEM.seat - STEM_FOOT - 0.3;
/** The provider's platform, under all three, on the aqueduct's tallest arches. Its outline, from above, about the centre line. */
export const PLATFORM: [number, number][] = [
	[-6.6, back(-0.8)],
	[-8.6, back(3.8)],
	[-8.6, back(17)],
	[-9.6, back(20.6)],
	[-9.4, back(29)],
	[-5.6, back(33.2)],
	[5.6, back(33.2)],
	[9.4, back(29)],
	[9.6, back(20.6)],
	[8.6, back(17)],
	[8.6, back(3.8)],
	[6.6, back(-0.8)]
];

/* ---------- either side ---------- */

/** The foundry, where the model was made: iron and copper, a furnace glowing, on its own arches to the left, higher up. */
export const FOUNDRY = { at: v(-19, 11.5, back(10.4)), w: 10, d: 7.5 };
/** The rail the finished model was carried up on: from the foundry, round behind the hall, up to the tower's roof. */
export const FOUNDRY_RAIL: V3[] = [
	[-14.6, 11.6, back(12.9)],
	[-12.6, 13.6, back(19.9)],
	[-10.4, 17.0, back(26.9)],
	[-6.6, ROOF_Y + 0.2, back(28.6)]
];
/** The proving ground, where agents are tested: a mint test course and a violet-domed observatory, on its own pier to the right. */
export const PROVING = { at: v(19, 10, back(10.4)), r: 6.2, observatory: v(21.2, 10, back(14)) };

/* ---------- the horizon ---------- */

/** Other companies' MCP servers: small towers floating on the horizon, each in its own colours. */
export const REMOTE = [
	{ at: v(-27, 19, -41), tint: '#b9a2e8', name: 'lilac' },
	{ at: v(-15, 22, -55), tint: '#f29a8c', name: 'coral' },
	{ at: v(26, 20, -48), tint: '#7fd3b5', name: 'sea-green' }
];
/** Their cables: each hangs down to a post on your desk; the sea-green one also runs to the provider's tower, which can call it itself. */
export const REMOTE_CABLES: { from: number; to: THREE.Vector3 }[] = [
	{ from: 0, to: POSTS[0] },
	{ from: 1, to: POSTS[0] },
	{ from: 2, to: POSTS[1] },
	{ from: 2, to: v(TOWER.r * 0.72, ROOF_Y - 3, TOWER.at.z + TOWER.r * 0.69) }
];

/* ---------- the route ---------- */

/**
 * A lane from the harness to the brainstem, on one side of the aqueduct's middle line (-1 the left, the request's; +1 the
 * right, the reply's): along the aqueduct a lane's width off its middle, through the gatehouse door, down the hall, into
 * the tower to its middle, and straight up the shaft and the glass pedestal to the seat the brainstem stands in.
 */
function lane(side: -1 | 1): THREE.Vector3[] {
	const along = new THREE.CatmullRomCurve3(AQUEDUCT.map((p) => v(...p)), false, 'centripetal');
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i <= 24; i++) {
		const u = i / 24;
		const p = along.getPointAt(u);
		const t = along.getTangentAt(u);
		const right = new THREE.Vector3(-t.z, 0, t.x).normalize();
		pts.push(p.addScaledVector(right, side * LANE).setY(p.y + 0.35));
	}
	const y = PLATFORM_Y + 0.35;
	const x = side * LANE;
	pts.push(v(x, y, HALL.from), v(x, y, HALL.to), v(x, y, TOWER.at.z + 1.4));
	const up = side * STEM_LANE;
	pts.push(v(up, y + 1.2, TOWER.at.z), v(up, ROOF_Y, TOWER.at.z), v(up, ROOF_Y + STEM_RISE, TOWER.at.z));
	return pts;
}

/** The request's lane, from the harness up to the brainstem, on the left. */
export const upLane = () => lane(-1);
/** The reply's lane, from the brainstem down to the harness, on the right. */
export const downLane = () => lane(1).reverse();
