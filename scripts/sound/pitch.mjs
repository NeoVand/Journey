// Finds the pitch of a single note: node scripts/sound/pitch.mjs file.mp3 [...]
// Autocorrelation over a window just after the strike, where the note is steady but still loud.
import { execFileSync } from 'node:child_process';

export function pitch(file) {
	const rate = 44100;
	const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
	const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
	const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
	const onset = s.findIndex((v) => Math.abs(v) > peak * 0.2);
	const from = onset + Math.round(rate * 0.04);
	const n = 4096;
	const w = s.subarray(from, from + n);
	if (w.length < n) return { f0: NaN, clarity: 0 };
	let energy = 0;
	for (const v of w) energy += v * v;
	let best = 0;
	let lag = 0;
	// 80 Hz to 2 kHz.
	for (let l = Math.floor(rate / 2000); l < rate / 80; l++) {
		let sum = 0;
		for (let i = 0; i < n - l; i++) sum += w[i] * w[i + l];
		const r = sum / energy;
		if (r > best) {
			best = r;
			lag = l;
		}
	}
	// Prefer the shortest lag that's nearly as good: the fundamental, not a multiple of it.
	for (let l = Math.floor(rate / 2000); l < lag; l++) {
		let sum = 0;
		for (let i = 0; i < n - l; i++) sum += w[i] * w[i + l];
		if (sum / energy > best * 0.9 && lag % l < 3) {
			lag = l;
			break;
		}
	}
	// Between whole samples: fit a parabola through the peak and its neighbours, which matters for high notes.
	const r = (l) => {
		let sum = 0;
		for (let i = 0; i < n - l; i++) sum += w[i] * w[i + l];
		return sum / energy;
	};
	const [a, b, c] = [r(lag - 1), r(lag), r(lag + 1)];
	const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
	return { f0: +(rate / (lag + shift)).toFixed(1), clarity: +best.toFixed(2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	for (const file of process.argv.slice(2)) console.log(file.split('/').pop(), JSON.stringify(pitch(file)));
}
