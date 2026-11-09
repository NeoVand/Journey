/**
 * The conversation points at the picture. As Nora or Theo names something in the scene, the camera goes to it and it
 * glows, and a quiet note sounds; then the camera goes back to the card's own shot. Not too often: the narrator keeps
 * only mentions spaced well apart (plan, in cues.ts), and of those, only what's in view and clear of the card's words
 * is shown.
 *
 * When each thing is named comes from the recordings (scripts/narration/spots.mjs, with the words in
 * narration/spots.json). Which things in the scene each one lights is below, by the names they're built with.
 */
import type { Narrator } from './narrator.svelte';
import type { World } from './world';

/** For each key in narration/spots.json, the things in the scene it lights: the biggest in view, or all of them together. */
export const SPOTS: Record<string, { names: string[]; together?: boolean }> = {
	harness: { names: ['Harness'] },
	laptop: { names: ['Laptop'] },
	mcp: { names: ['MCP'] },
	skills: { names: ['Skills', 'sign:Skills'] },
	drawers: { names: ['front:Instructions', 'front:Environment', 'front:Tools', 'front:Conversation'], together: true },
	instructions: { names: ['drawer:Instructions', 'front:Instructions'] },
	environment: { names: ['drawer:Environment', 'front:Environment'] },
	'tools-drawer': { names: ['drawer:Tools', 'front:Tools'] },
	'conversation-drawer': { names: ['drawer:Conversation', 'front:Conversation'] },
	resources: { names: ['mcp:Resources'] },
	prompts: { names: ['mcp:Prompts'] },
	request: { names: ['Request'] },
	'front-door': { names: ['Front door', 'gateway'] },
	tunnel: { names: ['tunnel-frame'] },
	tokenizer: { names: ['Tokenizer'] },
	chips: { names: ['label:Accelerator'], together: true },
	hbm: { names: ['label:HBM'], together: true },
	nvlink: { names: ['nvlink'] },
	kv: { names: ['KV cache', 'kv-cabinet'] },
	router: { names: ['Router', 'router-box'] },
	attention: { names: ['attention'] },
	wheel: { names: ['wheel'] },
	gates: { names: ['gate'] },
	hooks: { names: ['Your hooks'] },
	subagent: { names: ['Subagent'] },
	transcript: { names: ['reel', 'sign:Saved transcript'], together: true },
	loop: { names: ['loop'] },
	glass: { names: ['glass-frame', 'sandbox-frame'] },
	proxy: { names: ['sign:Proxy'] },
	deny: { names: ['check-Deny'] },
	ask: { names: ['check-Ask'] },
	allow: { names: ['check-Allow'] },
	checkpoint: { names: ['checkpoint-stand', 'sign:Checkpoint'], together: true },
	'git-host': { names: ['Git host'] }
};

/** What's being shown, and how far: 0 to 1 as the camera goes to it and comes back. */
export type Lit = { key: string; k: number };

/** Lit a moment before the word, so the light lands with it. */
const LEAD = 0.12;
/** Seconds after its word that something is still lit, when a busy page drew no frame in between. */
const LATE = 2.5;
/** Seconds for the camera to get there, to stay, and to go back: quicker when the talk stops, to give the story back. */
const RISE = 1.3;
const HOLD = 3.4;
const FALL = 1.5;
const LETGO = 0.7;
const ease = (t: number) => t * t * (3 - 2 * t);
/** The card's words, which nothing is lit under. */
const WORDS = 'h1, h2, p, li, dt, dd, button, pre, table, figure, .dial, .ticket';

/** Whether the middle of a place on screen is under a card's words or the header. */
export function covered(r: { x: number; y: number; w: number; h: number }) {
	const x = r.x + r.w / 2;
	const y = r.y + r.h / 2;
	const inside = (q: DOMRect) => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom;
	const bar = document.querySelector('header.bar');
	if (bar && inside(bar.getBoundingClientRect())) return true;
	for (const pin of document.querySelectorAll<HTMLElement>('.pin')) {
		if (pin.style.visibility === 'hidden') continue;
		for (const el of pin.querySelectorAll<HTMLElement>(WORDS)) {
			if (inside(el.getBoundingClientRect()) && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
		}
	}
	return false;
}

export class Pointer {
	lit = $state.raw<Lit | null>(null);
	private id: string | null = null;
	/** How far into the conversation it was last frame, to notice a jump. */
	private heard = 0;
	/** The next of the conversation's spots to come. */
	private next = 0;
	private on: { key: string; t0: number; fall: number } | null = null;

	constructor(
		private world: Pick<World, 'whereIs' | 'show'>,
		/** As something lights up: for its note. */
		private onLight: (key: string) => void = () => {},
		/** Whether a place on screen is hidden by words; a test can say no. */
		private hidden: (r: { x: number; y: number; w: number; h: number }) => boolean = covered
	) {}

	/** Once a frame. now is in seconds; move says whether the camera may go to things, which it mustn't for reduced motion. */
	update(now: number, narrator: Pick<Narrator, 'playing' | 'id' | 'time' | 'spots'>, move: boolean) {
		const talking = narrator.playing && !!narrator.id;
		const id = talking ? narrator.id : null;
		const t = narrator.time;
		const spots = id ? narrator.spots[id] : undefined;
		// A new conversation, or a jump within one: its spots are read on from here.
		if (id && (id !== this.id || t < this.heard - 0.6 || t > this.heard + 1.5)) {
			const at = spots ? spots.findIndex(([s]) => s >= t - 0.05) : -1;
			this.next = at < 0 ? (spots?.length ?? 0) : at;
		}
		if (id) {
			this.id = id;
			this.heard = t;
		}
		if (spots && !this.on) {
			while (this.next < spots.length && spots[this.next][0] - LEAD <= t) {
				const [at, key] = spots[this.next++];
				// Late by a slow frame or two is still worth lighting; much later, the talk has moved on.
				if (t - at > LATE) continue;
				const spot = SPOTS[key];
				const where = spot && this.world.whereIs(spot.names, spot.together);
				if (!where || this.hidden(where)) continue;
				this.on = { key, t0: now, fall: FALL };
				this.onLight(key);
				break;
			}
		}
		if (!this.on) return;
		// Paused or stopped, or the reader moving on: it goes now, from wherever it had got to.
		if (!talking && this.on.fall === FALL) {
			const e = now - this.on.t0;
			const k = e < RISE ? ease(e / RISE) : e < RISE + HOLD ? 1 : 1 - ease(Math.min(1, (e - RISE - HOLD) / FALL));
			// Starts its quick fall at the height it was at, so nothing jumps: how far into the fall the ease gives k.
			this.on.fall = LETGO;
			this.on.t0 = now - RISE - HOLD - (0.5 - Math.sin(Math.asin(2 * k - 1) / 3)) * LETGO;
		}
		const e = now - this.on.t0;
		const fall = this.on.fall;
		// It starts at nothing and comes up, so only the end of its fade finishes it.
		const done = e >= RISE + HOLD + fall;
		const k = e < RISE ? ease(e / RISE) : e < RISE + HOLD ? 1 : 1 - ease(Math.min(1, (e - RISE - HOLD) / fall));
		if (done) {
			this.clear();
			return;
		}
		this.lit = { key: this.on.key, k };
		this.world.show({ key: this.on.key, ...SPOTS[this.on.key] }, k, move);
	}

	/** Lets go at once: the page is going, or the reader leapt. */
	clear() {
		this.on = null;
		this.lit = null;
		this.world.show(null, 0);
	}
}
