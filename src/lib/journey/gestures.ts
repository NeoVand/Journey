/**
 * The reader's wheel, fingers and keys, turned into steps through the story: one gesture is one step, however far it
 * would have scrolled. The scroll bar only keeps count. Moving it some other way, by dragging it, a find in the page,
 * a screen reader, is a jump, read once it settles.
 */

/** Things that scroll, type or slide for themselves: gestures there are theirs. */
const OWN = 'dialog, textarea, input, select, [contenteditable], [role="slider"], [data-own-scroll]';
/** Keys belong to whatever has focus, if it's something that uses them. */
const KEYED = 'button, a, summary, [role="radiogroup"], [role="tablist"], ' + OWN;

/** A burst of wheel events is one gesture until it pauses this long. */
const WHEEL_GAP = 220;
/** How far a gesture has to go, in pixels, before it counts. */
const WHEEL_FAR = 30;
const TOUCH_FAR = 26;
/** No scrolling for this long, and no finger down: the page is still. */
const IDLE = 170;

export interface Steering {
	step(dir: 1 | -1, how: 'wheel' | 'touch' | 'key'): void;
	/** To a stop: 'first' and 'last' from Home and End, or a scroll offset the reader moved to some other way. */
	seek(to: 'first' | 'last' | number): void;
	/** Whatever is scrolling for the story right now: the page, or a side trip's own scroller. */
	scroller(): HTMLElement | Window;
}

export class Gestures {
	private wheelAt = -Infinity;
	private wheelSum = 0;
	private wheelSign = 0;
	private fired = false;
	private peak = 0;
	private low = Infinity;
	private decayed = false;

	private touching = false;
	private fromTouch = false;
	private touchX = 0;
	private touchY = 0;
	private touchFired = false;
	private touchOwn = false;

	private scrolledAt = -Infinity;
	private expect: number | null = null;
	private moved = false;
	private off: () => void;

	constructor(private steer: Steering) {
		const wheel = (e: WheelEvent) => this.wheel(e);
		const start = (e: TouchEvent) => this.touchStart(e);
		const move = (e: TouchEvent) => this.touchMove(e);
		const end = (e: TouchEvent) => this.touchEnd(e);
		const key = (e: KeyboardEvent) => this.key(e);
		const scroll = (e: Event) => this.scroll(e);
		addEventListener('wheel', wheel, { passive: false });
		addEventListener('touchstart', start, { passive: true });
		addEventListener('touchmove', move, { passive: true });
		addEventListener('touchend', end, { passive: true });
		addEventListener('touchcancel', end, { passive: true });
		addEventListener('keydown', key);
		// Scroll events don't bubble, but a listener that captures sees every scroller's.
		addEventListener('scroll', scroll, { passive: true, capture: true });
		this.off = () => {
			removeEventListener('wheel', wheel);
			removeEventListener('touchstart', start);
			removeEventListener('touchmove', move);
			removeEventListener('touchend', end);
			removeEventListener('touchcancel', end);
			removeEventListener('keydown', key);
			removeEventListener('scroll', scroll, { capture: true });
		};
	}

	dispose() {
		this.off();
	}

	private offset() {
		const s = this.steer.scroller();
		return s instanceof Window ? s.scrollY : s.scrollTop;
	}

	/** Scrolls the story's scroller to where it should be, without that counting as the reader's doing. */
	align(y: number) {
		const s = this.steer.scroller();
		const at = this.offset();
		if (Math.abs(at - y) < 1) return;
		this.expect = Math.round(y);
		s.scrollTo({ top: y, behavior: 'instant' });
	}

	/** Nothing under way: no finger down, no scrolling still going. Then the scroll bar can be put where the story is. */
	still(now = performance.now()) {
		if (this.touching || now - this.scrolledAt < IDLE) return false;
		this.fromTouch = false;
		if (this.moved) {
			this.moved = false;
			this.steer.seek(this.offset());
		}
		return true;
	}

	private wheel(e: WheelEvent) {
		// Pinching a trackpad arrives as a wheel with Ctrl held: that's zoom.
		if (e.ctrlKey || (e.target as Element | null)?.closest?.(OWN)) return;
		const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
		const dy = e.deltaY * unit;
		// Sideways: a row that scrolls across.
		if (Math.abs(e.deltaX * unit) > Math.abs(dy)) return;
		e.preventDefault();
		// When the reader moved the wheel, not when this ran: a busy page can't split one flick into several.
		const now = e.timeStamp;
		const sign = Math.sign(dy);
		if (now - this.wheelAt > WHEEL_GAP || (sign && sign !== this.wheelSign)) {
			this.wheelSum = 0;
			this.fired = false;
		}
		this.wheelAt = now;
		if (sign) this.wheelSign = sign;
		this.wheelSum += dy;
		const size = Math.abs(dy);
		if (this.fired) {
			// A trackpad's flick keeps sending as it coasts to a stop. A new flick on top of that one makes the
			// numbers jump back up, and that's a new gesture.
			this.peak = Math.max(this.peak, size);
			if (size < this.peak * 0.4) {
				this.decayed = true;
				this.low = Math.min(this.low, size);
			}
			if (this.decayed && size > 40 && size > this.low * 3) {
				this.fired = false;
				this.wheelSum = dy;
			}
		}
		if (!this.fired && Math.abs(this.wheelSum) >= WHEEL_FAR) {
			this.fired = true;
			this.peak = size;
			this.low = Infinity;
			this.decayed = false;
			this.steer.step(this.wheelSum > 0 ? 1 : -1, 'wheel');
		}
	}

	private touchStart(e: TouchEvent) {
		this.touching = true;
		this.fromTouch = true;
		this.touchFired = false;
		const t = e.touches[0];
		this.touchX = t.clientX;
		this.touchY = t.clientY;
		// Two fingers is a pinch; a row that swipes sideways or a slider is its own.
		this.touchOwn = e.touches.length > 1 || !!(e.target as Element | null)?.closest?.(`${OWN}, [data-swipe]`);
	}

	private touchMove(e: TouchEvent) {
		if (!this.touching || this.touchOwn || this.touchFired || e.touches.length > 1) return;
		const t = e.touches[0];
		const dy = this.touchY - t.clientY;
		const dx = this.touchX - t.clientX;
		if (Math.abs(dy) < TOUCH_FAR || Math.abs(dy) < Math.abs(dx) * 1.2) return;
		this.touchFired = true;
		this.steer.step(dy > 0 ? 1 : -1, 'touch');
	}

	private touchEnd(e: TouchEvent) {
		this.touching = false;
		this.scrolledAt = e.timeStamp;
	}

	private key(e: KeyboardEvent) {
		if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
		const t = e.target as Element | null;
		if (t?.closest?.(KEYED) || document.querySelector('dialog[open]')) return;
		const dir =
			e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)
				? 1
				: e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)
					? -1
					: 0;
		if (dir) {
			e.preventDefault();
			if (!e.repeat) this.steer.step(dir, 'key');
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			this.steer.seek(e.key === 'Home' ? 'first' : 'last');
		}
	}

	private scroll(e: Event) {
		const s = this.steer.scroller();
		const target = e.target === document ? window : e.target;
		if (target !== s) return;
		this.scrolledAt = e.timeStamp;
		const at = this.offset();
		if (this.expect !== null && Math.abs(at - this.expect) < 2) {
			this.expect = null;
			return;
		}
		this.expect = null;
		// A swipe's own scrolling, and its coasting after the finger lifts, are the swipe: already counted.
		if (this.fromTouch) return;
		this.moved = true;
	}
}
