import { describe, expect, it } from 'vitest';
import { Sharpness } from './sharpness';

/** Plays frames against a model of the machine: how long a frame takes at given settings. */
const play = (s: Sharpness, cost: (dpr: number, occlusion: boolean) => number, frames = 3000) => {
	let changes = 0;
	for (let i = 0; i < frames; i++) if (s.frame(cost(s.dpr, s.occlusion))) changes++;
	return changes;
};

describe('Sharpness', () => {
	it('leaves a fast machine alone', () => {
		const s = new Sharpness(2);
		expect(play(s, () => 1 / 60)).toBe(0);
		expect(s.dpr).toBe(2);
	});

	it('keeps full quality on a browser capped at 30 frames per second', () => {
		const s = new Sharpness(2);
		play(s, () => 1 / 30);
		expect(s.dpr).toBe(2);
		expect(s.occlusion).toBe(true);
		expect(s.locked).toBe(true);
	});

	it('comes down on a GPU that is really struggling, and stops once it is fast enough', () => {
		const s = new Sharpness(2);
		play(s, (dpr) => Math.max(1 / 60, (dpr * dpr) / 90));
		expect(s.dpr).toBeLessThan(2);
		expect(s.dpr).toBeGreaterThanOrEqual(1);
		expect(s.dpr * s.dpr).toBeLessThanOrEqual(2.2);
	});

	it('gives up occlusion only after resolution is exhausted', () => {
		const s = new Sharpness(1.25);
		play(s, (dpr, ao) => (ao ? 1 / 20 : 1 / 50) * dpr);
		expect(s.dpr).toBe(1);
		expect(s.occlusion).toBe(false);
	});
});
