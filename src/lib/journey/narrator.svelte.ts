/**
 * The conversations behind the header's talk key: Nora and Theo talk each card through, slower and fuller than the card
 * can. One plays at a time. Once the reader has pressed it, it follows them: a card they arrive at and stay on starts its
 * own conversation, and one they leave fades out. Pausing stops following.
 *
 * The audio is made by scripts/narration/say.mjs from the scripts in narration/, with timed words beside it for a
 * transcript one day.
 */
import manifest from './narration.json';

export const TALKS: Record<string, { title: string; seconds: number }> = manifest;

/** "3:25", the way a podcast app shows a length. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** "3 minutes 25 seconds", for a screen reader. */
export const spoken = (s: number) => {
	const m = Math.floor(s / 60);
	const r = Math.floor(s % 60);
	return [m && `${m} minute${m === 1 ? '' : 's'}`, r && `${r} second${r === 1 ? '' : 's'}`].filter(Boolean).join(' ');
};

/** How long a card must stay before its conversation starts on its own, so a reader passing through isn't talked at. */
const SETTLE = 900;

export class Narrator {
	/** The conversation on the air, or paused. */
	id = $state<string | null>(null);
	playing = $state(false);
	/** Waiting for the audio to arrive. */
	waiting = $state(false);
	time = $state(0);
	duration = $state(0);
	/** Played to the end. */
	done = $state(false);
	/** The reader asked to listen, and hasn't paused since: arriving at a card starts its conversation. */
	listening = $state(false);
	/** The card the reader is on, or was last fully on: what the talk key would play. */
	here = $state<string | null>(null);
	readonly progress = $derived(this.duration ? Math.min(1, this.time / this.duration) : 0);

	private audio: HTMLAudioElement | null = null;
	private frame = 0;
	private fading = 0;
	private shown: string | null = null;
	private settle = 0;

	constructor(
		private url: (file: string) => string,
		/** Called with true while a conversation is audible, so the music can make room. */
		private onAir: (on: boolean) => void = () => {}
	) {}

	/** The talk key: start this card's conversation, pause it, or pick it up again. */
	toggle(id: string) {
		if (this.id === id && this.playing) this.pause();
		else this.play(id);
	}

	play(id: string) {
		const audio = this.element();
		this.listening = true;
		window.clearTimeout(this.settle);
		if (this.id !== id || this.done) {
			this.load(id, audio);
		}
		this.cancelFade(audio);
		audio.volume = 1;
		this.waiting = audio.readyState < 3;
		void audio.play().catch(() => {
			this.playing = false;
			this.waiting = false;
		});
	}

	pause() {
		this.listening = false;
		this.audio?.pause();
	}

	/** Stops, and forgets where it was. */
	close() {
		this.listening = false;
		window.clearTimeout(this.settle);
		this.fadeOut(true);
	}

	/** Silences it for good: the page is going, so nothing must be left talking with no key to stop it. */
	dispose() {
		// Server rendering says goodbye too, and there's nothing there to silence.
		if (typeof window === 'undefined') return;
		window.clearTimeout(this.settle);
		cancelAnimationFrame(this.frame);
		cancelAnimationFrame(this.fading);
		if (!this.audio) return;
		this.audio.pause();
		this.audio.removeAttribute('src');
		this.audio.load();
		this.audio = null;
	}

	/** Jumps back or ahead by some seconds, as the lock screen's buttons ask. */
	skip(by: number) {
		if (!this.audio || !this.id) return;
		this.audio.currentTime = Math.max(0, Math.min(this.duration || Infinity, this.audio.currentTime + by));
		this.time = this.audio.currentTime;
	}

	/**
	 * Where the reader is: the conversation id of the card fully on screen, or null between cards. Called as cards come
	 * and go. A conversation whose card has gone fades out; while listening, one whose card stays starts.
	 */
	reader(id: string | null) {
		if (id === this.shown) return;
		this.shown = id;
		if (id) this.here = id;
		window.clearTimeout(this.settle);
		if (this.id && id !== this.id && this.playing) this.fadeOut(false);
		if (id && this.listening && TALKS[id] && (id !== this.id || !this.playing)) {
			this.settle = window.setTimeout(() => {
				if (this.shown === id && this.listening) this.play(id);
			}, SETTLE);
		}
	}

