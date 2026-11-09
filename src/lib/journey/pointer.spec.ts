import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plan, SPOT_AGAIN, SPOT_GAP } from './cues';
import { Pointer, SPOTS } from './pointer.svelte';

const words = JSON.parse(readFileSync(new URL('../../../narration/spots.json', import.meta.url), 'utf8')) as Record<string, string[] | string>;
const keys = Object.keys(words).filter((k) => !k.startsWith('//'));
const dir = new URL('../../../static/narration/', import.meta.url);

describe('the conversation spotlight', () => {
	it('knows what in the scene every named thing lights, and lights nothing it has no words for', () => {
		for (const key of keys) expect(SPOTS[key], key).toBeDefined();
		for (const key of Object.keys(SPOTS)) expect(keys, key).toContain(key);
	});

	it('has each conversation’s spots in order, all of them known', () => {
		const talks = readdirSync(dir).filter((f) => f.endsWith('.json'));
		expect(talks.length).toBeGreaterThan(50);
		let total = 0;
		for (const f of talks) {
			const { spots = [], seconds } = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { spots?: [number, string][]; seconds: number };
			total += spots.length;
			spots.forEach(([at, key], i) => {
				expect(SPOTS[key], `${f}: ${key}`).toBeDefined();
				expect(at, `${f}: ${key}`).toBeGreaterThanOrEqual(0);
				expect(at, `${f}: ${key}`).toBeLessThanOrEqual(seconds);
				if (i) expect(at, `${f}: ${key}`).toBeGreaterThanOrEqual(spots[i - 1][0]);
			});
		}
		expect(total).toBeGreaterThan(300);
	});

	it('spaces what lights: never two close together, and not the same thing again too soon', () => {
		const spots: [number, string][] = [
			[2, 'laptop'],
			[4, 'harness'],
			[12, 'harness'],
			[21, 'laptop'],
			[30, 'harness'],
			[60, 'harness']
		];
		const kept = plan(spots);
		// The laptop again at 21 is too soon after 2; the harness at 30 too soon after 12.
		expect(kept.map(([at]) => at)).toEqual([2, 12, 60]);
		kept.forEach(([at], i) => i && expect(at - kept[i - 1][0]).toBeGreaterThanOrEqual(SPOT_GAP));
		expect(kept.filter(([, k]) => k === 'harness').map(([at]) => at)).toEqual([12, 60]);
		expect(60 - 12).toBeGreaterThanOrEqual(SPOT_AGAIN);
	});

	it('shows each planned thing as it is said: the camera goes to it, stays, and comes back', () => {
		const leans: number[] = [];
		const lit: string[] = [];
		const inView = true;
		let hidden = false;
		const world = {
			whereIs: () => (inView ? { x: 100, y: 100, w: 200, h: 150, mid: [0, 1, 0] as [number, number, number] } : null),
			show: (_: unknown, k: number) => void leans.push(k)
		};
		const p = new Pointer(world, (key) => lit.push(key), () => hidden);
		const talk = { playing: true, id: 'a', time: 0, spots: { a: [[5, 'harness'], [20, 'laptop'], [40, 'mcp']] as [number, string][] } };
		// Heard frame by frame at 1x: wall clock and conversation move together.
		const run = (from: number, to: number) => {
			for (let t = from; t <= to + 1e-9; t += 0.05) {
				talk.time = t;
				p.update(t, talk, true);
			}
		};
		run(0, 4.8);
		expect(p.lit).toBeNull();
		run(4.85, 7);
		expect(lit).toEqual(['harness']);
		expect(p.lit?.k).toBe(1);
		expect(Math.max(...leans)).toBe(1);
		run(7.05, 12);
		expect(p.lit).toBeNull();
		expect(leans.at(-1)).toBe(0);
		// Hidden by words when it comes: it doesn't light, and the next one still does.
		hidden = true;
		run(12.05, 25);
		expect(lit).toEqual(['harness']);
		hidden = false;
		// Paused partway: what's lit fades now.
		run(25.05, 40.5);
		expect(lit).toEqual(['harness', 'mcp']);
		talk.playing = false;
		const before = p.lit?.k ?? 0;
		p.update(40.55, talk, true);
		// The quick fall starts where it was, without a jump.
		expect(Math.abs((p.lit?.k ?? 0) - before)).toBeLessThan(0.08);
		for (let t = 40.6; t < 41.5; t += 0.05) p.update(t, talk, true);
		expect(p.lit).toBeNull();
	});

	it('skips what was said too long ago, after a jump or a stalled page, and lights nothing out of view', () => {
		const lit: string[] = [];
		let inView = true;
		const world = { whereIs: () => (inView ? { x: 0, y: 0, w: 100, h: 100, mid: [0, 0, 0] as [number, number, number] } : null), show: () => {} };
		const p = new Pointer(world, (key) => lit.push(key), () => false);
		const talk = { playing: true, id: 'b', time: 0, spots: { b: [[3, 'harness'], [30, 'laptop']] as [number, string][] } };
		p.update(0, talk, true);
		// A page that drew nothing for five seconds: the harness is long gone by the next frame.
		talk.time = 8;
		p.update(8, talk, true);
		expect(lit).toEqual([]);
		// Out of view when it comes.
		inView = false;
		for (let t = 29; t < 32; t += 0.05) {
			talk.time = t;
			p.update(t, talk, true);
		}
		expect(lit).toEqual([]);
		expect(p.lit).toBeNull();
	});
});
