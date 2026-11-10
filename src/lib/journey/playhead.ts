/** Kept here rather than imported from the chapter: this file must stay free of 3D code. */
const TRANSFORMER_PACE = [
	{ from: 14.0, to: 14.125, seconds: 6.5 }, // what this thing is
	{ from: 14.125, to: 14.165, seconds: 2.4 },
	{ from: 14.165, to: 14.27, seconds: 7.5 }, // every word finds its place on the map
	{ from: 14.27, to: 14.32, seconds: 2.8 },
	{ from: 14.32, to: 14.54, seconds: 16 }, // compare, weigh, mix, and "job" moves
	{ from: 14.54, to: 14.62, seconds: 5 }, // then all of them
	{ from: 14.62, to: 14.695, seconds: 7 }, // the small network
	{ from: 14.695, to: 14.86, seconds: 10 }, // eighty floors
	{ from: 14.86, to: 14.984, seconds: 7.5 }, // one score for every word
	{ from: 14.984, to: 15.014, seconds: 2.4 }, // the highest line up
	{ from: 15.014, to: 15.092, seconds: 3.6 } // and travel to the board
];

export interface Span {
	from: number;
	to: number;
	/** How long this stretch of the timeline takes to play. */
	seconds: number;
	/** Names a stretch whose pace can change with what the reader has already seen. */
	key?: 'typing';
}

const FREE_RATE = 0.5;

/** How fast each stretch of the story plays, and so how long any part of it takes. */
export class Pace {
	/** By how much a stretch can go quicker for now, when what it shows has already happened. */
	quicker: (span: Span) => number = () => 1;

	constructor(public spans: Span[]) {}

	private spanAt(T: number) {
		for (const s of this.spans) if (T >= s.from && T < s.to) return s;
		return undefined;
	}

	/** Story time per second, here. */
	rate(T: number) {
		const s = this.spanAt(T);
		return s ? ((s.to - s.from) / s.seconds) * this.quicker(s) : FREE_RATE;
	}

	/** How long it takes to play from a to b, in seconds, whichever way round they are. */
	seconds(a: number, b: number) {
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		let total = 0;
		let at = lo;
		for (const s of this.spans) {
			if (s.to <= at || s.from >= hi) continue;
			if (s.from > at) total += (s.from - at) / FREE_RATE;
			const end = Math.min(hi, s.to);
			total += (end - Math.max(at, s.from)) / (((s.to - s.from) / s.seconds) * this.quicker(s));
			at = end;
		}
		if (at < hi) total += (hi - at) / FREE_RATE;
		return total;
	}

	/** Where the story is after playing for s seconds from a: the other way round from `seconds`. */
	after(a: number, s: number) {
		let at = a;
		let left = Math.max(0, s);
		for (const span of this.spans) {
			if (span.to <= at) continue;
			if (span.from > at) {
				const gap = (span.from - at) / FREE_RATE;
				if (left <= gap) return at + left * FREE_RATE;
				left -= gap;
				at = span.from;
			}
			const rate = ((span.to - span.from) / span.seconds) * this.quicker(span);
			const here = (span.to - at) / rate;
			if (left <= here) return at + left * rate;
			left -= here;
			at = span.to;
		}
		return at + left * FREE_RATE;
	}
}

const RESPONSE = 7; // how eagerly the playhead closes the last of the gap, per second
const EASE = 7; // how quickly its speed changes, per second

/**
 * Where the story is. It moves towards a target at the authored pace, times whatever speed it's asked for, easing into
 * and out of motion, and never passes the target.
 */
export class Playhead {
	v = 0;

	constructor(
		public pace: Pace,
		public T = 0,
		private unlimited = false
	) {}

	step(target: number, dt: number, speed = 1) {
		const lag = target - this.T;
		const limit = this.unlimited ? Infinity : this.pace.rate(this.T) * speed;
		const want = Math.max(-limit, Math.min(limit, lag * RESPONSE));
		this.v += (want - this.v) * (1 - Math.exp(-dt * EASE));
		const next = this.T + this.v * dt;
		const crossed = (target - next) * lag <= 0;
		if (crossed || (Math.abs(lag) < 0.0002 && Math.abs(this.v) < 0.002)) {
			this.T = target;
			this.v = 0;
		} else {
			this.T = next;
		}
		return this.T;
	}

	/** Straight there, without playing what's between: a cut. */
	jump(T: number) {
		this.T = T;
		this.v = 0;
	}
}

