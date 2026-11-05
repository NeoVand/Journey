import { describe, expect, it } from 'vitest';
import { Sharpness } from './sharpness';

/** Plays frames against a model of the machine: how long a frame takes at given settings, and on which frame. */
const play = (s: Sharpness, cost: (dpr: number, occlusion: boolean, i: number) => number, frames = 3000) => {
	let changes = 0;
	for (let i = 0; i < frames; i++) if (s.frame(cost(s.dpr, s.occlusion, i))) changes++;
	return changes;
};

describe('Sharpness', () => {
	it('leaves a fast machine alone', () => {
		const s = new Sharpness(2);
		expect(play(s, () => 1 / 60)).toBe(0);
		expect(s.dpr).toBe(2);
	});

	it('is not fooled by the odd long frame', () => {
		const s = new Sharpness(2);
		// Every fourth frame stalls: the average says 24 ms, but the machine is keeping up.
		expect(play(s, (_d, _o, i) => (i % 4 === 0 ? 1 / 20 : 1 / 60))).toBe(0);
		expect(s.dpr).toBe(2);
		expect(s.occlusion).toBe(true);
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

	it('gives up occlusion before resolution', () => {
		const s = new Sharpness(2);
		play(s, (_dpr, ao) => (ao ? 1 / 30 : 1 / 60));
		expect(s.occlusion).toBe(false);
		expect(s.dpr).toBe(2);
	});

	it('gives up both on a machine that needs it', () => {
		const s = new Sharpness(1.25);
		play(s, (dpr, ao) => (ao ? 1 / 20 : 1 / 50) * dpr);
		expect(s.dpr).toBe(1);
		expect(s.occlusion).toBe(false);
	});

	/** A GPU that only keeps up at 1.5 without occlusion: cost goes with the pixels, and occlusion adds 30%. */
	const heavy = (dpr: number, ao: boolean) => Math.max(1 / 60, 0.0079 * dpr * dpr * (ao ? 1.3 : 1));

	it('gets its sharpness back once a busy spell is over', () => {
		const s = new Sharpness(2);
		// Busy for the first 40 seconds, which outlasts the first try back up.
		play(s, (dpr, ao, i) => (i < 2400 ? heavy(dpr, ao) : 1 / 60), 15000);
		expect(s.dpr).toBe(2);
		expect(s.occlusion).toBe(true);
	});

	it('steps back up even after it stopped stepping down', () => {
		const s = new Sharpness(2);
		// While busy, dropping occlusion helps and dropping resolution does not, so it stops there. Then the machine goes quiet.
		play(s, (dpr, ao, i) => (i < 1500 ? (ao ? 1 / 30 : 1 / 40) : 1 / 60), 6000);
		expect(s.dpr).toBe(2);
		expect(s.occlusion).toBe(true);
	});

	it('goes back down and stays there when the machine really is too slow', () => {
		const s = new Sharpness(2);
		const changes = play(s, heavy, 40000);
		expect(s.dpr).toBe(1.5);
		expect(s.occlusion).toBe(false);
		// Three steps down, then three tries back up, each further apart and each undone.
		expect(changes).toBe(3 + 3 * 2);
	});
});
