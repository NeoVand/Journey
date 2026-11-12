import type { Region, Shot } from '../../rig';
import { ROOM_AT } from '../harness';
import { CHILD, SUB } from './layout';
import { COMPACT, NESTS, RESULTS, TURNS } from './turns';

/*
 * The camera inside the harness, card by card, timed to the trip's script so it arrives before what it has come to
 * see. Each card has one look, two at most; card 6 dives into the subagent's rooms and climbs back out.
 */

const box = (x: number, y: number, w: number, h: number): Region => ({ x, y, w, h });
/** Beside the card on a wide screen, above it on a phone. */
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);
const shot = (az: number, el: number, target: [number, number, number], radius: number, ry = radius * 0.7, extra: Partial<Shot> = {}): Omit<Shot, 'T'> => ({
	az,
	el,
	target: [target[0] + ROOM_AT.x, target[1] + ROOM_AT.y, target[2] + ROOM_AT.z],
	radius,
	ry,
	wide: WIDE,
	tall: TALL,
	...extra
});

/** The whole room: the loop, the gate, the benches and the subagent. */
const ROOM = shot(16, 38, [0.75, 1.7, -0.3], 9.2, 6.1, { tallRadius: 9.0, tallRy: 7.0 });
/** The back wall: the drawers, the shelf and the tray's start, where the request is packed. */
const BACK = shot(6, 18, [-0.6, 2.45, -4.4], 4.6, 3.05, { tallRadius: 4.8, tallRy: 3.6 });
/** The gate, close, from the open side: its lamps, its bell, the dial and rules, your screen and your hooks. */
const GATE = shot(38, 18, [-5.1, 1.2, -1.7], 2.5, 1.75, { tallRadius: 2.6, tallRy: 2.2 });
/** From the gate to the benches and back: the front of the room. */
const FRONT = shot(20, 30, [0.3, 0.9, -1.0], 6.8, 3.6, { tallRadius: 7.0, tallRy: 4.6 });
/** A long session: the tray, the gate and the benches, all busy. */
const BUSY = shot(10, 34, [0.6, 1.2, -1.2], 8.2, 5.0, { tallRadius: 8.2, tallRy: 5.8 });
/** The tray, end to end, with the press at its end and the record's way out to your disk. */
const TRAY = shot(6, 30, [0.25, 0.75, -3.1], 5.4, 2.3, { tallRadius: 5.6, tallRy: 3.0 });
/** The front of the room: the cart's way from the gate round to the subagent's door. */
const DOORWAY = shot(14, 32, [0.6, 0.8, 1.2], 6.8, 4.0, { tallRadius: 7.0, tallRy: 5.0 });

/** A room of the subagent's, by its layer: framed to fit its walls. */
function layer(n: number) {
	let x0 = SUB.x0;
	let x1 = SUB.x1;
	let z0 = SUB.z0;
	let z1 = SUB.z1;
	for (let i = 1; i < n; i++) {
		const w = x1 - x0;
		const d = z1 - z0;
		[x0, x1, z0, z1] = [x0 + CHILD.u0 * w, x0 + CHILD.u1 * w, z0 + CHILD.v0 * d, z0 + CHILD.v1 * d];
	}
	const w = x1 - x0;
	return shot(12, 34, [(x0 + x1) / 2, w * 0.12, (z0 + z1) / 2 + w * 0.04], w * 0.56, w * 0.4, { tallRadius: w * 0.6, tallRy: w * 0.5 });
}

const turn = (n: number) => TURNS[n - 1];
const deny = turn(5).cards.find((k) => k.call.verdict === 'deny')!;
const nest = (n: number) => NESTS[n - 1];
const report = RESULTS.find((r) => r.span === 2)!;

export const F3_SHOTS: Shot[] = [
	// Cards 1 and 2: the whole room, drifting a little as the loop goes round.
	{ T: 0, ...ROOM },
	{ T: 0.86, ...ROOM, az: 19 },
	{ T: 1.84, ...ROOM, az: 12 },
	// Card 3: the back wall, before your answer arrives and the request is packed again.
	{ T: 1.93, ...BACK },
	{ T: 2.84, ...BACK, az: 2 },
	// Card 4: the gate while it checks; then out to the benches and back with the results.
	{ T: 2.94, ...GATE },
	{ T: deny.out! + 0.01, ...GATE, az: 34 },
	{ T: deny.out! + 0.12, ...FRONT },
	{ T: 3.84, ...FRONT, az: 17 },
	// Card 5: the tray filling turn after turn; then close on the tray as it reaches its end and the press squeezes.
	{ T: 3.93, ...BUSY },
	{ T: COMPACT.at - 0.12, ...BUSY, az: 13 },
	{ T: COMPACT.at - 0.01, ...TRAY },
	{ T: 4.84, ...TRAY, az: 3 },
	// Card 6: the front, while the call goes round to the subagent; then in, room by room, and back out.
	{ T: 4.95, ...DOORWAY },
	{ T: nest(1).brief - 0.04, ...DOORWAY, az: 12 },
	{ T: nest(3).brief + 0.005, ...layer(3) },
	{ T: nest(3).done, ...layer(3), az: 10 },
	{ T: nest(1).back[0] + 0.01, ...layer(1) },
	{ T: report.aboard + 0.05, ...ROOM, az: 14 },
	{ T: 6, ...ROOM, az: 12 }
];
