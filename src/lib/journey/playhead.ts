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

/**
 * Scroll is the reader's intent, not the animation clock. A trackpad flick can cover a whole beat
 * in 100ms, so the scene follows a playhead that chases the scroll position at a bounded speed.
 * A flick starts a beat and the beat plays out at its authored pace. Big jumps still get there.
 */
export interface Span {
	from: number;
	to: number;
	/** The shortest time this stretch of the timeline may take. */
	seconds: number;
}

const RESPONSE = 7; // how eagerly the playhead closes the gap, per second
const EASE = 7; // how quickly its speed changes, per second
const REWIND = 1.8; // scrubbing backwards may run faster
const CATCH_UP_AFTER = 0.35; // lag, in beats, before the limit starts to lift
const CATCH_UP = 8;
const CATCH_UP_MAX = 40; // long jumps travel quickly but stay readable as travel
const FREE_RATE = 0.5;

export class Playhead {
	v = 0;

	constructor(
		private pace: Span[],
		public T = 0,
		private unlimited = false
	) {}

	rateAt(T: number) {
		for (const s of this.pace) {
			if (T >= s.from && T < s.to) return (s.to - s.from) / s.seconds;
		}
		return FREE_RATE;
	}

	step(target: number, dt: number) {
		const lag = target - this.T;
		const far = Math.max(0, Math.abs(lag) - CATCH_UP_AFTER);
		const limit = this.unlimited
			? Infinity
			: this.rateAt(this.T) * (lag < 0 ? REWIND : 1) * Math.min(CATCH_UP_MAX, 1 + far * far * CATCH_UP);
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
}

/** Minimum durations for each stretch of the story, in reading and watching time. */
export const PACE: Span[] = [
	{ from: 0, to: 1.02, seconds: 2.2 },
	{ from: 1.02, to: 1.56, seconds: 3.4 }, // typing 44 characters
	{ from: 1.56, to: 2.04, seconds: 2.4 }, // the prompt reaches the drawer
	{ from: 2.04, to: 2.7, seconds: 4.4 }, // four drawers
	{ from: 2.7, to: 3.58, seconds: 2.6 },
	{ from: 3.58, to: 4.08, seconds: 2.6 }, // the page falls to the tunnel
	{ from: 4.08, to: 4.86, seconds: 3.2 }, // ciphertext
	{ from: 4.86, to: 5.04, seconds: 1.1 },
	{ from: 5.04, to: 5.62, seconds: 3.6 }, // five checks
	{ from: 5.62, to: 6.16, seconds: 2.8 },
	{ from: 6.16, to: 6.56, seconds: 5.5 }, // eleven cuts
	{ from: 6.56, to: 6.86, seconds: 2 }, // the wave of flips
	{ from: 6.86, to: 7.72, seconds: 6.4 }, // long enough to read before the camera moves in
	{ from: 7.72, to: 8.1, seconds: 3.2 }, // pouring in, then the dive
	{ from: 8.1, to: 8.7, seconds: 3.8 }, // weights split across chips
	{ from: 8.7, to: 9.06, seconds: 2.2 },
	{ from: 9.06, to: 9.56, seconds: 4.2 }, // keys and values, one token at a time
	{ from: 9.56, to: 9.9, seconds: 2.4 }, // attention looks back
	{ from: 9.9, to: 10.1, seconds: 1.4 },
	{ from: 10.1, to: 10.62, seconds: 3.4 }, // blocks scatter into memory
	{ from: 10.62, to: 11.08, seconds: 1.8 },
	{ from: 11.08, to: 11.86, seconds: 7.5 }, // turn two: five blocks through the gate
	{ from: 11.86, to: 12.06, seconds: 1.4 },
	{ from: 12.06, to: 12.92, seconds: 11.5 }, // fourteen scheduler steps, and five comings and goings to follow
	{ from: 12.92, to: 13.08, seconds: 1.4 },
	{ from: 13.08, to: 14.0, seconds: 8.5 }, // two pools, and into the first
	...TRANSFORMER_PACE,
	{ from: 15.092, to: 15.42, seconds: 2.2 },
	{ from: 15.42, to: 15.88, seconds: 3.8 }, // the wheel
	{ from: 15.88, to: 16.06, seconds: 1.4 },
	{ from: 16.06, to: 16.9, seconds: 7.4 }, // thirteen thinking tokens
	{ from: 16.9, to: 17.06, seconds: 1.2 },
	{ from: 17.06, to: 17.8, seconds: 5.6 }, // the call
	{ from: 17.8, to: 17.95, seconds: 2.4 }, // the stamp, and the reason it stopped
	{ from: 17.95, to: 18.1, seconds: 1 },
	{ from: 18.1, to: 19.04, seconds: 5.2 }, // only text leaves
	{ from: 19.04, to: 20.04, seconds: 5.4 },
	{ from: 20.04, to: 21.04, seconds: 8 }, // the gates
	{ from: 21.04, to: 25.04, seconds: 22 }, // sandbox and tools
	{ from: 25.04, to: 29.04, seconds: 21 }, // round the loop
	{ from: 29.04, to: 29.84, seconds: 14 }, // ten turns, each with something to read
	{ from: 29.84, to: 32, seconds: 11 }, // the end
	{ from: 32, to: 32.32, seconds: 5.5 }, // the camera lets go of the laptop
	{ from: 32.32, to: 32.92, seconds: 11 }, // one last lap, with the whole world in view
	{ from: 32.92, to: 33, seconds: 1 }
];
