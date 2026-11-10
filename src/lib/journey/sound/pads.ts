/**
 * The music of each place: a small composer for every part of the story, playing for as long as the reader is there.
 *
 * Each one is a slow chord progression on soft pads, with a melody over it: notes picked one at a time, mostly from the
 * chord, close to the last one, so they fall into short phrases rather than scattering; or, where the place is about
 * flow, a steady arpeggio. The notes are the recorded kalimba, marimba and harp, kept in the warm middle, and under them
 * a soft bass: the chord's root, round and low, blooming and fading with each chord. Everything is in D, so every note
 * the story itself plays (its pentatonic: D E F# A B) sits inside whatever is sounding.
 *
 * The feeling of each place comes from its mode, register and pace, the way film music does it, and all of it is a
 * little bittersweet: sweetness with a catch in it. That comes from the minor chords inside the major key (iii and vi),
 * from sevenths and ninths that leave a note leaning against its neighbour, and from the melody: it tends to fall, and
 * now and then it sighs, landing a step above a chord tone and settling onto it, the oldest gesture of longing there is.
 * Nothing is borrowed from outside D major's own notes, where it would clash with the story's sounds.
 * - The open sky, where the story starts and ends: D major, I, iii, vi, IV. Open and unhurried, with an ache in it.
 * - The model: D Lydian, its raised fourth floating the I to II vamp of wonder, with music-box glints.
 * - Inside the data centre: B minor, i, VI, III, VII, and a soft arpeggio running like computation over a pulsing root.
 *   Wistful, never dark: the low notes are plucked and fade, since a held low drone is what turns a place ominous.
 * - The harness room: D Mixolydian's homely flat seventh, I, bVII, IV, vi, on warm wood. A workshop at dusk.
 * - The sandbox: suspended chords that never quite settle. Careful, but fair.
 * - Memory: the wistful vi, IV, I, V, on harp.
 * - Plans: a calm I, vi, IV, V with notes stepping upward, like ticking off a list.
 * - The end of the day: IV, iii, vi, I: home, and a little sorry the journey's over.
 */
import type { Voice } from './engine';
import { harp, porcelain } from './synth';

/** Builds a place's music into `out` and returns a function that lets it fade away. */
export type Pad = (ctx: AudioContext, out: AudioNode) => () => void;

