/**
 * Trades sharpness for frame rate, but only when that trade actually works. Browsers on battery often
 * cap frames at 30 per second whatever the page does, and lowering quality there buys nothing. So each
 * drop is an experiment: if frames do not get faster, it is undone and adapting stops.
 */
const WINDOW = 45;
const SLOW = 1 / 42;
const IMPROVED = 0.9;

export type Action = { dpr: number; occlusion: boolean };

export class Sharpness {
	dpr: number;
	occlusion = true;
	private sum = 0;
	private n = 0;
	private trial: { before: number; dpr: number; occlusion: boolean } | null = null;
	private settle = 0;
	locked = false;

	constructor(start: number) {
		this.dpr = start;
	}

	/** Feed each frame's duration in seconds. Returns the new settings when they change. */
	frame(dt: number): Action | null {
		if (this.locked) return null;
		// Ignore the frames right after a change: the resize itself is slow.
		if (this.settle > 0) {
			this.settle--;
			return null;
		}
		this.sum += dt;
		if (++this.n < WINDOW) return null;
		const avg = this.sum / this.n;
		this.sum = 0;
		this.n = 0;

		if (this.trial) {
			const { before, dpr, occlusion } = this.trial;
			this.trial = null;
			if (avg > before * IMPROVED) {
				this.dpr = dpr;
				this.occlusion = occlusion;
				this.locked = true;
				this.settle = 10;
				return { dpr, occlusion };
			}
		}
		if (avg <= SLOW) return null;
		if (this.dpr <= 1 && !this.occlusion) {
			this.locked = true;
			return null;
		}
		this.trial = { before: avg, dpr: this.dpr, occlusion: this.occlusion };
		if (this.dpr > 1) this.dpr = Math.max(1, this.dpr - 0.25);
		else this.occlusion = false;
		this.settle = 10;
		return { dpr: this.dpr, occlusion: this.occlusion };
	}
}
