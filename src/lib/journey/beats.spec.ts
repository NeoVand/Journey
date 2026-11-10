import { describe, expect, it } from 'vitest';
import { DESK, Director } from './beats';
import { Pace, Playhead, type Span } from './playhead';

// Four beats: two short, one long, one short. A second of story time takes 2, 2, 10 and 2 seconds.
const SPANS: Span[] = [
	{ from: 0, to: 1, seconds: 2 },
	{ from: 1, to: 2, seconds: 2 },
	{ from: 2, to: 3, seconds: 10 },
	{ from: 3, to: 4, seconds: 2 }
];
const STOPS = [0, 1, 2, 3, 4];
const make = () => new Director(STOPS, new Pace(SPANS), DESK);

/** Plays the director's wishes through a playhead, cuts included, and returns the seconds it took and every speed used. */
const play = (d: Director, p: Playhead, max = 60) => {
	let t = 0;
	const speeds: number[] = [];
	const cuts: number[] = [];
	while (p.T !== d.target && t < max) {
		const m = d.move(p.T);
		if (m.cut !== undefined) {
			cuts.push(m.cut);
			p.jump(m.cut);
			continue;
		}
		speeds.push(m.speed);
		p.step(d.target, 1 / 60, m.speed);
		t += 1 / 60;
	}
	return { t, speeds, cuts };
};

describe('Director', () => {
	it('plays the next beat whole, at its authored pace', () => {
		const d = make();
		const p = new Playhead(d.pace, 0);
		expect(d.next(p.T)).toBe(true);
		expect(d.target).toBe(1);
		const { t, speeds, cuts } = play(d, p);
		expect(t).toBeGreaterThan(1.9);
		expect(t).toBeLessThan(2.6);
		expect(new Set(speeds)).toEqual(new Set([1]));
		expect(cuts).toEqual([]);
	});

	it('asked again while a beat plays, lines up one more and hurries the one under way', () => {
		const d = make();
		const p = new Playhead(d.pace, 0);
		d.next(p.T);
		for (let i = 0; i < 30; i++) p.step(d.target, 1 / 60, d.move(p.T).speed);
		d.next(p.T);
		d.next(p.T);
		d.next(p.T);
		// However often it's asked, one more and no further.
		expect(d.target).toBe(2);
		expect(d.move(p.T).speed).toBe(DESK.hurry);
		const { t } = play(d, p);
		expect(p.T).toBe(2);
		// The rest of the first beat at four times, then the whole second one as made.
		expect(t).toBeLessThan(2.9);
	});

	it('finishes a long beat under way faster rather than cutting it, within a couple of seconds', () => {
		const d = make();
		const p = new Playhead(d.pace, 2);
		d.go(2);
		d.next(p.T);
		for (let i = 0; i < 10; i++) p.step(d.target, 1 / 60, d.move(p.T).speed);
		d.next(p.T);
		expect(d.target).toBe(4);
		// Ten seconds left of the long beat: played through quickly, never cut, then the last beat as made.
		const { t, cuts, speeds } = play(d, p);
		expect(cuts).toEqual([]);
		expect(p.T).toBe(4);
		expect(Math.max(...speeds)).toBeGreaterThan(DESK.hurry);
		expect(t).toBeLessThan(DESK.most + 2.6);
	});

	it('steps back by playing backwards, however long the beat, and never cuts', () => {
		const d = make();
		const p = new Playhead(d.pace, 3);
		d.go(3);
		d.back(p.T);
		expect(d.target).toBe(2);
		// Ten seconds of beat: backwards, faster than the least rewind, in no more than `most` and the easing.
		const m = d.move(p.T);
		expect(m.cut).toBeUndefined();
		expect(m.speed).toBeGreaterThan(DESK.rewind);
		const { t, cuts } = play(d, p);
		expect(cuts).toEqual([]);
		expect(p.T).toBe(2);
		expect(t).toBeLessThan(DESK.most + 0.6);
		// Two seconds at three times is short enough to play at the least rewind.
		const r = make();
		r.go(2);
		r.back(2);
		expect(r.move(2)).toEqual({ speed: DESK.rewind });
		// Just started on a beat and stepped back: a short rewind.
		const q = new Playhead(d.pace, 1.05);
		const e = make();
		e.go(2);
		e.back(q.T);
		expect(e.target).toBe(1);
		expect(e.move(q.T)).toEqual({ speed: DESK.rewind });
	});

	it('keeps one speed for a whole pass, so it neither lurches nor crawls at the end', () => {
		const d = make();
		d.go(3);
		d.back(3);
		const first = d.move(3).speed;
		expect(d.move(2.2).speed).toBe(first);
	});

	it('leaps only further than a beat or two: those are cuts, which the page dresses as a flight', () => {
		const d = make();
		d.go(4);
		expect(d.move(0.5).cut).toBe(3);
		d.go(0);
		expect(d.move(3.5).cut).toBe(0);
		// One beat to finish and the next to play is not a leap.
		d.go(3);
		expect(d.move(1.5).cut).toBeUndefined();
	});

	it('rests anywhere the reader lets go, and a step on finishes that beat', () => {
		const d = make();
		d.rest(2.4);
		expect(d.target).toBe(2.4);
		expect(d.move(2.4)).toEqual({ speed: 1 });
		d.next(2.4);
		expect(d.target).toBe(3);
		expect(d.move(2.4)).toEqual({ speed: 1 });
		d.rest(2.4);
		d.back(2.4);
		expect(d.target).toBe(2);
		// Letting go right on a stop is resting at it.
		d.rest(3);
		expect(d.hold).toBe(null);
		expect(d.goal).toBe(3);
	});

	it('turns round mid-beat to the nearest stop, not one further', () => {
		const d = make();
		d.go(3);
		// Playing forward into the third beat, the reader steps back: to the stop just behind.
		d.back(2.4);
		expect(d.target).toBe(2);
		// Going back from the middle of a beat, they change their mind: to the stop just ahead.
		d.go(1);
		d.next(1.5);
		expect(d.target).toBe(2);
	});

	it('goes no further than the ends', () => {
		const d = make();
		expect(d.back(0)).toBe(false);
		d.go(4);
		expect(d.next(4)).toBe(false);
		expect(d.target).toBe(4);
	});

	it('rests at a moment the reader picked inside a beat, and carries on from there', () => {
		const d = make();
		const p = new Playhead(d.pace, 2.1);
		d.go(3);
		d.reach(p.T, 2.6);
		expect(d.target).toBe(2.6);
		play(d, p);
		expect(p.T).toBe(2.6);
		expect(d.gauge(p.T)).toEqual({ dir: 0, done: 1 });
		d.next(p.T);
		expect(d.target).toBe(3);
	});

	it('shows how much of the beat under way has played, by the clock', () => {
		const d = make();
		d.go(3);
		expect(d.gauge(2.5).dir).toBe(1);
		expect(d.gauge(2.5).done).toBeCloseTo(0.5, 6);
		expect(d.gauge(3)).toEqual({ dir: 0, done: 1 });
		d.back(3);
		expect(d.gauge(3).dir).toBe(-1);
		expect(d.gauge(3).done).toBeCloseTo(0, 6);
		expect(d.gauge(2.5).done).toBeCloseTo(0.5, 6);
	});
});
