// What say.mjs and direct.mjs share: reading a script, the words as the voices hear them, how a script is cut into
// requests, and when in a recording each phrase of a conversation's direction is said.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

export const root = new URL('../../', import.meta.url);
export const scripts = new URL('narration/', root);
export const raw = new URL('narration-lab/raw/', root);
export const out = new URL('static/narration/', root);

export const config = JSON.parse(readFileSync(new URL('voices.json', scripts), 'utf8'));
export const takesFile = new URL('takes.json', scripts);
export const LIMIT = 1900;
/** The breath between two requests' audio when they're joined. */
export const GAP = 0.35;

/** Words the voices get wrong, spelled the way they should sound. Only the audio hears these; captions keep the real words. */
const SAY = Object.entries(config.say ?? {}).sort((a, b) => b[0].length - a[0].length);
export function spoken(text) {
	let t = text;
	for (const [word, sound] of SAY) {
		const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		t = t.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'g'), sound);
	}
	return t;
}

export function parse(id) {
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
export const caption = (text) =>
	text
		.replace(/\[[^\]]*\]\s*/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/** A turn cut into sentences, which the captions show one at a time. Cues stay with the sentence they colour. */
export const sentences = (text) => text.split(/(?<=[.!?…])\s+(?=["“[A-Z0-9])/);

/** Consecutive turns packed into requests that stay under the limit. */
export function chunks(turns) {
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

/** One request to the voices, and the name its answer is kept under: a hash of everything that shapes it. */
export function request(script, g, group, take = 0) {
	const inputs = group.map((i) => ({ text: sentences(script.turns[i].text).map(spoken).join(' '), voice_id: config.voices[script.turns[i].who] }));
	const body = { inputs, model_id: config.model, settings: config.settings, seed: (config.seed ?? 4242) + 1000 * take + g };
	const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
	return { inputs, body, hash };
}

export const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

/** Letters compared without case or curly quotes, one for one, so a place in one is the same place in the other. */
const fold = (text) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/**
 * A recording's words as one string, with when each letter is said, in seconds from the start. pieces are its requests
 * in order: each with its inputs, the voices' timing (letter by letter where the answer has it, else turn by turn) and
 * where its audio starts in the joined file.
 */
export function timeline(pieces) {
	let text = '';
	const times = [];
	for (const p of pieces) {
		let base = 0;
		const letters = p.alignment?.characters?.join('');
		for (const [k, input] of p.inputs.entries()) {
			const said = input.text;
			const segs = p.segments.filter((s) => s.dialogue_input_index === k);
			const t0 = segs.length ? Math.min(...segs.map((s) => s.start_time_seconds)) : 0;
			const t1 = segs.length ? Math.max(...segs.map((s) => s.end_time_seconds)) : t0;
			const exact = letters && letters.slice(base, base + said.length) === said;
			for (let i = 0; i < said.length; i++) {
				// Letter-timed where the voices said when; otherwise as far through the turn as the letter is through its text.
				times.push(p.offset + (exact ? p.alignment.character_start_times_seconds[base + i] : t0 + ((t1 - t0) * i) / said.length));
			}
			text += said;
			base += said.length;
			text += ' ';
			times.push(times[times.length - 1] ?? p.offset);
		}
	}
	return { text: fold(text), times };
}

/**
 * When a phrase of the script is said, after a place in the recording: its first letter's time and where it ends, or
 * null if it isn't there. The phrase is written as the script has it; the voices' respellings are applied here.
 */
export function when(line, phrase, from = 0) {
	const said = fold(spoken(phrase));
	const at = line.text.indexOf(said, from);
	if (at < 0) return null;
	return { t: +line.times[at].toFixed(2), end: at + said.length };
}

/**
 * A conversation's recording as say.mjs made it, read back from narration-lab/raw: its pieces, each with where it
 * starts. Null if it hasn't been recorded. A word added to the say list since changes a piece's name, not the
 * recording: the only take kept is the one playing.
 */
export function recording(script, take = 0) {
	const dir = new URL(`${script.id}/`, raw);
	const pieces = [];
	let offset = 0;
	for (const [g, group] of chunks(script.turns).entries()) {
		const { inputs, hash } = request(script, g, group, take);
		let file = new URL(`${g}-${hash}.json`, dir);
		if (!existsSync(file)) {
			const kept = existsSync(dir) ? readdirSync(dir).filter((f) => new RegExp(`^${g}-[0-9a-f]{12}\\.json$`).test(f)) : [];
			if (kept.length !== 1) return null;
			file = new URL(kept[0], dir);
		}
		const res = JSON.parse(readFileSync(file, 'utf8'));
		pieces.push({ inputs, segments: res.voice_segments, alignment: res.alignment, offset });
		// The joined audio puts a breath after each piece: its length measured as say.mjs measured it.
		const wav = new URL(`piece-${g}.wav`, dir);
		offset += seconds((existsSync(wav) ? wav : new URL(file.href.replace(/\.json$/, '.mp3'))).pathname) + GAP;
	}
	return pieces;
}

/**
 * A conversation's direction: narration/direction/<id>.json, the moments it shows something in the scene, each at a
 * phrase of the script, made into times. Each moment: { at: phrase, show: [names], together?, do?, index?, in?, hold? }.
 * Phrases are found in order, each after the last. Returns the moments with times, and the phrases not found.
 */
export function directionOf(id, pieces) {
	const file = new URL(`direction/${id}.json`, scripts);
	if (!existsSync(file)) return { direction: [], missing: [] };
	const { cues } = JSON.parse(readFileSync(file, 'utf8'));
	const line = timeline(pieces);
	const direction = [];
	const missing = [];
	let from = 0;
	for (const { at, ...cue } of cues) {
		const found = when(line, at, from);
		if (!found) {
			missing.push(at);
			continue;
		}
		from = found.end;
		direction.push({ t: found.t, ...cue });
	}
	return { direction, missing };
}
