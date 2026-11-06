import type { Pace } from './playhead';

/** Closer than this to a stop is at it. */
const AT = 1e-4;

export interface Feel {
	/** How much faster than authored a beat being passed through may play. */
	hurry: number;
	/** The longest it may take to finish a beat being passed through; longer than that, it's a cut instead. */
	hurryFor: number;
	/** How much faster than authored a step back may play. */
	rewind: number;
	/** The longest a step back may take to play backwards; longer than that, it's a cut instead. */
	rewindFor: number;
}

export const DESK: Feel = { hurry: 4, hurryFor: 1.2, rewind: 3, rewindFor: 0.8 };
/** A phone held close fills the eyes: quick passes are gentler, and give way to a cut sooner. */
export const PHONE: Feel = { hurry: 3, hurryFor: 1.4, rewind: 2.5, rewindFor: 0.7 };

export interface Move {
	/** Times the authored pace, for this frame. */
	speed: number;
	/** Go straight here instead of playing the way: under a cover, it's a cut. */
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
 * once begun, always plays to its end at its authored pace. The reader asks for the next beat or the one before;
 * asking again while one is playing lines up one more, and the beat under way finishes quickly to make way for it, or,
 * if even quickly would take too long, is cut to its end. Stepping back plays backwards only if it's short, and is
 * otherwise a cut. However the reader asks, the playhead is never more than one beat away from where it's going.
 */
export class Director {
	/** The stop the story is making for, or resting at. */
	goal = 0;
	/** Somewhere inside a beat to stop instead of its end: a moment the reader asked to see. */
	hold: number | null = null;
	/** Where a step back set out from. */
	private from = 0;

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
		return moved;
	}

	/** The beat before. Returns whether there was one. */
	back(T: number) {
		this.from = T;
		const goal = this.hold !== null || this.stops[this.goal] > T + AT ? this.behind(T) : Math.max(0, this.behind(T) - 1);
		const moved = goal !== this.goal || this.hold !== null;
		this.hold = null;
		this.goal = goal;
		return moved;
	}

	/** Straight to a stop, from wherever the reader is. */
	go(k: number) {
		this.hold = null;
		this.goal = Math.max(0, Math.min(this.last, k));
	}

	/** On to a moment inside the beat ahead, and rest there. */
	reach(T: number, at: number) {
		if (at <= T + AT) return;
		this.goal = this.ahead(at);
		this.hold = at;
	}

	/** What the playhead should do this frame, to get where it's going. */
	move(T: number): Move {
		const G = this.target;
		if (Math.abs(G - T) < AT) return { speed: 1 };
		const { hurry, hurryFor, rewind, rewindFor } = this.feel;
		if (G > T) {
			// A moment the reader picked inside this beat: on to it briskly.
			if (this.hold !== null) return { speed: hurry };
			const k = this.stops.findIndex((s) => s > T + AT);
			const end = k < 0 ? G : this.stops[k];
			// The beat the reader is going to plays as it was made.
			if (end >= G - AT) return { speed: 1 };
			// One on the way finishes briskly, or if that would still take too long, it's cut to the start of the last.
			if (this.pace.seconds(T, end) / hurry <= hurryFor) return { speed: hurry };
			return { speed: 1, cut: this.stops[this.goal - 1] ?? end };
		}
		if (this.pace.seconds(G, T) / rewind <= rewindFor) return { speed: rewind };
		return { speed: rewind, cut: G };
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
