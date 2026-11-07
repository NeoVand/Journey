/**
 * Turns the story's time into sound. Moments play as the reader passes them going forward at reading pace; a cut or
 * a jump plays nothing in between, scrolling back is quiet, and a fast scroll keeps only the moments that matter.
 * Ambiences rise and fall with the stretch of the story they belong to.
 */
import type { Sound, Voice } from './engine';

export type Where = readonly [number, number, number];

export interface Cue {
	T: number;
	/** A recorded sound by name, or a synthesized one. */
	sound: string | Voice;
	gain?: number;
	rate?: number;
	wet?: number;
	/** Where in the world it happens, for left and right and distance. Fixed, or asked for when it plays. */
	at?: Where | (() => Where);
	/** Dropped when the reader is scrolling fast: per-item detail, not the story's beats. */
	minor?: boolean;
	/** Lets the ambiences make room. */
	dip?: number;
	/** Seconds after its moment; and which slice of a recording to play, in seconds. */
	delay?: number;
	offset?: number;
	length?: number;
}

export interface Bed {
	sound: string;
	from: number;
	to: number;
	level: number;
	/** How long it takes to come in and go out, in story time. */
	fade?: number;
}

const ramp = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

export type Hear = (x: number, y: number, z: number) => { pan: number; gain: number };

export class Conductor {
	private last: number | null = null;
	private cues: Cue[];

	constructor(
		private sound: Sound,
		cues: Cue[],
		private beds: Bed[],
		private hear: Hear
	) {
		this.cues = [...cues].sort((a, b) => a.T - b.T);
	}

	/** Every sound this part of the story uses, to load ahead. */
	get names() {
		// Pads are made on the spot, so they have no file to fetch.
		return [...new Set([...this.cues.map((c) => c.sound).filter((s): s is string => typeof s === 'string'), ...this.beds.map((b) => b.sound)])].filter((n) => !n.startsWith('pad-'));
	}

	/** What each ambience should be at time T, 0 to 1. */
	levels(T: number, scale = 1) {
		const out: Record<string, number> = {};
		for (const b of this.beds) {
			const f = b.fade ?? 0.08;
			const k = Math.min(ramp(T, b.from - f, b.from), 1 - ramp(T, b.to, b.to + f));
			if (k > 0) out[b.sound] = Math.max(out[b.sound] ?? 0, k * b.level * scale);
		}
		return out;
	}

	/** Forget where the reader was, so the next frame plays nothing that came before it. */
	reset() {
		this.last = null;
	}

	/** The story was cut to T: whatever it skipped wasn't seen, so it isn't heard either, however short the skip. */
	cut(T: number) {
		this.last = T;
	}

	/**
	 * Plays whatever the reader has just passed. hurried: the story is playing faster than it was made, on its way to the
	 * next card, so the per-item detail drops out and only the moments that matter are heard.
	 */
	frame(T: number, dt: number, hurried = false) {
		const prev = this.last;
		this.last = T;
		if (prev === null || T <= prev || !this.sound.on) return;
		const moved = T - prev;
		// A cut lands somewhere new: nothing in between was seen, so nothing is heard.
		if (moved > 0.3) return;
		const fast = hurried || (dt > 0 && moved / dt > 0.8);
		let played = 0;
		for (const c of this.cues) {
			if (c.T <= prev) continue;
			if (c.T > T) break;
			if (fast && c.minor) continue;
			if (played++ >= 6) break;
			this.fire(c, fast ? 0.7 : 1);
		}
	}

	fire(c: Cue, scale = 1) {
		const where = typeof c.at === 'function' ? c.at() : c.at;
		const heard = where ? this.hear(where[0], where[1], where[2]) : { pan: 0, gain: 1 };
		const gain = (c.gain ?? 1) * heard.gain * scale;
		if (gain < 0.02) return;
		if (c.dip) this.sound.dip(c.dip);
		if (typeof c.sound === 'string') this.sound.play(c.sound, { gain, pan: heard.pan, rate: c.rate, wet: c.wet, delay: c.delay, offset: c.offset, length: c.length });
		else this.sound.voice(c.sound, { gain, pan: heard.pan, wet: c.wet, delay: c.delay });
	}
}
