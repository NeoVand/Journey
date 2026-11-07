<script lang="ts">
	import { GLOSSARY, HARNESSES, FORMS, LOGITS, RUN_WITH_CACHE, RUN_WITHOUT_CACHE, slug, TEN_AT, TEN_STEP, TEN_TURNS, TOP_K, TRACK_AT, TRACKS, TRIP, wheelOdds, wholePercents, type HarnessId, type TrackId } from './content';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import TripMap from './TripMap.svelte';
	import Tokenizer from './Tokenizer.svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Attachment } from 'svelte/attachments';
	import type { World } from './world';
	import { Pace, PACE, Playhead, trackPace } from './playhead';
	import { DESK, Director, PHONE } from './beats';
	import { Gestures } from './gestures';
	import { Sharpness } from './sharpness';
	import { SvelteSet } from 'svelte/reactivity';
	import Blueprint, { type Stage } from './Blueprint.svelte';
	import Icon from './Icon.svelte';
	import { ArrowLeft01Icon, ArrowRight01Icon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
	import { Sound } from './sound/engine';
	import { Conductor } from './sound/conductor';
	import { score, tripScore, TURN_NOTES } from './sound/score';
	import { chime, key, low, note, porcelain, tick as tickSound, VOICE_SOUNDS, whoosh } from './sound/synth';
	import { AGAIN, AGENT_MARK, CHECK_ICON, DRAWER_ICON, GATE_ICON, MAP, SPIN, SWAP, TRACK_ICON } from './icons';
	import { describe, takeLastStop, Watch, type Note } from './report';

	const ids: HarnessId[] = ['claude', 'codex', 'copilot'];
	const labels: Record<HarnessId, string> = { claude: 'Claude Code', codex: 'Codex', copilot: 'Copilot' };

	let harness = $state<HarnessId>('claude');
	let form = $state(1);
	let drawer = $state(-1);
	/** A drawer the reader has pulled out takes over from the story's. */
	let pulled = $state(-1);
	const shownDrawer = $derived(pulled >= 0 ? pulled : drawer);
	let check = $state(-1);
	let gate = $state(-1);
	let dark = $state(false);
	/** The title page is up: it brings its own ground, so the header's fade stays out of its heading. */
	let atTitle = $state(true);
	let driven = $state(false);
	let failed = $state(false);
	let section = $state(0);
	let part = $state<Stage>(null);
	let attention = $state(-1);
	let world: World | undefined;

	const spec = $derived(HARNESSES[harness]);
	const current = $derived(FORMS[form - 1]);

	const surfaceWords = $derived(
		spec.surface === 'terminal' ? 'keystrokes in a terminal' : 'keystrokes in the chat panel'
	);

	const callouts = $derived({
		prompt: {
			claude: 'The terminal, the VS Code extension and the desktop app all run the same program, so the journey starts the same way in each.',
			codex: 'The [[terminal app|tui]] runs the agent loop in its own process. The VS Code extension and desktop app reach the same engine through codex app-server.',
			copilot: 'VS Code owns the editor and the extension gathers context. Since mid-2026 the loop itself runs in a separate process, the Agent Host.'
		}[harness],
		wire: {
			claude: 'HTTPS to api.anthropic.com/v1/messages with stream: true, signed with an API key or your Claude login.',
			codex: 'The Responses API, streaming over [[SSE]] or a WebSocket, signed with an API key or your ChatGPT login.',
			copilot: 'To api.githubcopilot.com with a short-lived Copilot token, swapped for your GitHub login. Your GitHub token itself never reaches the model service.'
		}[harness],
		cache: {
			claude: 'Marks explicit cache breakpoints in the request. Reading from the cache costs a tenth of the normal input price.',
			codex: 'Relies on the Responses API’s automatic prefix caching, and keeps its instructions fixed for the session so the start stays identical.',
			copilot: 'GitHub’s service sits in between, so the extension can’t see hits or misses. Any caching at GitHub is undisclosed.'
		}[harness],
		thinking: {
			claude: 'Thinking blocks carry a signature and go back on the next turn, so the model keeps its train of thought.',
			codex: 'Reasoning can travel as encrypted items, which the client can’t read but must send back.',
			copilot: 'It depends on the model you picked. The extension shows either kind as a section you can fold away.'
		}[harness],
		toolcall: {
			claude: 'Grep is a tool of its own. The harness wraps [[ripgrep]] and returns matching lines with file names and numbers.',
			codex: 'There’s no search tool: the model writes [[rg|ripgrep]] into the shell tool. A simpler catalog, the same behavior.',
			copilot: 'Text search sits beside the language server’s symbols and a semantic index. The model picks one.'
		}[harness],
		stream: {
			claude: 'The Messages API streams thinking_delta, text_delta and input_json_delta events, then a stop reason.',
			codex: 'The Responses API streams typed events, such as response.function_call_arguments.delta.',
			copilot: 'GitHub’s API streams OpenAI-style chat chunks, whichever vendor is behind them.'
		}[harness],
		policy: {
			claude: 'Permission modes, allow, ask and deny rules, hooks, and in auto mode a classifier that reviews each call.',
			codex: 'Two dials: an approval policy for when to ask, and a sandbox mode for what’s allowed, plus execpolicy rules.',
			copilot: 'A confirmation card in the editor, with auto-approve lists and a cap on model calls before it stops to ask you.'
		}[harness],
		sandbox: {
			claude: '[[Seatbelt]] on macOS, bubblewrap on Linux. A proxy only lets approved domains through, so this request goes nowhere.',
			codex: '[[Seatbelt]], bwrap or MXC. In workspace-write mode the network is off by default.',
			copilot: 'No OS [[sandbox]] by default locally, and the network is wide open. The confirmation card has to catch this. The cloud agent runs in GitHub Actions.'
		}[harness],
		search: {
			claude: 'Grep wraps [[ripgrep]]. Read returns numbered lines, so the model can quote exact positions.',
			codex: 'No separate search tools: the model runs [[rg|ripgrep]] and sed through the shell.',
			copilot: 'Text search, the language server’s symbols, and semantic search over an [[embedding]] index.'
		}[harness],
		edit: {
			claude: 'Exact-string replacement. The old string must appear exactly once, and the file must have been read this session.',
			codex: 'apply_patch: a diff-like text format, applied one [[hunk]] at a time. The API can enforce its grammar while the model writes.',
			copilot: 'Edit tools plus a review surface: the diff lands in your editor to accept or reject, one [[hunk]] at a time.'
		}[harness],
		test: {
			claude: 'Two minutes by default. The result is a tool_result block carrying the tool_use_id it answers.',
			codex: 'The shell has a persistent [[PTY]] mode, so a process can keep running across turns. The result carries a call_id.',
			copilot: 'Commands run in the integrated terminal where you can see them, which doubles as a place to step in.'
		}[harness],
		loop: {
			claude: 'Resends everything. The API is [[stateless]], and the [[prefix cache]] makes that cheap.',
			codex: 'Also resends, with reasoning sealed as encrypted items. The API can keep state on its side instead.',
			copilot: 'Rebuilds the prompt from its parts every turn, trimming low-priority ones when the budget is tight.'
		}[harness],
		compact: {
			claude: 'Compacts automatically near the limit, or on /compact. Durable notes can live in CLAUDE.md and auto memory.',
			codex: 'A client-side /compact, or server-side compaction that returns an encrypted item to append.',
			copilot: 'A background summarizer watches the budget and can get ahead of the limit, with a simpler way to fall back on.'
		}[harness],
		door: {
			claude: 'Just one door to pass: Anthropic’s own, or Bedrock, Vertex or Foundry serving the same models.',
			codex: 'One front door. With a ChatGPT login the request goes to ChatGPT’s backend rather than the public API host.',
			copilot: 'Two front doors. GitHub checks your plan, policies and content exclusions, then forwards to the vendor, whose own door runs this list again.'
		}[harness]
	});

	const DRAWERS = $derived([
		{ name: 'Instructions', text: `Who the agent is, plus your project’s rules from ${spec.ruleFile}.` },
		{ name: 'Environment', text: 'Where you are: folder, git branch, operating system, date, shell.' },
		{ name: 'Tools', text: 'What it may ask to do, built in or from [[MCP]] servers. Each has a [[JSON Schema]] and costs tokens every [[turn]]. [[Skills]] wait on their shelf until needed.' },
		{ name: 'Conversation', text: 'Your prompt, plus anything you attached. Here, just the prompt.' }
	]);

	const GATES = $derived([
		{ name: 'Valid shape?', text: 'Is this a real tool, with arguments that fit?' },
		{ name: 'Allowed path?', text: 'Inside the project, and not on a deny list?' },
		{
			name: 'Policy',
			text:
				harness === 'codex'
					? 'May this run without asking? Your execpolicy rules can block a command here, as [[hooks]] do in other agents.'
					: 'May this run without asking? Your own [[hooks]] can block or rewrite it here.'
		},
		{ name: 'You, if asked', text: 'Reads often pass on their own. Writes and commands may come to you.' }
	]);

	const CHECKS = [
		{ name: 'Decrypt', text: 'The encryption ends here.' },
		{ name: 'Who are you?', text: 'Is this key valid, and whose is it?' },
		{ name: 'Rate limit', text: 'Too many requests or tokens this minute?' },
		{ name: 'Budget', text: 'Any quota or money left?' },
		{ name: 'Capacity', text: 'If every chip is busy, you wait or get a [[529]], and the harness quietly tries again.' }
	];

	/** The wheel is real: move the temperature and the odds change, spin and it draws from them. */
	let temperature = $state(1);
	let wins = $state(LOGITS.slice(0, TOP_K).map(() => 0));
	let spinning = $state(false);
	let landed = $state(-1);
	const odds = $derived(wheelOdds(temperature));
	/** As the reader sees them: whole numbers that always add up to 100. */
	const percents = $derived(wholePercents(odds));

	async function spinIt() {
		if (!world || spinning) return;
		spinning = true;
		landed = -1;
		cue('spin');
		const pick = await world.spinWheel(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
		wins[pick]++;
		landed = pick;
		spinning = false;
	}

	/** The map lets a reader go straight to any chapter, and a chapter's address can be shared. */
	let mapOpen = $state(false);
	let mapHere = $state('How a coding agent works');
	const headings = () => [...document.querySelectorAll<HTMLElement>('main h1, main h2')];
	// Before the 3D is running, and when it can't run, the page is plain text that simply scrolls.
	let cutTo = (title: string, at?: 'at-once') => headings().find((h) => h.textContent === title)?.scrollIntoView({ behavior: at ? 'instant' : 'auto' });
	let locate = () => mapHere;
	/** Scrolls the story on to where a turn is told. Set once the page has measured itself. */
	let reachTurn: (i: number) => void = () => {};

	/** A side trip: a detour of a few cards off the main road, which brings the reader back to exactly where they left. */
	let track = $state<TrackId | null>(null);
	let trackCard = $state(0);
	/** Set once the world is running. Before that, and without 3D, there's nowhere to go. */
	let enterTrack: (id: TrackId) => void = () => {};
	/** What to tell the reader if the page stopped last time, or something went wrong just now. */
	let report = $state<{ note: Note; why: 'stopped' | 'error' | 'asked' } | null>(null);
	let copied = $state(false);
	async function copyReport() {
		if (!report) return;
		const text = describe(report.note);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Older browsers: through a text box, the old way.
			const box = document.createElement('textarea');
			box.value = text;
			document.body.append(box);
			box.select();
			document.execCommand('copy');
			box.remove();
		}
		copied = true;
	}
	/** Sound: off until the reader turns it on, and remembered between visits. */
	let soundOn = $state(false);
	let toggleSound: () => void = () => {};
	/** The sounds of the interface itself: a step, a flight, the map. Quiet until sound is on. */
	/** The page's own sounds: the reader's steps and flights, and the controls they press. `n` and `m` say which, or how many. */
	type CueKind = 'step' | 'flight' | 'drop' | 'rise' | 'map' | 'enter' | 'spin' | 'harness' | 'cache' | 'temperature' | 'turn' | 'tokens';
	let cue: (kind: CueKind, n?: number, m?: number) => void = () => {};
	let leaveTrack: (atOnce?: boolean) => void = () => {};
	const trip = $derived(track ? TRACKS[track] : null);

	function takeTrip(id: TrackId) {
		mapOpen = false;
		enterTrack(id);
	}

	function openMap() {
		cue('map');
		mapHere = locate();
		mapOpen = true;
	}

	function jump(title: string) {
		mapOpen = false;
		leaveTrack(true);
		goto(resolve(`/#${slug(title)}`), { shallow: true, replace: true });
		cutTo(title);
	}

	function followAddress(at?: 'at-once') {
		const wanted = location.hash.slice(1);
		const heading = wanted && headings().find((h) => slug(h.textContent ?? '') === wanted);
		if (heading) cutTo(heading.textContent ?? '', at);
	}

	/** The last look at the whole world: the nine stops follow the token, and then the Enter key is yours. */
	let tripStep = $state(0);
	let tripLaps = $state(0);
	let tripDone = $state(false);
	const tripWords = $derived(
		tripLaps >= 10 ? 'Ten turns. That’s about what this fix took.' : tripLaps ? `Turn ${tripLaps} done. Press it again.` : 'Go on, press it.'
	);

	function pressEnter() {
		cue('enter');
		world?.pressEnter(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	}

	/** The real key works too, unless it already belongs to whatever has focus. */
	function enterKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.key === 'Enter' && tripDone && !mapOpen && !target?.closest('button, a, input, dialog')) pressEnter();
	}

	/** Moves the story one step on or back. Set once the page has measured itself. */
	let step: (dir: 1 | -1, how?: 'button' | 'key' | 'wheel' | 'touch') => void = () => {};
	let canBack = $state(false);
	let canOn = $state(true);

	/** The arrow keys step through the story, unless something on the page wants them for itself. */
	function arrowKey(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented || !driven) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable], [role="slider"], dialog') || document.querySelector('dialog[open]')) return;
		event.preventDefault();
		step(event.key === 'ArrowRight' ? 1 : -1, 'key');
		if (event.key === 'ArrowRight') pressBegin();
	}

	/** The title page's Begin key goes down with the → key it stands for, while the title page is still there to see it. */
	function pressBegin() {
		const key = document.querySelector<HTMLElement>('.begin');
		if (!key || key.closest<HTMLElement>('.pin')?.style.visibility === 'hidden') return;
		key.classList.add('pressed');
		setTimeout(() => key.classList.remove('pressed'), 150);
	}

	let tryOpen = $state(false);

	/** The ten turns follow the bars as they rise. Once a turn has been told, the reader can go back to it. */
	let turnReached = $state(-1);
	let turnPinned = $state(-1);
	const turn = $derived(turnPinned >= 0 ? turnPinned : Math.max(0, turnReached));
	const ticket = $derived(TEN_TURNS[turn]);

	function pinTurn(i: number) {
		if (i !== turn) cue('turn', i);
		turnPinned = i;
		world?.setTurn(i);
	}

	let cacheOn = $state(true);
	const ran = new Tween(RUN_WITH_CACHE, { duration: 900, easing: cubicOut });

	function setCache(on: boolean) {
		if (on !== cacheOn) cue('cache', on ? 1 : 0);
		cacheOn = on;
		world?.setCache(on);
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		ran.set(on ? RUN_WITH_CACHE : RUN_WITHOUT_CACHE, reduced ? { duration: 0 } : undefined);
	}

	/** Words the reader may not know get a dotted underline. Hover, focus or tap shows what they mean. */
	let tip = $state<{ key: string; text: string; x: number; y: number; below: boolean } | null>(null);
	const TIP_W = 290;

	let tipShownAt = 0;

	function showTip(el: HTMLElement, key: string) {
		tipShownAt = performance.now();
		const r = el.getBoundingClientRect();
		const w = Math.min(TIP_W, window.innerWidth - 24);
		const below = r.top < 150;
		tip = {
			key,
			text: GLOSSARY[key],
			x: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)),
			y: below ? r.bottom + 9 : r.top - 9,
			below
		};
	}

	/** Copy is written with [[shown|key]] marking a term, or just [[term]] when they are the same. */
	/** A term is a button, and Safari will start a new line right after one, so the punctuation that follows stays with it. */
	const pieces = (text: string) => {
		const parts: { text: string; key: string; tail: string }[] = [];
		for (const piece of text.split(/(\[\[[^\]]+\]\])/).filter(Boolean)) {
			const m = piece.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
			if (m) {
				parts.push({ text: m[1], key: (m[2] ?? m[1]).toLowerCase(), tail: '' });
				continue;
			}
			const last = parts.at(-1);
			const tail = last?.key ? (piece.match(/^[.,;:!?)’”]+/)?.[0] ?? '') : '';
			if (last && tail) last.tail = tail;
			if (piece.length > tail.length) parts.push({ text: piece.slice(tail.length), key: '', tail: '' });
		}
		return parts;
	};

	/** The pages that really do read or look different for each agent. */
	const DIFFERS = new Set([0, 1, 2, 3, 4, 5, 11, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29]);
	const tried = new SvelteSet<string>();
	const differs = $derived(DIFFERS.has(section));
	/** An agent breathes while this page has something to show for it that the reader has not looked at yet. */
	const hinting = (id: HarnessId) => differs && id !== harness && !tried.has(`${section}/${id}`);

	const nextAgent = $derived(ids[(ids.indexOf(harness) + 1) % ids.length]);

	/**
	 * On a phone only the lit row of a list shows its words. Each list keeps the height of its tallest state,
	 * or everything above it would jump every time a row of a different length lit up.
	 */
	/** Set once the world exists: measures, on a phone, how much of the screen each chapter's words take. */
	let measureRooms = () => {};

	function holdSteps() {
		document.querySelectorAll<HTMLElement>('.steps').forEach((list) => {
			list.style.minHeight = '';
			const rows = [...list.children];
			const lit = rows.filter((row) => row.classList.contains('on'));
			lit.forEach((row) => row.classList.remove('on'));
			let most = list.offsetHeight;
			rows.forEach((row) => {
				row.classList.add('on');
				most = Math.max(most, list.offsetHeight);
				row.classList.remove('on');
			});
			lit.forEach((row) => row.classList.add('on'));
			list.style.minHeight = `${most}px`;
		});
		measureRooms();
	}

	function choose(id: HarnessId) {
		if (id !== harness) cue('harness', ids.indexOf(id));
		tried.add(`${section}/${harness}`);
		tried.add(`${section}/${id}`);
		harness = id;
		world?.setHarness(id);
		tick().then(holdSteps);
	}

	const stage: Attachment<HTMLCanvasElement> = (canvas) => {
		let disposed = false;
		let raf = 0;
		let cleanup = () => {};
		const params = new URLSearchParams(location.search);
		const still = params.has('still');

		// If the last visit ended without the page being closed, a phone's browser most likely ran out of memory.
		const before = takeLastStop();
		if (before && !still) report = { note: before, why: 'stopped' };
		// The page's own date says which version this is: each deploy publishes it afresh.
		const watch = new Watch({ version: `published ${document.lastModified}`, gpu: 'not started', ua: navigator.userAgent });
		const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
			const message = 'reason' in e ? String(e.reason?.stack ?? e.reason) : `${e.message} at ${e.filename?.split('/').pop()}:${e.lineno}`;
			watch.error(message);
			if (!report) report = { note: watch.note, why: 'error' };
		};
		addEventListener('error', onError);
		addEventListener('unhandledrejection', onError);
		canvas.addEventListener('webglcontextlost', () => watch.error('WebGL context lost'));

		(async () => {
			const { World } = await import('./world');
			if (disposed) return;
			let w: World;
			try {
				w = await World.create(canvas);
			} catch (error) {
				// Without WebGL the page is still the whole explanation, over the plain sky.
				console.warn('The 3D scene could not start:', error);
				failed = true;
				return;
			}
			if (disposed) {
				w.dispose();
				return;
			}
			world = w;
			w.setHarness(harness);
			{
				const gl = w.stage.renderer.getContext();
				const info = gl.getExtension('WEBGL_debug_renderer_info');
				watch.note.gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
			}
			let noted = 0;

			const sections = [...document.querySelectorAll<HTMLElement>('[data-beat]')];
			const pins = sections.flatMap((s, i) =>
				[...s.querySelectorAll<HTMLElement>('.pin')].map((el) => {
					// A card belongs to one world for its whole life, so its colours can never flip while it is showing.
					el.dataset.tone = i >= 8 && i < 19 ? 'inside' : 'sky';
					return {
						el,
						i,
						from: Number(el.dataset.in ?? 0.03),
						end: Number(el.dataset.out ?? 0.92),
						fade: Number(el.dataset.fade ?? 0.07)
					};
				})
			);
			const lastPin = pins.length - 1;
			// The smallest the screen gets: steady while a phone's toolbars come and go.
			const smallest = document.createElement('div');
			smallest.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
			document.body.append(smallest);

			/*
			 * The story is a run of beats, one per card: from where the last card's scene finished to where this one's has.
			 * Card n's beat ends at stop n, just before its words go. The title page is stop 0, and the very end the last.
			 */
			const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const touch = window.matchMedia('(pointer: coarse)').matches;
			const pace = new Pace(PACE);
			// The sentence types itself on the title page. If it already has, the stretch that types it has nothing to show.
			pace.quicker = (span) => (span.key === 'typing' ? 1 / (1 - 0.85 * w.typedAhead) : 1);
			// A breath before the words go, the same by the clock everywhere: pressing on, something moves at once.
			const stops = [
				0,
				...pins.slice(1, -1).map((p) => {
					const end = p.i + p.end;
					return end - Math.min(0.012, pace.rate(end - 0.0005) * 0.08);
				}),
				sections.length
			];
			const director = new Director(stops, pace, touch ? PHONE : DESK);

			// Where the reader was before the world existed, in the plain page that simply scrolled: the nearest card.
			const before = (() => {
				const y = window.scrollY;
				let i = 0;
				while (i < sections.length - 1 && y >= sections[i + 1].offsetTop) i++;
				const into = Math.min(1, Math.max(0, (y - sections[i].offsetTop) / Math.max(1, sections[i].offsetHeight - (i === sections.length - 1 ? window.innerHeight : 0))));
				return director.behind(i + into);
			})();
			director.go(before);

			/** The scroll bar just keeps count: a screen of it per beat, so it shows how far along the story is. */
			const runway = document.querySelector<HTMLElement>('[data-runway]')!;
			let beat = 1;
			const measure = () => {
				beat = Math.max(360, smallest.offsetHeight);
				runway.style.height = `${(stops.length - 1) * beat + window.innerHeight}px`;
			};
			const yOf = (k: number) => k * beat;

			/** Set once the trip code below exists; a trip measures its own sections. */
			let remeasureTrip = () => {};
			const dprFor = () => Math.min(window.devicePixelRatio || 1, 2);
			let dpr = dprFor();
			// The canvas is as tall as the screen ever gets, so a phone's toolbar sliding away neither stretches
			// the picture nor costs a rebuild of every render target in the middle of the reader's first scroll.
			let drawnW = 0;
			let drawnH = 0;
			/** Set once the reader's gestures are being followed: puts the scroll bar where the story is. */
			let align = () => {};
			const resize = () => {
				measure();
				remeasureTrip();
				measureRooms();
				// However the screen changed, the reader stays where they are in the story.
				align();
				if (canvas.clientWidth === drawnW && canvas.clientHeight === drawnH) return;
				drawnW = canvas.clientWidth;
				drawnH = canvas.clientHeight;
				w.resize(drawnW, drawnH, dpr);
			};
			performance.mark('journey:built');
			w.stage.warmUp();
			performance.mark('journey:warm');
			resize();
			window.addEventListener('resize', resize);

			const head = new Playhead(pace, director.target, reduced);
			let T = head.T;
			let px = 0;
			let py = 0;
			let mx = 0;
			let my = 0;
			const move = (e: PointerEvent) => {
				mx = e.clientX / window.innerWidth - 0.5;
				my = e.clientY / window.innerHeight - 0.5;
			};
			window.addEventListener('pointermove', move, { passive: true });

			// A press on the scene itself. A drag or a scroll isn't one, and neither is anything aimed at the page's own controls.
			let downAt: { x: number; y: number; time: number } | null = null;
			const clip = (e: PointerEvent) => [(e.clientX / drawnW) * 2 - 1, 1 - (e.clientY / drawnH) * 2] as const;
			const onScene = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('button, a, input, textarea, select, label, dialog');
			const down = (e: PointerEvent) => {
				downAt = onScene(e) ? { x: e.clientX, y: e.clientY, time: performance.now() } : null;
			};
			const up = (e: PointerEvent) => {
				if (downAt && onScene(e) && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10 && performance.now() - downAt.time < 500) w.pressAt(...clip(e));
				downAt = null;
			};
			window.addEventListener('pointerdown', down, { passive: true });
			window.addEventListener('pointerup', up, { passive: true });
			w.onPress = (what) => {
				if (what === 'wheel') spinIt();
				else pressEnter();
			};
			// With a mouse, the cursor says what can be pressed. A few times a second is plenty for that.
			let aiming: [number, number] | null = null;
			let lastAim = 0;
			const aim = (e: PointerEvent) => {
				aiming = e.pointerType === 'mouse' && onScene(e) ? [...clip(e)] : null;
			};
			window.addEventListener('pointermove', aim, { passive: true });

			let last = performance.now();
			let time = 0;
			const sharpness = new Sharpness(dpr, w.stage.ao.enabled);


				/*
				 * On a phone the words sit on the bottom of the screen and the picture has everything above them. Each card leaves
				 * its own room, and the camera eases from one card's room to the next only in the moment between them, while the
				 * words are away. Cards in one chapter that are nearly the same height share the shortest room, so the picture
				 * holds still through them. Measured against the screen with Safari's toolbar showing, so the words can only ever
				 * sit lower than the picture allows for, never over it.
				 */
				const ease = (a: number, b: number, k: number) => a + (b - a) * k * k * (3 - 2 * k);
				const within = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
				let rooms: number[] = [];
				measureRooms = () => {
					if (canvas.clientWidth >= canvas.clientHeight * 0.9) {
						w.roomAt = null;
						w.titleFloor = null;
						w.ceiling = 0;
						return;
					}
					const screen = smallest.offsetHeight;
					const picture = canvas.clientHeight;
					// The title page's words sit at the top: its picture starts a little below the last of them.
					const title = [...pins[0].el.children].filter((k) => (k as HTMLElement).offsetParent) as HTMLElement[];
					const titleEnd = Math.max(...title.map((k) => k.offsetTop + k.offsetHeight));
					w.titleFloor = Math.min(0.62, (titleEnd + 18) / picture);
					const bar = document.querySelector<HTMLElement>('header.bar');
					w.ceiling = bar ? (bar.offsetTop + bar.offsetHeight + 4) / picture : 0;
					rooms = pins.map((p) => {
						const first = p.el.firstElementChild as HTMLElement | null;
						// From the top of the words' ground to the bottom of the card, which sits on the bottom of the screen.
						return first ? (screen - (p.el.offsetHeight - first.offsetTop + 14)) / picture : 1;
					});
					// The title page keeps its words at the top and frames its picture for itself.
					rooms[0] = rooms[1];
					for (let n = 1; n < rooms.length; n++) {
						if (pins[n].i !== pins[n - 1].i || Math.abs(rooms[n] - rooms[n - 1]) > 0.06) continue;
						const low = Math.min(rooms[n], rooms[n - 1]);
						for (let m = n; m >= 0 && pins[m].i === pins[n].i && Math.abs(rooms[m] - low) <= 0.06; m--) rooms[m] = low;
						rooms[n] = low;
					}
					const starts = pins.map((p) => p.i + p.from - p.fade * 0.3);
					const ends = pins.map((p) => p.i + p.end + p.fade);
					w.roomAt = (at) => {
						// From one card's room to the next across the moment they hand over: the gap between them, or, where the
						// next arrives before the last has gone, the time they share.
						for (let n = 0; n < pins.length - 1; n++) {
							const a = Math.min(ends[n], starts[n + 1]);
							const b = Math.max(ends[n], starts[n + 1], a + 0.01);
							if (at < a) return rooms[n];
							if (at < b) return ease(rooms[n], rooms[n + 1], within(at, a, b));
						}
						return rooms[rooms.length - 1];
					};
				};
				measureRooms();
				const diveEl = document.querySelector<HTMLElement>('[data-dive]')!;
				const edgeEl = document.querySelector<HTMLElement>('[data-edge]')!;
				const barEl = document.querySelector<HTMLElement>('header.bar')!;
				const themeEl = document.querySelector('meta[name="theme-color"]');
				let edgeShade = -1;
				let edgeNudge = 0;
				const ROOM_EDGE = '#fdf6e8';
				/** The map's paper, and the widest it opens. Kept in step with TripMap.svelte. */
				const MAP_PAPER = '#fdf7e9';
				const MAP_WIDTH = 452;
				const mixSky = (k: number) => `rgb(${[198, 229, 253].map((sky, i) => Math.round(sky + ([6, 15, 38][i] - sky) * k)).join(' ')})`;
				// The sky's middle in the late light of the finale, as world.ts paints it.
				const mixLate = (k: number) => `rgb(${[198, 229, 253].map((sky, i) => Math.round(sky + ([242, 226, 220][i] - sky) * k)).join(' ')})`;
				const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
				const shownKey: number[] = [];
				const inAt = (n: number, at: number) => (n === 0 ? 1 : seg(at - pins[n].i, pins[n].from - pins[n].fade * 0.3, pins[n].from + pins[n].fade * 0.7));
				const outAt = (n: number, at: number) => (n === lastPin ? 0 : seg(at - pins[n].i, pins[n].end, pins[n].end + pins[n].fade));
				const fade = () => {
					// Cards belong to the playhead, not the scroll bar, so text and scene can never drift apart.
					pins.forEach(({ el }, n) => {
						const inK = inAt(n, T);
						const outK = outAt(n, T);
						const k = Math.min(inK, 1 - outK);
						const key = k <= 0 ? -1 : Math.round(k * 200) + (outK > 0 ? 1000 : 0);
						if (shownKey[n] === key) return;
						shownKey[n] = key;
						el.style.opacity = String(k);
						// Not just see-through: Safari picks its toolbar colours from what's stacked at the screen's edge, even at zero opacity.
						el.style.visibility = k <= 0 ? 'hidden' : '';
						const moving = k > 0 && k < 1;
						el.style.transform = moving ? `translateY(${(1 - inK) * 14 - outK * 10}px)` : 'none';
						if (n === 0) el.style.pointerEvents = k > 0.6 ? 'auto' : 'none';
						el.inert = k < 0.1;
					});
					diveEl.style.opacity = String(w.state.dive);
					diveEl.style.visibility = w.state.dive > 0 ? '' : 'hidden';
					// A phone browser paints the page's own colour around the page, so it has to go dark with the world.
					// Inside the harness it's the cream of the room instead.
					// On a phone the map covers the whole screen, so the edges take its paper's colour while it's open.
					// At the very end the light goes over to late afternoon, and the edges warm with it.
					const dusk = Math.round(w.state.dusk * 16);
					const shade = mapOpen && innerWidth <= MAP_WIDTH ? -3 : w.trackIn && w.trackId === 'harness' ? -2 : w.trackIn ? 0 : dusk > 0 ? 100 + dusk : Math.round((w.state.inside ? 1 : w.state.dive) * 32);
					if (shade !== edgeShade) {
						edgeShade = shade;
						const tone = shade === -3 ? MAP_PAPER : shade === -2 ? ROOM_EDGE : shade > 100 ? mixLate((shade - 100) / 16) : mixSky(shade / 32);
						document.documentElement.style.backgroundColor = tone;
						edgeEl.style.setProperty('--tone', tone);
						// The top strip comes from the header's own colour on a phone, so it gets the same tone.
						barEl.style.setProperty('--tone', tone);
						// The ground a side trip's header stands on: the room's cream inside the harness, the sky outside.
						document.documentElement.style.setProperty('--ground', shade === -2 ? '251 241 221' : '214 234 251');
						// Safari only reads those colours again after a layout, so give each one.
						edgeNudge = 1 - edgeNudge;
						edgeEl.style.paddingBottom = `${edgeNudge}px`;
						barEl.style.borderBottom = `${edgeNudge}px solid transparent`;
						themeEl?.setAttribute('content', tone);
					}
				};

				const publish = () => {
				form = w.state.form;
				// Only the header follows this. It switches while the screen is black, so nobody sees it happen.
				dark = T >= 7.96 && T < 19.02;
				atTitle = T < 0.45;
				fade();
				const starts = [2.04, 2.2, 2.36, 2.52];
				let dr = -1;
				starts.forEach((a, i) => {
					if (T >= a) dr = i;
				});
				drawer = T > 2.74 ? 4 : dr;
				pulled = w.pulledDrawer;
				check = T < 5 ? -1 : Math.min(5, Math.floor(((T - 5.04) / 0.58) * 5));
				// The first call stops at the second gate, and the list has to say so.
				gate = T < 20.04 ? -1 : T < 20.4 ? 1 : Math.min(4, Math.floor(((T - 20.4) / 0.58) * 5));
				section = Math.min(sections.length - 1, Math.floor(T));
				part = T < 14.15 ? null : T < 14.3 ? 'embed' : T < 14.625 ? 'attn' : T < 14.7 ? 'ffn' : T < 14.865 ? 'stack' : 'head';
				attention = T < 14.358 ? -1 : T < 14.4 ? 0 : T < 14.43 ? 1 : T < 14.5 ? 2 : 3;
				tripStep = w.trip.step;
				tripLaps = w.trip.laps;
				tripDone = T >= 32.88;
				const reached = T < TEN_AT ? -1 : Math.min(TEN_TURNS.length - 1, Math.floor((T - TEN_AT) / TEN_STEP));
				if (reached !== turnReached) {
					turnReached = reached;
					turnPinned = -1;
					w.setTurn(Math.max(0, reached));
				}
			};

			const frame = (now: number) => {
				raf = requestAnimationFrame(frame);
				// Never below zero. A frame's timestamp is when it began, which can be well before a long warm-up finished,
				// and a negative step would hold the opening back by however long that took.
				const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
				last = now;
				time += dt;
				// Once the reader's hands are still, the scroll bar goes to where the story is.
				if (gestures.still(now)) (track ? alignTrip : align)();
				play(dt);
				steppable();
				playTrip(dt);
				showGauge();
				px += (mx - px) * (1 - Math.exp(-dt * 3));
				py += (my - py) * (1 - Math.exp(-dt * 3));
				w.update(track && tripT !== null ? tripT : T, reduced ? 0 : time, dt, reduced ? 0 : px, reduced ? 0 : py, reduced);
				if (soundOn) playSound(dt);
				publish();
				if (now - noted > 1500) {
					noted = now;
					const mem = w.stage.renderer.info.memory;
					watch.beat({
						where: locate(),
						T,
						trip: track,
						agent: harness,
						screen: `${innerWidth}x${innerHeight} at ${devicePixelRatio}x, drawing at ${dpr}x`,
						memory: `${mem.textures} textures, ${mem.geometries} geometries`
					});
				}

				if (now - lastAim > 140) {
					lastAim = now;
					document.documentElement.style.cursor = aiming && w.overAt(aiming[0], aiming[1]) ? 'pointer' : '';
				}

				const change = params.has('debug') ? null : sharpness.frame(dt);
				if (change) {
					dpr = change.dpr;
					w.resize(drawnW, drawnH, dpr);
					w.stage.setOcclusion(change.occlusion);
				}
			};

			const cutEl = document.querySelector<HTMLElement>('[data-cut]')!;
			let cutTimer = 0;
			/** Under a quick cover, the colour of the world on the other side of it. */
			const cover = (to: number, fn: () => void, colour = to >= 7.96 && to < 19.02 ? '#060f26' : '#d6eafb') => {
				if (reduced || still) return fn();
				cutEl.style.background = colour;
				cutEl.classList.add('on');
				clearTimeout(cutTimer);
				cutTimer = window.setTimeout(() => {
					fn();
					requestAnimationFrame(() => requestAnimationFrame(() => cutEl.classList.remove('on')));
				}, 150);
			};

			/*
			 * Every frame, the playhead does what the director asks: plays the beat under way at its authored pace,
			 * finishes one on the way briskly, or, where even briskly would take too long, cuts.
			 */
			let cutting = false;
			/** How fast the story is playing this frame, times the authored pace: above 1 on the way past a card. */
			let speed = 1;
			/** Tells the sound the story was cut, once the sound exists. */
			let heardCut: (to: number) => void = () => {};
			const play = (dt: number) => {
				if (cutting) return;
				const m = director.move(head.T);
				speed = m.speed;
				if (m.cut === undefined) {
					T = head.step(director.target, dt, m.speed);
					return;
				}
				const to = m.cut;
				cutting = true;
				cover(to, () => {
					head.jump(to);
					T = to;
					heardCut(to);
					cutting = false;
				});
			};

			// A cut, not a flight: the long way round would be minutes of scenery the reader didn't ask for. It lands where
			// the card's words have arrived, and its scene plays from there.
			const pinOf = (title: string) => pins.find((p) => p.el.querySelector('h1, h2')?.textContent === title);
			const startOf = (p: (typeof pins)[number]) => (p.i === 0 ? 0 : p.i + p.from + p.fade * 0.8);
			cutTo = (title, at) => {
				const pin = pinOf(title);
				if (!pin) return;
				const nextT = startOf(pin);
				const land = () => {
					head.jump(nextT);
					T = nextT;
					heardCut(nextT);
					director.go(pins.indexOf(pin));
					align();
				};
				if (reduced || still || at) return land();
				cover(nextT, land);
			};

			// One card at a time, from the buttons, the keys, a flick of the wheel or a swipe: see Director.
			step = (dir, how = 'button') => {
				if (track) return stepTrip(dir);
				const moved = dir === 1 ? director.next(head.T) : director.back(head.T);
				if (!moved) return;
				if (how === 'button' || how === 'key') cue('step');
				align();
			};
			const seekStory = (to: 'first' | 'last' | number) => {
				director.go(to === 'first' ? 0 : to === 'last' ? director.last : Math.round(to / beat));
				align();
			};
			const steppable = () => {
				if (track) return;
				canBack = director.goal > 0 || T > stops[0] + 0.004;
				canOn = director.goal < director.last;
			};

			/*
			 * The step buttons show the beat under way: the way it's going fills up as it plays, by the clock, so the reader
			 * can see how long is left. When it's done, the next button gives a small nudge: your turn.
			 */
			const nextEl = document.querySelector<HTMLElement>('[data-step="next"]')!;
			const backEl = document.querySelector<HTMLElement>('[data-step="back"]')!;
			let gaugeKey = '';
			let wasPlaying = false;
			const showGauge = () => {
				const g = track ? (tripDirector && tripHead ? tripDirector.gauge(tripHead.T) : { dir: 0 as const, done: 1 }) : director.gauge(T);
				const shown = reduced ? { dir: 0 as const, done: 1 } : g;
				const key = `${shown.dir}:${Math.round(shown.done * 500)}`;
				if (key === gaugeKey) return;
				gaugeKey = key;
				// At rest the fill keeps its last length while it fades.
				if (shown.dir === 1) nextEl.style.setProperty('--done', shown.done.toFixed(4));
				if (shown.dir === -1) backEl.style.setProperty('--done', shown.done.toFixed(4));
				nextEl.classList.toggle('playing', shown.dir === 1);
				backEl.classList.toggle('playing', shown.dir === -1);
				if (wasPlaying && shown.dir === 0) {
					nextEl.classList.remove('ready');
					// Starts the nudge over, even if the last one is still going.
					void nextEl.offsetWidth;
					nextEl.classList.add('ready');
				}
				wasPlaying = shown.dir === 1;
			};

			/* ---- side trips ---- */
			// A trip has its own scroller over the page, so the page itself, and the reader's place in it, stay where they were.
			let tripEl: HTMLElement | null = null;
			let tripPins: HTMLElement[] = [];
			let tripHead: Playhead | null = null;
			let tripDirector: Director | null = null;
			/** A trip's scroll bar keeps count the same way: a screen of it per beat. */
			let tripBeat = 1;
			/** Whether the trip's first scene has been set going, once the reader has arrived. */
			let tripStarted = false;
			/** How far the trip has taken over the picture, 0 to 1, and where it's heading. */
			let blend = 0;
			let blendGoal = 0;
			/** The story time the world is posed at during a trip: null to keep the reader's own. */
			let tripT: number | null = null;
			let flying = false;
			let afterFlight: (() => void) | null = null;
			/** Inside a room: how far the drop from above has come, 0 to 1, where it's heading, and what follows. */
			let arrive = 1;
			let arriveGoal = 1;
			let afterArrive: (() => void) | null = null;
			/** What each place you drop into is made of: the colour to pass through on the way in, and the cards' own tone. */
			const PLACES = {
				harness: { cover: '#f4e2bd', tone: 'warm' },
				sandbox: { cover: '#d6eafb', tone: 'sky' },
				memory: { cover: '#d6eafb', tone: 'sky' }
			} as const;
			const placeOf = (id: TrackId | null) => PLACES[id === 'sandbox' || id === 'memory' ? id : 'harness'];
			let comeBackTo: HTMLElement | null = null;
			/** Set once the reader has gone past the last card, so the way home starts only once. */
			let homeward = false;
			const cards = () => tripPins.length;
			const measureTrip = () => {
				if (!tripEl) return;
				tripBeat = Math.max(360, tripEl.clientHeight);
				const runway = tripEl.querySelector<HTMLElement>('[data-runway]');
				// With a little room past the last card: scrolling on into it is the way home.
				if (runway) runway.style.height = `${(cards() + 0.6) * tripBeat + tripEl.clientHeight}px`;
				// On a phone a trip's picture, like the story's, takes all the room above each card's words, and eases to the
				// next card's room only in the moment between them.
				if (canvas.clientWidth >= canvas.clientHeight * 0.9) {
					w.tripRoomAt = null;
					return;
				}
				const screen = smallest.offsetHeight;
				const picture = canvas.clientHeight;
				// A trip's header carries its name, which can take two lines.
				const bar = document.querySelector<HTMLElement>('header.bar');
				w.ceiling = bar ? (bar.offsetTop + bar.offsetHeight + 4) / picture : 0;
				const rooms = tripPins.map((el) => {
					const first = el.firstElementChild as HTMLElement | null;
					return first ? (screen - (el.offsetHeight - first.offsetTop + 14)) / picture : 1;
				});
				w.tripRoomAt = (t) => {
					const n = Math.max(0, Math.min(rooms.length - 1, Math.floor(t)));
					const into = t - n;
					if (n < rooms.length - 1 && into > 0.93) return ease(rooms[n], rooms[n + 1], within(into, 0.93, 1.01));
					if (n > 0 && into < 0.01) return ease(rooms[n - 1], rooms[n], within(into + 1, 0.93, 1.01));
					return rooms[n];
				};
			};
			remeasureTrip = measureTrip;
			// Like the story's own cards: on from a little way in, off just before the next.
			const cardIn = (n: number, t: number) => (n === 0 ? 1 : seg(t - n, 0.01, 0.08));
			const cardOut = (n: number, t: number) => (n === cards() - 1 ? 0 : seg(t - n, 0.86, 0.93));
			const tripStops = () => [0, ...tripPins.slice(0, -1).map((_, n) => n + 0.86 - 0.012), cards()];
			// Under a quick cover, for a reader coming from too far away to fly, or who asked for less motion.
			const swap = (fn: () => void, cover = '#d6eafb') => {
				if (reduced || still) return fn();
				cutEl.style.background = cover;
				cutEl.classList.add('on');
				clearTimeout(cutTimer);
				cutTimer = window.setTimeout(() => {
					fn();
					requestAnimationFrame(() => requestAnimationFrame(() => cutEl.classList.remove('on')));
				}, 150);
			};
			const alignTrip = () => {
				if (tripDirector) gestures.align(tripDirector.goal * tripBeat);
			};
			// Past the last card, a step on is the way home.
			const stepTrip = (dir: 1 | -1) => {
				if (!tripEl || !tripHead || !tripDirector) return;
				const moved = dir === 1 ? tripDirector.next(tripHead.T) : tripDirector.back(tripHead.T);
				if (!moved) {
					if (dir === 1) leaveTrack();
					return;
				}
				alignTrip();
			};
			const seekTrip = (to: 'first' | 'last' | number) => {
				if (!tripDirector) return;
				if (typeof to === 'number' && to > (tripDirector.last + 0.25) * tripBeat) {
					if (!homeward && !flying) {
						homeward = true;
						leaveTrack();
					}
					return;
				}
				tripDirector.go(to === 'first' ? 0 : to === 'last' ? tripDirector.last : Math.round(to / tripBeat));
				alignTrip();
			};
			let tripCutting = false;
			let tripSpeed = 1;
			const playTrip = (dt: number) => {
				if (blend !== blendGoal) {
					blend = Math.min(1, Math.max(0, blend + Math.sign(blendGoal - blend) * (dt / 1.4)));
					if (blend === blendGoal && afterFlight) {
						const then = afterFlight;
						afterFlight = null;
						then();
					}
				}
				w.trackBlend = blend * blend * (3 - 2 * blend);
				if (arrive !== arriveGoal) {
					arrive = Math.min(1, Math.max(0, arrive + Math.sign(arriveGoal - arrive) * (dt / 1.5)));
					if (arrive === arriveGoal && afterArrive) {
						const then = afterArrive;
						afterArrive = null;
						then();
					}
				}
				w.trackArrive = arrive;
				if (!track || !tripEl || !tripHead || !tripDirector) return;
				// Once the reader has arrived, the first card's scene plays by itself.
				if (!tripStarted && !flying) {
					tripStarted = true;
					if (tripDirector.goal === 0) tripDirector.go(1);
					alignTrip();
				}
				if (!tripCutting) {
					const m = tripDirector.move(tripHead.T);
					tripSpeed = m.speed;
					if (m.cut === undefined) tripHead.step(tripDirector.target, dt, m.speed);
					else {
						const to = m.cut;
						const head = tripHead;
						tripCutting = true;
						swap(() => {
							head.jump(to);
							heardCut(to);
							tripCutting = false;
						}, placeOf(track).cover);
					}
				}
				const t = tripHead.T;
				w.trackT = t;
				let most = 0;
				let at = 0;
				tripPins.forEach((el, n) => {
					const inK = cardIn(n, t);
					const outK = cardOut(n, t);
					const k = Math.min(inK, 1 - outK);
					if (k > most) {
						most = k;
						at = n;
					}
					el.style.opacity = String(k);
					el.style.visibility = k <= 0 ? 'hidden' : '';
					el.style.transform = k > 0 && k < 1 ? `translateY(${(1 - inK) * 14 - outK * 10}px)` : 'none';
					el.inert = k < 0.1;
				});
				if (at !== trackCard && most > 0.5) trackCard = at;
				canBack = tripDirector.goal > 0 || t > 0.004;
				// At the end, a step forward is the way home.
				canOn = true;
			};

			enterTrack = async (id) => {
				if (track || flying) return;
				homeward = false;
				comeBackTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				const near = T >= (TRACK_AT[id].nearFrom ?? -Infinity) && T < TRACK_AT[id].nearBefore && !reduced && !still;
				track = id;
				trackCard = 0;
				await tick();
				tripEl = document.querySelector<HTMLElement>('[data-trip]');
				if (!tripEl) return;
				tripPins = [...tripEl.querySelectorAll<HTMLElement>('.pin')];
				tripPins.forEach((el) => (el.dataset.tone = 'sky'));
				measureTrip();
				tripEl.scrollTop = 0;
				const tripPace = new Pace(trackPace(cards()));
				tripDirector = new Director(tripStops(), tripPace, touch ? PHONE : DESK);
				tripHead = new Playhead(tripPace, 0, reduced);
				tripStarted = false;
				w.trackT = 0;
				w.setTrack(id);
				const inside = TRACK_AT[id].inside;
				// Into the room, under a warm cover, then down from above it.
				const goIn = () => {
					cue('drop');
					w.trackIn = true;
					tripPins.forEach((el) => (el.dataset.tone = placeOf(id).tone));
					if (reduced || still) {
						arrive = arriveGoal = 1;
						flying = false;
						return;
					}
					arrive = 0;
					arriveGoal = 1;
					afterArrive = () => (flying = false);
				};
				if (near) {
					// Close enough to fly: the world stays as the reader left it, and the camera goes to the trip.
					tripT = null;
					flying = true;
					blendGoal = 1;
					cue('flight');
					afterFlight = inside ? () => swap(goIn, placeOf(id).cover) : () => (flying = false);
				} else {
					if (inside && !reduced && !still) flying = true;
					swap(
						() => {
							tripT = TRACK_AT[id].T;
							blend = blendGoal = 1;
							if (inside) goIn();
						},
						inside ? placeOf(id).cover : undefined
					);
				}
				tripEl.focus({ preventScroll: true });
			};
			leaveTrack = (atOnce = false) => {
				// A reader still dropping into a room can turn straight round; any other flight finishes first.
				const dropping = w.trackIn && arriveGoal === 1;
				if (!track || (flying && !atOnce && !dropping)) return;
				const done = () => {
					w.setTrack(null);
					w.trackIn = false;
					arrive = arriveGoal = 1;
					afterArrive = null;
					blend = blendGoal = 0;
					tripT = null;
					track = null;
					tripEl = null;
					tripPins = [];
					tripHead = null;
					tripDirector = null;
					flying = false;
					afterFlight = null;
					// The story's own header again, once it has drawn.
					tick().then(measureRooms);
					comeBackTo?.focus({ preventScroll: true });
				};
				if (atOnce) return done();
				if (w.trackIn) {
					// Up out of the room, back through the roof, and then home the way the reader came in.
					const out = () => {
						w.trackIn = false;
						tripPins.forEach((el) => (el.dataset.tone = 'sky'));
						if (tripT === null && !reduced && !still) {
							blendGoal = 0;
							afterFlight = done;
						} else done();
					};
					const cover = placeOf(track).cover;
					if (reduced || still) return swap(out, cover);
					flying = true;
					tripEl?.classList.add('leaving');
					arriveGoal = 0;
					cue('rise');
					afterArrive = () => swap(out, cover);
					return;
				}
				if (tripT === null && !reduced && !still) {
					cue('flight');
					// The world never left: the camera flies back to the story while the trip's words go.
					flying = true;
					tripEl?.classList.add('leaving');
					blendGoal = 0;
					afterFlight = done;
				} else swap(done);
			};
			w.onTrack = (id) => enterTrack(id);

			// The reader's wheel, fingers and keys: one gesture, one step. See gestures.ts.
			const gestures = new Gestures({
				step: (dir, how) => step(dir, how),
				seek: (to) => (track ? seekTrip(to) : seekStory(to)),
				scroller: () => (track && tripEl ? tripEl : window)
			});
			align = () => {
				if (!track) gestures.align(yOf(director.goal));
			};

			/* ---- sound ---- */
			// Under the site's own address, wherever it's hosted.
			const sound = new Sound((name) => `${resolve('/')}sound/${name}.mp3`);
			const hear = (x: number, y: number, z: number) => w.heard(x, y, z);
			const story = score(w);
			const main = new Conductor(sound, story.cues, story.beds, hear);
			let tripSound: Conductor | null = null;
			let tripSoundFor: TrackId | null = null;
			heardCut = (to) => {
				if (track) tripSound?.cut(to);
				else main.cut(to);
			};
			/** hello: the reader just turned it on, so it says so, softly, once everything has loaded. */
			const begin = (hello = false) => {
				main.reset();
				void sound
					.start()
					.then(() => sound.load([...VOICE_SOUNDS, ...main.names]))
					.then(() => {
						if (hello && sound.on) sound.voice(chime([0, 4, 7], 0.09), { gain: 0.28, wet: 0.3 });
					});
			};
			toggleSound = () => {
				soundOn = !soundOn;
				try {
					localStorage.setItem('journey-sound', soundOn ? 'on' : 'off');
				} catch {
					// Private browsing: it just isn't remembered.
				}
				if (soundOn) begin(true);
				else sound.stop();
			};
			try {
				// On last time: the first press anywhere picks it up again, since nothing can play before one.
				if (localStorage.getItem('journey-sound') === 'on') {
					soundOn = true;
					const wake = () => {
						window.removeEventListener('pointerdown', wake);
						window.removeEventListener('keydown', wake);
						if (soundOn && !sound.on) begin();
					};
					window.addEventListener('pointerdown', wake);
					window.addEventListener('keydown', wake);
				}
			} catch {
				// No storage: starts off.
			}
			cue = (kind, n = 0, m = 0) => {
				if (!sound.on) return;
				if (kind === 'step') sound.voice(tickSound(1.15), { gain: 0.3, wet: 0.1 });
				else if (kind === 'flight') sound.voice(whoosh(1.4, 1500), { gain: 0.32, wet: 0.3 });
				else if (kind === 'drop') sound.voice(whoosh(1.6, 900), { gain: 0.4, wet: 0.4 });
				else if (kind === 'rise') sound.voice(whoosh(1.4, 2200), { gain: 0.36, wet: 0.4 });
				else if (kind === 'map') sound.play('paper-slide', { gain: 0.5, rate: 0.9 });
				else if (kind === 'enter') {
					sound.voice(key(1.6), { gain: 0.8 });
					if (reduced) return sound.voice(chime([0, 2, 4, 7]), { gain: 0.35, delay: 0.1 });
					// The lap's nine stops, at the moments the token reaches each, and a chime as it gets home.
					[0, 914, 1542, 3576, 6546, 7631, 9231, 11829, 12800].forEach((ms, i) =>
						sound.voice(porcelain(note([0, 2, 4, 5, 7, 9, 7, 5, 4][i]), 1.2), { gain: 0.32, delay: ms / 1000 })
					);
					sound.voice(chime([0, 2, 4, 7, 9]), { gain: 0.35, delay: 14 });
				} else if (kind === 'spin' && !reduced) {
					// The wheel's own easing, peg by peg: quick and loud, then slower and fainter until it stops.
					const pegs = 165;
					for (let k = 1; k <= pegs; k++) {
						const t = 1 - Math.pow(1 - k / pegs, 1 / 4);
						sound.voice(tickSound(1.1 + (1 - t) * 0.4), { gain: 0.12 + 0.36 * Math.min(1, Math.pow(1 - t, 3) * 3), delay: 3.4 * t });
					}
					sound.voice(chime([0, 2, 4]), { gain: 0.35, delay: 3.45 });
				} else if (kind === 'harness') {
					// A selector clicks over, and each agent has a note of its own.
					sound.play('latch', { gain: 0.32, rate: 1.25, wet: 0.08 });
					sound.voice(porcelain(note([4, 7, 9][n] ?? 4), 0.8), { gain: 0.18, delay: 0.04 });
				} else if (kind === 'cache') {
					// A lever, the tally fluttering over as it rolls, and how it lands: bright with the cache, low without.
					sound.play('latch', { gain: 0.42, rate: n ? 1 : 0.8 });
					sound.play('flap', { gain: 0.26, rate: n ? 1.08 : 0.9, delay: 0.08, length: 0.7 });
					if (n) sound.voice(chime([2, 4], 0.08), { gain: 0.22, delay: 0.85 });
					else sound.voice(low(note(-5), 0.6), { gain: 0.24, delay: 0.85 });
				} else if (kind === 'temperature') {
					// A ratchet, one tick per step, higher as it runs hotter.
					sound.voice(tickSound(0.8 + ((n - 0.2) / 1.8) * 0.6), { gain: 0.2, wet: 0.05 });
				} else if (kind === 'turn') {
					sound.voice(key(0.7), { gain: 0.22 });
					sound.voice(porcelain(note(TURN_NOTES[n] ?? 0), 0.9), { gain: 0.26, delay: 0.03 });
				} else if (kind === 'tokens') {
					// A tiny pop for each new token, a run of them for a whole new sentence, and a softer one when one goes.
					if (n > m) {
						for (let j = 0; j < Math.min(n - m, 6); j++) sound.play('pop', { gain: 0.2, rate: 0.95 + ((m + j + 1) % 7) * 0.07, delay: j * 0.045, wet: 0.08 });
					} else if (n < m) sound.play('pop', { gain: 0.14, rate: 0.75 });
				}
			};
			// Pressing something in the scene: it answers where it is.
			w.onPoked = (what, x, y, z) => {
				if (!sound.on) return;
				const heard = w.heard(x, y, z);
				if (what === 'drawer') sound.play('drawer-out', { gain: heard.gain, pan: heard.pan });
				else if (what === 'tile') sound.voice(porcelain(note(Math.round(x * 3))), { gain: 0.5 * heard.gain, pan: heard.pan });
				else if (what === 'brain') {
					sound.voice(chime([0, 4, 7, 9]), { gain: 0.45, pan: heard.pan, wet: 0.4 });
					sound.dip(0.4, 1.2);
				}
			};
			const playSound = (dt: number) => {
				if (track !== tripSoundFor) {
					tripSoundFor = track;
					const s = track ? tripScore(track, w) : null;
					tripSound = s ? new Conductor(sound, s.cues, s.beds, hear) : null;
					if (tripSound) void sound.load(tripSound.names);
					main.reset();
				}
				if (tripSound) tripSound.frame(w.trackT, dt, tripSpeed > 1);
				else main.frame(T, dt, speed > 1);
				// Inside a room, its own ambience replaces the story's. Out of one, it's wherever the world is posed.
				const room = w.trackIn ? 1 : 0;
				const levels = main.levels(track && tripT !== null ? tripT : T, 1 - room);
				for (const [name, level] of Object.entries(tripSound?.levels(w.trackT, room) ?? {})) levels[name] = Math.max(levels[name] ?? 0, level);
				sound.ambience(levels);
			};

			// A turn the story hasn't reached yet is one press away: the story plays on to it briskly, and rests there.
			reachTurn = (i) => {
				director.reach(head.T, TEN_AT + i * TEN_STEP + TEN_STEP * 0.5);
				align();
			};
			locate = () => {
				let at = pins[0];
				for (const p of pins) if (startOf(p) - p.fade <= T) at = p;
				return at.el.querySelector('h1, h2')?.textContent ?? '';
			};
			const onHash = () => followAddress();
			window.addEventListener('hashchange', onHash);

			if (params.has('debug')) {
				(window as unknown as { __world: unknown; __head: unknown }).__world = w;
				(window as unknown as { __world: unknown; __head: unknown }).__head = head;
			}
			if (still) {
				const api = {
					seek(nextT: number, t = 0, hash?: HarnessId) {
						if (hash) choose(hash);
						director.go(director.nearest(nextT));
						window.scrollTo(0, yOf(director.goal));
						T = nextT;
						head.jump(nextT);
						w.update(nextT, t, 1, 0, 0, true);
						publish();
					},
					maxT: () => stops[stops.length - 1]
				};
				(window as unknown as { __journey: unknown }).__journey = api;
				api.seek(0);
			} else {
				raf = requestAnimationFrame(frame);
			}

			cleanup = () => {
				cancelAnimationFrame(raf);
				window.removeEventListener('resize', resize);
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointermove', aim);
				window.removeEventListener('pointerdown', down);
				window.removeEventListener('pointerup', up);
				document.documentElement.style.cursor = '';
				window.removeEventListener('hashchange', onHash);
				gestures.dispose();
				clearTimeout(cutTimer);
				w.dispose();
			};
			driven = true;
			// Measured once the cards have their real widths, and again if the type arrives late and wraps differently.
			tick().then(holdSteps);
			document.fonts.ready.then(holdSteps);
			// Behind the loader nobody sees it happen, so there's no need for the cut to hide it.
			followAddress('at-once');
			canvas.dataset.ready = 'true';
			// ?report shows what the page notes about this device, to send on when something looks wrong.
			if (params.has('report')) setTimeout(() => (report = { note: watch.note, why: 'asked' }), 2500);
		})();

		return () => {
			disposed = true;
			removeEventListener('error', onError);
			removeEventListener('unhandledrejection', onError);
			cleanup();
		};
	};

	const reachedForm = (n: number) => n <= form;

	function restart(event: MouseEvent) {
		event.preventDefault();
		cutTo('How a coding agent works');
	}
