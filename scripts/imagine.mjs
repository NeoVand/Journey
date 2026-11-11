// Concept images with OpenAI's image model, from a prompt file and reference images.
// node scripts/imagine.mjs <out-prefix> <prompt.txt> [ref.png,ref.png,...]
// env: MODEL (gpt-image-2.6-sunburst), SIZE (1536x1024), QUALITY (medium), N (2), COMPLEXITY (high)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

const [out, promptFile, refs = ''] = process.argv.slice(2);
if (!out || !promptFile) throw new Error('usage: node scripts/imagine.mjs <out-prefix> <prompt.txt> [refs]');
const env = Object.fromEntries(
	readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
		.split('\n')
		.filter((l) => l.includes('='))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const key = env.OPENAI_API_KEY;
const model = process.env.MODEL ?? 'gpt-image-2.6-sunburst';
const prompt = readFileSync(promptFile, 'utf8');
const files = refs ? refs.split(',').filter(Boolean) : [];
const common = { model, prompt, size: process.env.SIZE ?? '1536x1024', quality: process.env.QUALITY ?? 'medium', n: Number(process.env.N ?? 2) };
if (process.env.COMPLEXITY) common.complexity = process.env.COMPLEXITY;

const t0 = Date.now();
let res;
if (files.length) {
	const form = new FormData();
	for (const [k, v] of Object.entries(common)) form.append(k, String(v));
	for (const f of files) form.append('image[]', new Blob([readFileSync(f)], { type: 'image/png' }), basename(f));
	res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
} else {
	res = await fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(common)
	});
}
const body = await res.json();
if (!res.ok) {
	console.error('error', res.status, JSON.stringify(body.error ?? body).slice(0, 600));
	process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
body.data.forEach((d, i) => {
	const file = `${out}-${i + 1}.png`;
	writeFileSync(file, Buffer.from(d.b64_json, 'base64'));
	console.log(file);
});
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; usage ${JSON.stringify(body.usage ?? {})}`);
