// Turns the two-voice scripts in narration/*.txt into the site's narration: node scripts/narration/say.mjs [id,id,...]
// With no ids it makes only the conversations that have no audio yet; name ids to make those again where changed.
//
// A script is a title line ("# Title") and then one turn per line, "NORA: words" or "THEO: words". Square brackets are
// delivery cues for the voice ([curious], [laughs]); they're spoken as direction, never shown in the captions.
//
// Each script is cut at turn boundaries into requests under ElevenLabs' 2,000-character limit for Text to Dialogue,
// and each request is kept in narration-lab/raw (gitignored) under a hash of everything that shapes it, so running
// this again pays only for what changed. The pieces are joined, levelled to podcast loudness, and written as
// static/narration/<id>.mp3 with static/narration/<id>.json (the captions, timed per turn), plus a manifest the page
// imports. Anything over five minutes is refused.
//
// --dry   counts characters and estimates length and credits without calling the API.
// --retake=<id>   asks for a new take of that script: its count in narration/takes.json goes up, which changes the seed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { elevenKey } from '../sound/env.mjs';

const root = new URL('../../', import.meta.url);
const scripts = new URL('narration/', root);
const raw = new URL('narration-lab/raw/', root);
const out = new URL('static/narration/', root);
const manifestFile = new URL('src/lib/journey/narration.json', root);
mkdirSync(raw, { recursive: true });
mkdirSync(out, { recursive: true });

const config = JSON.parse(readFileSync(new URL('voices.json', scripts), 'utf8'));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const takesFile = new URL('takes.json', scripts);
const takes = existsSync(takesFile) ? JSON.parse(readFileSync(takesFile, 'utf8')) : {};
const retakes = new Set(args.filter((a) => a.startsWith('--retake=')).flatMap((a) => a.slice(9).split(',')));
for (const id of retakes) takes[id] = (takes[id] ?? 0) + 1;
if (!dry) writeFileSync(takesFile, JSON.stringify(takes, null, '\t') + '\n');
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const LIMIT = 1900;
const MAX_SECONDS = 300;
const GAP = 0.35;

/** Words the voices get wrong, spelled the way they should sound. Only the audio hears these; captions keep the real words. */
const SAY = Object.entries(config.say ?? {}).sort((a, b) => b[0].length - a[0].length);
function spoken(text) {
	let t = text;
	for (const [word, sound] of SAY) {
		const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		t = t.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'g'), sound);
	}
	return t;
}

function parse(id) {
	const lines = readFileSync(new URL(`${id}.txt`, scripts), 'utf8').split('\n');
	const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim() ?? id;
	const turns = [];
	for (const line of lines) {
		const m = line.match(/^([A-Z]+):\s*(.+)$/);
		if (!m) continue;
		if (!config.voices[m[1]]) throw new Error(`${id}: no voice for ${m[1]}`);
		turns.push({ who: m[1], text: m[2].trim() });
	}
	return { id, title, turns };
}

/** The words a reader sees: cues out, spacing tidied. */
const caption = (text) =>
	text
		.replace(/\[[^\]]*\]\s*/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/** A turn cut into sentences, which the captions show one at a time. Cues stay with the sentence they colour. */