	private element() {
		if (this.audio) return this.audio;
		const audio = new Audio();
		audio.preload = 'auto';
		audio.addEventListener('playing', () => {
			this.playing = true;
			this.waiting = false;
			this.done = false;
			this.onAir(true);
			this.tick();
		});
		audio.addEventListener('waiting', () => (this.waiting = true));
		audio.addEventListener('pause', () => {
			this.playing = false;
			this.onAir(false);
			cancelAnimationFrame(this.frame);
			this.time = audio.currentTime;
		});
		audio.addEventListener('ended', () => {
			this.done = true;
			this.time = this.duration;
		});
		audio.addEventListener('loadedmetadata', () => {
			if (Number.isFinite(audio.duration)) this.duration = audio.duration;
		});
		audio.addEventListener('error', () => {
			this.playing = false;
			this.waiting = false;
		});
		this.audio = audio;
		this.mediaKeys(audio);
		return audio;
	}

	private load(id: string, audio: HTMLAudioElement) {
		this.id = id;
		this.done = false;
		this.time = 0;
		this.duration = TALKS[id]?.seconds ?? 0;
		audio.src = this.url(`${id}.mp3`);
		audio.currentTime = 0;
		if ('mediaSession' in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: TALKS[id]?.title ?? 'The journey of a token',
				artist: 'Nora and Theo',
				album: 'The journey of a token',
				artwork: [{ src: this.url('../og.png'), sizes: '1200x630', type: 'image/png' }]
			});
		}
	}

	/** Smooth progress while playing; the element's own updates come only a few times a second. */
	private tick() {
		cancelAnimationFrame(this.frame);
		const step = () => {
			if (!this.audio || this.audio.paused) return;
			this.time = this.audio.currentTime;
			this.frame = requestAnimationFrame(step);
		};
		this.frame = requestAnimationFrame(step);
	}

	/** Lets a conversation go gently. Phones that won't change an element's volume just pause it. */
	private fadeOut(forget: boolean) {
		const audio = this.audio;
		if (!audio) return;
		this.cancelFade(audio);
		const finish = () => {
			audio.pause();
			audio.volume = 1;
			if (forget) {
				this.id = null;
				this.time = 0;
				this.done = false;
			}
		};
		if (audio.paused) return finish();
		const from = audio.volume;
		const t0 = performance.now();
		const step = () => {
			const k = Math.min(1, (performance.now() - t0) / 450);
			audio.volume = Math.max(0, from * (1 - k));
			if (k < 1 && audio.volume > 0.01 && Math.abs(audio.volume - from * (1 - k)) < 0.05) this.fading = requestAnimationFrame(step);
			else finish();
		};
		this.fading = requestAnimationFrame(step);
	}

	private cancelFade(audio: HTMLAudioElement) {
		cancelAnimationFrame(this.fading);
		audio.volume = 1;
	}

	private mediaKeys(audio: HTMLAudioElement) {
		if (!('mediaSession' in navigator)) return;
		const ms = navigator.mediaSession;
		const set = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
			try {
				ms.setActionHandler(action, fn);
			} catch {
				// Not every browser knows every action.
			}
		};
		set('play', () => this.id && this.play(this.id));
		set('pause', () => this.pause());
		set('stop', () => this.close());
		set('seekbackward', () => this.skip(-10));
		set('seekforward', () => this.skip(10));
		audio.addEventListener('timeupdate', () => {
			if (!this.duration || !Number.isFinite(audio.currentTime)) return;
			try {
				ms.setPositionState({ duration: this.duration, position: Math.min(audio.currentTime, this.duration), playbackRate: 1 });
			} catch {
				// A position past the end, while the file is still being measured.
			}
		});
	}
}
