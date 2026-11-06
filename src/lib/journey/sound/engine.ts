/**
 * The sound of the journey. Everything goes through one small mixing desk: sounds and their echo in a shared room,
 * ambiences on their own fader that dips when something happens, and a gentle compressor so nothing ever jumps out.
 * It stays silent until the reader turns it on, which is also the click browsers need before they'll play anything.
 */

import { useRecordings } from './synth';
import { PADS } from './pads';

const MASTER = 0.9;

export interface Play {
	/** Linear volume, 1 as recorded. */
	gain?: number;
	/** Left -1 to right 1. */
	pan?: number;
	/** Playback speed, which also shifts the pitch. */
	rate?: number;
	/** Seconds from now. */
	delay?: number;
	/** How much goes to the room's echo, 0 to 1. */
	wet?: number;
	/** Where in the sound to start, and how long to play, in seconds. */
	offset?: number;
	length?: number;
}

/** A synthesized voice: builds its nodes into `out`, starting at time `at`, and says when it ends. */
export type Voice = (ctx: AudioContext, out: AudioNode, at: number) => number;

interface Loop {
	src: AudioBufferSourceNode;
	fade: GainNode;
	/** When this pass of the loop starts fading out for the next. */
	handover: number;
}

interface Bed {
	gain: GainNode;
	level: number;
	loops: Loop[];
	quietSince: number;
	/** A synthesized pad instead of a recording: how to stop it. */
	stopPad?: () => void;
}

/** A room for the echo: a couple of seconds of noise dying away, darker as it goes, a little different in each ear. */
function room(ctx: AudioContext, seconds: number, decay: number) {
	const length = Math.round(ctx.sampleRate * seconds);
	const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const data = buffer.getChannelData(ch);
		let low = 0;
		for (let i = 0; i < length; i++) {
			const t = i / length;
			// Lowpass that closes over time, so the tail is warm rather than hissy.
			const k = 0.55 - 0.45 * t;
			low += k * (Math.random() * 2 - 1 - low);
			data[i] = low * Math.pow(1 - t, decay) * (i < 90 ? i / 90 : 1);
		}
	}
	return buffer;
}

export class Sound {
	ctx: AudioContext | null = null;
	on = false;
	private master!: GainNode;
	private sfx!: GainNode;
	private bedsBus!: GainNode;
	private duck!: GainNode;
	private echo!: GainNode;
	private buffers = new Map<string, AudioBuffer>();
	private loading = new Map<string, Promise<AudioBuffer | null>>();
	private beds = new Map<string, Bed>();
	private last = new Map<string, number>();

	/** url: where a named sound's file is. */
	constructor(private url: (name: string) => string) {
		useRecordings((name) => this.buffers.get(name));
	}

