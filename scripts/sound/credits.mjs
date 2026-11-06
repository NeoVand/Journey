// How many ElevenLabs credits are left: node scripts/sound/credits.mjs
import { elevenKey } from './env.mjs';

const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': elevenKey() } });
if (!res.ok) {
	console.log('status', res.status, (await res.text()).slice(0, 200));
	process.exit(1);
}
const s = await res.json();
console.log(`tier ${s.tier}, used ${s.character_count} of ${s.character_limit} credits, resets ${new Date(s.next_character_count_reset_unix * 1000).toDateString()}`);
