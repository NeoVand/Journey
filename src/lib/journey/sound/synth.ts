/**
 * Sounds made on the spot, for what a recording can't do: notes that follow the tokens, ticks that keep time with
 * the picture, and taps that never sound the same twice. Each builds a few nodes into `out` and returns its end time.
 */
import type { Voice } from './engine';

/** D major pentatonic: any run of these sounds like a tune, never a mistake. */
const DEGREES = [0, 2, 4, 7, 9];

/** The i-th note of the scale, counting up from the D above middle C; negative counts down, octave by octave. */
export const note = (i: number) => {
	const octave = Math.floor(i / DEGREES.length);
	const degree = DEGREES[i - octave * DEGREES.length];
	return 293.66 * Math.pow(2, (degree + 12 * octave) / 12);
};

function noise(ctx: AudioContext, seconds: number) {
	const b = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * seconds)), ctx.sampleRate);
	const d = b.getChannelData(0);
	for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	const src = ctx.createBufferSource();
	src.buffer = b;
	return src;
}

/** An envelope that rises in `attack` seconds to `peak` and dies away exponentially. */
function env(ctx: AudioContext, at: number, peak: number, attack: number, decay: number) {
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, at);
	g.gain.exponentialRampToValueAtTime(peak, at + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
	return g;
}

/**
 * Struck porcelain: the inharmonic modes of a small bar or bowl, each dying at its own rate, over a tiny click.
 * Bright, round and short; the sound of the world's cream-and-porcelain machines.
 */
export const porcelain =
	(freq: number, ring = 1): Voice =>
	(ctx, out, at) => {
		const modes = [
			[1, 1, 0.9],
			[2.76, 0.42, 0.38],
			[5.4, 0.18, 0.16],
			[8.93, 0.08, 0.08]
		];
		let end = at;
		for (const [ratio, amp, decay] of modes) {
			const o = ctx.createOscillator();
			o.frequency.value = freq * ratio * (1 + (Math.random() - 0.5) * 0.004);
			const g = env(ctx, at, amp * 0.5, 0.002, decay * ring);
			o.connect(g).connect(out);
			o.start(at);
			o.stop(at + decay * ring + 0.05);
			end = Math.max(end, at + decay * ring + 0.05);
		}
		const click = noise(ctx, 0.01);
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 3000;
		const cg = env(ctx, at, 0.12, 0.0005, 0.008);
		click.connect(hp).connect(cg).connect(out);
		click.start(at);
		return end;
	};

/** A small wooden tick: a burst of filtered noise, pitched a little differently every time. */
export const tick =
	(bright = 1): Voice =>
	(ctx, out, at) => {
		const n = noise(ctx, 0.03);
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = (1800 + Math.random() * 500) * bright;
		bp.Q.value = 2.5;
		const g = env(ctx, at, 0.6, 0.0008, 0.022);
		n.connect(bp).connect(g).connect(out);
		n.start(at);
		return at + 0.03;
	};

/** A key going down and coming back up: two clicks and a soft thump under them. */
export const key =
	(weight = 1): Voice =>
	(ctx, out, at) => {
		for (const [t, f, a] of [
			[0, 2600, 0.5],
			[0.07 + Math.random() * 0.02, 3400, 0.25]
		]) {
			const n = noise(ctx, 0.02);
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = f;
			bp.Q.value = 1.6;
			const g = env(ctx, at + t, a * weight, 0.0006, 0.018);
			n.connect(bp).connect(g).connect(out);
			n.start(at + t);
		}
		const o = ctx.createOscillator();
		o.frequency.setValueAtTime(140, at);
		o.frequency.exponentialRampToValueAtTime(70, at + 0.05);
		const g = env(ctx, at, 0.35 * weight, 0.002, 0.05);
		o.connect(g).connect(out);
		o.start(at);
		o.stop(at + 0.08);
		return at + 0.12;
	};

/** Air moving past: noise through a filter that opens and closes, for the camera's flights and the cut of a jump. */
export const whoosh =
	(seconds = 0.9, high = 1800): Voice =>
	(ctx, out, at) => {
		const n = noise(ctx, seconds + 0.1);
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.Q.value = 0.9;
		bp.frequency.setValueAtTime(260, at);
		bp.frequency.exponentialRampToValueAtTime(high, at + seconds * 0.55);
		bp.frequency.exponentialRampToValueAtTime(420, at + seconds);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(0.5, at + seconds * 0.5);
		g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
		n.connect(bp).connect(g).connect(out);
		n.start(at);
		return at + seconds + 0.1;
	};

/** A rising run of porcelain notes: something worked. */
export const chime =
	(steps = [0, 2, 4, 7], gap = 0.07): Voice =>
	(ctx, out, at) => {
		let end = at;
		steps.forEach((s, i) => {
			end = Math.max(end, porcelain(note(s + 3), 1.3)(ctx, out, at + i * gap));
		});
		return end;
	};

/** A warm low tone that swells and fades: for refusals, failures and things that went wrong. Never harsh. */
export const low =
	(freq: number, seconds = 0.7): Voice =>
	(ctx, out, at) => {
		for (const [ratio, amp] of [
			[1, 0.5],
			[2.01, 0.12],
			[0.5, 0.18]
		]) {
			const o = ctx.createOscillator();
			o.type = 'sine';
			o.frequency.value = freq * ratio;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(amp, at + 0.03);
			g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
			o.connect(g).connect(out);
			o.start(at);
			o.stop(at + seconds + 0.05);
		}
		return at + seconds + 0.05;
	};

/** A tone gliding from one pitch to another: something filling up. */
export const sweep =
	(from: number, to: number, seconds: number): Voice =>
	(ctx, out, at) => {
		const o = ctx.createOscillator();
		o.type = 'triangle';
		o.frequency.setValueAtTime(from, at);
		o.frequency.exponentialRampToValueAtTime(to, at + seconds);
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 1400;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(0.16, at + 0.2);
		g.gain.setValueAtTime(0.16, at + seconds - 0.15);
		g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
		o.connect(lp).connect(g).connect(out);
		o.start(at);
		o.stop(at + seconds + 0.05);
		return at + seconds + 0.05;
	};