/** How long each stretch of the story takes, in reading and watching time. */
export const PACE: Span[] = [
	// The title stays put until its words begin to go: nothing to wait for.
	{ from: 0, to: 0.5, seconds: 0.3 },
	{ from: 0.5, to: 1.02, seconds: 3.2 }, // from the title to the laptop
	{ from: 1.02, to: 1.56, seconds: 3.4, key: 'typing' }, // typing 44 characters, unless it has typed itself already
	{ from: 1.56, to: 2.04, seconds: 2.4 }, // the prompt reaches the drawer
	{ from: 2.04, to: 2.7, seconds: 4.4 }, // four drawers
	{ from: 2.7, to: 3.58, seconds: 3.2 },
	{ from: 3.58, to: 4.08, seconds: 2.6 }, // the page falls to the tunnel
	{ from: 4.08, to: 4.86, seconds: 3.2 }, // ciphertext
	{ from: 4.86, to: 5.04, seconds: 1.1 },
	{ from: 5.04, to: 5.62, seconds: 3.6 }, // five checks
	{ from: 5.62, to: 6.16, seconds: 2.8 },
	{ from: 6.16, to: 6.56, seconds: 5.5 }, // eleven cuts
	{ from: 6.56, to: 6.86, seconds: 2 }, // the wave of flips
	{ from: 6.86, to: 7.72, seconds: 6.4 }, // long enough to read before the camera moves in
	{ from: 7.72, to: 8.1, seconds: 3.9 }, // pouring in, then the dive
	{ from: 8.1, to: 8.7, seconds: 3.8 }, // weights split across chips
	{ from: 8.7, to: 9.06, seconds: 2.8 },
	{ from: 9.06, to: 9.56, seconds: 4.2 }, // keys and values, one token at a time
	{ from: 9.56, to: 9.9, seconds: 2.4 }, // attention looks back
	{ from: 9.9, to: 10.1, seconds: 2 },
	{ from: 10.1, to: 10.62, seconds: 3.4 }, // blocks scatter into memory
	{ from: 10.62, to: 11, seconds: 2.4 },
	{ from: 11, to: 11.86, seconds: 11.5 }, // turn two: the router asks around, then five blocks through the gate
	{ from: 11.86, to: 12.06, seconds: 1.4 },
	{ from: 12.06, to: 12.92, seconds: 11.5 }, // fourteen scheduler steps, and five comings and goings to follow
	{ from: 12.92, to: 13.08, seconds: 1.4 },
	{ from: 13.08, to: 14.0, seconds: 12 }, // two pools, and into the first
	...TRANSFORMER_PACE,
	{ from: 15.092, to: 15.42, seconds: 2.2 },
	{ from: 15.42, to: 15.88, seconds: 3.8 }, // the wheel
	{ from: 15.88, to: 16.06, seconds: 1.4 },
	{ from: 16.06, to: 16.9, seconds: 7.4 }, // thirteen thinking tokens
	{ from: 16.9, to: 17.06, seconds: 2 },
	{ from: 17.06, to: 17.8, seconds: 5.6 }, // the call
	{ from: 17.8, to: 17.95, seconds: 2.4 }, // the stamp, and the reason it stopped
	{ from: 17.95, to: 18.1, seconds: 2.8 }, // the long pan along the row to the detokenizer
	{ from: 18.1, to: 19.04, seconds: 5.2 }, // only text leaves
	{ from: 19.04, to: 20.04, seconds: 5.4 },
	{ from: 20.04, to: 21.04, seconds: 8 }, // the gates
	{ from: 21.04, to: 25.04, seconds: 22 }, // sandbox and tools
	{ from: 25.04, to: 26.9, seconds: 9.8 }, // round the loop, and the press
	{ from: 26.9, to: 27.06, seconds: 1.7 }, // across to the memory shelf
	{ from: 27.06, to: 27.92, seconds: 4.5 },
	{ from: 27.92, to: 28.06, seconds: 1.7 }, // across to the lost answer
	{ from: 28.06, to: 28.9, seconds: 4.4 },
	{ from: 28.9, to: 29.06, seconds: 1.8 }, // across to the ten turns
	{ from: 29.06, to: 29.84, seconds: 13.6 }, // ten turns, each with something to read
	{ from: 29.84, to: 30.1, seconds: 3 }, // the long move from the ten turns to the steps
	{ from: 30.1, to: 32, seconds: 9.5 }, // the end
	{ from: 32, to: 32.32, seconds: 5.5 }, // the camera lets go of the laptop
	{ from: 32.32, to: 32.92, seconds: 11 }, // one last lap, with the whole world in view
	{ from: 32.92, to: 33, seconds: 1 }
];

/** A side trip's pace: each card's scene takes about this long to play. */
export const trackPace = (cards: number): Span[] => Array.from({ length: cards }, (_, i) => ({ from: i, to: i + 1, seconds: 8.5 }));
