// What say.mjs and spots.mjs share: reading a script, the words as the voices hear them, how a script is cut into
// requests, and where in a recording each named thing is said.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

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

/** The things in the scene that can be pointed at, and the words that name each one: narration/spots.json. */
const SPOTS = existsSync(new URL('spots.json', scripts)) ? JSON.parse(readFileSync(new URL('spots.json', scripts), 'utf8')) : {};
const NAMES = Object.entries(SPOTS)
	.filter(([key]) => !key.startsWith('//'))
	.flatMap(([key, words]) => words.map((w) => ({ key, re: new RegExp(`(?<![\\w-])${spoken(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi') })));
/** The same thing named again this soon after is the same mention. */
const AGAIN = 6;

/**
 * When each thing in the scene is named in a recording, in seconds from its start: [[seconds, key], ...]. pieces are the
 * requests in order, each with its inputs, the voices' timing (letter by letter where the answer has it, else turn by
 * turn) and where its audio starts in the joined file.
 */
export function spotsIn(pieces) {
	const found = [];
	for (const p of pieces) {
		let base = 0;
		const letters = p.alignment?.characters?.join('');
		for (const [k, input] of p.inputs.entries()) {
			const text = input.text;
			const segs = p.segments.filter((s) => s.dialogue_input_index === k);
			const t0 = segs.length ? Math.min(...segs.map((s) => s.start_time_seconds)) : null;
			const t1 = segs.length ? Math.max(...segs.map((s) => s.end_time_seconds)) : null;
			for (const { key, re } of NAMES) {
				re.lastIndex = 0;
				for (let m = re.exec(text); m; m = re.exec(text)) {
					// Letter-timed where the voices said when; otherwise as far through the turn as the word is through its text.
					let at = letters && letters.slice(base, base + text.length) === text ? p.alignment.character_start_times_seconds[base + m.index] : null;
					if (at === null || at === undefined) at = t0 === null ? null : t0 + ((t1 - t0) * m.index) / text.length;
					if (at !== null) found.push([+(p.offset + at).toFixed(2), key]);
				}
			}
			base += text.length;
		}
	}
	found.sort((a, b) => a[0] - b[0]);
	const last = {};
	return found.filter(([at, key]) => {
		const keep = last[key] === undefined || at - last[key] > AGAIN;
		last[key] = at;
		return keep;
	});
}
