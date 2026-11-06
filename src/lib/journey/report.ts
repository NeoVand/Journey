/**
 * A note of where the reader is, kept while the page runs and cleared when they leave it the normal way. A phone's
 * browser that runs out of memory closes the page without a word and loads it again; then the note is still there, and
 * the page can say where it stopped and offer the details to copy. Errors along the way go into the same note.
 */

const KEY = 'journey:alive';
/** A note older than this is from some other day, not from the page that just went away. */
const FRESH = 30 * 60 * 1000;

export interface Note {
	/** When the note was last written, and when this visit began. */
	at: number;
	started: number;
	version: string;
	where: string;
	T: number;
	trip: string | null;
	agent: string;
	screen: string;
	gpu: string;
	memory: string;
	ua: string;
	errors: string[];
}

const read = (): Note | null => {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as Note) : null;
	} catch {
		return null;
	}
};

/** What the last visit left behind if it ended without the page being closed, and forgets it. */
export function takeLastStop(): Note | null {
	const note = read();
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* storage can be off: then there's simply no report */
	}
	return note && Date.now() - note.at < FRESH ? note : null;
}

export function describe(note: Note) {
	const lines = [
		`The journey of a token, ${note.version}`,
		`Stopped at: ${note.where}${note.trip ? ` (side trip: ${note.trip})` : ''}, story time ${note.T.toFixed(3)}`,
		`After: ${Math.round((note.at - note.started) / 1000)} s`,
		`Agent: ${note.agent}`,
		`Screen: ${note.screen}`,
		`GPU: ${note.gpu}`,
		`Memory: ${note.memory}`,
		`Browser: ${note.ua}`
	];
	if (note.errors.length) lines.push('Errors:', ...note.errors.map((e) => `  ${e}`));
	return lines.join('\n');
}

export class Watch {
	note: Note;
	private last = 0;
	private away = false;

	constructor(base: Pick<Note, 'version' | 'gpu' | 'ua'>) {
		const now = Date.now();
		this.note = { at: now, started: now, where: '', T: 0, trip: null, agent: '', screen: '', memory: '', errors: [], ...base };
		const leave = () => {
			this.away = true;
			try {
				localStorage.removeItem(KEY);
			} catch {
				/* nothing to clear */
			}
		};
		addEventListener('pagehide', leave);
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') leave();
			else {
				this.away = false;
				this.write();
			}
		});
	}

	/** Called every frame; writes at most every second and a half. */
	beat(fields: Pick<Note, 'where' | 'T' | 'trip' | 'agent' | 'screen' | 'memory'>) {
		Object.assign(this.note, fields);
		const now = performance.now();
		if (now - this.last < 1500) return;
		this.last = now;
		this.write();
	}

	error(message: string) {
		this.note.errors = [...this.note.errors, message.slice(0, 300)].slice(-6);
		this.write();
	}

	private write() {
		if (this.away) return;
		this.note.at = Date.now();
		try {
			localStorage.setItem(KEY, JSON.stringify(this.note));
		} catch {
			/* storage full or off */
		}
	}
}
