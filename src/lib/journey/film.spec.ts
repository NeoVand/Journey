import { describe, expect, it } from 'vitest';
import { Reel, readingTime } from './film';
import { Pace, type Span } from './playhead';

// Three cards after the title: scenes of 2, 10 and 2 seconds.
const SPANS: Span[] = [
	{ from: 0, to: 1, seconds: 2 },
	{ from: 1, to: 2, seconds: 10 },
	{ from: 2, to: 3, seconds: 2 }
];
const STOPS = [0, 1, 2, 3];
const make = () =>
	new Reel(STOPS, new Pace(SPANS), [
		{ talk: 'title', hold: 20 },
		{ talk: 'a', hold: 100 },
		{ talk: null, hold: 6 },
		{ talk: 'c', hold: 50 }
	]);

describe('Reel', () => {
	it('runs every scene and every hold, one after another', () => {
		const r = make();
		expect(r.total).toBeCloseTo(20 + 2 + 100 + 10 + 6 + 2 + 50, 6);
		expect(r.holdStart(1)).toBeCloseTo(22, 6);
		expect(r.sceneStart(2)).toBeCloseTo(122, 6);
	});

	it('puts a moment of the film at its moment of the story, and in a hold, of the conversation', () => {
		const r = make();
		expect(r.at(10)).toEqual({ T: 0, k: 0, holding: true, into: 10 });
		const scene = r.at(21);
		expect(scene.holding).toBe(false);
		expect(scene.k).toBe(1);
		expect(scene.T).toBeCloseTo(0.5, 6);
		expect(r.at(60)).toMatchObject({ T: 1, k: 1, holding: true });
		expect(r.at(60).into).toBeCloseTo(38, 6);
		expect(r.at(1e9).T).toBe(3);
	});

	it('finds the film time of any moment of the story, and back again', () => {
		const r = make();
		for (const f of [0, 5, 20.5, 21.9, 30, 122.5, 127, 140, 189.9]) expect(r.when(r.at(f).T, r.at(f).into)).toBeCloseTo(f, 6);
		expect(r.when(1.5)).toBeCloseTo(122 + 5, 6);
		expect(r.when(1, 40)).toBeCloseTo(22 + 40, 6);
	});

	it('gives every card the same share of the rail, its scene first and never squeezed out', () => {
		const r = make();
		expect(r.rail(0)).toBe(0);
		expect(r.rail(r.total)).toBe(1);
		// Card 1: a 2-second scene before a 100-second talk still has a third of its share.
		expect(r.split(1)).toBeCloseTo(0.32, 6);
		expect(r.rail(r.holdStart(1))).toBeCloseTo((1 + 0.32) / 4, 6);
		// Along the rail and back lands on the same film time.
		for (const u of [0, 0.1, 0.26, 0.3, 0.55, 0.7, 0.99]) expect(r.rail(r.fromRail(u))).toBeCloseTo(u, 6);
	});

	it('changes length with its holds', () => {
		const r = make();
		r.cards[1].hold = 10;
		r.measure();
		expect(r.total).toBeCloseTo(20 + 2 + 10 + 10 + 6 + 2 + 50, 6);
	});

	it('reads a short card in a few seconds and a long one in longer, but not forever', () => {
		expect(readingTime(5)).toBe(4.5);
		expect(readingTime(60)).toBeGreaterThan(15);
		expect(readingTime(500)).toBe(18);
	});
});

describe('Pace.after', () => {
	it('is the other way round from seconds', () => {
		const pace = new Pace(SPANS);
		for (const T of [0, 0.3, 1, 1.7, 2.5, 3]) expect(pace.after(0, pace.seconds(0, T))).toBeCloseTo(T, 6);
		expect(pace.after(1, 5)).toBeCloseTo(1.5, 6);
	});
});
