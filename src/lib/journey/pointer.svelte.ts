/**
 * The conversation directs the picture. Each conversation has a few moments, chosen for what they mean and written in
 * narration/direction/<id>.json: at a phrase, the camera goes to a thing and it glows, and sometimes something happens
 * there, a drawer sliding out or the wheel spinning. A thing that lives in another part of the story is a peek: the
 * picture cuts there and back while the card stays.
 *
 * scripts/narration/direct.mjs makes the phrases into times. The camera's flight and the glow are visit.ts.
 */
import type { Narrator } from './narrator.svelte';
import type { World } from './world';

/**
 * One moment: when, what to show, what to do there, and where in the story it lives if not here. wide pulls back to see a
 * whole. A moment that shows nothing is a beat: something on the card changes in step with the words, and the camera stays.
 */
export type Moment = { t: number; show: string[]; together?: boolean; do?: string; index?: number; in?: string; hold?: number; wide?: boolean; front?: boolean };

/** What the page does for it. */
export interface Stagehand {
	/** Where in the story a card is, by its title: null if there's no such card. */
	whenIs(title: string): number | null;
	/** Cuts the picture to another moment of the story, or back home with null. */
	peek(T: number | null): void;
	/** As the camera sets off: one quiet note. */
	note(): void;
	/** A beat: the card does something in step with the words, the turn shown, say, while the camera stays where it is. */
	act?(what: string, index: number): void;
}

/** Set off a moment before the words, so the camera arrives with them. */
const LEAD = 0.3;
/** Seconds after its words that a moment is still worth showing, when a busy page drew nothing in between. */
const LATE = 2.5;
/** After a peek's cut, a moment for the other place to be drawn before the camera goes looking in it, and how long to keep looking on a slow page. */
const SETTLE = 0.3;
const PATIENCE = 1.5;

type Seen = Pick<World, 'visit' | 'hasThing' | 'leaveVisit' | 'endVisit' | 'visiting' | 'visitDone'>;

export class Pointer {
	/** The moment being shown, if any. */
	lit = $state.raw<Moment | null>(null);
	private id: string | null = null;
	/** How far into the conversation it was last frame, and the narrator's count of jumps then, to notice a jump. */
	private heard = 0;
	private seeks = 0;
	/** The next of the conversation's moments to come. */
	private next = 0;
	/** Showing something from another part of the story. */
	private peeking = false;
	/** A peek's visit, waiting for the cut to cover the change. */
	private pending: { m: Moment; at: number; still: boolean } | null = null;

	constructor(
		private world: Seen,
		private hand: Stagehand
	) {}

	/** Once a frame, after the picture is drawn. now is in seconds; move is false for reduced motion: no flights, no peeks. */
	update(now: number, narrator: Pick<Narrator, 'playing' | 'id' | 'time' | 'direction' | 'seeks'>, move: boolean) {
		const talking = narrator.playing && !!narrator.id;
		if (!talking) {
			if (this.lit || this.pending) this.letGo();
			return;
		}
		const id = narrator.id!;
		const t = narrator.time;
		const moments = narrator.direction[id];
		// A new conversation, or a jump within one: what was showing goes, and its moments are read on from here. Time
		// that only moved on further than usual is a slow frame, not a jump: what it passed is shown if still fresh.
		if (id !== this.id || narrator.seeks !== this.seeks || t < this.heard - 0.6) {
			if (this.lit || this.pending) this.letGo();
			const at = moments ? moments.findIndex((m) => m.t >= t - 0.05) : -1;
			this.next = at < 0 ? (moments?.length ?? 0) : at;
			// Landing part way through, the card catches up with the beats it missed: the last of each kind is where it is now.
			const caught: Record<string, Moment> = {};
			for (const m of moments?.slice(0, this.next) ?? []) if (!m.show.length && m.do) caught[m.do] = m;
			for (const m of Object.values(caught)) this.hand.act?.(m.do!, m.index ?? 0);
		}
		this.id = id;
		this.heard = t;
		this.seeks = narrator.seeks;

		// The cut has covered the change: go and look in the other place, once it has been drawn there.
		if (this.pending && now >= this.pending.at) {
			const { m, still } = this.pending;
			if (this.world.visit({ names: m.show, together: m.together, hold: m.hold, act: m.do, index: m.index, wide: m.wide, front: m.front, cutBack: true, still })) this.pending = null;
			else if (now >= this.pending.at + PATIENCE) this.home();
		}
		// A peek has stayed its time: home.
		if (this.peeking && !this.pending && this.world.visitDone) this.home();
		// A visit here has come back by itself.
		if (!this.peeking && !this.pending && this.lit && !this.world.visiting) this.lit = null;

		while (moments && this.next < moments.length && moments[this.next].t - LEAD <= t) {
			const m = moments[this.next++];
			if (!m.show.length) {
				if (m.do) this.hand.act?.(m.do, m.index ?? 0);
				continue;
			}
			if (t - m.t > LATE) continue;
			if (this.start(m, now, move)) break;
		}
	}

	/**
	 * Shows a moment: a peek at the card it names, if it names one, since that's where it is meant to be seen (the
	 * laptop as it was in the very first frame, say); otherwise here, if the thing is in the picture's world now.
	 */
	private start(m: Moment, now: number, move: boolean) {
		const visit = { names: m.show, together: m.together, hold: m.hold, act: m.do, index: m.index, wide: m.wide, front: m.front, still: !move };
		const T = move && m.in ? this.hand.whenIs(m.in) : null;
		if (T === null) {
			if (!this.world.hasThing(m.show)) return false;
			// In a peek, a second thing there is shown from there too, and the cut home waits for it.
			if (!this.world.visit({ ...visit, cutBack: this.peeking })) return false;
			this.lit = m;
			this.hand.note();
			return true;
		}
		this.world.endVisit();
		this.hand.peek(T);
		this.peeking = true;
		this.pending = { m, at: now + SETTLE, still: !move };
		this.lit = m;
		this.hand.note();
		return true;
	}

	/** Cuts back to the card's own moment; the page drops the visit under the cut. */
	private home() {
		this.hand.peek(null);
		this.peeking = false;
		this.pending = null;
		this.lit = null;
	}

	/** The talk stopped, or jumped: whatever is showing gives the picture back, quickly. */
	private letGo() {
		this.pending = null;
		if (this.peeking) this.home();
		else this.world.leaveVisit(true);
		this.lit = null;
	}

	/** Lets go gently: a visit flies back as it's left, so a flight setting off now leaves from wherever the camera is. */
	release() {
		this.letGo();
	}

	/** Drops everything at once: the reader leapt elsewhere, under a cut. */
	clear() {
		this.pending = null;
		if (this.peeking) this.hand.peek(null);
		this.peeking = false;
		this.world.endVisit();
		this.lit = null;
	}
}
