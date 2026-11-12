/**
 * The tray's tiles: what kinds there are, their colours, and how many fit. The tray (tray.ts), the turns that fill it
 * (turns.ts) and everything that draws a tile read these.
 *
 * The tray is the agent's whole window, a million tokens for Claude Code on current models. A tile is one piece of
 * the request (a part, a message, a result), and even a small one gets a whole tile; the header's gauge gives the real
 * numbers. Turn one fills a sliver of the tray, which is the honest picture.
 */
export type TileKind = 'tools' | 'instructions' | 'environment' | 'prompt' | 'text' | 'call' | 'result' | 'refusal' | 'summary';

/** The gauge's colours, so the tray and the header agree. Red only for a refusal. */
export const TILE_COLOR: Record<TileKind, string> = {
	tools: '#c9a271',
	instructions: '#ecd29a',
	environment: '#9fcbf3',
	prompt: '#2f6fe0',
	text: '#b9c4d8',
	call: '#ffbc2e',
	result: '#3cc47e',
	refusal: '#e0574f',
	summary: '#ff9a1f'
};

export const WINDOW = 1_000_000;
/** How many tiles fit between the tray's start and its end stop. */
export const SLOTS = 52;

/** Turn one, in the request's real order: the tools first, then the instructions, the environment, your prompt. */
export const TURN_ONE: TileKind[] = ['tools', 'instructions', 'environment', 'prompt'];
/** How many tiles at the start never change: what the press leaves alone. */
export const KEPT = TURN_ONE.length;
/** What was there before the trip began, cached from earlier sessions: everything in turn one but your prompt. */
export const STANDING = KEPT - 1;