interface Mood {
	/** Chord voicings, as MIDI notes, played in turn. */
	chords: number[][];
	/** Seconds each chord lasts. */
	bar: number;
	/** The scale the melody may use besides the chord, as pitch classes (0 is C). */
	scale: number[];
	pad: { type: OscillatorType; cutoff: number; level: number };
	/**
	 * A soft bass under each chord: the chord's root down low, as a round note that blooms and fades, never a drone. Each
	 * beat is when in the bar (0 to 1) and how far above the root (7, the fifth). By default the root, then its fifth.
	 */
	bass?: { gain: number; beats?: [number, number][] };
	melody: {
		/** The range it moves in, as MIDI notes. */
		lo: number;
		hi: number;
		/** Seconds between notes: a range for a wandering melody, the beat for an arpeggio. */
		every: [number, number];
		/** wander: phrases near the last note. arp: up and down the chord. climb: up the chord, then again. */
		shape: 'wander' | 'arp' | 'climb';
		/** How often a beat of an arpeggio is left out. */
		rest?: number;
		/** How often a wandering note is a sigh: a step above a chord tone, then settling onto it. */
		sigh?: number;
		/** How much more a wandering melody likes to step down than up. */
		fall?: number;
		gain: number;
		voice?: 'harp';
	};
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A little room of its own: two echoes, left and right, darkening as they repeat. */
function space(ctx: AudioContext, out: AudioNode) {
	const input = ctx.createGain();
	input.gain.value = 0.32;
	const left = ctx.createDelay(2);
	left.delayTime.value = 0.43;
	const right = ctx.createDelay(2);
	right.delayTime.value = 0.61;
	const tone = ctx.createBiquadFilter();
	tone.type = 'lowpass';
	tone.frequency.value = 2300;
	const feedback = ctx.createGain();
	feedback.gain.value = 0.36;
	const merge = ctx.createChannelMerger(2);
	input.connect(left);
	left.connect(merge, 0, 0);
	left.connect(right);
	right.connect(merge, 0, 1);
	right.connect(tone).connect(feedback).connect(left);
	merge.connect(out);
	return input;
}

function mood(m: Mood): Pad {
	return (ctx, out) => {
		const start = ctx.currentTime;
		const bus = ctx.createGain();
		bus.gain.setValueAtTime(0, start);
		bus.gain.linearRampToValueAtTime(1, start + 3);
		bus.connect(out);
		const wet = space(ctx, bus);
		const padBus = ctx.createGain();
		padBus.gain.value = m.pad.level;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = m.pad.cutoff;
		filter.Q.value = 0.5;
		filter.connect(padBus).connect(bus);

		/** Which chord sounds from when, so a note can be fitted to the chord under it. */
		const changes: { at: number; chord: number[] }[] = [];
		const chordAt = (t: number) => {
			let c = changes[0]?.chord ?? m.chords[0];
			for (const x of changes) if (x.at <= t) c = x.chord;
			return c;
		};
		let held: { stop: (at: number) => void } | null = null;
		const sound = (chord: number[], at: number) => {
			const voices: { o: OscillatorNode; g: GainNode }[] = [];
			chord.forEach((n, i) => {
				// Two voices a hair apart, for warmth; too far apart and they beat, which is what made the old pads uneasy.
				for (const cents of [-3, 3]) {
					const o = ctx.createOscillator();
					o.type = m.pad.type;
					o.frequency.value = hz(n);
					o.detune.value = cents + (i % 2 ? 1 : -1);
					const g = ctx.createGain();
					g.gain.setValueAtTime(0, at);
					g.gain.setTargetAtTime(0.5 / chord.length, at, 1.1);
					o.connect(g).connect(filter);
					o.start(at);
					voices.push({ o, g });
				}
			});
			return {
				stop: (t: number) => {
					for (const { o, g } of voices) {
						g.gain.cancelScheduledValues(t);
						g.gain.setTargetAtTime(0, t, 1.3);
						o.stop(t + 7);
					}
				}
			};
		};

		let bar = 0;
		let nextChord = start + 0.05;
		let nextNote = start + 1.2 + Math.random();
		let last = Math.round((m.melody.lo + m.melody.hi) / 2);
		let step = 0;
		let up = true;

		/** The notes the melody may take under a chord: its own tones in every octave, and the scale's. */
		const pool = (chord: number[], withScale: boolean) => {
			const out: { n: number; w: number }[] = [];
			const classes = new Set(chord.map((n) => n % 12));
			for (let n = m.melody.lo; n <= m.melody.hi; n++) {
				if (classes.has(n % 12)) out.push({ n, w: 3 });
				else if (withScale && m.scale.includes(n % 12)) out.push({ n, w: 1 });
			}
			return out;
		};

		/** A bass note: sine with a little triangle for body, rounded off, swelling in and dying away over a few seconds. */
		const bassTone = ctx.createBiquadFilter();
		bassTone.type = 'lowpass';
		bassTone.frequency.value = 420;
		bassTone.Q.value = 0.3;
		bassTone.connect(bus);
		const low = (n: number, at: number, gain: number) => {
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, at);
			g.gain.linearRampToValueAtTime(gain, at + 0.09);
			g.gain.setTargetAtTime(0, at + 0.12, 1.1);
			g.connect(bassTone);
			for (const [type, level] of [
				['sine', 1],
				['triangle', 0.22]
			] as const) {
				const o = ctx.createOscillator();
				o.type = type;
				o.frequency.value = hz(n);
				const v = ctx.createGain();
				v.gain.value = level;
				o.connect(v).connect(g);
				o.start(at);
				o.stop(at + 5);
			}
		};
		/** The chord's root, between D2 and C#3. */
		const rootOf = (chord: number[]) => 38 + ((Math.min(...chord) - 38) % 12 + 12) % 12;

		const play = (n: number, at: number, accent = 1) => {
			const g = ctx.createGain();
			g.gain.value = m.melody.gain * accent * (0.75 + Math.random() * 0.25);
			const p = ctx.createStereoPanner();
			p.pan.value = Math.random() * 1.2 - 0.6;
			g.connect(p);
			p.connect(bus);
			p.connect(wet);
			const voice: Voice = m.melody.voice === 'harp' ? harp(hz(n)) : porcelain(hz(n));
			voice(ctx, g, at);
		};

		const nextMelody = (at: number) => {
			const chord = chordAt(at);
			const mel = m.melody;
			if (mel.shape === 'wander') {
				// Close to the last note, mostly on the chord: a phrase, not a scatter. Now and then a breath.
				const near = pool(chord, true).filter((x) => Math.abs(x.n - last) <= 7 && x.n !== last);
				const choices = near.length ? near : pool(chord, false);
				const weight = (x: { n: number; w: number }) => (x.w / (1 + Math.abs(x.n - last) / 3)) * (x.n < last ? (mel.fall ?? 1) : 1);
				const total = choices.reduce((s, x) => s + weight(x), 0);
				let r = Math.random() * total;
				let chosen = choices[0]?.n ?? last;
				for (const x of choices) {
					r -= weight(x);
					if (r <= 0) {
						chosen = x.n;
						break;
					}
				}
				const [a, b] = mel.every;
				const classes = new Set(chord.map((n) => n % 12));
				// A sigh: the scale's note just above a chord tone, leaned on, then let go down onto the chord.
				const above = [1, 2].map((d) => chosen + d).find((n) => n <= mel.hi + 2 && m.scale.includes(n % 12) && !classes.has(n % 12));
				if (above !== undefined && classes.has(chosen % 12) && Math.random() < (mel.sigh ?? 0)) {
					const settle = 0.5 + Math.random() * 0.25;
					play(above, at, 1.05);
					play(chosen, at + settle, 0.78);
					last = chosen;
					return at + settle + a + Math.random() * (b - a);
				}
				last = chosen;
				play(chosen, at);
				return at + a + Math.random() * (b - a) + (Math.random() < 0.15 ? b : 0);
			}
			// An arpeggio: the chord's tones in order, up (and back down, for arp), with a little accent on each turn.
			const tones = pool(chord, false).map((x) => x.n);
			if (!tones.length) return at + mel.every[0];
			if (Math.random() >= (mel.rest ?? 0)) {
				const i = mel.shape === 'climb' ? step % tones.length : Math.min(tones.length - 1, step);
				const n = tones[i];
				const above = [1, 2].map((d) => n + d).find((x) => m.scale.includes(x % 12) && !tones.includes(x));
				// At the top of a run, sometimes the note leans on the one above first.
				if (above !== undefined && !up && Math.random() < (mel.sigh ?? 0)) {
					play(above, at, 1.1);
					play(n, at + mel.every[0] * 0.5, 0.8);
				} else play(n, at, step === 0 ? 1.15 : 1);
			}
			if (mel.shape === 'climb') step = (step + 1) % tones.length;
			else {
				step += up ? 1 : -1;
				if (step >= tones.length - 1) up = false;
				if (step <= 0) up = true;
			}
			return at + mel.every[0];
		};

		const tick = () => {
			const horizon = ctx.currentTime + 0.6;
			while (nextChord < horizon) {
				const chord = m.chords[bar % m.chords.length];
				held?.stop(nextChord);
				held = sound(chord, nextChord);
				const root = rootOf(chord);
				for (const [when, above] of m.bass?.beats ?? [
					[0, 0],
					[0.5, 7]
				])
					low(root + above, nextChord + when * m.bar, (m.bass?.gain ?? 0.075) * (when === 0 ? 1 : 0.7));
				changes.push({ at: nextChord, chord });
				if (changes.length > 4) changes.shift();
				bar++;
				nextChord += m.bar;
			}
			while (nextNote < horizon) nextNote = nextMelody(Math.max(nextNote, ctx.currentTime + 0.02));
		};
		tick();
		const timer = window.setInterval(tick, 120);
		return () => {
			window.clearInterval(timer);
			const t = ctx.currentTime;
			bus.gain.cancelScheduledValues(t);
			bus.gain.setTargetAtTime(0, t, 0.6);
			held?.stop(t);
		};
	};
}

