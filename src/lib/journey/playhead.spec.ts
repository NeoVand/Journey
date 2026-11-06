import { describe, expect, it } from 'vitest';
import { Pace, PACE, Playhead } from './playhead';

const run = (p: Playhead, target: number, speed = 1, maxSeconds = 120) => {
	let t = 0;
	while (p.T !== target && t < maxSeconds) {
		p.step(target, 1 / 60, speed);
		t += 1 / 60;
	}
	return t;
};

describe('Pace', () => {
	const pace = new Pace(PACE);

	it('has a contiguous table that covers the whole story', () => {
		expect(PACE[0].from).toBe(0);
		for (let i = 1; i < PACE.length; i++) expect(PACE[i].from).toBe(PACE[i - 1].to);
		expect(PACE[PACE.length - 1].to).toBe(33);
	});

	it('adds up the seconds of every stretch between two moments', () => {
		expect(pace.seconds(6.16, 6.56)).toBeCloseTo(5.5, 6);
		expect(pace.seconds(6.16, 6.86)).toBeCloseTo(7.5, 6);
		expect(pace.seconds(6.86, 6.16)).toBeCloseTo(7.5, 6);
		expect(pace.seconds(0, 33)).toBeCloseTo(
			PACE.reduce((s, x) => s + x.seconds, 0),
			6
		);
	});

	it('lets a stretch go quicker when what it shows has already happened', () => {
		const typed = new Pace(PACE);
		typed.quicker = (s) => (s.key === 'typing' ? 5 : 1);
		expect(typed.seconds(1.02, 1.56)).toBeCloseTo(3.4 / 5, 6);
		expect(typed.seconds(1.56, 2.04)).toBeCloseTo(2.4, 6);
	});
});

describe('Playhead', () => {
	it('plays the eleven token cuts at their authored pace, easing in and out', () => {
		const p = new Playhead(new Pace(PACE), 6.16);
		const took = run(p, 6.56);
		expect(took).toBeGreaterThan(5.5);
		expect(took).toBeLessThan(6.6);
	});

	it('plays faster when asked to', () => {
		const slow = run(new Playhead(new Pace(PACE), 6.16), 6.56);
		const quick = run(new Playhead(new Pace(PACE), 6.16), 6.56, 4);
		expect(quick).toBeLessThan(slow / 3);
	});

	it('settles exactly on target and never overshoots', () => {
		const p = new Playhead(new Pace(PACE), 5);
		let peak = 0;
		for (let i = 0; i < 600; i++) peak = Math.max(peak, p.step(5.1, 1 / 60));
		expect(p.T).toBe(5.1);
		expect(peak).toBeLessThanOrEqual(5.1);
	});

	it('does not hold back readers who asked for reduced motion', () => {
		const p = new Playhead(new Pace(PACE), 0, true);
		expect(run(p, 33)).toBeLessThan(1.5);
	});
});