const sentences = (text) => text.split(/(?<=[.!?…])\s+(?=["“[A-Z0-9])/);

/** Consecutive turns packed into requests that stay under the limit. */
function chunks(turns) {
	const groups = [];
	let cur = [];
	let size = 0;
	for (const [i, t] of turns.entries()) {
		const n = spoken(t.text).length;
		if (n > LIMIT) throw new Error(`a turn of ${n} characters is too long for one request`);
		if (size + n > LIMIT && cur.length) {
			groups.push(cur);
			cur = [];
			size = 0;
		}
		cur.push(i);
		size += n;
	}
	if (cur.length) groups.push(cur);
	return groups;
}

const key = dry ? '' : elevenKey();

async function request(body, attempt = 0) {
	const res = await fetch('https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128', {
		method: 'POST',
		headers: { 'xi-api-key': key, 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if ((res.status === 429 || res.status >= 500) && attempt < 6) {
		await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
		return request(body, attempt + 1);
	}
	if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
	return res.json();
}

const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

async function build(script) {
	const { id, turns } = script;
	const dir = new URL(`${id}/`, raw);
	mkdirSync(dir, { recursive: true });
	const groups = chunks(turns);
	const seed = (config.seed ?? 4242) + 1000 * (takes[id] ?? 0);
	const pieces = [];
	for (const [g, group] of groups.entries()) {
		const inputs = group.map((i) => ({ text: sentences(turns[i].text).map(spoken).join(' '), voice_id: config.voices[turns[i].who] }));
		const body = { inputs, model_id: config.model, settings: config.settings, seed: seed + g };
		const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
		const file = new URL(`${g}-${hash}.json`, dir);
		if (!existsSync(file)) {
			if (dry) {
				pieces.push(null);
				continue;
			}
			process.stdout.write(`  ${id} part ${g + 1}/${groups.length}…`);
			const res = await request(body);
			writeFileSync(file, JSON.stringify({ voice_segments: res.voice_segments, alignment: res.alignment, audio_base64: res.audio_base64 }));
			console.log(' done');
		}
		if (dry) {
			pieces.push(null);
			continue;
		}
		const res = JSON.parse(readFileSync(file, 'utf8'));
		const mp3 = new URL(`${g}-${hash}.mp3`, dir);
		if (!existsSync(mp3)) writeFileSync(mp3, Buffer.from(res.audio_base64, 'base64'));
		pieces.push({ group, inputs, mp3: mp3.pathname, segments: res.voice_segments, alignment: res.alignment });
	}
	if (dry) return null;

	// Join the pieces with a breath between them, at one loudness, in mono for speech.
	const list = new URL('list.txt', dir);
	const gap = new URL('gap.wav', dir);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', String(GAP), gap.pathname]);
	const wavs = pieces.map((p, i) => {
		const wav = new URL(`piece-${i}.wav`, dir);
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', p.mp3, '-ac', '1', '-ar', '44100', wav.pathname]);
		return wav.pathname;
	});
	writeFileSync(list, wavs.flatMap((w, i) => (i ? [`file '${gap.pathname}'`, `file '${w}'`] : [`file '${w}'`])).join('\n'));
	const joined = new URL('joined.wav', dir);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list.pathname, '-c', 'copy', joined.pathname]);
	const final = new URL(`${id}.mp3`, out);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', joined.pathname, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', final.pathname]);

	// Captions: each turn's span from the voice segments, and each sentence's start from the timing of its first
	// letter, all moved along by the pieces before them.
	const lines = [];
	let offset = 0;
	const at = (v) => (v === null || v === undefined ? null : +(offset + v).toFixed(2));
	for (const [i, p] of pieces.entries()) {
		let base = 0;
		for (const [k, t] of p.group.entries()) {
			const segs = p.segments.filter((s) => s.dialogue_input_index === k);
			const start = segs.length ? Math.min(...segs.map((s) => s.start_time_seconds)) : null;
			const end = segs.length ? Math.max(...segs.map((s) => s.end_time_seconds)) : null;
			const parts = [];
			let from = 0;
			for (const sentence of sentences(turns[t].text)) {
				const said = spoken(sentence);
				const lead = said.match(/^(\[[^\]]*\]\s*)*/)[0].length;
				const when = p.alignment?.character_start_times_seconds?.[base + from + lead];
				parts.push({ text: caption(sentence), start: at(when ?? null) });
				from += said.length + 1;
			}
			lines.push({ who: turns[t].who, text: caption(turns[t].text), start: at(start), end: at(end), parts: parts.length > 1 ? parts : undefined });
			base += p.inputs[k].text.length;
		}
		offset += seconds(wavs[i]) + GAP;
	}
	const length = seconds(final.pathname);
	if (length > MAX_SECONDS) throw new Error(`${id} runs ${length.toFixed(0)} s, over five minutes: shorten the script`);
	writeFileSync(new URL(`${id}.json`, out), JSON.stringify({ id, title: script.title, seconds: +length.toFixed(1), lines }));
	return { seconds: +length.toFixed(1), parts: pieces.length };
}

const ids = readdirSync(scripts)
	.filter((f) => f.endsWith('.txt'))
	.map((f) => f.slice(0, -4))
	.filter((id) => !only || only.includes(id));
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
let chars = 0;
let words = 0;
const queue = [];
for (const id of ids) {
	const script = parse(id);
	const n = script.turns.reduce((s, t) => s + spoken(t.text).length, 0);
	const w = script.turns.reduce((s, t) => s + caption(t.text).split(' ').length, 0);
	chars += n;
	words += w;
	if (dry) console.log(`${id.padEnd(44)} ${String(w).padStart(4)} words  ~${((w / 160) * 60).toFixed(0).padStart(3)} s  ${n} chars  ${chunks(script.turns).length} parts`);
	// Run with no ids, it makes only what's missing, so a new word in the say list doesn't quietly pay for every take again.
	else if (only || !manifest[id] || retakes.has(id)) queue.push(script);
}
// Three conversations at a time, inside the account's limit on requests at once.
await Promise.all(
	Array.from({ length: 3 }, async () => {
		for (let script = queue.shift(); script; script = queue.shift()) {
			try {
				const made = await build(script);
				manifest[script.id] = { title: script.title, seconds: made.seconds };
				console.log(`${script.id}: ${made.seconds} s in ${made.parts} parts`);
			} catch (e) {
				console.log(`${script.id}: FAILED ${e.message}`);
			}
		}
	})
);
if (!dry) writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, '\t') + '\n');
console.log(`${ids.length} scripts, ${words} words, ${chars} characters${dry ? ` (about ${Math.round(chars * (config.cost ?? 1))} credits if all are new)` : ''}`);
