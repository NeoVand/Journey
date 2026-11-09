// Finds where each conversation names something in the scene, from the recordings already made, and writes it into
// static/narration/<id>.json as spots: [[seconds, key], ...]. The page lights that thing up as it's said.
// node scripts/narration/spots.mjs [id,id,...]
//
// The words that name each thing are in narration/spots.json. Nothing is recorded or paid for: the voices' own timing,
// letter by letter, is in narration-lab/raw from when say.mjs made the audio, and say.mjs writes spots too as it makes
// a conversation. Run this after changing spots.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chunks, GAP, out, parse, raw, request, scripts, seconds, spotsIn, takesFile } from './lib.mjs';

const takes = existsSync(takesFile) ? JSON.parse(readFileSync(takesFile, 'utf8')) : {};
const only = process.argv[2]?.split(',');
const ids = readdirSync(scripts)
	.filter((f) => f.endsWith('.txt'))
	.map((f) => f.slice(0, -4))
	.filter((id) => !only || only.includes(id));

let total = 0;
for (const id of ids) {
	const script = parse(id);
	const dir = new URL(`${id}/`, raw);
	const pieces = [];
	let offset = 0;
	let missing = false;
	for (const [g, group] of chunks(script.turns).entries()) {
		const { inputs, hash } = request(script, g, group, takes[id] ?? 0);
		let file = new URL(`${g}-${hash}.json`, dir);
		// A word added to the say list since this was recorded changes the name, not the recording: the only take kept is
		// the one playing. Its words are placed by how far through each turn they are.
		if (!existsSync(file)) {
			const kept = existsSync(dir) ? readdirSync(dir).filter((f) => new RegExp(`^${g}-[0-9a-f]{12}\\.json$`).test(f)) : [];
			if (kept.length !== 1) {
				missing = true;
				break;
			}
			file = new URL(kept[0], dir);
		}
		const res = JSON.parse(readFileSync(file, 'utf8'));
		pieces.push({ inputs, segments: res.voice_segments, alignment: res.alignment, offset });
		// The joined audio puts a breath after each piece: the piece's length is measured as say.mjs measured it.
		const wav = new URL(`piece-${g}.wav`, dir);
		const mp3 = new URL(file.href.replace(/\.json$/, '.mp3'));
		offset += seconds((existsSync(wav) ? wav : mp3).pathname) + GAP;
	}
	const json = new URL(`${id}.json`, out);
	if (missing || !existsSync(json)) {
		console.log(`${id}: no recording to read; run say.mjs first`);
		continue;
	}
	const spots = spotsIn(pieces);
	const talk = JSON.parse(readFileSync(json, 'utf8'));
	writeFileSync(json, JSON.stringify({ ...talk, spots }));
	total += spots.length;
	console.log(`${id.padEnd(44)} ${String(spots.length).padStart(3)} spots  ${[...new Set(spots.map((s) => s[1]))].join(' ')}`);
}
console.log(`${ids.length} conversations, ${total} spots`);
