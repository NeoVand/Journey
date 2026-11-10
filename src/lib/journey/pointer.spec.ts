import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from './narration.json';
import { Pointer, type Moment } from './pointer.svelte';

const sheets = new URL('../../../narration/direction/', import.meta.url);
const talks = new URL('../../../static/narration/', import.meta.url);
const ACTS = ['pull', 'flip', 'excite', 'spin'];
/** What a beat can do on the card, with nothing for the camera to show. */
const BEATS = ['turn', 'cache'];
const titles = new Set(Object.values(manifest as Record<string, { title: string }>).map((t) => t.title));

describe('the conversations’ direction', () => {
	const files = existsSync(sheets) ? readdirSync(sheets).filter((f) => f.endsWith('.json')) : [];

	it('asks only for what the scene can do, and peeks only into cards that exist', () => {
		expect(files.length).toBeGreaterThan(0);
		for (const f of files) {
			const { cues } = JSON.parse(readFileSync(new URL(f, sheets), 'utf8')) as { cues: (Omit<Moment, 't'> & { at: string })[] };
			for (const c of cues) {
				expect(c.at, f).toBeTruthy();
				if (!c.show.length) {
					expect(BEATS, `${f}: ${c.at}: a beat shows nothing, so it must do something on the card`).toContain(c.do);
					expect(c.in, `${f}: ${c.at}`).toBeUndefined();
					continue;
				}
				if (c.do) expect(ACTS, `${f}: ${c.at}`).toContain(c.do);
				if (c.in) expect(titles.has(c.in), `${f}: no card called "${c.in}"`).toBe(true);
			}
		}
	});

	it('finds every phrase in its recording, in order, inside the conversation', () => {
		for (const f of files) {
			const { cues } = JSON.parse(readFileSync(new URL(f, sheets), 'utf8')) as { cues: unknown[] };
			const { direction = [], seconds } = JSON.parse(readFileSync(new URL(f, talks), 'utf8')) as { direction?: Moment[]; seconds: number };
			expect(direction.length, `${f}: a phrase wasn’t found; run scripts/narration/direct.mjs`).toBe(cues.length);
			direction.forEach((m, i) => {
				expect(m.t).toBeGreaterThanOrEqual(0);
				expect(m.t).toBeLessThanOrEqual(seconds);
				if (i) expect(m.t, f).toBeGreaterThan(direction[i - 1].t);
			});
		}
	});
});

/** A world that remembers what it was asked, with things in it by name. */
function fakeWorld(here: string[]) {
	const asked: { names: string[]; cutBack?: boolean; still?: boolean }[] = [];
	const world = {
		busy: false,
		done: false,
		left: 0,
		ended: 0,
		visit(cue: { names: string[]; cutBack?: boolean; still?: boolean }) {
			asked.push(cue);
			world.busy = true;
			return true;
		},
		hasThing: (names: string[]) => names.some((n) => here.includes(n)),
		leaveVisit: () => void world.left++,
		endVisit: () => {
			world.ended++;
			world.busy = false;
		},
		get visiting() {
			return world.busy;
		},
		get visitDone() {
			return world.done;
		}
	};
	return { world, asked };
}

