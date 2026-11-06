// Reads ELEVENLABS_API_KEY from .env.local (kept out of git) or the environment. Never prints it.
import { readFileSync } from 'node:fs';

export function elevenKey() {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
	try {
		const line = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
			.split('\n')
			.find((l) => l.startsWith('ELEVENLABS_API_KEY='));
		if (line) return line.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
	} catch {
		// No file: fall through to the error below.
	}
	throw new Error('Put ELEVENLABS_API_KEY=... in .env.local');
}
