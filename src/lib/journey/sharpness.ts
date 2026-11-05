/**
 * Trades quality for frame rate, but only when that trade actually works. Browsers on battery often
 * cap frames at 30 per second whatever the page does, and lowering quality there buys nothing. So each
 * drop is an experiment: if frames do not get faster, it is undone, and if nothing helps, adapting stops.
 *
 * It judges by the typical frame of each window, not the average, so the odd long frame (a garbage
 * collection, a texture going up, another app waking) is never mistaken for a slow machine. Occlusion goes
 * before resolution, since a softer picture is the bigger loss on a sharp screen. And a drop is not for
 * life: a machine that was only busy for a while gets its sharpness back once it has been fast again for
 * a good stretch, and if that proves too much it goes back down and stays there.
 */
const WINDOW = 60;
const SLOW = 1 / 42;
const IMPROVED = 0.9;
/** Comfortably fast: what a lower setting must hold for a while before the higher one is tried again. */
const EASY = 1 / 56;
/** Seconds of easy frames before trying the higher setting again; doubled each time that proves too much. */
const RETRY_AFTER = 20;
const RETRIES = 3;

export type Action = { dpr: number; occlusion: boolean };

const typical = (frames: number[]) => [...frames].sort((a, b) => a - b)[frames.length >> 1];

export class Sharpness {
	dpr: number;
	occlusion: boolean;
	locked = false;
	private frames: number[] = [];
	/** The first window after loading still meets things for the first time. */
	private settle = WINDOW;
	private trial: { before: number; from: Action } | null = null;
	/** Settings that were stepped down from, most recent last, so they can be tried again. */
	private above: Action[] = [];
	/** Set while a higher setting is being tried again: the setting to go back to if it is too slow. */
	private raised: Action | null = null;
	private easy = 0;
	private retryAfter = RETRY_AFTER;
	/** Higher settings tried again and found too slow. */
	private failures = 0;
	/** Occlusion that made no difference when dropped is not worth dropping again. */
	private occlusionMatters = true;

	constructor(start: number, occlusion = true) {
		this.dpr = start;
		this.occlusion = occlusion;
	}

	private get now(): Action {
		return { dpr: this.dpr, occlusion: this.occlusion };
	}

	private set(to: Action): Action {
		this.dpr = to.dpr;
		this.occlusion = to.occlusion;
		// The frames right after a change are slow for their own reasons: everything is being resized.
		this.settle = 10;
		this.easy = 0;
		return this.now;
	}

	/** One step down, or null when there is nothing left to give. */
	private lower(): Action | null {
		if (this.occlusion && this.occlusionMatters) return { dpr: this.dpr, occlusion: false };
		if (this.dpr > 1) return { dpr: Math.max(1, this.dpr - 0.25), occlusion: this.occlusion };
		return null;
	}

	/** Feed each frame's duration in seconds. Returns the new settings when they change. */
	frame(dt: number): Action | null {
		// Locked means no more stepping down. Stepping back up is still on the table while there is somewhere to go.
		if (this.locked && !this.above.length) return null;
		if (this.settle > 0) {
			this.settle--;
			return null;
		}
		this.frames.push(dt);
		if (this.frames.length < WINDOW) return null;
		const span = this.frames.reduce((a, b) => a + b, 0);
		const t = typical(this.frames);
		this.frames.length = 0;

		if (this.raised) {
			const back = this.raised;
			this.raised = null;
			if (t > SLOW) {
				// It was only fast because it was doing less, or the machine is still busy. Back down, and wait longer next time.
				this.above.push(this.now);
				this.failures++;
				this.retryAfter *= 2;
				return this.set(back);
			}
		}

		if (this.trial) {
			const { before, from } = this.trial;
			this.trial = null;
			if (t > before * IMPROVED) {
				// No faster for it, so undo it. Occlusion may just be cheap here, so resolution still gets its turn;
				// but when resolution does not help either, the limit is somewhere else, perhaps a capped frame rate.
				const wasOcclusion = from.occlusion && !this.occlusion;
				this.set(from);
				this.above.pop();
				if (wasOcclusion) this.occlusionMatters = false;
				else this.locked = true;
				return this.now;
			}
		}

		if (t <= SLOW) {
			if (this.above.length && this.failures < RETRIES && t <= EASY) {
				this.easy += span;
				if (this.easy >= this.retryAfter) {
					this.raised = this.now;
					return this.set(this.above.pop()!);
				}
			} else this.easy = 0;
			return null;
		}

		const next = this.locked ? null : this.lower();
		if (!next) return null;
		this.trial = { before: t, from: this.now };
		this.above.push(this.now);
		return this.set(next);
	}
}
