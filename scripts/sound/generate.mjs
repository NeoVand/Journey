// Generates candidate sounds with ElevenLabs into sound-lab/raw, from scripts/sound/prompts.json.
// node scripts/sound/generate.mjs [id,id,...]   (no ids: every cue; existing candidates are kept, not paid for twice)
// Each cue: { id, prompt, seconds?, loop?, count?, influence? }. Candidates are <id>-<n>.mp3.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { elevenKey } from './env.mjs';

const root = new URL('../../', import.meta.url);
const raw = new URL('sound-lab/raw/', root);
mkdirSync(raw, { recursive: true });
const cues = JSON.parse(readFileSync(new URL('scripts/sound/prompts.json', root), 'utf8'));
const only = process.argv[2]?.split(',');
const key = elevenKey();

const jobs = [];
for (const cue of cues) {
	if (only && !only.includes(cue.id)) continue;
	for (let n = 1; n <= (cue.count ?? 3); n++) {
		const file = new URL(`${cue.id}-${n}.mp3`, raw);
		if (!existsSync(file)) jobs.push({ cue, n, file });
	}
}
console.log(`${jobs.length} to generate`);

async function generate({ cue, n, file }, attempt = 0) {
	const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192', {
		method: 'POST',
		headers: { 'xi-api-key': key, 'content-type': 'application/json' },
		body: JSON.stringify({
			text: cue.prompt,
			model_id: 'eleven_text_to_sound_v3',
			duration_seconds: cue.seconds ?? null,
			loop: !!cue.loop,
			prompt_influence: cue.influence ?? 0.45
		})
	});
	if (res.status === 429 && attempt < 6) {
		await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
		return generate({ cue, n, file }, attempt + 1);
	}
	if (!res.ok) throw new Error(`${cue.id}-${n}: ${res.status} ${(await res.text()).slice(0, 200)}`);
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	console.log(`  ${cue.id}-${n}`);
}

// A few at a time, so the account's concurrency limit isn't hit.
const queue = [...jobs];
const failures = [];
await Promise.all(
	Array.from({ length: 3 }, async () => {
		for (let job = queue.shift(); job; job = queue.shift()) {
			try {
				await generate(job);
			} catch (e) {
				failures.push(e.message);
			}
		}
	})
);
if (failures.length) console.log(`failed:\n${failures.join('\n')}`);
