/**
 * The story as a film. Each card is a scene and then a hold: the scene plays, from where the last card finished to where
 * this one has, and the picture holds while Nora and Theo talk the card through, or, without them, while it's read.
 * Film time runs through them all, one after another, so any moment of the film is a moment of the story and, in a
 * hold, a moment of its conversation: scrubbing the film moves both, and a press of Play runs them all.
 *
 * The rail the reader drags gives every card the same share, its scene first and its hold after, so a card is always
 * as easy to find as the next, and the picture moves under the scene's part of it however long the talk after it is.
 */
import type { Pace } from './playhead';

/** Closer than this to a stop is at it. */
const AT = 1e-4;
/** However short a card's scene or long its hold, each keeps at least this much of the card's share of the rail. */
const LEAST = 0.32;

export interface Card {
	/** The conversation that goes with it, if any. */
	talk: string | null;
	/** Seconds the picture holds still once the scene has played: its conversation, or time to read it. */
	hold: number;
}

/** A card as the rail draws it: its title, how much of its share the scene takes, whether it's talked through, and its chapter. */
export interface ReelCard {
	title: string;
	split: number;
	talk: boolean;
	chapter: number;
}

/** A moment of the film. */
export interface Place {
	/** Story time. */
	T: number;
	/** Whose card it is: the scene leading to stop k, or the hold at it. */
	k: number;
	/** Resting at the card's stop, `into` seconds into its hold; otherwise in the scene leading to it, `into` seconds in. */
	holding: boolean;
	into: number;
}

/** A calm reading pace, in words a second: about two hundred and fifty words a minute. */
export const READ_PACE = 4.2;
/** However quickly a card was read, the picture rests a moment on it before the next scene. */
const BREATH = 1.2;
/** The longest a card waits to be read once its scene has played: a longer card unfolds a little quicker instead. */
const LONGEST = 12;

/** How fast a card's words unfold, in words a second, once it has been on screen `seen` seconds of its scene. */
export const readingPace = (words: number, seen: number) => Math.max(READ_PACE, words / (seen + LONGEST));

/**
 * How long a card holds still once its scene has played, without the voices. Its words unfold at a reading pace from
 * the moment the card arrives, while the scene is still playing, so the hold is only what's left to read after the
 * scene has spent `seen` seconds of it, and a breath: a short card on a long scene hardly stops at all.
 */
export const readingHold = (words: number, seen: number) => Math.max(0.6, words / readingPace(words, seen) - seen) + BREATH;

export class Reel {
	/** Film seconds at which each card's scene begins, and its hold. */
	private sceneAt: number[] = [];
	private holdAt: number[] = [];
	total = 0;

	constructor(
		/** Story time at each card's stop: stop 0 is the title page. */
		public stops: number[],
		public pace: Pace,
		public cards: Card[]
	) {
		this.measure();
	}

	/** Again, after a hold changed: a conversation turned off, say, or played faster. */
	measure() {
		let f = 0;
		this.sceneAt = [];
		this.holdAt = [];
		this.stops.forEach((_, k) => {
			this.sceneAt.push(f);
			f += this.scene(k);
			this.holdAt.push(f);
			f += this.cards[k]?.hold ?? 0;
		});
		this.total = f;
	}

	get count() {
		return this.stops.length;
	}

	/** Seconds the scene leading to card k takes to play. The title page has none: it's there from the start. */
	scene(k: number) {
		return k <= 0 ? 0 : this.pace.seconds(this.stops[k - 1], this.stops[k]);
	}

	hold(k: number) {
		return this.cards[k]?.hold ?? 0;
	}

	/** Film seconds where card k's hold begins. */
	holdStart(k: number) {
		return this.holdAt[Math.max(0, Math.min(this.count - 1, k))];
	}

	/** Film seconds where card k's scene begins. */
	sceneStart(k: number) {
		return this.sceneAt[Math.max(0, Math.min(this.count - 1, k))];
	}

	/** Film seconds at a moment of the story, and `into` seconds into the hold if it's resting at a stop. */
	when(T: number, into = 0) {
		const k = this.stops.findIndex((s) => s >= T - AT);
		if (k < 0) return this.total;
		if (Math.abs(this.stops[k] - T) < AT) return this.holdAt[k] + Math.max(0, Math.min(this.hold(k), into));
		return this.sceneAt[k] + Math.min(this.scene(k), this.pace.seconds(this.stops[k - 1], T));
	}

	/** Where the film is, f seconds in. */
	at(f: number): Place {
		const t = Math.max(0, Math.min(this.total, f));
		let k = 0;
		while (k < this.count - 1 && this.sceneAt[k + 1] <= t) k++;
		if (t >= this.holdAt[k]) return { T: this.stops[k], k, holding: true, into: t - this.holdAt[k] };
		const into = t - this.sceneAt[k];
		return { T: Math.min(this.stops[k], this.pace.after(this.stops[k - 1], into)), k, holding: false, into };
	}

	/** How much of card k's share of the rail its scene takes, 0 to 1: the rest is its hold. */
	split(k: number) {
		const scene = this.scene(k);
		const hold = this.hold(k);
		if (scene <= 0) return 0;
		if (hold <= 0) return 1;
		return Math.min(1 - LEAST, Math.max(LEAST, scene / (scene + hold)));
	}

	/** Where film time f is along the rail, 0 to 1. */
	rail(f: number) {
		const p = this.at(f);
		const s = this.split(p.k);
		const part = p.holding ? s + (1 - s) * (this.hold(p.k) > 0 ? Math.min(1, p.into / this.hold(p.k)) : 1) : s * (this.scene(p.k) > 0 ? p.into / this.scene(p.k) : 1);
		return Math.min(1, (p.k + part) / this.count);
	}

	/** The film time at a place along the rail, 0 to 1. */
	fromRail(u: number) {
		const x = Math.max(0, Math.min(1, u)) * this.count;
		const k = Math.min(this.count - 1, Math.floor(x));
		const part = x - k;
		const s = this.split(k);
		if (part < s) return this.sceneAt[k] + (part / s) * this.scene(k);
		return this.holdAt[k] + (s < 1 ? (part - s) / (1 - s) : 0) * this.hold(k);
	}
}
