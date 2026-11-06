import { describe, expect, it } from 'vitest';
import { PACE, Playhead } from './playhead';

const run = (p: Playhead, target: number, maxSeconds = 60) => {
	let t = 0;
	while (p.T !== target && t < maxSeconds) {
		p.step(target, 1 / 60);
		t += 1 / 60;
	}
	return t;
};

describe('Playhead', () => {
	it('plays a flick across all eleven token cuts at close to its authored pace', () => {
		const p = new Playhead(PACE, 6.16);
		expect(run(p, 6.56)).toBeGreaterThan(3.5);
	});

	it('still reaches the end of a very long jump within a few seconds', () => {
		const p = new Playhead(PACE, 0);
		expect(run(p, 33.9)).toBeLessThan(14);
	});

	it('follows slow scrolling closely', () => {
		const p = new Playhead(PACE, 2);
		for (let i = 0; i < 240; i++) p.step(2 + (0.05 * i) / 60, 1 / 60);
		expect(Math.abs(p.T - 2.2)).toBeLessThan(0.02);
	});

	it('settles exactly on target and never overshoots', () => {
		const p = new Playhead(PACE, 5);
		let peak = 0;
		for (let i = 0; i < 600; i++) peak = Math.max(peak, p.step(5.1, 1 / 60));
		expect(p.T).toBe(5.1);
		expect(peak).toBeLessThanOrEqual(5.1);
	});

	it('on a phone, catches up after a fling more gently, and still gets there', () => {
		const brisk = run(new Playhead(PACE, 20), 23);
		const calm = new Playhead(PACE, 20);
		calm.calm = true;
		const gentle = run(calm, 23);
		expect(gentle).toBeGreaterThan(brisk * 1.5);
		expect(gentle).toBeLessThan(8);
	});

	it('does not limit readers who asked for reduced motion', () => {
		const p = new Playhead(PACE, 0, true);
		expect(run(p, 33.9)).toBeLessThan(1.5);
	});

	it('has a contiguous pace table', () => {
		for (let i = 1; i < PACE.length; i++) expect(PACE[i].from).toBe(PACE[i - 1].to);
	});
});
