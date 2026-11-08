// Listens back to the narration, since nobody here can: node scripts/narration/check.mjs [id,id,...]
// Each static/narration/<id>.mp3 goes through ElevenLabs speech to text, and the words heard are lined up against the
// script's words. Prints the share of script words that were heard, and every run of three or more words that went
// missing or was added, so a skipped line, a stumble or an invented phrase can be retaken. Transcripts are kept in
// narration-lab/heard (gitignored), so a second run costs nothing.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { elevenKey } from '../sound/env.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('static/narration/', root);
const heardDir = new URL('narration-lab/heard/', root);
mkdirSync(heardDir, { recursive: true });
const only = process.argv[2]?.split(',');
const ids = readdirSync(out)
	.filter((f) => f.endsWith('.json'))
	.map((f) => f.slice(0, -5))
	.filter((id) => !only || only.includes(id));

const words = (s) =>
	s
		.toLowerCase()
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);

async function hear(id) {
	const file = new URL(`${id}.txt`, heardDir);
	const mp3 = new URL(`${id}.mp3`, out);
	const cached = new URL(`${id}.stamp`, heardDir);
	const stamp = String(readFileSync(mp3).length);
	if (existsSync(file) && existsSync(cached) && readFileSync(cached, 'utf8') === stamp) return readFileSync(file, 'utf8');
	const form = new FormData();
	form.append('model_id', 'scribe_v2');
	form.append('file', new Blob([readFileSync(mp3)], { type: 'audio/mpeg' }), `${id}.mp3`);
	form.append('tag_audio_events', 'false');
	const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': elevenKey() }, body: form });
	if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
	const text = (await res.json()).text;
	writeFileSync(file, text);
	writeFileSync(cached, stamp);
	return text;
}

/** A number said in words and written back in digits, "twenty one thousand" for "21 000": the same thing heard right. */
const NUMBER_WORDS = /^(and|a|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion)$/;
const numbers = (r) => r.miss.split(' ').every((w) => NUMBER_WORDS.test(w)) && r.extra.split(' ').every((w) => /^\d+$/.test(w) || NUMBER_WORDS.test(w));

/** Word alignment by longest common subsequence; returns the runs that differ. */
function diff(a, b) {
	const n = a.length;
	const m = b.length;
	const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const runs = [];
	let i = 0;
	let j = 0;
	let miss = [];
	let extra = [];
	const flush = () => {
		if (miss.length + extra.length) runs.push({ at: i, miss: miss.join(' '), extra: extra.join(' ') });
		miss = [];
		extra = [];
	};
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			flush();
			i++;
			j++;
		} else if (L[i + 1][j] >= L[i][j + 1]) miss.push(a[i++]);
		else extra.push(b[j++]);
	}
	while (i < n) miss.push(a[i++]);
	while (j < m) extra.push(b[j++]);
	flush();
	return { same: L[0][0], runs };
}

for (const id of ids) {
	const { lines } = JSON.parse(readFileSync(new URL(`${id}.json`, out), 'utf8'));
	const said = words(lines.map((l) => l.text).join(' '));
	try {
		const heard = words(await hear(id));
		const { same, runs } = diff(said, heard);
		const big = runs.filter((r) => (r.miss.split(' ').length >= 3 || r.extra.split(' ').length >= 3) && !numbers(r));
		console.log(`${id.padEnd(44)} ${((100 * same) / said.length).toFixed(1)}% heard${big.length ? `, ${big.length} to look at` : ''}`);
		for (const r of big) console.log(`    near "${said.slice(Math.max(0, r.at - 4), r.at).join(' ')}": missing "${r.miss}"${r.extra ? `, heard "${r.extra}"` : ''}`);
	} catch (e) {
		console.log(`${id}: ${e.message}`);
	}
}
