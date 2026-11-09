// Turns each conversation's direction into times: node scripts/narration/direct.mjs [id,id,...]
// narration/direction/<id>.json says, at phrases of the script, what the scene shows: the camera goes to a thing, it
// glows, and sometimes something happens there (a drawer slides out). This finds when each phrase is said, from the
// voices' own letter-by-letter timing kept in narration-lab/raw, and writes the moments into static/narration/<id>.json
// as direction: [{ t, show, ... }]. Nothing is recorded or paid for. say.mjs does the same as it makes a conversation.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { directionOf, out, parse, recording, scripts, takesFile } from './lib.mjs';

const takes = existsSync(takesFile) ? JSON.parse(readFileSync(takesFile, 'utf8')) : {};
const only = process.argv[2]?.split(',');
const ids = readdirSync(scripts)
	.filter((f) => f.endsWith('.txt'))
	.map((f) => f.slice(0, -4))
	.filter((id) => !only || only.includes(id));

let total = 0;
let lost = 0;
for (const id of ids) {
	const json = new URL(`${id}.json`, out);
	const pieces = recording(parse(id), takes[id] ?? 0);
	if (!pieces || !existsSync(json)) {
		console.log(`${id}: no recording to read; run say.mjs first`);
		continue;
	}
	const { direction, missing } = directionOf(id, pieces);
	// The words the scene once listened for are gone: only the direction remains.
	const talk = JSON.parse(readFileSync(json, 'utf8'));
	delete talk.spots;
	writeFileSync(json, JSON.stringify({ ...talk, direction }));
	total += direction.length;
	lost += missing.length;
	if (direction.length || missing.length) console.log(`${id.padEnd(44)} ${String(direction.length).padStart(2)} moments${missing.length ? `  NOT FOUND: ${missing.map((m) => `"${m}"`).join(', ')}` : ''}`);
}
console.log(`${ids.length} conversations, ${total} moments${lost ? `, ${lost} phrases not found` : ''}`);
