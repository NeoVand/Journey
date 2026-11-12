import { KEPT, STANDING, TURN_ONE, type TileKind } from './tiles';
import { ADDS, COMPACT } from './turns';

/**
 * What the tray holds at each moment of the side trip inside the harness: the context, as a row of tiles, in the
 * order the model reads it. Trip time t runs from 0 to 6; card n is t in [n - 1, n]. What arrives when is the trip's
 * script, in turns.ts.
 */
export { KEPT, SLOTS, TILE_COLOR, TURN_ONE, WINDOW, type TileKind } from './tiles';
export { COMPACT } from './turns';

/** One tile in the tray: what it is, when it arrived, and how many slots it takes (a summary block takes several). */
export type Tile = { kind: TileKind; born: number; span: number };

/** While the press works: the tiles from `from` up to (not including) `to` are being squeezed into `span` slots. */
export type Squeeze = { from: number; to: number; k: number; span: number };

export type Tray = { tiles: Tile[]; squeeze: Squeeze | null; used: number };

/** What the tray holds at trip time t. */
export function trayAt(t: number): Tray {
	// What was there before the trip began: everything in turn one but your prompt, which you type in card 1.
	let tiles: Tile[] = TURN_ONE.slice(0, STANDING).map((kind) => ({ kind, born: -Infinity, span: 1 }));
	let squeeze: Squeeze | null = null;
	const compacted = t >= COMPACT.until;
	for (const add of ADDS) {
		if (add.at > t) break;
		if (compacted && add.at >= COMPACT.at && tiles.every((x) => x.kind !== 'summary')) fold(tiles);
		for (const kind of add.kinds) tiles.push({ kind, born: add.at, span: add.span ?? 1 });
	}
	if (compacted && tiles.every((x) => x.kind !== 'summary')) fold(tiles);
	else if (t >= COMPACT.at && !compacted) squeeze = { from: KEPT, to: tiles.length, k: (t - COMPACT.at) / (COMPACT.until - COMPACT.at), span: COMPACT.span };
	return { tiles, squeeze, used: tiles.reduce((s, x) => s + x.span, 0) };

	function fold(list: Tile[]) {
		list.splice(KEPT, list.length - KEPT, { kind: 'summary', born: COMPACT.until, span: COMPACT.span });
		tiles = list;
	}
}

/** The slot where the next tile goes: where the writer sits, and where the cart tips a result. */
export const openEnd = (tray: Tray) => tray.used;
