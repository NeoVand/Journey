// Turns the picked takes into the site's sound files: node scripts/sound/build.mjs
// Short sounds: silence trimmed off the front, a quick fade at the end, mono, levelled to the same loudness.
// Room tones and other loops: stereo, levelled to a quieter target, left whole so they still loop.
// Writes static/sound/<id>.mp3, and prints what it did.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { measure } from './measure.mjs';

const root = new URL('../../', import.meta.url);
const raw = new URL('sound-lab/raw/', root);
const out = new URL('static/sound/', root);
mkdirSync(out, { recursive: true });
const cues = JSON.parse(readFileSync(new URL('scripts/sound/prompts.json', root), 'utf8'));
const picks = existsSync(new URL('sound-lab/picks.json', root)) ? JSON.parse(readFileSync(new URL('sound-lab/picks.json', root), 'utf8')) : {};

/** Loudness of the part that's actually sounding, in dBFS RMS. */
function rms(file) {
	const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
	const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
	const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
	let sum = 0;
	let n = 0;
	for (const v of s) {
		if (Math.abs(v) < peak * 0.05) continue;
		sum += v * v;
		n++;
	}
	return { rms: 10 * Math.log10(sum / Math.max(1, n)), peak: 20 * Math.log10(peak) };
}

/**
 * Until a take is picked by ear, a stand-in: for a short sound, the one that starts soonest among those that aren't
 * faint, so it lands on its moment; for a loop, the fullest one.
 */
function standIn(cue) {
	const takes = [];
	for (let n = 1; n <= (cue.count ?? 3); n++) {
		const file = new URL(`${cue.id}-${n}.mp3`, raw);
		if (existsSync(file)) takes.push({ n, m: measure(file.pathname) });
	}
	if (!takes.length) return null;
	if (cue.loop) return takes.sort((a, b) => b.m.peakDb - a.m.peakDb)[0].n;
	const loud = takes.filter((t) => t.m.peakDb > -36);
	return (loud.length ? loud : takes).sort((a, b) => a.m.startsAt - b.m.startsAt)[0].n;
}

let total = 0;
for (const cue of cues) {
	const chosen = picks[cue.id]?.pick;
	const pick = chosen ?? standIn(cue);
	if (!pick) continue;
	const src = new URL(`${cue.id}-${pick}.mp3`, raw).pathname;
	const dst = new URL(`${cue.id}.mp3`, out).pathname;
	const m = measure(src);
	if (cue.loop) {
		// Loops stay whole and stereo; only their level changes.
		const level = rms(src);
		const gain = Math.min(-26 - level.rms, -1 - level.peak);
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', '128k', dst]);
	} else {
		// From just before it starts, to a little after it ends, with a 30 ms fade so the cut never clicks.
		const start = Math.max(0, m.startsAt - 0.012);
		const end = Math.min(m.duration, m.endsAt + 0.12);
		const length = end - start;
		const trimmed = new URL(`${cue.id}.wav`, out).pathname;
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', src, '-ac', '1', '-af', `afade=t=out:st=${Math.max(0, length - 0.03).toFixed(3)}:d=0.03`, trimmed]);
		const level = rms(trimmed);
		const gain = Math.min(-16 - level.rms, -3 - level.peak);
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', trimmed, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', '96k', dst]);
		execFileSync('rm', ['-f', trimmed]);
	}
	const size = statSync(dst).size;
	total += size;
	console.log(`${cue.id.padEnd(16)} take ${pick}${chosen ? ' (picked)' : ' (stand-in)'}  ${(size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);