	/** Call from a click or a key press: browsers only let sound start from one. */
	async start() {
		if (!this.ctx) this.build();
		const ctx = this.ctx!;
		if (ctx.state !== 'running') await ctx.resume();
		this.on = true;
		this.master.gain.cancelScheduledValues(ctx.currentTime);
		this.master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.2);
	}

	stop() {
		const ctx = this.ctx;
		this.on = false;
		if (!ctx) return;
		this.master.gain.cancelScheduledValues(ctx.currentTime);
		this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
		setTimeout(() => {
			if (!this.on) void ctx.suspend();
		}, 600);
	}

	private build() {
		const ctx = new AudioContext({ latencyHint: 'interactive' });
		this.ctx = ctx;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -18;
		comp.knee.value = 14;
		comp.ratio.value = 3;
		comp.attack.value = 0.004;
		comp.release.value = 0.25;
		this.master = ctx.createGain();
		this.master.gain.value = 0;
		comp.connect(this.master).connect(ctx.destination);
		this.sfx = ctx.createGain();
		this.sfx.connect(comp);
		this.duck = ctx.createGain();
		this.duck.connect(comp);
		this.bedsBus = ctx.createGain();
		this.bedsBus.connect(this.duck);
		const verb = ctx.createConvolver();
		verb.buffer = room(ctx, 2.2, 3.2);
		this.echo = ctx.createGain();
		const back = ctx.createGain();
		back.gain.value = 0.32;
		this.echo.connect(verb).connect(back).connect(comp);
	}

	/** Fetches and decodes sounds ahead of when they're needed. */
	load(names: string[]) {
		return Promise.all(names.map((n) => this.buffer(n)));
	}

	private buffer(name: string) {
		const have = this.loading.get(name);
		if (have) return have;
		const ctx = this.ctx;
		if (!ctx) return Promise.resolve(null);
		const job = fetch(this.url(name))
			.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
			.then((data) => ctx.decodeAudioData(data))
			.then((b) => {
				this.buffers.set(name, b);
				return b;
			})
			.catch(() => null);
		this.loading.set(name, job);
		return job;
	}

	/** A channel strip for one sound: its volume, its place left to right, and its send to the room. */
	private strip(gain: number, pan: number, wet: number, at: number) {
		const ctx = this.ctx!;
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, at);
		const p = ctx.createStereoPanner();
		p.pan.value = Math.max(-1, Math.min(1, pan));
		g.connect(p).connect(this.sfx);
		if (wet > 0) {
			const s = ctx.createGain();
			s.gain.value = wet;
			p.connect(s).connect(this.echo);
		}
		return g;
	}

	/**
	 * Plays a recorded sound. One that hasn't loaded yet is skipped rather than played late, and the same sound
	 * twice within 40 ms plays once, so a fast scroll never machine-guns.
	 */
	play(name: string, o: Play = {}) {
		const ctx = this.ctx;
		if (!ctx || !this.on) return;
		const buffer = this.buffers.get(name);
		if (!buffer) {
			void this.buffer(name);
			return;
		}
		const now = ctx.currentTime;
		if (now - (this.last.get(name) ?? -1) < 0.04) return;
		this.last.set(name, now);
		const at = now + (o.delay ?? 0);
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.playbackRate.value = o.rate ?? 1;
		const g = this.strip(o.gain ?? 1, o.pan ?? 0, o.wet ?? 0.18, at);
		src.connect(g);
		const offset = o.offset ?? 0;
		if (o.length) {
			// A short fade at the cut, so stopping early never clicks.
			const end = at + o.length;
			g.gain.setValueAtTime(o.gain ?? 1, end - 0.04);
			g.gain.linearRampToValueAtTime(0, end);
			src.start(at, offset, o.length + 0.01);
		} else src.start(at, offset);
	}

	/** Plays a synthesized voice. */
	voice(v: Voice, o: { gain?: number; pan?: number; wet?: number; delay?: number } = {}) {
		const ctx = this.ctx;
		if (!ctx || !this.on) return;
		const at = ctx.currentTime + (o.delay ?? 0) + 0.005;
		v(ctx, this.strip(o.gain ?? 1, o.pan ?? 0, o.wet ?? 0.2, at), at);
	}

	/** Lets the ambiences make room for a moment, for something that matters. */
	dip(depth = 0.5, seconds = 0.8) {
		const ctx = this.ctx;
		if (!ctx || !this.on) return;
		const g = this.duck.gain;
		const now = ctx.currentTime;
		g.cancelScheduledValues(now);
		g.setTargetAtTime(1 - depth, now, 0.04);
		g.setTargetAtTime(1, now + seconds, 0.35);
	}

	/**
	 * How loud each ambience should be right now, 0 to 1. Called every frame; levels glide, and each one loops by
	 * crossfading into a fresh pass of itself, which hides any seam in the recording.
	 */
	ambience(levels: Record<string, number>) {
		const ctx = this.ctx;
		if (!ctx || !this.on) return;
		const now = ctx.currentTime;
		for (const name of new Set([...this.beds.keys(), ...Object.keys(levels)])) {
			const level = levels[name] ?? 0;
			let bed = this.beds.get(name);
			if (!bed) {
				if (level <= 0) continue;
				const gain = ctx.createGain();
				gain.gain.value = 0;
				gain.connect(this.bedsBus);
				bed = { gain, level: 0, loops: [], quietSince: now };
				this.beds.set(name, bed);
			}
			if (Math.abs(level - bed.level) > 0.002) {
				bed.level = level;
				bed.gain.gain.setTargetAtTime(level, now, 0.6);
			}
			if (level > 0.001) bed.quietSince = now;
			const pad = PADS[name];
			if (pad) {
				// A pad plays for as long as it's wanted, and is let go once it has been silent for a while.
				if (level > 0.001 && !bed.stopPad) bed.stopPad = pad(ctx, bed.gain);
				else if (bed.stopPad && now - bed.quietSince > 4) {
					bed.stopPad();
					bed.stopPad = undefined;
				}
				continue;
			}
			const buffer = this.buffers.get(name);
			if (!buffer) {
				if (level > 0) void this.buffer(name);
				continue;
			}
			// Silent for a while: let it go, so a quiet bed costs nothing.
			if (now - bed.quietSince > 4) {
				for (const l of bed.loops) l.src.stop();
				bed.loops = [];
				continue;
			}
			const lastLoop = bed.loops[bed.loops.length - 1];
			if (!lastLoop || now > lastLoop.handover - 0.25) this.nextPass(bed, buffer, lastLoop ? lastLoop.handover : now);
			bed.loops = bed.loops.filter((l) => l.handover + 3 > now);
		}
	}

	private nextPass(bed: Bed, buffer: AudioBuffer, at: number) {
		const ctx = this.ctx!;
		const overlap = Math.min(2, buffer.duration * 0.2);
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		const fade = ctx.createGain();
		fade.gain.setValueAtTime(0, at);
		fade.gain.linearRampToValueAtTime(1, at + overlap);
		const handover = at + buffer.duration - overlap;
		fade.gain.setValueAtTime(1, handover);
		fade.gain.linearRampToValueAtTime(0, handover + overlap);
		src.connect(fade).connect(bed.gain);
		src.start(at);
		src.stop(handover + overlap + 0.05);
		bed.loops.push({ src, fade, handover });
	}
}