describe('the pointer', () => {
	it('shows what a slow frame passed over, if it is still fresh, but reads on from where a jump lands', () => {
		const { world, asked } = fakeWorld(['Harness', 'MCP', 'Skills']);
		const p = new Pointer(world, { whenIs: () => null, peek: () => {}, note: () => {} });
		const n = { playing: true, id: 'a', time: 0, seeks: 0, direction: { a: [{ t: 4, show: ['Harness'] }, { t: 20, show: ['MCP'] }, { t: 40, show: ['Skills'] }] } as Record<string, Moment[]> };
		p.update(0, { ...n, time: 3 }, true);
		// Two seconds went by in one frame: the harness, said a moment ago, is still shown.
		p.update(2, { ...n, time: 5 }, true);
		expect(asked.map((a) => a.names[0])).toEqual(['Harness']);
		world.busy = false;
		// The reader jumped past the MCP box: it isn't shown late, and the next thing comes in its time.
		p.update(3, { ...n, time: 24, seeks: 1 }, true);
		p.update(4, { ...n, time: 25, seeks: 1 }, true);
		expect(asked.map((a) => a.names[0])).toEqual(['Harness']);
		p.update(5, { ...n, time: 39.8, seeks: 1 }, true);
		expect(asked.map((a) => a.names[0])).toEqual(['Harness', 'Skills']);
	});

	const talk = (direction: Moment[]) => ({ playing: true, id: 'a', time: 0, seeks: 0, direction: { a: direction } as Record<string, Moment[]> });

	it('plays a beat on the card without moving the camera, and catches the card up after a jump', () => {
		const { world, asked } = fakeWorld(['Harness']);
		const acts: string[] = [];
		const p = new Pointer(world, { whenIs: () => null, peek: () => {}, note: () => {}, act: (what, i) => void acts.push(`${what} ${i}`) });
		const n = talk([
			{ t: 2, show: [], do: 'turn', index: 0 },
			{ t: 4, show: [], do: 'turn', index: 1 },
			{ t: 6, show: ['Harness'] },
			{ t: 8, show: [], do: 'cache', index: 0 },
			{ t: 10, show: [], do: 'turn', index: 2 }
		]);
		for (let t = 0; t < 5; t += 0.05) p.update(t, { ...n, time: t }, true);
		expect(acts).toEqual(['turn 0', 'turn 1']);
		expect(asked).toEqual([]);
		// A jump past both kinds: the card lands where the words have got to, each kind at its latest.
		p.update(6, { ...n, time: 11, seeks: 1 }, true);
		expect(acts.slice(2)).toEqual(['turn 2', 'cache 0']);
		expect(asked).toEqual([]);
	});

	it('shows a thing here as its words come, and is free again once the visit comes back', () => {
		const { world, asked } = fakeWorld(['Harness']);
		let notes = 0;
		const p = new Pointer(world, { whenIs: () => null, peek: () => {}, note: () => void notes++ });
		const n = talk([{ t: 5, show: ['Harness'] }]);
		for (let t = 0; t < 4.6; t += 0.05) p.update(t, { ...n, time: t }, true);
		expect(asked).toEqual([]);
		p.update(4.75, { ...n, time: 4.75 }, true);
		expect(asked.map((a) => a.names)).toEqual([['Harness']]);
		expect(notes).toBe(1);
		expect(p.lit?.show).toEqual(['Harness']);
		world.busy = false;
		p.update(10, { ...n, time: 10 }, true);
		expect(p.lit).toBeNull();
	});

	it('peeks at a thing that lives elsewhere: cuts there, looks, and cuts home once it has stayed', () => {
		const { world, asked } = fakeWorld([]);
		const cuts: (number | null)[] = [];
		const p = new Pointer(world, { whenIs: (title) => (title === 'One model, many chips' ? 8.35 : null), peek: (T) => void cuts.push(T), note: () => {} });
		const n = talk([{ t: 3, show: ['label:Accelerator'], together: true, in: 'One model, many chips' }]);
		p.update(2.8, { ...n, time: 2.8 }, true);
		expect(cuts).toEqual([8.35]);
		expect(asked).toEqual([]);
		// Once the cut has covered the change, the camera goes looking there.
		p.update(3.2, { ...n, time: 3.2 }, true);
		expect(asked[0]).toMatchObject({ names: ['label:Accelerator'], cutBack: true });
		world.done = true;
		p.update(8, { ...n, time: 8 }, true);
		expect(cuts).toEqual([8.35, null]);
		expect(p.lit).toBeNull();
	});

	it('lets go at once when the talk stops, skips what was said too long ago, and never peeks without motion', () => {
		const { world, asked } = fakeWorld(['Harness']);
		const cuts: (number | null)[] = [];
		const p = new Pointer(world, { whenIs: () => 8.35, peek: (T) => void cuts.push(T), note: () => {} });
		const n = talk([
			{ t: 2, show: ['Harness'] },
			{ t: 20, show: ['label:Accelerator'], in: 'One model, many chips' }
		]);
		p.update(0, { ...n, time: 0 }, true);
		// A page that drew nothing for six seconds: the harness was said long ago.
		p.update(8, { ...n, time: 8 }, true);
		expect(asked).toEqual([]);
		// Reduced motion: no peek at all.
		p.update(19.8, { ...n, time: 19.8 }, false);
		expect(cuts).toEqual([]);
		// The reader jumps on, to a thing here: it glows without the camera moving.
		const m = { ...talk([{ t: 30, show: ['Harness'] }]), seeks: 1 };
		p.update(29.8, { ...m, time: 29.8 }, false);
		expect(asked.at(-1)).toMatchObject({ names: ['Harness'], still: true });
		p.update(30.5, { ...m, time: 30.5, playing: false }, false);
		expect(world.left).toBe(1);
		expect(p.lit).toBeNull();
	});
});