/** D major's notes, and its modes' (as pitch classes, C = 0). */
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
const D_LYDIAN = [2, 4, 6, 8, 9, 11, 1];
const D_MIXOLYDIAN = [2, 4, 6, 7, 9, 11, 0];

export const PADS: Record<string, Pad> = {
	// The open sky: Dmaj9, F#m7, Bm9, Gmaj7. Sparse bells up high that tend to fall, and sigh.
	'pad-sky': mood({
		chords: [
			[50, 57, 61, 64, 66],
			[54, 57, 61, 64, 69],
			[47, 54, 57, 61, 62],
			[55, 59, 62, 66, 69]
		],
		bar: 10,
		scale: D_MAJOR,
		pad: { type: 'triangle', cutoff: 1200, level: 0.05 },
		melody: { lo: 62, hi: 77, every: [1.9, 3.6], shape: 'wander', sigh: 0.3, fall: 1.5, gain: 0.22 }
	}),
	// The model: Dmaj7#11 to E over D, back and forth, the floating sound of wonder; quicker music-box glints.
	'pad-brain': mood({
		chords: [
			[50, 57, 61, 64, 68],
			[50, 59, 64, 68, 71]
		],
		bar: 7,
		scale: D_LYDIAN,
		pad: { type: 'triangle', cutoff: 1500, level: 0.055 },
		bass: { gain: 0.07, beats: [[0, 0]] },
		melody: { lo: 66, hi: 81, every: [1.1, 2.4], shape: 'wander', sigh: 0.15, fall: 1.2, gain: 0.19 }
	}),
	// Inside the data centre: Bm9, Gmaj7, Dadd9, A. A soft arpeggio, like work flowing through the chips, now and then
	// leaning on a note before it lets go.
	'pad-cluster': mood({
		chords: [
			[47, 54, 57, 61, 62],
			[55, 59, 62, 66, 69],
			[50, 57, 62, 64, 66],
			[45, 52, 57, 59, 61]
		],
		bar: 8,
		scale: D_MAJOR,
		pad: { type: 'sine', cutoff: 950, level: 0.06 },
		bass: { gain: 0.055, beats: [[0, 0], [0.25, 0], [0.5, 7], [0.75, 0]] },
		melody: { lo: 57, hi: 74, every: [0.36, 0.36], shape: 'arp', rest: 0.25, sigh: 0.2, gain: 0.11 }
	}),
	// The harness room: D, C over D, G over D, Bm7. Warm wood, unhurried.
	'pad-room': mood({
		chords: [
			[50, 57, 62, 66, 69],
			[50, 55, 60, 64, 67],
			[50, 55, 59, 62, 67],
			[47, 54, 57, 62, 66]
		],
		bar: 10,
		scale: D_MIXOLYDIAN,
		pad: { type: 'triangle', cutoff: 1000, level: 0.05 },
		melody: { lo: 55, hi: 71, every: [1.8, 3.8], shape: 'wander', sigh: 0.2, fall: 1.3, gain: 0.21 }
	}),
	// The sandbox: Dsus2, Asus4, Gsus2, Dsus4, never quite settling.
	'pad-gates': mood({
		chords: [
			[50, 57, 62, 64, 69],
			[45, 52, 57, 62, 64],
			[55, 57, 62, 67, 69],
			[50, 57, 62, 67, 69]
		],
		bar: 9,
		scale: D_MAJOR,
		pad: { type: 'triangle', cutoff: 1150, level: 0.05 },
		melody: { lo: 62, hi: 76, every: [2, 4], shape: 'wander', sigh: 0.2, fall: 1.3, gain: 0.19 }
	}),
	// Memory: Bm7, Gmaj7, Dadd9, A. Bittersweet, on harp.
	'pad-memory': mood({
		chords: [
			[47, 54, 57, 62, 66],
			[55, 59, 62, 66, 69],
			[50, 57, 62, 64, 66],
			[45, 52, 57, 61, 64]
		],
		bar: 9,
		scale: D_MAJOR,
		pad: { type: 'triangle', cutoff: 1100, level: 0.05 },
		melody: { lo: 57, hi: 74, every: [2, 4.2], shape: 'wander', sigh: 0.35, fall: 1.6, gain: 0.22, voice: 'harp' }
	}),
	// Plans: Dmaj7, Bm7, Gadd9, A. The notes climb the chord, one step at a time.
	'pad-plans': mood({
		chords: [
			[50, 57, 61, 66],
			[47, 54, 57, 62, 66],
			[55, 57, 59, 62, 66],
			[45, 52, 59, 61, 64]
		],
		bar: 8,
		scale: D_MAJOR,
		pad: { type: 'triangle', cutoff: 1200, level: 0.05 },
		melody: { lo: 62, hi: 74, every: [0.5, 0.5], shape: 'climb', rest: 0.35, gain: 0.12 }
	}),
	// The end of the day: Gmaj9, F#m7, Bm9, Dmaj9, slowly, with a rare high note like a first star.
	'pad-dusk': mood({
		chords: [
			[55, 59, 62, 66, 69],
			[54, 57, 61, 64, 69],
			[47, 54, 57, 61, 62],
			[50, 57, 61, 64, 66]
		],
		bar: 11,
		scale: D_MAJOR,
		pad: { type: 'triangle', cutoff: 1050, level: 0.055 },
		bass: { gain: 0.075, beats: [[0, 0]] },
		melody: { lo: 66, hi: 79, every: [3, 6], shape: 'wander', sigh: 0.4, fall: 1.4, gain: 0.18 }
	})
};
