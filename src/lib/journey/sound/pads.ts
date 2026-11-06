/**
 * Ambient pads: soft chords in the story's key that drift slowly, so every note the story plays sits inside them.
 * Each place has its own: open and airy in the sky, deep and cool inside the cluster, warm in the harness room,
 * and a dreamier chord around the model, with now and then a music-box glint, as if it were thinking. At the very end,
 * as the light goes gold, the sky's chord settles into a warmer one.
 */
import { porcelain, note } from './synth';

/** Builds a pad into `out` and returns a function that stops it. */
export type Pad = (ctx: AudioContext, out: AudioNode) => () => void;

interface Shape {
	/** The chord, in Hz. */
	chord: number[];
	type: OscillatorType;
	/** Where the filter sits, and how far it wanders, in Hz. */
	cutoff: number;
	sweep: number;
	/** How slowly it moves, in cycles per second. */
	drift: number;
	/** How loud, before the bed's own level. */
	level: number;
	/** Seconds between glints, if any. */
	glints?: [number, number];
}

function pad(shape: Shape): Pad {
	return (ctx, out) => {
		const now = ctx.currentTime;
		const bus = ctx.createGain();
		bus.gain.setValueAtTime(0, now);
		bus.gain.linearRampToValueAtTime(shape.level, now + 3);
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = shape.cutoff;
		filter.Q.value = 0.4;
		// The filter breathes open and closed, very slowly.
		const lfo = ctx.createOscillator();
		lfo.frequency.value = shape.drift;
		const depth = ctx.createGain();
		depth.gain.value = shape.sweep;
		lfo.connect(depth).connect(filter.frequency);
		filter.connect(bus).connect(out);
		const nodes: AudioScheduledSourceNode[] = [lfo];
		shape.chord.forEach((f, i) => {
			// Two slightly detuned voices per note, each swelling on its own slow cycle, so the chord never sits still.
			for (const cents of [-6, 6]) {
				const o = ctx.createOscillator();
				o.type = shape.type;
				o.frequency.value = f;
				o.detune.value = cents + (i % 2 ? 2 : -2);
				const g = ctx.createGain();
				g.gain.value = 0.5 / shape.chord.length;
				const swell = ctx.createOscillator();
				swell.frequency.value = shape.drift * (0.7 + i * 0.23);
				const swellDepth = ctx.createGain();
				swellDepth.gain.value = 0.35 / shape.chord.length;
				swell.connect(swellDepth).connect(g.gain);
				o.connect(g).connect(filter);
				nodes.push(o, swell);
			}
		});
		for (const n of nodes) n.start(now);
		// Now and then a single high note, somewhere in the chord's scale.
		let timer = 0;
		const glint = () => {
			if (!shape.glints) return;
			const [a, b] = shape.glints;
			timer = window.setTimeout(
				() => {
					const g = ctx.createGain();
					g.gain.value = 0.18 + Math.random() * 0.12;
					const p = ctx.createStereoPanner();
					p.pan.value = Math.random() * 1.4 - 0.7;
					g.connect(p).connect(out);
					porcelain(note(10 + Math.floor(Math.random() * 6)))(ctx, g, ctx.currentTime + 0.02);
					glint();
				},
				(a + Math.random() * (b - a)) * 1000
			);
		};
		glint();
		return () => {
			clearTimeout(timer);
			const t = ctx.currentTime;
			bus.gain.cancelScheduledValues(t);
			bus.gain.setTargetAtTime(0, t, 0.5);
			for (const n of nodes) n.stop(t + 3);
		};
	};
}

/** D, A, E, F#: open fifths with a ninth, in the same pentatonic as the notes. */
export const PADS: Record<string, Pad> = {
	'pad-sky': pad({ chord: [146.83, 220, 329.63, 369.99], type: 'triangle', cutoff: 1300, sweep: 500, drift: 0.045, level: 0.07 }),
	'pad-cluster': pad({ chord: [73.42, 110, 146.83, 220], type: 'sine', cutoff: 650, sweep: 260, drift: 0.07, level: 0.09 }),
	'pad-room': pad({ chord: [146.83, 220, 293.66, 369.99], type: 'triangle', cutoff: 950, sweep: 300, drift: 0.05, level: 0.07 }),
	'pad-brain': pad({ chord: [146.83, 184.99, 220, 329.63, 440], type: 'triangle', cutoff: 1500, sweep: 700, drift: 0.06, level: 0.08, glints: [1.4, 3.6] }),
	// The end of the day: the sky's chord settles into a warmer major seventh, with a rare high note like a first star.
	'pad-dusk': pad({ chord: [110, 146.83, 184.99, 220, 277.18], type: 'triangle', cutoff: 1050, sweep: 380, drift: 0.035, level: 0.075, glints: [4, 9] })
};
