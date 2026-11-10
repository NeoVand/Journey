import type { Pace } from './playhead';

/** Closer than this to a stop is at it. */
const AT = 1e-4;

export interface Feel {
	/** The least a beat being passed through speeds up by, to make way for the one asked for. */
	hurry: number;
	/** How long passing the rest of a beat takes at the least: shorter ones play at `hurry`. */
	hurryFor: number;
	/** The least a step back speeds up by, playing the way backwards. */
	rewind: number;
	/** How long a step back takes at the least: shorter ones play at `rewind`. */
	rewindFor: number;
	/** The longest a pass or a step back may take, however long its beat: a longer one plays faster instead. */
	most: number;
}

export const DESK: Feel = { hurry: 4, hurryFor: 1.2, rewind: 3, rewindFor: 0.8, most: 1.9 };
/** A phone held close fills the eyes: quick passes are gentler. */
export const PHONE: Feel = { hurry: 3, hurryFor: 1.4, rewind: 2.5, rewindFor: 0.9, most: 2.1 };

/**
 * How long, by the clock, playing through s seconds of story takes when it isn't the beat the reader asked for: a short
 * stretch at the least speed, a long one a little longer by the clock but much faster, and never longer than `most`.
 */
export const passing = (s: number, least: number, shortest: number, most: number) => Math.min(s / least, Math.min(most, Math.max(shortest, 0.55 + 0.09 * s)));

export interface Move {
	/** Times the authored pace, for this frame. */
	speed: number;
	/** Go straight here instead of playing the way: somewhere further than a beat or two, reached some other way. */
	cut?: number;
}

export interface Gauge {
	/** 1 playing forward, -1 going back, 0 at rest. */
	dir: 1 | -1 | 0;
	/** How much of the beat under way has played, by the clock, 0 to 1. */
	done: number;
}

/**
 * The story as beats: each card's scene, from the moment the last one finished to the moment this one has. A beat,
 * once begun, plays to its end at its authored pace. The reader asks for the next beat or the one before; asking again
 * while one is playing lines up one more, and the beat under way finishes quickly to make way for it. Stepping back
 * plays the beat backwards. Neither is ever cut: a long beat just plays faster, so either way takes a second or two.
 * Only a leap further than that, from the map or the ends, is a cut, which the page dresses as a flight.
 */
export class Director {
	/** The stop the story is making for, or resting at. */
	goal = 0;
	/** Somewhere inside a beat to stop instead of its end: a moment the reader asked to see. */
	hold: number | null = null;
	/** Where a step back set out from. */
	private from = 0;
	/** How fast the pass under way plays, set the first time it's asked for, so it keeps one speed all the way. */
	private pass = 0;

	constructor(
		public stops: number[],
		public pace: Pace,
		public feel: Feel = DESK
	) {}

	get last() {
		return this.stops.length - 1;
	}

	/** Where the playhead is going. */
	get target() {
		return this.hold ?? this.stops[this.goal];
	}

	/** The stop at or after T. */
	ahead(T: number) {
		const k = this.stops.findIndex((s) => s >= T - AT);
		return k < 0 ? this.last : k;
	}

	/** The stop at or before T. */
	behind(T: number) {
		return Math.max(
			0,
			this.stops.findLastIndex((s) => s <= T + AT)
		);
	}

	/** The nearest stop to T. */
	nearest(T: number) {
		let best = 0;
		this.stops.forEach((s, k) => {
			if (Math.abs(s - T) < Math.abs(this.stops[best] - T)) best = k;
		});
		return best;
	}

	/** The next beat. Returns whether there was one. */
	next(T: number) {
		const goal = this.hold !== null || this.stops[this.goal] < T - AT ? this.ahead(T) : Math.min(this.last, this.ahead(T) + 1);
		const moved = goal !== this.goal || this.hold !== null;
		this.hold = null;
		this.goal = goal;
		this.pass = 0;
		return moved;
	}

	/** The beat before. Returns whether there was one. */
	back(T: number) {
		this.from = T;
		const goal = this.hold !== null || this.stops[this.goal] > T + AT ? this.behind(T) : Math.max(0, this.behind(T) - 1);
		const moved = goal !== this.goal || this.hold !== null;
		this.hold = null;
		this.goal = goal;
		this.pass = 0;
		return moved;
	}

	/** Straight to a stop, from wherever the reader is. */
	go(k: number) {
		this.hold = null;
		this.goal = Math.max(0, Math.min(this.last, k));
		this.pass = 0;
	}

	/** On to a moment inside the beat ahead, and rest there. */
	reach(T: number, at: number) {
		if (at <= T + AT) return;
		this.goal = this.ahead(at);
		this.hold = at;
		this.pass = 0;
	}

	/** Rest right here, wherever that is: in the middle of a beat, the next step finishes it. */
	rest(T: number) {
		this.goal = this.ahead(T);
		this.hold = Math.abs(this.stops[this.goal] - T) < AT ? null : T;
		this.pass = 0;
	}

	/** How many stops lie strictly between two moments of the story. */
	private between(a: number, b: number) {
		const lo = Math.min(a, b) + AT;
		const hi = Math.max(a, b) - AT;
		return this.stops.filter((s) => s > lo && s < hi).length;
	}

	/** What the playhead should do this frame, to get where it's going. */
	move(T: number): Move {
		const G = this.target;
		if (Math.abs(G - T) < AT) return { speed: 1 };
		const { hurry, hurryFor, rewind, rewindFor, most } = this.feel;
		if (G > T) {
			const k = this.stops.findIndex((s) => s > T + AT);
			const end = k < 0 ? G : this.stops[k];
			// The beat the reader is going to plays as it was made; a moment they picked inside one, briskly.
			if (end >= G - AT && this.hold === null) return { speed: 1 };
			// Further than the beat after this one: the long way round would be minutes of scenery nobody asked for.
			if (this.between(T, G) >= 2) return { speed: 1, cut: this.stops[this.goal - 1] };
			// The rest of the beat under way finishes quickly to make way: faster the more it has left.
			if (!this.pass) {
				const s = this.pace.seconds(T, this.hold ?? end);
				this.pass = s / passing(s, hurry, hurryFor, most);
			}
			return { speed: this.pass };
		}
		if (this.between(G, T) >= 2) return { speed: rewind, cut: G };
		// Backwards, all the way it came, as quickly as a long beat needs.
		if (!this.pass) {
			const s = this.pace.seconds(G, T);
			this.pass = s / passing(s, rewind, rewindFor, most);
		}
		return { speed: this.pass };
	}

	/** How far through its beat the story is: what the step buttons show. */
	gauge(T: number): Gauge {
		const G = this.target;
		if (Math.abs(G - T) < AT) return { dir: 0, done: 1 };
		if (G > T) {
			const k = Math.max(
				1,
				this.stops.findIndex((s) => s > T + AT)
			);
			const a = this.stops[k - 1];
			const b = Math.min(this.stops[k] ?? G, this.hold !== null && this.hold > a ? this.hold : Infinity);
			const whole = this.pace.seconds(a, b);
			return { dir: 1, done: whole > 0 ? Math.min(1, this.pace.seconds(a, T) / whole) : 1 };
		}
		const whole = this.pace.seconds(G, Math.max(T, this.from));
		return { dir: -1, done: whole > 0 ? 1 - Math.min(1, this.pace.seconds(G, T) / whole) : 1 };
	}
}
