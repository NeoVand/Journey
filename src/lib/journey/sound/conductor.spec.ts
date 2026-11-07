import { describe, expect, it } from 'vitest';
import { Conductor, type Cue } from './conductor';
import type { Sound } from './engine';

/** A stand-in for the engine that only counts what it was asked to play. */
const counting = () => {
	const played: string[] = [];
	const sound = { on: true, play: (name: string) => played.push(name), voice: () => played.push('voice'), dip: () => {} } as unknown as Sound;
	return { sound, played };
};
const cues: Cue[] = [
	{ T: 1.01, sound: 'a' },
	{ T: 1.02, sound: 'b', minor: true },
	{ T: 1.03, sound: 'c', minor: true },
	{ T: 1.04, sound: 'd' }
];

describe('Conductor', () => {
	it('plays every moment passed at reading pace', () => {
		const { sound, played } = counting();
		const c = new Conductor(sound, cues, [], () => ({ pan: 0, gain: 1 }));
		for (let T = 1; T <= 1.05; T += 0.002) c.frame(T, 1 / 60);
		expect(played).toEqual(['a', 'b', 'c', 'd']);
	});

	it('keeps only the moments that matter while the story is hurried past', () => {
		const { sound, played } = counting();
		const c = new Conductor(sound, cues, [], () => ({ pan: 0, gain: 1 }));
		for (let T = 1; T <= 1.05; T += 0.002) c.frame(T, 1 / 60, true);
		expect(played).toEqual(['a', 'd']);
	});

	it('plays nothing a cut skipped, however short the cut', () => {
		const { sound, played } = counting();
		const c = new Conductor(sound, cues, [], () => ({ pan: 0, gain: 1 }));
		c.frame(1, 1 / 60);
		c.cut(1.035);
		c.frame(1.036, 1 / 60);
		c.frame(1.05, 1 / 60);
		expect(played).toEqual(['d']);
	});
});
