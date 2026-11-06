// Measures sounds, since nobody here can listen to them: node scripts/sound/measure.mjs file.mp3 [...]
// Prints duration, peak and loudness, where the sound starts and stops, and how bright it is.
import { execFileSync, spawnSync } from 'node:child_process';

export function measure(file) {
	const duration = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
	// ffmpeg reports its measurements on stderr.
	const stats = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'astats=metadata=0,ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
	const num = (re) => {
		const m = stats.match(re);
		return m ? +m[1] : NaN;
	};
	// Mono samples at 8 kHz are plenty to find the edges of a sound and its rough brightness.
	const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
	const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
	const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
	const gate = peak * 0.05;
	const first = s.findIndex((v) => Math.abs(v) > gate);
	let last = s.length - 1;
	while (last > 0 && Math.abs(s[last]) <= gate) last--;
	let zc = 0;
	for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) zc++;
	return {
		duration: +duration.toFixed(2),
		peakDb: num(/Overall[\s\S]*?Peak level dB: (-?[\d.]+)/),
		lufs: num(/I:\s+(-?[\d.]+) LUFS/),
		startsAt: +(first / 8000).toFixed(3),
		// Where the loudest moment is: the hit, in a sound that winds up to one.
		peakAt: +(s.findIndex((v) => Math.abs(v) === peak) / 8000).toFixed(3),
		endsAt: +(last / 8000).toFixed(3),
		// Zero crossings per second: a rough brightness, low for rumbles and high for hiss.
		brightness: Math.round(zc / (s.length / 8000))
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	for (const file of process.argv.slice(2)) console.log(file.split('/').pop(), JSON.stringify(measure(file)));
}