</script>

{#snippet picker()}
	<div class="picker" role="radiogroup" aria-label="Which coding agent do you use?">
		{#each ids as id (id)}
			<button
				type="button"
				role="radio"
				aria-checked={harness === id}
				class={{ on: harness === id }}
				onclick={() => choose(id)}
			>
				<Icon icon={AGENT_MARK[id]} size={15} stroke={1.8} />
				{labels[id]}
			</button>
		{/each}
	</div>
{/snippet}

<!-- A ticket off the main road, with the badge of the place it goes. In a card it says what it is; on the title page the
     heading over the set already does. -->
{#snippet tripButton(id: TrackId, inCard = true)}
	<button type="button" class="trip-go" data-place={id} disabled={!driven} onclick={() => takeTrip(id)}>
		<span class="badge" aria-hidden="true"><Icon icon={TRACK_ICON[id]} size={17} stroke={1.9} /></span>
		<span class="trip-words">
			{#if inCard}<small>Side trip</small>{/if}
			<b>{TRACKS[id].name}</b>
		</span>
	</button>
{/snippet}

<!-- The agent's name leads each note that differs between agents, and is the way to change it: one tap, the next agent. -->
{#snippet agent()}
	<button type="button" class={['agent', { hint: hinting(nextAgent) }]} aria-label="{spec.name}. Show this for {labels[nextAgent]}" onclick={() => choose(nextAgent)}>
		<Icon icon={AGENT_MARK[harness]} size={15} stroke={1.8} />
		{spec.name}
		<Icon icon={SWAP} size={14} stroke={1.8} />
	</button>
{/snippet}

{#snippet rich(text: string)}
	{#each pieces(text) as piece, i (i)}
		{#if piece.key}<span class="held"><button
				type="button"
				class="term"
				aria-expanded={tip?.key === piece.key}
				onpointerenter={(e) => {
					if (e.pointerType === 'mouse') showTip(e.currentTarget, piece.key);
				}}
				onpointerleave={(e) => {
					if (e.pointerType === 'mouse') tip = null;
				}}
				onfocus={(e) => showTip(e.currentTarget, piece.key)}
				onblur={() => (tip = null)}
				onclick={(e) => {
					e.stopPropagation();
					// A tap focuses first, which already showed it: only a later tap closes it.
					const tapped = (e as MouseEvent & { pointerType?: string }).pointerType !== 'mouse';
					if (tip?.key === piece.key && tapped && performance.now() - tipShownAt > 400) tip = null;
					else showTip(e.currentTarget, piece.key);
				}}>{piece.text}<span class="vh"> ({GLOSSARY[piece.key]})</span></button
			>{piece.tail}</span>{:else}{piece.text}{/if}
	{/each}
{/snippet}

<svelte:window
	onscroll={() => (tip = null)}
	onclick={() => (tip = null)}
	onkeydown={(e) => {
		if (e.key === 'Escape') tip = null;
		if (e.key === 'Escape' && track && !document.querySelector('dialog[open]')) leaveTrack();
		enterKey(e);
		arrowKey(e);
	}}
/>

<canvas class="stage" {@attach stage} aria-hidden="true"></canvas>
{#if report}
	<aside class="report" role="status">
		<p>
			{#if report.why === 'stopped'}
				Last time, the page stopped unexpectedly at <b>{report.note.where || 'the start'}</b>. A phone can close a page that
				uses too much memory.
			{:else if report.why === 'error'}
				Something went wrong on this page.
			{:else}
				What the page notes about this device.
			{/if}
			Copy the details to report it.
		</p>
		<div class="report-row">
			<button type="button" class="report-copy" onclick={copyReport}>{copied ? 'Copied' : 'Copy details'}</button>
			<button type="button" class="report-close" onclick={() => (report = null)}>Dismiss</button>
		</div>
	</aside>
{/if}
{#if !driven && !failed}
	<div class="loader" aria-hidden="true">
		<div class="hops">
			{#each [46, 30, 60, 38, 52] as width, i (i)}
				<i style:--w="{width}px" style:--i={i}></i>
			{/each}
		</div>
		<p>Warming up the machines</p>
	</div>
{/if}
<div class="edge" data-edge aria-hidden="true"></div>
<div class="dive" data-dive aria-hidden="true"></div>
<div class="cut" data-cut aria-hidden="true"></div>

<div class={['journey', { dark: dark && !track, words: failed, tripping: !!track }]}>
<header class={['bar', { 'at-title': atTitle && !trip }]}>
	<button type="button" class="brand" aria-haspopup="dialog" aria-label="The journey of a token. Open the map of the trip" onclick={openMap}>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M6 19c7 0 3-7 8-7s5-7-1-7" />
			<circle cx="6" cy="19" r="2.6" />
			<circle cx="14" cy="12" r="2.6" />
			<circle cx="13" cy="5" r="2.6" />
		</svg>
		<span class="name">The journey of a token</span>
		<span class="map-chip">Map</span>
	</button>
	{#if trip}
		<button type="button" class="trip-back" onclick={() => leaveTrack()}>
			<Icon icon={ArrowLeft01Icon} size={18} stroke={2} />
			<span class="long">Back to the journey</span>
			<span class="short">Back</span>
		</button>
	{/if}
	<div class="bar-end">
		<div class="spine" role="status" aria-live="polite">
			{#if trip}
				<ol aria-hidden="true">
					{#each trip.cards as card, n (card.title)}
						<li class={{ on: n <= trackCard, now: n === trackCard }}></li>
					{/each}
				</ol>
				<p>
					<span>Side trip {trackCard + 1} of {trip.cards.length}</span> <strong>{trip.name}</strong>
				</p>
			{:else}
				<ol aria-hidden="true">
					{#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}
						<li class={{ on: reachedForm(n), now: n === form }}></li>
					{/each}
				</ol>
				<p>
					<span>Form {form} of 12</span> <strong>{current.name}</strong>
				</p>
			{/if}
		</div>
		<div class={['stepper', { show: driven }]} role="group" aria-label="Step through the story" inert={!driven}>
			<button type="button" class="sound" aria-pressed={soundOn} aria-label="Sound" title={soundOn ? 'Sound is on' : 'Sound is off'} onclick={() => toggleSound()}>
				<Icon icon={soundOn ? VolumeHighIcon : VolumeOffIcon} size={19} stroke={1.8} />
			</button>
			<button type="button" data-step="back" aria-label="Previous step" aria-keyshortcuts="ArrowLeft" title="Previous step (←)" disabled={!canBack} onclick={() => step(-1)}>
				<Icon icon={ArrowLeft01Icon} size={20} stroke={2} />
			</button>
			<button type="button" data-step="next" aria-label="Next step" aria-keyshortcuts="ArrowRight" title="Next step (→)" disabled={!canOn} onclick={() => step(1)}>
				<Icon icon={ArrowRight01Icon} size={20} stroke={2} />
			</button>
		</div>
	</div>
</header>

{#if trip}
	<!-- tabindex lets the keys that scroll a page scroll this one too, once it has the focus. -->
	<div class="trip-scroll driven" data-trip tabindex="-1" role="region" aria-label="Side trip: {trip.name}">
		{#each trip.cards as card, n (card.title)}
			<section class="beat" style:--h={n === trip.cards.length - 1 ? '220vh' : '300vh'}>
				<article class="pin left" data-tone="sky">
					<!-- Its own class keeps the trip's titles off the main road's list of chapters. -->
					<h2 class="trip-title">{card.title}</h2>
					{#each card.body as line (line)}
						<p>{@render rich(line)}</p>
					{/each}
					{#if card.note}
						<p class="note">{@render agent()} {@render rich(card.note[harness])}</p>
					{/if}
					{#if n === trip.cards.length - 1}
						<p class="ends">
							<button type="button" class="again" onclick={() => leaveTrack()}><Icon icon={ArrowLeft01Icon} size={17} stroke={2} />Back to the journey</button>
							<span class="ends-hint">or keep scrolling</span>
						</p>
					{/if}
				</article>
			</section>
		{/each}
		<!-- Room to scroll on past the last card: doing so ends the trip. -->
		<section class="beat" style:--h="160vh" aria-hidden="true"></section>
		<div class="runway" data-runway aria-hidden="true"></div>
	</div>
{/if}

<main id="top" class={{ driven, words: failed, away: !!track }} inert={!!track}>
	<section data-beat class="beat hero" style:--h="170vh">
		<div class="pin left top" data-out="0.55">
			<h1>How a coding agent works</h1>
			<p class="lede">You type one sentence. Follow it all the way to the model and back, until the bug is fixed.</p>
			{#if failed}
				<div class="told"><span>Your agent</span>{@render picker()}</div>
				<p class="fallback">This browser can’t draw the 3D scenes right now, so here’s the whole story in words.</p>
			{:else}
				<div class="begin-row">
					<button type="button" class={['begin', { live: driven }]} disabled={!driven} aria-keyshortcuts="ArrowRight" onclick={() => step(1, 'button')}>
						Begin
						<Icon icon={ArrowRight01Icon} size={21} stroke={2.4} />
					</button>
					<span class="begin-or">
						<span class="by-key">or scroll, or step with <kbd>←</kbd> <kbd>→</kbd></span>
						<span class="by-tap">or swipe up</span>
					</span>
				</div>
				<p class="upright">Scroll to watch. Turn your phone upright to read along.</p>
				<div class="told"><span>Your agent</span>{@render picker()}</div>
				<div class="trip-set">
					<p class="trip-set-head">Side trips <span>Short detours that bring you back</span></p>
					<ul>
						{#each ['harness', 'mcp', 'sandbox', 'memory'] as const as id (id)}
							<li>{@render tripButton(id, false)}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>

	<section data-beat class="beat" style:--h="300vh">
		<article class="pin left" data-out="0.565">
			<h2>It starts as a sentence</h2>
			<p>{@render rich(`You type one request. For now it’s just ${surfaceWords}. The model hasn’t seen a thing, and nothing here is a [[token]] yet.`)}</p>
			<p>Your request will take twelve forms on this trip. The corner up there keeps count.</p>
			<p class="note">{@render agent()} {@render rich(callouts.prompt)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.76">
			<h2>The harness wakes up</h2>
			<p>
				The harness is the program around the model, the part you installed. Before anything leaves your laptop, it spends a few hundred
				milliseconds packing what the model will need. Pull out a drawer to see what’s in it.
			</p>
			<ol class="steps">
				{#each DRAWERS as d, i (d.name)}
					<li class={{ on: shownDrawer === i, done: drawer > i && shownDrawer !== i }}>
						<strong><Icon icon={DRAWER_ICON[i]} size={16} />{d.name}</strong>
						<span>{@render rich(d.text)}</span>
					</li>
				{/each}
			</ol>
			<p class="trips">
				{@render tripButton('harness')}
				{@render tripButton('mcp')}
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="300vh">
		<article class="pin right" data-out="0.6">
			<h2>One JSON request</h2>
			<p>
				Everything lands on one page. The parts that stay the same go first, and the conversation goes last, because it’s the only part
				that grows. That order pays off later.
			</p>
			<p>Notice what’s missing: none of your code. The model will have to ask for it, one tool call at a time.</p>
			<p>And it’s still plain text. No tokens yet.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin left" data-out="0.66">
			<h2>Across the wire</h2>
			<p>{@render rich('The harness opens a secure connection, and [[TLS]] scrambles every byte, so nobody along the way can read it.')}</p>
			<p>It also asks for the answer as a stream. That’s why you see the agent typing instead of waiting for one big reply.</p>
			<p class="note">{@render agent()} {@render rich(callouts.wire)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin right" data-out="0.66">
			<h2>The front door</h2>
			<p>Five plain checks, in order. No AI yet, just ordinary code.</p>
			<ol class="steps compact">
				{#each CHECKS as c, i (c.name)}
					<li class={{ on: check === i, done: check > i }}>
						<strong><Icon icon={CHECK_ICON[i]} size={16} />{c.name}</strong>
						<span>{@render rich(c.text)}</span>
					</li>
				{/each}
			</ol>
			<p class="note">{@render agent()} {@render rich(callouts.door)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="640vh">
		<article class="pin top-band" data-out="0.815">
			<h2>Now it is a token</h2>
			<div class="cols">
				<p>
					{@render rich('First, a [[chat template]] flattens the whole request into one long string, with markers showing who said what. Then the tokenizer cuts it into pieces from a vocabulary of 100,000 to 200,000 entries.')}
				</p>
				<p>
					Each piece has a number, and those numbers are all the model will ever read. No letters. The two “the” tiles get the same number,
					and the blue tiles are markers the template added. <small>IDs are illustrative. Press a tile to flip it.</small>
				</p>
			</div>
			<button type="button" class="try-it" onclick={() => (tryOpen = true)}>
				<i aria-hidden="true"></i>
				Cut your own sentence
			</button>
		</article>
	</section>

	<section data-beat class="beat" style:--h="400vh">
		<article class="pin left" data-out="0.58">
			<h2>Thousands more behind it</h2>
			<p>
				Your sentence is only the tail. The instructions and tool descriptions count too, so turn one comes to about 21,000 tokens.
				<small>Illustrative.</small>
			</p>
			<p>{@render rich('On the way out, small [[classifiers]] check them against the rules, and a clear violation stops here. Everything else heads for a machine already serving hundreds of other people.')}</p>
			<p class="next">{@render rich('Next stop: inside the [[inference cluster]].')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.672">
			<h2>One model, many chips</h2>
			<p>{@render rich('A frontier model is hundreds of billions to a few trillion learned numbers, its [[weights]]. Even compressed they won’t fit in one chip’s memory, so they’re split across many.')}</p>
			<p>{@render rich('Chips in one server talk over [[NVLink]], at terabytes per second. Servers talk to each other more slowly, over [[InfiniBand or RoCE]], at hundreds of gigabits.')}</p>
			<p class="note">
				<b>From here on, all three agents look the same.</b>
				{@render rich('Providers don’t publish these systems, so this is the public blueprint, drawn from open engines like [[vLLM and SGLang]].')}
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.86">
			<h2>Its working memory</h2>
			<p>
				To predict the next token, the model looks back at every earlier token. For each one it needs two lists of numbers, a key and a
				value. Working them out again at every step would be absurd, so they’re computed once and kept. That store is the KV cache.
			</p>
			<p>
				At about 330 KB per token, your 21,000 tokens take about 7 GB of chip memory, the scarcest thing in the building.
				<small>Illustrative: 80 layers, 8 KV heads, 128 dimensions, 2 bytes per number.</small>
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin left" data-out="0.78">
			<h2>Blocks that can sit anywhere</h2>
			<p>The cache is cut into fixed-size blocks, say 16 tokens each. A block can sit in any free slot, and a little table remembers where.</p>
			<p>So almost nothing goes to waste, and two requests that start the same way can share a block.</p>
			<p><small>A real request has far more than four blocks. The grey ones belong to other people.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="640vh">
		<article class="pin right" data-out="0.8">
			<h2>Turn two starts ahead</h2>
			<p>
				{@render rich('Jump ahead a moment. When the agent comes back for its second [[turn]], the request starts with exactly the same bytes, plus a little more. A [[router]] reads the start and sends it to the copy of the model most likely to still have those blocks, so only the new part runs. Remember the careful order on that JSON page? This is why.')}
			</p>
			<p>It saves computing. It isn’t the model remembering you. Unused blocks slide down to slower memory and get thrown out, usually within minutes, so coming back after an hour costs full price once.</p>
			<p class="note short-note">{@render agent()} {@render rich(callouts.cache)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin left" data-out="0.905">
			<h2>Sharing the chips</h2>
			<p>{@render rich('A chip only earns its keep when it works on many requests at once. So at every step, the [[scheduler]] gathers a batch of requests that each need one more token.')}</p>
			<p>When one finishes, a waiting one takes its lane right away. Nobody waits for a batch to fill. If memory runs short, someone gets paused and picked up again later.</p>
			<p>Yours is the amber one. Its long prompt goes in slices between everyone else’s steps, so your arrival doesn’t freeze their typing.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.72">
			<h2>Reading and writing</h2>
			<p>{@render rich('Reading your prompt is called [[prefill]]: thousands of tokens at once, limited by compute. Writing the answer is called [[decode]]: one token per step, limited by memory, because every step reads all the weights.')}</p>
			<p>{@render rich('On one chip, even in slices, a big new prompt makes everyone’s typing stutter. So many clusters split the two jobs into pools, and ship the KV cache across over [[RDMA]]. It’s a choice, not a law. For some work, one shared pool still wins.')}</p>
			<p class="next">Your prompt is in the first one. What’s actually running in there?</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="2800vh">
		<article class="pin left tight" data-in="0.035" data-out="0.125" data-fade="0.014">
			<h2>The transformer</h2>
			<p>
				Every chip in those pools runs the same kind of program, a transformer. It’s the T in GPT, and the design behind today’s big language
				models. Tokens go in at the bottom. A score for every possible next word comes out at the top.
			</p>
			<Blueprint />
		</article>
		<article class="pin left tight" data-in="0.17" data-out="0.272" data-fade="0.014">
			<h2>A place for every word</h2>
			<p>{@render rich('Your prompt starts at the bottom. On turn one almost nothing is cached, so everything goes through together. An [[embedding]] turns each token’s number into a long list of numbers, and you can read that list as a place on a map of meaning.')}</p>
			<p>Watch where they land. “job” is among careers, “race” is in sports. An embedding knows the word, not the sentence. Both “the” tiles land on one spot, until a position signal says which comes first.</p>
			<p><small>The real map has thousands of dimensions. This one has two, and its neighborhoods are illustrative.</small></p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.325" data-out="0.548" data-fade="0.014">
			<h2>Attention</h2>
			<p>
				In this sentence “job” isn’t about careers, and only the words around it can say so. So it asks a question, its query. Each token before
				it offers a key, like a label, and holds a value, like what’s behind that label. Later tokens stay dark: a token can only look back.
			</p>
			<div class="eq" role="img" aria-label="Attention of Q, K and V equals softmax of Q times K transpose over the square root of d k, times V.">
				<span class="eq-name">Attention(<b class="q">Q</b>, <b class="k">K</b>, <b class="v">V</b>) =</span>
				<span class={['eq-part', { lit: attention === 1 }]}>softmax</span><span class="eq-paren">(</span>
				<span class={['eq-frac', { lit: attention === 0 }]}>
					<span class="eq-top"><b class="q">Q</b><b class="k">K</b><sup>T</sup></span>
					<span class="eq-bot">√d<sub>k</sub></span>
				</span><span class="eq-paren">)</span>
				<span class={['eq-part', { lit: attention === 2 }]}><b class="v">V</b></span>
			</div>
			<ol class="steps compact">
				<li class={{ on: attention === 0, done: attention > 0 }}>
					<strong>Compare</strong>
					<span>The query against every key. The better the match, the higher the score. The √d just keeps the numbers in range.</span>
				</li>
				<li class={{ on: attention === 1, done: attention > 1 }}>
					<strong>Weigh</strong>
					<span>{@render rich('[[Softmax]] turns the scores into shares that add up to 100%.')}</span>
				</li>
				<li class={{ on: attention === 2, done: attention > 2 }}>
					<strong>Mix</strong>
					<span>{@render rich('Those shares of the values blend into “job”’s new [[vector]], and it moves toward code.')}</span>
				</li>
			</ol>
			<p><small>The shares are illustrative. A real layer runs many of these side by side, called heads.</small></p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.555" data-out="0.622" data-fade="0.014">
			<h2>All of them, at once</h2>
			<p>Every token does this in the same instant, which is why this work suits a chip built for parallel math. Each one also stores its key and value in the row of lights along the layer’s front edge.</p>
			<p>That row is the KV cache from earlier. Now you can see what it’s for.</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.63" data-out="0.694" data-fade="0.014">
			<h2>Then each token, by itself</h2>
			<p>Attention moves information between tokens. Next comes a small fully connected network, with every input wired to every unit. It works on one token at a time, and every token gets the same network.</p>
			<p>
				<small>Around both steps, the layer normalizes its numbers to keep them in range and adds the old vector back, so nothing is lost. In many large models this network comes in hundreds of versions, called experts, and each token gets just a few.</small>
			</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.705" data-out="0.858" data-fade="0.014">
			<h2>Then again, eighty times</h2>
			<p>That was one layer. The next has the same design but its own weights, and starts where the last one finished. Each thread is one token’s path up the stack. Watch them gather as they climb.</p>
			<p>
				“race” never quite arrives. It can’t see “condition”, which comes after it. That’s the price of only looking back.
				<small>Eighty is illustrative.</small>
			</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.885" data-out="0.985" data-fade="0.014">
			<h2>One score for every word</h2>
			<p>
				{@render rich('After the last layer, only the final position matters. The [[LM head]] gives every entry in the vocabulary a raw score, called a [[logit]]. Those scores are all the model ever outputs.')}
				<small>Scores on the map are illustrative.</small>
			</p>
			<p>All this was the pause before the agent starts typing. It’s called time to first token, usually 0.3 to 2 seconds for a prompt this size.</p>
			<Blueprint compact stage={part} />
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right wheel-card" data-in="0.1" data-out="0.86">
			<h2>One token is chosen</h2>
			<p>{@render rich('The only roll of the dice in the whole journey. The highest logits land here and become odds. [[Top-p or top-k]] cut off the long shots, and [[temperature]] reshapes the rest.')}</p>
			<p>Coding agents usually run cool, so the wheel is lopsided. But it’s still a wheel, and a random draw picks one.</p>
			<div class="dial">
				<label class="dial-head" for="temperature">
					<span>Temperature</span>
					<output for="temperature">{temperature.toFixed(1)}</output>
				</label>
				<input
					id="temperature"
					type="range"
					min="0.2"
					max="2"
					step="0.1"
					bind:value={temperature}
					oninput={() => {
						world?.setTemperature(temperature);
						cue('temperature', temperature);
					}}
				/>
				<ol class="odds">
					{#each LOGITS.slice(0, TOP_K) as l, i (l.text)}
						<li class={{ won: landed === i }}>
							<b>{l.text}</b>
							<span>{percents[i] === 0 ? '<1' : percents[i]}%</span>
							{#if wins[i]}<em>×{wins[i]}</em>{/if}
						</li>
					{/each}
				</ol>
				<button type="button" class="spin" disabled={spinning} onclick={spinIt}>
					<Icon icon={SPIN} size={18} stroke={1.8} />
					{spinning ? 'Round it goes' : 'Spin it yourself'}
				</button>
			</div>
			<p><small>Illustrative odds. In this story, it lands on “The”.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="600vh">
		<article class="pin left tight" data-in="0.075" data-out="0.912">
			<h2>One at a time</h2>
			<p>Now it repeats. The new token climbs the same stack, alone. On each layer it looks back at everything through the KV cache, and adds its own key and value to the row of lights. One step takes 10 to 40 milliseconds. That’s the typing speed you see.</p>
			<p>In 2026 the model usually thinks first. Thinking tokens are ordinary tokens, billed as output.</p>
			<p class="note">{@render agent()} {@render rich(callouts.thinking)}</p>
			<p><small>{@render rich('[[Speculative decoding]] can check several guessed tokens in one pass, often 2 to 3 times faster on code, with the same answers.')}</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin top-band" data-in="0.08" data-out="0.9">
			<h2>A tool call is born</h2>
			<div class="cols">
				<p>The model opens a tool call with a special token, then writes the name and arguments as more tokens. That’s all it does. When it’s done it stops, and says why. The file may not exist and the command may not be allowed. Those checks come later.</p>
				<p class="note">{@render agent()} {@render rich(callouts.toolcall)}</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin left" data-out="0.635">
			<h2>Text comes back, not numbers</h2>
			<p>Each number is looked up in the vocabulary. The detokenizer waits until it has a whole character, then sends a small chunk of text, or of a tool call’s JSON. Token numbers never leave the data center.</p>
			<p>{@render rich('A second set of [[classifiers]] reads along. If the text crosses a line, generation stops mid-sentence.')}</p>
			<p class="note">{@render agent()} {@render rich(callouts.stream)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="460vh">
		<article class="pin right" data-in="0.05" data-out="0.56">
			<h2>The model has no hands</h2>
			<p>The tube ends at your laptop, in the harness. It holds on to the stream until the tool call is complete, then reads it. Only now does anyone know the full request.</p>
			<p>And it’s only a request, like a web form sent to a server. The model can’t read a file. It can only write the words “please read this file.” Everything after this decides whether to say yes.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="620vh">
		<article class="pin left" data-out="0.915">
			<h2>Intent is not authority</h2>
			<p>Every call passes the same gates. Here, one is refused: a request for your secrets, stopped by a deny list.</p>
			<ol class="steps compact">
				{#each GATES as g, i (g.name)}
					<li class={{ on: gate === i, done: gate > i }}>
						<strong><Icon icon={GATE_ICON[i]} size={16} />{g.name}</strong>
						<span>{@render rich(g.text)}</span>
					</li>
				{/each}
			</ol>
			<p class="note">{@render agent()} {@render rich(callouts.policy)}</p>
			<p class="trips">{@render tripButton('sandbox')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.88">
			<h2>When the page lies</h2>
			<p>{@render rich('Our agent also fetched a library’s docs. Now that page sits in the same context as your instructions, and it can say anything. This is [[prompt injection]], the main unsolved security problem of agents.')}</p>
			<p>So the defenses come in layers. The strongest doesn’t have to be convinced of anything: an operating-system fence around the commands it runs, which every child process inherits.</p>
			<p class="note">{@render agent()} {@render rich(callouts.sandbox)}</p>
			<p class="trips">{@render tripButton('sandbox')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>Finding the code</h2>
			<p>{@render rich('An approved call becomes a [[system call]], real work on your machine. The model searches the way an engineer does: look for the words, list the candidates, read the promising file by line range.')}</p>
			<p>Each step is its own turn: call, result, think, next call. Calls that don’t need each other’s answers can share one, and the harness runs them side by side. In the end the model reads about 250 lines of your repository, not all of it.</p>
			<p class="note">{@render agent()} {@render rich(callouts.search)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin right" data-in="0.09" data-out="0.88">
			<h2>Three ways to edit</h2>
			<p>A few turns later the model knows what to change, and asks. The edit goes through the same gates.</p>
			<p class="note">{@render agent()} {@render rich(callouts.edit)}</p>
			<p>{@render rich('All three agents write [[atomically]]: a temporary file, then a rename, so a crash never leaves half a file. Proposing a patch and applying it are different events, and the result says which happened.')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.795">
			<h2>Evidence, not opinion</h2>
			<p>{@render rich(`${harness === 'copilot' ? 'The harness runs the tests in your terminal' : 'The harness runs the tests inside the [[sandbox]] with a time limit'}, and captures everything: [[stdout, stderr and the exit code]]. Here they failed: the new lock [[deadlocks]].`)}</p>
			<p>That isn’t the tool going wrong. It’s a successful tool call whose text says failed, and it’s the most useful thing the model has read all session.</p>
			<p class="note">{@render agent()} {@render rich(callouts.test)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin right" data-in="0.4" data-out="0.86">
			<h2>Around the loop</h2>
			<p>{@render rich('Remember the green pipe in the very first frame? This is what it carries. The result joins the [[transcript]], and the whole conversation goes back to the provider.')}</p>
			<p>One trip around is a turn. A real fix takes five to thirty.</p>
			<p class="note">{@render agent()} {@render rich(callouts.loop)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.86">
			<h2>When the context fills up</h2>
			<p>{@render rich('A long session reads many files, and the transcript creeps up on the [[context window]]. So a separate model call writes a summary, and the next request sends it, with the latest turns, in place of the older messages. The saved session keeps them all. The cache is lost once, then rebuilt.')}</p>
			<p>{@render rich('Big side quests can go to a [[subagent]] instead: a second conversation with its own fresh context. It reports back in a summary, but it works on the same files unless it’s given its own copy.')}</p>
			<p class="note">{@render agent()} {@render rich(callouts.compact)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin right" data-out="0.86">
			<h2>Seven things called memory</h2>
			<p>A lot of confusion comes from using one word for seven different things. Each has its own owner and its own lifetime.</p>
			<p>The last one answers a common question: using an agent doesn’t change the model. Learning happens only in a separate training process, so when your session ends, the model hasn’t learned a thing from you.</p>
			<p class="trips">{@render tripButton('memory')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>When the answer gets lost</h2>
			<p>A tool can succeed while its result gets lost. The honest state is “I don’t know whether that happened,” and the next step is to look, not to retry.</p>
			<p>Exact-string edits help here: a second attempt fails harmlessly, because the old string is already gone.</p>
			<p>And four controls do four different things. Steering changes the plan. Cancelling stops the stream. Terminating kills the process. Only rolling back undoes a file change.</p>
			<p class="trips">{@render tripButton('memory')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="1000vh">
		<article class="pin top-band ten" data-out="0.88">
			<h2>The whole fix, in ten turns</h2>
			<div class="ten-grid">
				<div class="ledger">
					<p class="ten-intro">Each bar is one request. Green was already cached, amber is new. Only turn one pays for all of it. After that, with each turn minutes after the last, more than nine tokens in ten are already there.</p>
					<div class="cache-row">
						<div class="picker compact" role="radiogroup" aria-label="Run the ten turns with the cache, or without it">
							<button type="button" role="radio" aria-checked={cacheOn} class={{ on: cacheOn }} onclick={() => setCache(true)}>With the cache</button>
							<button type="button" role="radio" aria-checked={!cacheOn} class={{ on: !cacheOn }} onclick={() => setCache(false)}>Without it</button>
						</div>
						<p class="tally"><b>{Math.round(ran.current).toLocaleString('en-US')}</b> tokens to run</p>
					</div>
					<p class="tally-why">
						{#if cacheOn}
							The chips skip the other {(RUN_WITHOUT_CACHE - RUN_WITH_CACHE).toLocaleString('en-US')}. They come straight from memory, at a tenth of the price.
						{:else}
							Same requests, but the chips run every token. Nine times the work, about five times the bill, and every reply slower to start.
						{/if}
						<small>Claude Code’s numbers. Illustrative.</small>
					</p>
				</div>
				<div class="ticket">
					<div class="turns" role="group" aria-label="Choose a turn">
						{#each TEN_TURNS as t, i (i)}
							{@const ahead = driven && i > turnReached}
							<button type="button" class={{ on: turn === i, ahead }} aria-label="Turn {i + 1}: {t.label}{ahead ? ', ahead. Plays on to it' : ''}" title={ahead ? 'Play on to this turn' : undefined} aria-current={turn === i} onclick={() => (ahead ? reachTurn(i) : pinTurn(i))}>{i + 1}</button>
						{/each}
					</div>
					<dl>
						<div><dt>It sees</dt><dd>{@render rich(ticket.sees)}</dd></div>
						<div><dt>It thinks</dt><dd>{@render rich(ticket.thinks)}</dd></div>
						<div><dt>It calls</dt><dd><code>{ticket.calls[harness]}</code></dd></div>
						<div><dt>Then</dt><dd>{@render rich(ticket.after[harness])}</dd></div>
					</dl>
				</div>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin top-band" data-out="0.76">
			<h2>What finished means</h2>
			<div class="cols">
				<p>There’s no “finished” signal. After green tests, the model writes a summary and an end-of-turn token instead of another tool call. That only means it stopped asking for tools: a stop hook can still send it back, and green tests are evidence, not proof.</p>
				<p>The ending is five separate steps, each with its own permission. A typical fix costs tens of cents to a few dollars, mostly in cache reads.</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="440vh">
		<article class="pin left" data-in="0.44" data-out="0.93">
			<h2>Different bodies, one kind of mind</h2>
			<p>The model is a function from tokens to odds for every possible next token. Everything else, searching, editing, running code, remembering, asking permission, is the harness.</p>
			<p>The model doesn’t know your codebase. It searches, one tool call at a time, and forgets everything when the session ends unless the harness writes it down.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="900vh">
		<article class="pin end whole" data-in="0.3" data-out="9">
			<div class="whole-top">
				<h2>The whole trip, in one look</h2>
				<ol class="trip">
					{#each TRIP as stop, i (stop.name)}
						<li class={{ now: i === tripStep, past: tripDone || i < tripStep, model: tripDone && tripStep < 0 && i === 4 }}><b>{i + 1}</b> {stop.name}</li>
					{/each}
				</ol>
				<p class="trip-what">{tripStep >= 0 ? TRIP[tripStep].what : tripDone ? 'Only one of these nine stops is the model.' : TRIP[0].what}</p>
			</div>
			<div class={['closing', { shown: tripDone || failed }]} inert={!tripDone && !failed}>
				<p class="next">Next time you press Enter, you’ll know where it goes.</p>
				<div class="enter-row">
					<button type="button" class="enter-key" onclick={pressEnter} aria-label="Press Enter: send a token around the loop">
						Enter
						<svg viewBox="0 0 20 14" aria-hidden="true"><path d="M18 2v4a3 3 0 0 1-3 3H3m0 0 4-4M3 9l4 4" /></svg>
					</button>
					<span class="enter-words" aria-live="polite">{tripWords}</span>
				</div>
				<p class="sources"><small>Harness details are from public docs and source as of November 2026. Inside the data center, this follows public engines and papers, because providers don’t publish their own.</small></p>
				<p class="ends">
					<a class="again" href="#top" onclick={restart}><Icon icon={AGAIN} size={17} stroke={1.8} />Follow it again</a>
					<button type="button" class="again quiet" onclick={openMap}><Icon icon={MAP} size={17} stroke={1.8} />Open the map</button>
				</p>
			</div>
		</article>
	</section>
	<!-- Once the story is driven, the cards hang over the picture and the page is just this: a screen of scrolling per beat. -->
	<div class="runway" data-runway aria-hidden="true"></div>
</main>
{#if tip}
	<div class={['tip', { below: tip.below }]} aria-hidden="true" style:left="{tip.x}px" style:top="{tip.y}px">{tip.text}</div>
{/if}
</div>

<Tokenizer bind:open={tryOpen} oncut={(now, before) => cue('tokens', now, before)} />

<TripMap bind:open={mapOpen} here={mapHere} onjump={jump} ontrip={takeTrip}>
	{#snippet agents()}
		{@render picker()}
	{/snippet}
</TripMap>

<style>
	/* The last look runs edge to edge. Its words sit in the two open corners of the sky, left of the home island. */
	.driven .pin.whole {
		right: 0;
	}
	.pin.whole {
		width: auto;
		justify-content: space-between;
		padding: 84px 0 34px;
		margin-right: clamp(24px, 5.2vw, 88px);
	}
	.beat:not(.hero) .pin.whole::before {
		display: none;
	}
	.whole-top {
		max-width: min(50vw, 680px);
	}
	.whole h2 {
		margin-bottom: 10px;
		font-size: clamp(30px, 3vw, 46px);
	}
	.trip {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0 0 8px;
		padding: 0;
		list-style: none;
		font-size: 0.84em;
		line-height: 1.2;
	}
	.trip li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 11px 4px 4px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.55);
		color: var(--ink-soft);
		font-weight: 600;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.trip b {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: rgb(16 26 48 / 0.1);
		font-size: 0.86em;
		transition: background 0.2s;
	}
	.trip li.past b,
	.trip li.now b {
		background: #ffb921;
		color: #101a30;
	}
	.trip li.now,
	.trip li.model {
		background: #101a30;
		color: #fff;
	}
	p.trip-what {
		margin: 0;
		min-height: 1.5em;
	}
	.closing {
		max-width: min(32em, 42vw);
		opacity: 0;
		transform: translateY(10px);
		transition:
			opacity 0.5s,
			transform 0.5s cubic-bezier(0.2, 1, 0.3, 1);
	}
	.closing.shown {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
	.closing .next {
		margin: 0 0 12px;
		font-size: clamp(22px, 1.9vw, 30px);
		line-height: 1.12;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}
	.enter-row {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
	}
	.enter-key {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		padding: 13px 18px 13px 22px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(#ffffff, #eef3fb);
		color: #101a30;
		font-family: var(--display);
		font-weight: 700;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		box-shadow:
			inset 0 1px 0 #fff,
			0 7px 0 #b3c3dc,
			0 13px 22px rgb(30 70 140 / 0.3);
		transition:
			transform 0.07s,
			box-shadow 0.07s;
	}
	.enter-key:hover {
		transform: translateY(-1px);
	}
	.enter-key:active {
		transform: translateY(6px);
		box-shadow:
			inset 0 1px 0 #fff,
			0 1px 0 #b3c3dc,
			0 3px 7px rgb(30 70 140 / 0.3);
	}
	.enter-key svg {
		width: 20px;
		height: 14px;
	}
	.enter-key path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.enter-words {
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
	}
	p.sources {
		margin: 0 0 10px;
		line-height: 1.32;
	}
	.ends {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
	}
	.ends-hint {
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	.again.quiet {
		background: rgb(255 255 255 / 0.4);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.55);
	}
	.again.quiet:hover {
		background: rgb(255 255 255 / 0.6);
	}

	/* Only phones get this, in place of the plain name. */
	.agent {
		display: inline-flex;
		position: relative;
		align-items: center;
		gap: 5px;
		margin: -4px 3px -4px 0;
		padding: 4px 7px 5px 8px;
		border: 0;
		border-radius: 9px;
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		font: inherit;
		font-weight: 650;
		vertical-align: baseline;
		white-space: nowrap;
		cursor: pointer;
		pointer-events: auto;
		-webkit-tap-highlight-color: transparent;
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.16);
		transition: transform 0.1s;
	}
	/* The swap mark says what a press does: the next agent. */
	.agent > :global(svg:last-child) {
		color: #8a7445;
		transition: transform 0.3s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.agent:hover > :global(svg:last-child) {
		transform: rotate(180deg);
	}
	/* A bigger target than it looks. */
	.agent::after {
		content: '';
		position: absolute;
		inset: -10px -6px;
	}
	.agent:active {
		transform: translateY(1px);
	}
	.agent.hint {
		animation: agent-hint 3.2s ease-in-out infinite;
	}
	@keyframes agent-hint {
		0%,
		100% {
			box-shadow:
				inset 0 1px 0 #fff,
				inset 0 -2px 0 #e2cb9f,
				0 1px 3px rgb(60 40 10 / 0.16),
				0 0 0 0 rgb(255 185 33 / 0);
		}
		50% {
			box-shadow:
				inset 0 1px 0 #fff,
				inset 0 -2px 0 #e2cb9f,
				0 1px 3px rgb(60 40 10 / 0.16),
				0 0 0 2px rgb(255 185 33 / 0.95);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.agent.hint {
			animation: none;
			box-shadow:
				inset 0 1px 0 #fff,
				inset 0 -2px 0 #e2cb9f,
				0 0 0 2px rgb(255 185 33 / 0.9);
		}
	}

	.ten-grid {
		display: grid;
		grid-template-columns: minmax(0, 28em) minmax(0, 34em);
		gap: 8px 44px;
		align-items: start;
	}
	.ledger p {
		margin-bottom: 8px;
	}
	.cache-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		pointer-events: auto;
	}
	.cache-row .picker {
		align-self: center;
	}
	p.tally {
		margin: 0;
		font-size: 0.92em;
		white-space: nowrap;
	}
	.tally b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.3em;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	p.tally-why {
		margin: 6px 0 0;
		font-size: 0.92em;
		line-height: 1.4;
	}
	.ticket {
		display: grid;
		gap: 9px;
		pointer-events: auto;
	}
	.turns {
		display: flex;
		gap: 4px;
	}
	.turns button {
		flex: 1;
		max-width: 38px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 9px;
		background: rgb(255 255 255 / 0.5);
		color: #33415c;
		font: 700 14px/1 var(--sans);
		cursor: pointer;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.6);
		transition:
			background 0.18s,
			color 0.18s,
			transform 0.12s;
	}
	.turns button:hover:not(.on) {
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -2px 0 #e2cb9f;
		transform: translateY(-1px);
	}
	/* Not reached yet: faint, but still a way to get there. */
	.turns button.ahead {
		opacity: 0.42;
	}
	.turns button.ahead:hover {
		opacity: 0.75;
	}
	/* The turn on show is the token, in amber. */
	.turns button.on {
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	.ticket dl {
		display: grid;
		gap: 3px;
		margin: 0;
		font-size: 0.9em;
		line-height: 1.36;
	}
	.ticket dl div {
		display: grid;
		grid-template-columns: 4.6em minmax(0, 1fr);
		gap: 8px;
	}
	.ticket dt {
		font-weight: 650;
		color: var(--ink);
	}
	.ticket dd {
		margin: 0;
	}
	.ticket code {
		font-family: var(--mono);
		font-size: 0.92em;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.dial {
		display: grid;
		gap: 9px;
		margin: 4px 0 12px;
		padding: 13px 15px 15px;
		border-radius: 14px;
		background: rgb(255 255 255 / 0.07);
		box-shadow: inset 0 0 0 1px rgb(243 247 255 / 0.12);
		pointer-events: auto;
	}
	.dial-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.92em;
		font-weight: 600;
		color: var(--ink);
	}
	.dial output {
		font-family: var(--mono);
		font-weight: 600;
		color: var(--amber);
	}
	.dial input[type='range'] {
		appearance: none;
		width: 100%;
		height: 26px;
		margin: 0;
		background: none;
		cursor: grab;
	}
	.dial input[type='range']:active {
		cursor: grabbing;
	}
	.dial input[type='range']::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(to right, #3b76ec, #ffbc12 55%, #f0663c);
	}
	.dial input[type='range']::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(to right, #3b76ec, #ffbc12 55%, #f0663c);
	}
	.dial input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 26px;
		height: 26px;
		margin-top: -10px;
		border-radius: 8px;
		background: var(--amber);
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.55),
			inset 0 -4px 0 rgb(176 104 0 / 0.5),
			0 2px 6px rgb(6 15 38 / 0.4);
		transition: transform 0.12s;
	}
	.dial input[type='range']::-moz-range-thumb {
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 8px;
		background: var(--amber);
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.55),
			inset 0 -4px 0 rgb(176 104 0 / 0.5),
			0 2px 6px rgb(6 15 38 / 0.4);
	}
	.dial input[type='range']:hover::-webkit-slider-thumb {
		transform: scale(1.08);
	}
	.odds {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 5px;
		margin: 0;
		padding: 0;
		list-style: none;
		text-align: center;
		font-size: 0.84em;
		line-height: 1.2;
	}
	.odds li {
		position: relative;
		display: grid;
		gap: 1px;
		padding: 6px 2px;
		border-radius: 9px;
		background: rgb(255 255 255 / 0.06);
		transition: background 0.2s;
	}
	.odds li.won {
		background: var(--amber);
		color: #111a2e;
		animation: won 0.5s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.odds li.won span {
		color: #3d2c00;
	}
	.odds b {
		font-weight: 700;
	}
	.odds span {
		font-family: var(--mono);
		font-size: 0.92em;
		color: var(--ink-soft);
	}
	/* The tally sits on the chip's corner like a sticker, so counting doesn't move anything. */
	.odds em {
		position: absolute;
		top: -7px;
		right: -3px;
		padding: 1px 5px;
		border-radius: 8px;
		background: var(--ink);
		color: #111a2e;
		font-style: normal;
		font-weight: 700;
		font-size: 0.86em;
		line-height: 1.3;
		box-shadow: 0 1px 3px rgb(6 15 38 / 0.5);
	}
	@keyframes won {
		from {
			transform: scale(0.8);
		}
	}
	.spin {
		justify-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 14px;
		border: 0;
		border-radius: 11px;
		background: var(--amber);
		color: #111a2e;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.5),
			inset 0 -4px 0 rgb(176 104 0 / 0.45);
		transition:
			transform 0.1s,
			filter 0.15s;
	}
	.spin:hover:not(:disabled) {
		filter: brightness(1.06);
	}
	.spin:active:not(:disabled) {
		transform: translateY(2px) scale(0.99);
	}
	.spin:disabled {
		cursor: default;
		filter: saturate(0.6) brightness(0.85);
	}
	@media (prefers-reduced-motion: reduce) {
		.odds li.won {
			animation: none;
		}
	}

	.report {
		position: fixed;
		z-index: 40;
		left: 50%;
		bottom: max(16px, env(safe-area-inset-bottom));
		width: min(420px, calc(100vw - 24px));
		padding: 14px 16px 12px;
		border-radius: 16px;
		background: #fffdf7;
		color: #16243d;
		font: 450 14.5px/1.42 var(--sans);
		box-shadow: 0 12px 34px rgb(6 15 38 / 0.24);
		transform: translateX(-50%);
	}
	.report p {
		margin: 0 0 10px;
	}
	.report-row {
		display: flex;
		gap: 8px;
	}
	.report-copy,
	.report-close {
		padding: 8px 14px 9px;
		border: 0;
		border-radius: 11px;
		font: 650 14px/1 var(--sans);
		cursor: pointer;
	}
	.report-copy {
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	.report-close {
		background: rgb(16 26 48 / 0.07);
		color: #16243d;
	}
	.loader {
		position: fixed;
		z-index: 2;
		left: 70%;
		top: 50%;
		display: grid;
		justify-items: center;
		gap: 16px;
		transform: translate(-50%, -50%);
		color: var(--ink-soft);
		font-size: 14.5px;
		pointer-events: none;
		animation: loader-in 0.3s 0.25s both;
	}
	.loader p {
		margin: 0;
	}
	.hops {
		display: flex;
		align-items: flex-end;
		gap: 5px;
	}
	.hops i {
		display: block;
		width: var(--w);
		height: 26px;
		border-radius: 6px;
		background: var(--amber);
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.5),
			inset 0 -5px 0 rgb(176 104 0 / 0.5);
		/* Transform only, so it keeps hopping while the main thread is busy building the world. */
		animation: hop 1.1s calc(var(--i) * 0.09s) infinite cubic-bezier(0.3, 0.7, 0.4, 1);
	}
	@keyframes hop {
		0%,
		55%,
		100% {
			transform: none;
		}
		22% {
			transform: translateY(-22px) scaleY(1.04);
		}
		46% {
			transform: scale(1.06, 0.9);
		}
	}
	@keyframes loader-in {
		from {
			opacity: 0;
		}
	}
	@media (max-aspect-ratio: 9/10) {
		/* Someone arriving at a chapter's address sees its words while the world builds, so it brings its own ground. */
		.report {
		position: fixed;
		z-index: 40;
		left: 50%;
		bottom: max(16px, env(safe-area-inset-bottom));
		width: min(420px, calc(100vw - 24px));
		padding: 14px 16px 12px;
		border-radius: 16px;
		background: #fffdf7;
		color: #16243d;
		font: 450 14.5px/1.42 var(--sans);
		box-shadow: 0 12px 34px rgb(6 15 38 / 0.24);
		transform: translateX(-50%);
	}
	.report p {
		margin: 0 0 10px;
	}
	.report-row {
		display: flex;
		gap: 8px;
	}
	.report-copy,
	.report-close {
		padding: 8px 14px 9px;
		border: 0;
		border-radius: 11px;
		font: 650 14px/1 var(--sans);
		cursor: pointer;
	}
	.report-copy {
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	.report-close {
		background: rgb(16 26 48 / 0.07);
		color: #16243d;
	}
	.loader {
			left: 50%;
			top: auto;
			bottom: 24px;
			width: max-content;
			padding: 26px 22px 12px;
			border-radius: 18px;
			background: rgb(214 234 251 / 0.94);
			box-shadow: 0 10px 30px rgb(16 26 48 / 0.12);
			transform: translateX(-50%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hops i {
			animation: none;
		}
	}
	/* No 3D: just the story, read straight down. */
	.journey.words .spine,
	.journey.words .stepper {
		display: none;
	}
	.journey.words .bar {
		position: absolute;
	}
	.words .beat {
		height: auto;
		min-height: 0;
	}
	.words .pin,
	.words .pin.right,
	.words .pin.top-band {
		position: static;
		min-height: 0;
		padding-block: 6vh;
		justify-content: flex-start;
	}
	.words .pin::before {
		display: none;
	}
	/* On a wide screen the words make one column down the middle, the way an article reads, not a zigzag. */
	@media (min-aspect-ratio: 9/10) {
		.words .pin,
		.words .pin.right,
		.words .pin.top-band,
		.words .hero .pin {
			width: min(680px, calc(100vw - 48px));
			margin-inline: auto;
			padding-block: 5vh;
		}
		.words .hero .pin {
			padding-top: 18vh;
		}
		.words .lede {
			max-width: none;
		}
	}
	.words .steps li {
		opacity: 1;
	}
	.words .steps li > span,
	.words .steps li:not(.on) > span {
		display: block;
	}
	.fallback {
		margin-top: 18px;
		font-size: 15.5px;
		color: var(--ink-soft);
	}

	.held {
		white-space: nowrap;
	}
	.term {
		appearance: none;
		display: inline;
		white-space: normal;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: inherit;
		cursor: help;
		pointer-events: auto;
		text-decoration: underline dotted;
		text-decoration-thickness: 1.5px;
		text-underline-offset: 0.2em;
		text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
		transition: text-decoration-color 0.15s;
	}
	.term:hover,
	.term[aria-expanded='true'] {
		text-decoration-color: currentColor;
	}
	.term:focus-visible {
		outline: 2px solid var(--cobalt);
		outline-offset: 2px;
		border-radius: 3px;
	}
	/* Short screens keep what teaches, and let the small print go first. */
	@media (max-height: 800px) and (min-aspect-ratio: 9/10) {
		.pin.tight :global(.crumbs) {
			display: none;
		}
	}
	@media (max-aspect-ratio: 9/10) {
		.pin.end small {
			display: none;
		}
	}
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.tip {
		position: fixed;
		z-index: 30;
		width: min(290px, calc(100vw - 24px));
		padding: 11px 14px 12px;
		border-radius: 12px;
		background: #fffdf7;
		color: #16243d;
		font-family: var(--sans);
		font-size: 14.5px;
		font-weight: 450;
		line-height: 1.42;
		box-shadow:
			0 1px 0 rgb(255 255 255 / 0.9) inset,
			0 10px 30px rgb(6 15 38 / 0.28);
		transform: translateY(-100%);
		transform-origin: 50% 100%;
		pointer-events: none;
		animation: tip-in 0.16s cubic-bezier(0.2, 1.3, 0.5, 1);
	}
	.tip.below {
		transform: none;
		transform-origin: 50% 0;
		animation-name: tip-in-below;
	}
	@keyframes tip-in {
		from {
			opacity: 0;
			transform: translateY(-100%) scale(0.94);
		}
	}
	@keyframes tip-in-below {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tip {
			animation: none;
		}
	}

	.stage {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		height: 100lvh;
		display: block;
	}

	.upright {
		display: none;
	}

	/* Safari stops drawing the page above its toolbar. Melt the world into the colour it fills that strip with, not a hard line. */
	.edge {
		display: none;
		position: fixed;
		z-index: 4;
		left: 0;
		right: 0;
		bottom: 0;
		height: 56px;
		/* A flat colour under a mask, because a flat colour is what Safari can sample for that strip and a gradient isn't. */
		background: var(--tone, var(--sky));
		-webkit-mask-image: linear-gradient(to bottom, transparent, black);
		mask-image: linear-gradient(to bottom, transparent, black);
		pointer-events: none;
	}
	@supports (-webkit-touch-callout: none) {
		.edge {
			display: block;
		}
	}

	.dive {
		position: fixed;
		z-index: 5;
		inset: 0;
		background: #060f26;
		opacity: 0;
		pointer-events: none;
	}

	.journey {
		--rule: rgb(16 26 48 / 0.14);
		--rail: rgb(16 26 48 / 0.16);
		--tray: rgb(255 255 255 / 0.42);
		--tray-rim: rgb(255 255 255 / 0.6);
		color: var(--ink);
	}
	.journey.dark {
		--ink: #f3f7ff;
		--ink-soft: #c2cfe6;
		--cobalt: #6ea2ff;
		--rail: rgb(243 247 255 / 0.22);
		--tray: rgb(255 255 255 / 0.06);
		--tray-rim: rgb(255 255 255 / 0.1);
	}

	/* Each card carries the colours of the world it stands in. */
	.pin {
		--veil: 214 234 251;
		--veil-a: 0.93;
	}
	.pin:global([data-tone='sky']),
	.pin:global([data-tone='warm']) {
		--ink: #101a30;
		--ink-soft: #33415c;
		--cobalt: #1f5fe0;
		--amber: #ffb921;
		--green: #12a956;
		--rule: rgb(16 26 48 / 0.14);
		--tray: rgb(255 255 255 / 0.42);
		--tray-rim: rgb(255 255 255 / 0.6);
	}
	/* Inside the harness: cream walls all round. */
	.pin:global([data-tone='warm']) {
		--veil: 251 241 221;
		--tray: rgb(255 255 255 / 0.55);
		--tray-rim: rgb(226 203 159 / 0.6);
	}
	.pin:global([data-tone='inside']) {
		--ink: #f3f7ff;
		--ink-soft: #c2cfe6;
		--cobalt: #6ea2ff;
		--amber: #ffc247;
		--green: #41e58a;
		--rule: rgb(243 247 255 / 0.22);
		--tray: rgb(255 255 255 / 0.06);
		--tray-rim: rgb(255 255 255 / 0.1);
		--veil: 6 15 38;
		--veil-a: 0.97;
	}

	/* A side trip flies in close, so its props reach up behind the header: the header brings a ground of its own, in the
	   colour of the place the trip is in. Phones have one all the time. */
	.tripping .bar::before {
		content: '';
		position: absolute;
		inset: 0 0 -28px;
		z-index: -1;
		pointer-events: none;
		background: linear-gradient(to bottom, rgb(var(--ground, 214 234 251) / 0.9) 52%, rgb(var(--ground, 214 234 251) / 0));
	}

	.bar {
		position: fixed;
		z-index: 10;
		inset: 0 0 auto;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 18px clamp(20px, 3vw, 44px);
		pointer-events: none;
	}
	.bar > * {
		pointer-events: auto;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: -7px 0 -7px -9px;
		padding: 7px 12px 7px 9px;
		border: 0;
		border-radius: 999px;
		background: none;
		font-family: var(--display);
		font-weight: 700;
		font-size: 17px;
		letter-spacing: -0.01em;
		color: var(--ink);
		justify-self: start;
		cursor: pointer;
		transition:
			color 0.3s,
			background 0.15s;
	}
	.brand:hover {
		background: rgb(127 150 190 / 0.2);
	}
	.brand svg {
		width: 22px;
		height: 22px;
		flex: none;
		overflow: visible;
		transition: transform 0.25s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.brand:hover svg {
		transform: scale(1.14) rotate(-6deg);
	}
	.brand path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
	.brand circle {
		fill: currentColor;
	}
	.brand circle:first-of-type {
		fill: #ffb921;
	}
	.map-chip {
		padding: 3px 8px 4px;
		border-radius: 7px;
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 2px rgb(60 40 10 / 0.16);
		font: 650 12.5px/1.2 var(--sans);
		letter-spacing: 0;
	}
	/* A sheet is open, so the page behind it holds still. */
	:global(html:has(dialog[open])) {
		overflow: hidden;
	}
	.try-it {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 9px;
		margin-top: 8px;
		padding: 10px 16px 10px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--amber);
		color: #111a2e;
		font: inherit;
		font-size: 0.94em;
		font-weight: 700;
		pointer-events: auto;
		cursor: pointer;
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.5),
			inset 0 -4px 0 rgb(176 104 0 / 0.45),
			0 4px 12px rgb(30 70 140 / 0.22);
		transition: transform 0.1s;
	}
	.try-it:hover {
		transform: translateY(-1px);
	}
	.try-it:active {
		transform: translateY(2px);
	}
	/* A knife, about to come down on a strip: the tokenizer's whole job. */
	.try-it i {
		position: relative;
		width: 22px;
		height: 13px;
		border-radius: 3px;
		background: rgb(17 26 46 / 0.86);
	}
	.try-it i::after {
		content: '';
		position: absolute;
		inset: -3px auto -3px 12px;
		width: 2px;
		border-radius: 2px;
		background: #fff3da;
	}

	/* The moment of a jump: gone before anyone sees the world swap. */
	.cut {
		position: fixed;
		z-index: 5;
		inset: 0;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition:
			opacity 0.3s ease-out,
			visibility 0.3s;
	}
	.cut:global(.on) {
		opacity: 1;
		visibility: visible;
		transition: opacity 0.13s ease-in;
	}

	.bar-end {
		grid-column: 3;
		justify-self: end;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.spine {
		display: grid;
		justify-items: end;
		gap: 7px;
	}
	/*
	 * The controls are one panel, made of the same stuff as the labels on the machines: cream, with an edge you can see
	 * the thickness of. Sound, then back and next. Next is amber, the token's colour, whenever it's yours to press.
	 */
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px;
		border-radius: 16px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 10px 26px rgb(20 60 130 / 0.16);
		opacity: 0;
		transition: opacity 0.4s;
	}
	.stepper.show {
		opacity: 1;
	}
	.stepper button {
		display: grid;
		place-items: center;
		width: 40px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: 11px;
		background: transparent;
		color: #33415c;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 0.25s,
			color 0.15s,
			transform 0.1s,
			box-shadow 0.25s,
			opacity 0.2s;
	}
	.stepper button:hover:not(:disabled) {
		background: rgb(217 191 149 / 0.3);
		color: #101a30;
	}
	.stepper button:active:not(:disabled) {
		transform: translateY(1px);
	}
	.stepper button:disabled {
		opacity: 0.32;
		cursor: default;
	}
	.stepper button:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 1px;
	}
	/* A seam between the sound and the steps, pressed into the panel. */
	.stepper .sound {
		position: relative;
		margin-right: 5px;
	}
	.stepper .sound::after {
		content: '';
		position: absolute;
		right: -5px;
		top: 7px;
		bottom: 7px;
		width: 2px;
		border-radius: 1px;
		background: #ecdcbb;
		box-shadow: 1px 0 0 #fff;
	}
	.stepper .sound[aria-pressed='false'] {
		color: #7d879a;
	}
	/* Next, at rest: a little amber key. */
	.stepper button[data-step='next']:not(:disabled) {
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	.stepper button[data-step='next']:hover:not(:disabled) {
		background: linear-gradient(#ffdb78, #ffc23d);
	}
	.stepper button[data-step='next']:active:not(:disabled) {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -1px 0 rgb(176 104 0 / 0.42);
	}
	/*
	 * The beat under way: the key goes out, and the amber comes back into it from the side it's heading, steadily by the
	 * clock, so the reader can see how long is left. Full again, it's the reader's turn, and the arrow gives one small
	 * nudge. Back fills the same way, the other way round, on the way back.
	 */
	.stepper button[data-step] {
		position: relative;
		isolation: isolate;
		overflow: hidden;
	}
	.stepper button[data-step]::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: linear-gradient(90deg, rgb(255 185 33 / 0.18), #ffb921);
		/* Revealed from the start, so the key keeps its round ends instead of squashing. */
		clip-path: inset(0 calc(100% - var(--done, 0) * 100%) 0 0);
		opacity: 0;
		transition: opacity 0.4s ease-out;
	}
	.stepper button[data-step='back']::before {
		background: linear-gradient(270deg, rgb(255 185 33 / 0.18), #ffb921);
		clip-path: inset(0 0 0 calc(100% - var(--done, 0) * 100%));
	}
	.stepper button[data-step]:global(.playing),
	.stepper button[data-step='next']:global(.playing):not(:disabled) {
		background: rgb(217 191 149 / 0.26);
		color: #101a30;
		box-shadow: inset 0 1px 2px rgb(120 90 30 / 0.16);
		transition: none;
	}
	.stepper button[data-step]:global(.playing)::before {
		opacity: 1;
		transition: none;
	}
	.stepper button[data-step='next']:global(.ready) {
		animation: ready 0.9s ease-out;
	}
	.stepper button[data-step='next']:global(.ready) :global(svg) {
		animation: nudge 0.62s cubic-bezier(0.3, 0, 0.2, 1);
	}
	@keyframes ready {
		0% {
			box-shadow:
				inset 0 1px 0 rgb(255 255 255 / 0.55),
				inset 0 -3px 0 rgb(176 104 0 / 0.42),
				0 0 0 0 rgb(255 185 33 / 0.6);
		}
		100% {
			box-shadow:
				inset 0 1px 0 rgb(255 255 255 / 0.55),
				inset 0 -3px 0 rgb(176 104 0 / 0.42),
				0 0 0 10px rgb(255 185 33 / 0);
		}
	}
	@keyframes nudge {
		0%,
		100% {
			transform: none;
		}
		38% {
			transform: translateX(3.5px);
		}
		64% {
			transform: translateX(-1px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stepper button[data-step='next']:global(.ready),
		.stepper button[data-step='next']:global(.ready) :global(svg),
		.spine li.now,
		.begin.live {
			animation: none;
		}
	}

	/* Where the request is: a dot for each of its twelve forms, and the one it's in now is the token, in amber. */
	.spine ol {
		display: flex;
		align-items: center;
		gap: 5px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.spine li {
		width: 14px;
		height: 6px;
		border-radius: 3px;
		background: var(--rail);
		transition:
			background 0.3s,
			width 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.spine li.on {
		background: var(--ink);
	}
	.spine li.now {
		width: 24px;
		height: 8px;
		border-radius: 3px;
		background: #ffb921;
		box-shadow: inset 0 -2px 0 rgb(176 104 0 / 0.45);
		animation: hop-in 0.5s cubic-bezier(0.3, 0.7, 0.4, 1);
	}
	/* The request takes a new form: its token hops into the next place, the way the loader's tokens hop. */
	@keyframes hop-in {
		0% {
			transform: none;
		}
		35% {
			transform: translateY(-7px) scale(0.9, 1.15);
		}
		70% {
			transform: scale(1.12, 0.82);
		}
		100% {
			transform: none;
		}
	}
	/* On a narrower desktop the dots give up some width, so the name beside them stays on one line. */
	@media (min-aspect-ratio: 9/10) and (max-width: 1240px) {
		.spine li {
			width: 10px;
		}
		.spine li.now {
			width: 20px;
		}
		.bar-end {
			gap: 12px;
		}
	}
	/* Narrower still, the count leaves the screen and the name stays: the dots above it already say how far along it
	   is. A screen reader still hears it. */
	@media (min-aspect-ratio: 9/10) and (max-width: 1120px) {
		.spine p span {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.spine strong {
			margin-left: 0;
		}
	}
	.spine p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1;
		color: var(--ink-soft);
	}
	.spine strong {
		color: var(--ink);
		font-weight: 650;
		margin-left: 4px;
	}

	/*
	 * Which agent the notes are told for: a small tray of three, with the chosen one standing up out of it as a cream key.
	 * It's a preference, not a gate, so it stays a size below everything that tells the story.
	 */
	.picker {
		display: inline-flex;
		align-self: flex-start;
		padding: 3px;
		gap: 2px;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.42);
		box-shadow:
			inset 0 1px 2px rgb(30 60 110 / 0.12),
			inset 0 0 0 1px rgb(255 255 255 / 0.5);
	}
	.picker button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 0;
		background: transparent;
		color: #4d5a72;
		font: 600 13.5px/1 var(--sans);
		white-space: nowrap;
		padding: 7px 11px 8px;
		border-radius: 9px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 0.18s,
			color 0.18s,
			box-shadow 0.18s;
	}
	.picker button:hover {
		color: #101a30;
	}
	.picker button.on {
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.18);
	}
	/* The narrowest phones: the three names still fit on one line, with the marks giving way first. */
	@media (max-width: 360px) {
		.picker button {
			padding: 7px 9px 8px;
		}
		.picker button > :global(svg) {
			display: none;
		}
	}

	main {
		position: relative;
	}

	.beat {
		position: relative;
		height: var(--h);
		pointer-events: none;
	}
	/* Driven, the cards are fixed over the picture and the story keeps time by beats, so the sections take no room. */
	.driven > .beat {
		height: 0;
	}
	.runway {
		pointer-events: none;
	}

	.pin {
		position: sticky;
		top: 0;
		min-height: 100vh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		width: min(35vw, 470px);
		padding: 92px 0 48px;
		margin-left: clamp(24px, 5.2vw, 88px);
		pointer-events: auto;
		font-size: clamp(17px, 1.25vw, 19px);
		line-height: 1.5;
		color: var(--ink-soft);
	}
	.driven .pin {
		position: fixed;
		top: 0;
		left: 0;
		height: 100vh;
		/* The smallest the screen gets, so the words stay put when a phone's toolbar slides away. */
		height: 100svh;
		min-height: 0;
		opacity: 0;
		pointer-events: none;
	}
	.driven .pin.right {
		left: auto;
		right: 0;
	}
	.driven .pin.top-band {
		right: 0;
	}
	/* A scrim in the colour of the world behind it: props keep moving under the text, and the text must stay readable. */
	@media (min-aspect-ratio: 9/10) {
		.beat:not(.hero) .pin::before {
			content: '';
			position: absolute;
			inset: 0 -12vw 0 -8vw;
			z-index: -1;
			pointer-events: none;
			background: linear-gradient(to right, rgb(var(--veil) / var(--veil-a)) 76%, rgb(var(--veil) / calc(var(--veil-a) * 0.68)) 84%, rgb(var(--veil) / calc(var(--veil-a) * 0.26)) 92%, rgb(var(--veil) / 0));
		}
		.beat:not(.hero) .pin.right::before {
			inset: 0 -8vw 0 -12vw;
			background: linear-gradient(to left, rgb(var(--veil) / var(--veil-a)) 76%, rgb(var(--veil) / calc(var(--veil-a) * 0.68)) 84%, rgb(var(--veil) / calc(var(--veil-a) * 0.26)) 92%, rgb(var(--veil) / 0));
		}
		/* Where the scene beside the text is bright and close, the shade has to stop before it. */
		.beat:not(.hero) .pin.tight::before {
			inset: 0 -6vw 0 -8vw;
			background: linear-gradient(to right, rgb(var(--veil) / var(--veil-a)) 74%, rgb(var(--veil) / calc(var(--veil-a) * 0.62)) 84%, rgb(var(--veil) / calc(var(--veil-a) * 0.2)) 93%, rgb(var(--veil) / 0));
		}
		.beat:not(.hero) .pin.top-band::before {
			inset: 0 -8vw auto -8vw;
			height: 46vh;
			background: linear-gradient(to bottom, rgb(var(--veil) / var(--veil-a)) 68%, rgb(var(--veil) / 0));
		}
	}
	.pin.right {
		margin-left: auto;
		margin-right: clamp(24px, 5.2vw, 88px);
	}
	.pin.top-band {
		width: auto;
		min-height: 0;
		justify-content: flex-start;
		padding-top: 92px;
		margin-right: clamp(24px, 5.2vw, 88px);
	}
	.hero .pin {
		width: min(46vw, 760px);
	}

	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(50px, 5.6vw, 92px);
		line-height: 0.96;
		letter-spacing: -0.035em;
		color: var(--ink);
		margin: 0 0 20px;
		text-wrap: balance;
	}
	h2 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(34px, 3.5vw, 54px);
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--ink);
		margin: 0 0 18px;
		text-wrap: balance;
	}
	p {
		margin: 0 0 14px;
		text-wrap: pretty;
	}
	.lede {
		font-size: clamp(18px, 1.5vw, 22px);
		line-height: 1.4;
		color: var(--ink-soft);
		margin-bottom: 26px;
		max-width: min(26em, 33vw);
	}
	small {
		font-size: 0.82em;
		opacity: 0.8;
	}

	/*
	 * The way in is a key, the reader's first press, in the token's amber. It's a real key with a real depth, and it goes
	 * down when pressed, the same as the → key it stands for.
	 */
	.begin-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 18px;
		margin: 30px 0 0;
	}
	.begin {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 6px;
		padding: 14px 18px 15px 24px;
		border: 0;
		border-radius: 16px;
		background: linear-gradient(#ffd660, #ffb921 70%);
		color: #101a30;
		font-family: var(--display);
		font-weight: 800;
		font-size: 22px;
		line-height: 1;
		letter-spacing: -0.01em;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.6),
			0 6px 0 #d18b00,
			0 12px 24px rgb(150 90 0 / 0.3);
		transition:
			transform 0.08s,
			box-shadow 0.08s,
			filter 0.15s;
	}
	.begin:hover:not(:disabled) {
		filter: brightness(1.04) saturate(1.05);
		transform: translateY(-1px);
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.6),
			0 7px 0 #d18b00,
			0 14px 26px rgb(150 90 0 / 0.32);
	}
	.begin:active:not(:disabled),
	.begin:global(.pressed) {
		transform: translateY(5px);
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.6),
			0 1px 0 #d18b00,
			0 4px 9px rgb(150 90 0 / 0.3);
	}
	.begin:disabled {
		cursor: default;
		filter: saturate(0.5);
		opacity: 0.7;
	}
	/* The world is ready: the key drops into place like the token on the map, squashes, and settles. */
	.begin.live {
		animation: land 0.62s 0.1s cubic-bezier(0.2, 1.5, 0.4, 1) backwards;
	}
	@keyframes land {
		from {
			opacity: 0;
			transform: translateY(-30px) scale(0.8, 1.12);
		}
		40% {
			opacity: 1;
		}
	}
	.begin :global(svg) {
		transition: transform 0.2s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.begin:hover:not(:disabled) :global(svg) {
		transform: translateX(3px);
	}
	.begin-or {
		font-size: 15px;
		line-height: 1.35;
		color: var(--ink-soft);
	}
	.begin-or kbd {
		display: inline-block;
		min-width: 22px;
		margin: 0 1px;
		padding: 1px 5px 2px;
		border-radius: 6px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 2px rgb(60 40 10 / 0.16);
		font: 650 12.5px/1.5 var(--sans);
		text-align: center;
		color: #101a30;
	}
	.begin-or .by-tap {
		display: none;
	}
	@media (pointer: coarse) {
		.begin-or .by-key {
			display: none;
		}
		.begin-or .by-tap {
			display: inline;
		}
	}

	.told {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		margin: 28px 0 0;
		font-size: 14px;
		color: var(--ink-soft);
	}
	.told .picker {
		align-self: center;
	}

	/* Side trips: a set of tickets off the main road, each with the badge of the place it goes. */
	.trip-set {
		margin: 22px 0 0;
		max-width: 540px;
	}
	.trip-set-head {
		margin: 0 0 9px;
		font-family: var(--display);
		font-weight: 750;
		font-size: 16px;
		line-height: 1.2;
		color: var(--ink);
	}
	.trip-set-head span {
		margin-left: 6px;
		font-family: var(--sans);
		font-weight: 450;
		font-size: 14px;
		color: var(--ink-soft);
	}
	.trip-set ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 9px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.trip-set .trip-go {
		width: 100%;
		height: 100%;
	}
	p.trips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 16px 0 0;
	}
	.trip-go {
		--badge: #28405f;
		--badge-ink: #fff3da;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		box-sizing: border-box;
		padding: 7px 14px 8px 7px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		font: inherit;
		text-align: left;
		cursor: pointer;
		pointer-events: auto;
		-webkit-tap-highlight-color: transparent;
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.12),
			0 6px 16px rgb(20 60 130 / 0.12);
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.trip-go:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.12),
			0 10px 22px rgb(20 60 130 / 0.18);
	}
	.trip-go:active:not(:disabled) {
		transform: translateY(1px);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -1px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.12),
			0 3px 8px rgb(20 60 130 / 0.12);
	}
	.trip-go:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.trip-go[data-place='mcp'] {
		--badge: #1f5fe0;
		--badge-ink: #fff;
	}
	.trip-go[data-place='sandbox'] {
		--badge: #12a956;
		--badge-ink: #fff;
	}
	.trip-go[data-place='memory'] {
		--badge: #ff7f17;
		--badge-ink: #fff;
	}
	.badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--badge);
		color: var(--badge-ink);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.3),
			inset 0 -2px 0 rgb(0 0 0 / 0.2);
		transition: transform 0.25s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.trip-go:hover:not(:disabled) .badge {
		transform: rotate(-7deg) scale(1.06);
	}
	.trip-words {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.trip-words small {
		font-size: 12px;
		font-weight: 550;
		line-height: 1.2;
		color: #5c6880;
		opacity: 1;
	}
	.trip-words b {
		font-size: 14.5px;
		font-weight: 650;
		line-height: 1.2;
	}

	/* A phone's title page: everything a size down, so the words take the top of the screen and the world has the rest,
	   even with a browser's bars at both ends. */
	@media (max-aspect-ratio: 9/10) {
		.hero h1 {
			font-size: clamp(32px, 9.4vw, 44px);
			margin-bottom: 12px;
		}
		.hero .lede {
			font-size: 15.5px;
			line-height: 1.42;
			margin-bottom: 0;
		}
		.begin-row {
			margin-top: 16px;
			gap: 8px 14px;
		}
		.begin {
			margin-bottom: 5px;
			padding: 11px 14px 12px 19px;
			border-radius: 14px;
			font-size: 19px;
		}
		.begin-or {
			font-size: 14px;
		}
		.told {
			margin-top: 16px;
			font-size: 13px;
		}
		.trip-set {
			margin-top: 14px;
		}
		.trip-set-head {
			margin-bottom: 7px;
			font-size: 14.5px;
		}
		.trip-set-head span {
			font-size: 13px;
		}
		.trip-set ul {
			gap: 7px;
		}
		.trip-go {
			gap: 8px;
			padding: 6px 10px 7px 6px;
			border-radius: 12px;
		}
		.badge {
			width: 28px;
			height: 28px;
			border-radius: 8px;
		}
		.trip-words b {
			font-size: 13.5px;
		}
	}
	/* On a big screen the title grows, and the way in grows with it. */
	@media (min-aspect-ratio: 9/10) {
		.begin {
			font-size: clamp(22px, 1.35vw, 27px);
			padding: 0.64em 0.8em 0.7em 1.08em;
		}
		.begin-or,
		.told {
			font-size: clamp(14.5px, 0.88vw, 17px);
		}
		.hero .picker button {
			font-size: clamp(13.5px, 0.8vw, 15.5px);
		}
		.trip-set {
			max-width: clamp(540px, 34vw, 680px);
		}
		.trip-set-head {
			font-size: clamp(16px, 1vw, 19px);
		}
		.trip-set-head span {
			font-size: clamp(14px, 0.85vw, 16px);
		}
		.trip-set .trip-words b {
			font-size: clamp(14.5px, 0.88vw, 17px);
		}
		.trip-set .badge {
			width: clamp(32px, 2vw, 38px);
			height: clamp(32px, 2vw, 38px);
		}
	}
	/* A short phone screen, such as Chrome's on an iPhone with its two bars: the line under the heading gives way. */
	@media (max-aspect-ratio: 9/10) and (max-height: 720px) {
		.trip-set-head span {
			display: none;
		}
	}
	/* The story steps aside while a trip has the screen, and comes back as it ends. */
	main {
		transition: opacity 0.35s;
	}
	main.away {
		opacity: 0;
	}
	.trip-scroll {
		position: fixed;
		z-index: 3;
		inset: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		outline: none;
		transition: opacity 0.35s;
	}
	.trip-scroll:global(.leaving) {
		opacity: 0;
	}
	:global(html:has(.trip-scroll)) {
		overflow: hidden;
	}
	.trip-back {
		justify-self: center;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 10px 18px 11px 12px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		font: 650 15px/1 var(--sans);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 10px 26px rgb(20 60 130 / 0.16);
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.trip-back:hover {
		transform: translateY(-1px);
	}
	.trip-back:active {
		transform: translateY(1px);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -1px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 4px 10px rgb(20 60 130 / 0.14);
	}
	.trip-back:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 2px;
	}
	.trip-back .short {
		display: none;
	}

	/* What differs between agents: a soft tray under the story, led by a key with the agent's name on it. */
	.note {
		margin-top: 10px;
		padding: 10px 14px 11px;
		border-radius: 14px;
		background: var(--tray);
		box-shadow: inset 0 0 0 1px var(--tray-rim);
		font-size: 0.9em;
		line-height: 1.5;
	}
	.note b {
		color: var(--ink);
		font-weight: 650;
	}

	.steps {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		align-content: start;
		gap: 10px;
		font-size: 0.92em;
		line-height: 1.38;
	}
	.steps li {
		display: grid;
		gap: 1px;
		padding-left: 14px;
		border-left: 3px solid var(--rule);
		opacity: 0.56;
		transition:
			opacity 0.25s,
			border-color 0.25s;
	}
	.steps strong {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--ink);
		font-weight: 650;
	}
	.steps strong > :global(svg) {
		color: var(--ink-soft);
		transition: color 0.25s;
	}
	.steps li.on strong > :global(svg) {
		color: var(--ink);
	}
	.steps li.on {
		opacity: 1;
		border-color: var(--amber);
	}
	.steps li.done {
		opacity: 1;
		border-color: var(--green);
	}
	.steps.compact {
		gap: 7px;
		margin-bottom: 14px;
		font-size: 0.88em;
	}

	.eq {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 5px;
		margin: 4px 0 14px;
		padding: 12px 14px;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.06);
		font-family: var(--mono);
		font-size: clamp(14px, 1.1vw, 16px);
		font-weight: 500;
		line-height: 1.2;
		color: var(--ink);
	}
	.eq b {
		font-weight: 800;
	}
	.eq .q {
		color: #ffc247;
	}
	.eq .k {
		color: #41e58a;
	}
	.eq .v {
		color: #59e0e6;
	}
	.eq-paren {
		font-size: 1.7em;
		font-weight: 300;
		opacity: 0.7;
	}
	.eq-part,
	.eq-frac {
		padding: 2px 5px;
		border-radius: 7px;
		transition: background 0.25s;
	}
	.eq-frac {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
	}
	.eq-top {
		padding: 0 3px 2px;
		border-bottom: 1px solid currentColor;
	}
	.eq-bot {
		padding-top: 2px;
	}
	.eq sup,
	.eq sub {
		font-size: 0.68em;
		line-height: 0;
	}
	.eq .lit {
		background: rgb(255 194 71 / 0.24);
	}

	.cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 30em));
		gap: 8px 40px;
	}

	.again {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 11px 18px 12px 14px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(#fffaf0, #fbefd6);
		color: #101a30;
		font: inherit;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
		pointer-events: auto;
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.12),
			0 6px 16px rgb(20 60 130 / 0.12);
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.again:hover {
		transform: translateY(-1px);
	}
	.again:active {
		transform: translateY(1px);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -1px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.12),
			0 3px 8px rgb(20 60 130 / 0.12);
	}
	.driven .pin.end {
		pointer-events: auto;
	}
	.next {
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.2em;
		line-height: 1.2;
		color: var(--ink);
		margin-top: 12px;
	}

	@media (max-aspect-ratio: 9/10) {
		/* One row: where you are on the left, then sound, the steps and the map within reach of a thumb on the right. */
		.bar {
			grid-template-columns: minmax(0, 1fr) auto auto auto;
			column-gap: 4px;
			padding: 14px 10px 14px 20px;
		}
		.bar-end {
			display: contents;
		}
		/* A phone keeps the dots and the form's name, and lets the count leave the screen: a screen reader still hears it. */
		.spine p span {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.spine strong {
			margin-left: 0;
		}
		.spine {
			order: 1;
			justify-self: start;
			justify-items: start;
			min-width: 0;
		}
		.stepper {
			order: 2;
		}
		/* On a trip, the way back takes the map's place, where a thumb finds it. */
		.tripping .brand {
			display: none;
		}
		.trip-back {
			order: 3;
			padding: 8px 12px 8px 9px;
			font-size: 14px;
		}
		.trip-back .long {
			display: none;
		}
		.trip-back .short {
			display: inline;
		}
		/* No room for the name on a phone, so the button just says what it opens. */
		.brand {
			order: 3;
			gap: 5px;
			margin: 0 0 0 2px;
			padding: 9px 11px 10px 8px;
			border-radius: 15px;
			background: linear-gradient(#fffaf0, #fbefd6);
			color: #101a30;
			box-shadow:
				inset 0 1px 0 #fff,
				inset 0 -3px 0 #e4cfa6,
				0 1px 2px rgb(60 40 10 / 0.14),
				0 10px 26px rgb(20 60 130 / 0.16);
		}
		.brand:hover {
			background: linear-gradient(#fffaf0, #fbefd6);
		}
		.brand .name {
			display: none;
		}
		.map-chip {
			padding: 0;
			background: none;
			box-shadow: none;
			font-size: 14px;
		}
		/* On a phone the scene runs up under the header, so the header brings its own ground. It's a flat colour, the
		   world's own tone, because iOS Safari tints the strip around the clock from a fixed header's background colour
		   and can't read a gradient. Below it, a short fade in the same tone. */
		.bar {
			background-color: var(--tone, rgb(198 229 253));
		}
		.bar::before,
		.tripping .bar::before {
			content: '';
			position: absolute;
			inset: 100% 0 -48px;
			z-index: -1;
			pointer-events: none;
			background: linear-gradient(to bottom, var(--tone, rgb(198 229 253)), transparent);
			transition: opacity 0.4s;
		}
		.bar.at-title::before {
			opacity: 0;
		}
		/* Small enough that the dots stop short of the panel, with the map beside it. */
		.bar .spine ol {
			gap: 3px;
		}
		.spine li {
			width: 8px;
		}
		.spine li.now {
			width: 14px;
		}
		.stepper {
			gap: 2px;
			padding: 3px;
			border-radius: 15px;
		}
		.stepper button {
			width: 37px;
		}
		/* The narrowest phones tighten the dots and the keys a little more. */
		@media (max-width: 380px) {
			.bar .spine li {
				width: 6px;
			}
			.bar .spine li.now {
				width: 12px;
			}
			.bar .stepper button {
				width: 33px;
			}
		}
		.pin,
		.pin.right,
		.pin.top-band {
			width: auto;
			margin: 0;
			padding: 74px 20px 26px;
			justify-content: flex-end;
			min-height: 100vh;
			min-height: 100svh;
			font-size: 16px;
		}
		/* The words sit on the bottom of the screen, wherever Safari's toolbar leaves it, and the picture has the rest.
		   Sized to the smallest screen, they used to leave an empty strip under them while the toolbar was away. */
		.driven .beat:not(.hero) .pin {
			top: auto;
			bottom: 0;
			height: auto;
			min-height: 0;
		}
		/* Every card spans the screen, so its ground does too, however short its lines. */
		.driven .pin,
		.driven .pin.right,
		.driven .pin.top-band {
			left: 0;
			right: 0;
		}
		.pin > :global(*) {
			position: relative;
		}
		/* The ground under a card starts where its words start, however many there are. Everything above it stays the scene's. */
		.driven .beat:not(.hero) .pin > :global(:first-child)::before {
			content: '';
			position: absolute;
			z-index: -1;
			top: calc(var(--ramp, 52px) * -1);
			left: -20px;
			width: 100vw;
			height: 200vh;
			background: linear-gradient(to bottom, rgb(var(--veil) / 0), rgb(var(--veil) / 0.97) var(--ramp, 52px));
			pointer-events: none;
		}
		.wheel-card {
			--ramp: 30px;
		}
		.whole {
			--ramp: 18px;
		}
		/* These cards carry the most, and a phone has the least room: keep what teaches. */
		.pin.tight small,
		.pin.tight :global(.crumbs) {
			display: none;
		}
		.eq {
			margin-bottom: 10px;
			padding: 9px 10px;
			/* Sized to the room it has, so the formula always holds on one line. */
			font-size: min(13px, calc((100vw - 60px) * 0.0375));
			flex-wrap: nowrap;
		}
		.ten-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}
		.pin.whole {
			justify-content: flex-end;
			padding: 74px 20px 22px;
			margin: 0;
		}
		.whole-top,
		.closing {
			max-width: none;
		}
		.whole-top {
			margin-bottom: 12px;
		}
		.whole h2 {
			font-size: 32px;
		}
		.closing .next {
			margin-bottom: 10px;
			font-size: 21px;
		}
		.enter-row {
			margin-bottom: 14px;
		}
		/* The shortest phones keep the world and the key. The stops are named out in the world anyway. */
		@media (max-height: 700px) {
			.trip {
				display: none;
			}
		}
		.turns button {
			max-width: none;
			height: 36px;
		}
		/* On the shortest phones the ticket keeps its room, and the explaining gives way. */
		@media (max-height: 760px) {
			.ten-intro,
			.tally-why {
				display: none;
			}
			.ten h2 {
				margin-bottom: 8px;
			}
		}
		.dial {
			gap: 6px;
			margin: 2px 0 8px;
			padding: 9px 12px 12px;
		}
		/* The shortest phones: everything a notch tighter, so the scene keeps its share of the screen. */
		@media (max-height: 700px) {
			.pin,
			.pin.right,
			.pin.top-band {
				padding-bottom: 16px;
				font-size: 15px;
				line-height: 1.4;
			}
			h2 {
				margin-bottom: 8px;
				font-size: 28px;
			}
			p {
				margin-bottom: 8px;
			}
			.note {
				margin-top: 4px;
			}
			.steps {
				display: flex;
				flex-wrap: wrap;
				gap: 3px 14px;
				margin-top: 4px;
				line-height: 1.3;
			}
			.eq {
				margin-bottom: 6px;
				padding: 6px 10px;
			}
			.short-note {
				display: none;
			}
		}
		/* On the shortest phones the wheel still has to show, so the toy keeps its room and the words give way. */
		@media (max-height: 700px) {
			.wheel-card h2 {
				margin-bottom: 8px;
			}
			.wheel-card p:nth-of-type(2),
			.wheel-card p:last-child {
				display: none;
			}
		}
		.spin {
			padding: 8px 14px;
		}
		.hero .pin {
			width: auto;
			justify-content: flex-start;
		}
		h1 {
			font-size: clamp(44px, 12.4vw, 64px);
		}
		.lede {
			margin-bottom: 18px;
			max-width: none;
		}
		.steps li:not(.on) > span {
			display: none;
		}
		/* The title page's ground is the header's own sky, so the two meet without a seam. */
		.hero .pin {
			--veil: 198 229 253;
		}
		.hero .pin::before {
			content: '';
			position: absolute;
			pointer-events: none;
			inset: 0 0 auto;
			height: 56%;
			background: linear-gradient(to bottom, rgb(var(--veil) / 0.9) 72%, rgb(var(--veil) / 0));
		}
		.cols {
			grid-template-columns: 1fr;
		}
	}

	/* A tablet held upright reads like a phone, a size up, with lines kept to a comfortable length. */
	@media (max-aspect-ratio: 9/10) and (min-width: 600px) {
		.pin,
		.pin.right,
		.pin.top-band {
			padding-left: 40px;
			padding-right: 40px;
			font-size: 17.5px;
		}
		.pin > :global(*) {
			max-width: 640px;
		}
		.driven .beat:not(.hero) .pin > :global(:first-child)::before {
			left: -40px;
		}
		.hero .lede {
			font-size: 18px;
		}
	}

	/* A phone on its side has room for the film or for the words, not both. It gets the film, with each chapter's title as a caption. */
	@media (max-height: 500px) and (min-aspect-ratio: 9/10) {
		.bar {
			padding: 10px 16px;
		}
		.brand .name {
			display: none;
		}
		.driven .pin,
		.driven .pin.left,
		.driven .pin.right,
		.driven .pin.top-band {
			top: auto;
			bottom: 14px;
			left: 16px;
			right: auto;
			width: auto;
			max-width: 62vw;
			height: auto;
			min-height: 0;
			margin: 0;
			padding: 0;
			transform: none;
		}
		.driven .pin::before,
		.driven .pin > :global(*)::before {
			display: none;
		}
		.driven .pin > :global(*) {
			display: none;
		}
		.driven .pin > :global(h1),
		.driven .pin > :global(h2) {
			display: block;
			width: fit-content;
			margin: 0;
			padding: 6px 14px 7px;
			border-radius: 12px;
			background: rgb(var(--veil) / 0.86);
			color: var(--ink);
			font-size: 17px;
			line-height: 1.2;
		}
		.driven .pin > :global(h2 br),
		.driven .pin > :global(h1 br) {
			display: none;
		}
		.driven .pin > .upright {
			display: block;
			width: fit-content;
			margin: 6px 0 0;
			padding: 5px 12px;
			border-radius: 10px;
			background: rgb(var(--veil) / 0.86);
			color: var(--ink-soft);
			font-size: 13px;
		}
	}
</style>
