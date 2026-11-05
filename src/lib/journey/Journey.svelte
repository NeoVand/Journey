<script lang="ts">
	import { GLOSSARY, HARNESSES, FORMS, LOGITS, RUN_WITH_CACHE, RUN_WITHOUT_CACHE, slug, TEN_TURNS, TOP_K, TRIP, wheelOdds, type HarnessId } from './content';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import TripMap from './TripMap.svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Attachment } from 'svelte/attachments';
	import type { World } from './world';
	import { PACE, Playhead } from './playhead';
	import { Sharpness } from './sharpness';
	import { SvelteSet } from 'svelte/reactivity';
	import Blueprint, { type Stage } from './Blueprint.svelte';

	const ids: HarnessId[] = ['claude', 'codex', 'copilot'];
	const labels: Record<HarnessId, string> = { claude: 'Claude Code', codex: 'Codex', copilot: 'Copilot' };

	let harness = $state<HarnessId>('claude');
	let form = $state(1);
	let drawer = $state(-1);
	let check = $state(-1);
	let gate = $state(-1);
	let scrolled = $state(false);
	let dark = $state(false);
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
			claude: 'Thinking blocks carry a signature, so they can come back unmodified on the next turn.',
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
			copilot: 'A confirmation card in the editor, with auto-approve lists and a cap on requests per session.'
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
			claude: 'Resends everything. The API is [[stateless]], and the prefix cache makes that cheap.',
			codex: 'Also resends, with reasoning sealed as encrypted items. The API can keep state on its side instead.',
			copilot: 'Rebuilds the prompt from its parts every turn, trimming low-priority ones when the budget is tight.'
		}[harness],
		compact: {
			claude: 'Compacts automatically near the limit, or on /compact. Durable notes can live in CLAUDE.md and auto memory.',
			codex: 'A client-side /compact, or server-side compaction that returns an encrypted item to append.',
			copilot: 'A background summarizer watches the budget, with a simpler fallback if the full mode fails.'
		}[harness],
		door: {
			claude: 'One front door: Anthropic’s own, or Bedrock, Vertex or Foundry for the same models.',
			codex: 'One front door. With a ChatGPT login the request goes to ChatGPT’s backend rather than the public API host.',
			copilot: 'Two front doors. GitHub checks your plan, policies and content exclusions, then forwards to the vendor, whose own door runs this list again.'
		}[harness]
	});

	const DRAWERS = $derived([
		{ name: 'Instructions', text: `Who the agent is, plus your project’s rules from ${spec.ruleFile}.` },
		{ name: 'Environment', text: 'Where you are: folder, git branch, operating system, date, shell.' },
		{ name: 'Tools', text: 'Everything it may ask to do, built in or from [[MCP]] servers. Each has a name, a description and a [[JSON Schema]], and each costs tokens on every turn.' },
		{ name: 'Conversation', text: 'Your prompt. On turn one, nothing else.' }
	]);

	const GATES = [
		{ name: 'Valid shape?', text: 'Is this a real tool, with arguments that fit?' },
		{ name: 'Allowed path?', text: 'Inside the project, and not on a deny list?' },
		{ name: 'Policy', text: 'May this run without asking?' },
		{ name: 'You, if asked', text: 'Reads often pass on their own. Writes and commands may come to you.' }
	];

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

	async function spinIt() {
		if (!world || spinning) return;
		spinning = true;
		landed = -1;
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

	function openMap() {
		mapHere = locate();
		mapOpen = true;
	}

	function jump(title: string) {
		mapOpen = false;
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
		world?.pressEnter(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	}

	/** The real key works too, unless it already belongs to whatever has focus. */
	function enterKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.key === 'Enter' && tripDone && !mapOpen && !target?.closest('button, a, input, dialog')) pressEnter();
	}

	/** The ten turns follow the bars as they rise. Once a turn has been told, the reader can go back to it. */
	let turnReached = $state(-1);
	let turnPinned = $state(-1);
	const turn = $derived(turnPinned >= 0 ? turnPinned : Math.max(0, turnReached));
	const ticket = $derived(TEN_TURNS[turn]);

	function pinTurn(i: number) {
		turnPinned = i;
		world?.setTurn(i);
	}

	let cacheOn = $state(true);
	const ran = new Tween(RUN_WITH_CACHE, { duration: 900, easing: cubicOut });

	function setCache(on: boolean) {
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
	const pieces = (text: string) =>
		text
			.split(/(\[\[[^\]]+\]\])/)
			.filter(Boolean)
			.map((piece) => {
				const m = piece.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
				return m ? { text: m[1], key: (m[2] ?? m[1]).toLowerCase() } : { text: piece, key: '' };
			});

	/** The pages that really do read or look different for each agent. */
	const DIFFERS = new Set([0, 1, 2, 3, 4, 5, 11, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29]);
	const tried = new SvelteSet<string>();
	const differs = $derived(DIFFERS.has(section));
	/** An agent breathes while this page has something to show for it that the reader has not looked at yet. */
	const hinting = (id: HarnessId) => differs && id !== harness && !tried.has(`${section}/${id}`);

	const nextAgent = $derived(ids[(ids.indexOf(harness) + 1) % ids.length]);

	function choose(id: HarnessId) {
		tried.add(`${section}/${harness}`);
		tried.add(`${section}/${id}`);
		harness = id;
		world?.setHarness(id);
	}

	const stage: Attachment<HTMLCanvasElement> = (canvas) => {
		let disposed = false;
		let raf = 0;
		let cleanup = () => {};
		const params = new URLSearchParams(location.search);
		const still = params.has('still');

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

			const sections = [...document.querySelectorAll<HTMLElement>('[data-beat]')];
			let tops: number[] = [];
			let heights: number[] = [];
			const measure = () => {
				tops = sections.map((s) => s.offsetTop);
				heights = sections.map((s) => s.offsetHeight);
				// The scroll bar stops one viewport before the page ends, and the story must end exactly there.
				heights[heights.length - 1] = Math.max(1, heights[heights.length - 1] - window.innerHeight);
			};
			const toT = (y: number) => {
				let i = 0;
				while (i < sections.length - 1 && y >= tops[i + 1]) i++;
				return i + Math.min(1, Math.max(0, (y - tops[i]) / heights[i]));
			};
			const toY = (T: number) => {
				const i = Math.min(sections.length - 1, Math.floor(T));
				return tops[i] + (T - i) * heights[i];
			};

			const dprFor = () => Math.min(window.devicePixelRatio || 1, 2);
			let dpr = dprFor();
			const resize = () => {
				measure();
				w.resize(window.innerWidth, window.innerHeight, dpr);
			};
			performance.mark('journey:built');
			w.stage.warmUp();
			performance.mark('journey:warm');
			resize();
			window.addEventListener('resize', resize);

			const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const head = new Playhead(PACE, toT(window.scrollY), reduced);
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

			let last = performance.now();
			let time = 0;
			const sharpness = new Sharpness(dpr, w.stage.ao.enabled);

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
				const diveEl = document.querySelector<HTMLElement>('[data-dive]')!;
				const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
				const shownKey: number[] = [];
				const fade = () => {
					// Cards belong to the playhead, not the scroll bar, so text and scene can never drift apart.
					pins.forEach(({ el, i, from, end, fade: f }, n) => {
						const t = T - i;
						const inK = n === 0 ? 1 : seg(t, from - f * 0.3, from + f * 0.7);
						const outK = n === lastPin ? 0 : seg(t, end, end + f);
						const k = Math.min(inK, 1 - outK);
						const key = k <= 0 ? -1 : Math.round(k * 200) + (outK > 0 ? 1000 : 0);
						if (shownKey[n] === key) return;
						shownKey[n] = key;
						el.style.opacity = String(k);
						const moving = k > 0 && k < 1;
						el.style.transform = moving ? `translateY(${(1 - inK) * 14 - outK * 10}px)` : 'none';
						if (n === 0) el.style.pointerEvents = k > 0.6 ? 'auto' : 'none';
						el.inert = k < 0.1;
					});
					diveEl.style.opacity = String(w.state.dive);
				};

				const publish = () => {
				form = w.state.form;
				// Only the header follows this. It switches while the screen is black, so nobody sees it happen.
				dark = T >= 7.96 && T < 19.02;
				fade();
				scrolled = T > 0.72;
				const starts = [2.04, 2.2, 2.36, 2.52];
				let dr = -1;
				starts.forEach((a, i) => {
					if (T >= a) dr = i;
				});
				drawer = T > 2.74 ? 4 : dr;
				check = T < 5 ? -1 : Math.min(5, Math.floor(((T - 5.04) / 0.58) * 5));
				// The first call stops at the second gate, and the list has to say so.
				gate = T < 20.04 ? -1 : T < 20.4 ? 1 : Math.min(4, Math.floor(((T - 20.4) / 0.58) * 5));
				section = Math.min(sections.length - 1, Math.floor(T));
				part = T < 14.15 ? null : T < 14.3 ? 'embed' : T < 14.625 ? 'attn' : T < 14.7 ? 'ffn' : T < 14.865 ? 'stack' : 'head';
				attention = T < 14.358 ? -1 : T < 14.4 ? 0 : T < 14.43 ? 1 : T < 14.5 ? 2 : 3;
				tripStep = w.trip.step;
				tripLaps = w.trip.laps;
				tripDone = T >= 32.88;
				const reached = T < 29.1 ? -1 : Math.min(TEN_TURNS.length - 1, Math.floor((T - 29.1) / 0.066));
				if (reached !== turnReached) {
					turnReached = reached;
					turnPinned = -1;
					w.setTurn(Math.max(0, reached));
				}
			};

			const frame = (now: number) => {
				raf = requestAnimationFrame(frame);
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				time += dt;
				T = head.step(toT(window.scrollY), dt);
				px += (mx - px) * (1 - Math.exp(-dt * 3));
				py += (my - py) * (1 - Math.exp(-dt * 3));
				w.update(T, reduced ? 0 : time, dt, reduced ? 0 : px, reduced ? 0 : py, reduced);
				publish();

				const change = params.has('debug') ? null : sharpness.frame(dt);
				if (change) {
					dpr = change.dpr;
					w.resize(window.innerWidth, window.innerHeight, dpr);
					w.stage.setOcclusion(change.occlusion);
				}
			};

			// A cut, not a flight: the long way round would be minutes of scenery the reader didn't ask for.
			const pinOf = (title: string) => pins.find((p) => p.el.querySelector('h1, h2')?.textContent === title);
			const startOf = (p: (typeof pins)[number]) => (p.i === 0 ? 0 : p.i + p.from + p.fade * 0.8);
			const cutEl = document.querySelector<HTMLElement>('[data-cut]')!;
			let cutTimer = 0;
			cutTo = (title, at) => {
				const pin = pinOf(title);
				if (!pin) return;
				const nextT = startOf(pin);
				const land = () => {
					window.scrollTo({ top: toY(nextT), behavior: 'instant' });
					T = nextT;
					head.T = nextT;
					head.v = 0;
				};
				if (reduced || still || at) return land();
				cutEl.style.background = nextT >= 7.96 && nextT < 19.02 ? '#060f26' : '#d6eafb';
				cutEl.classList.add('on');
				clearTimeout(cutTimer);
				cutTimer = window.setTimeout(() => {
					land();
					requestAnimationFrame(() => requestAnimationFrame(() => cutEl.classList.remove('on')));
				}, 150);
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
						window.scrollTo(0, toY(nextT));
						T = nextT;
						head.T = nextT;
						head.v = 0;
						w.update(nextT, t, 1, 0, 0, true);
						publish();
					},
					maxT: () => toT(document.documentElement.scrollHeight - window.innerHeight)
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
				window.removeEventListener('hashchange', onHash);
				clearTimeout(cutTimer);
				w.dispose();
			};
			driven = true;
			// Behind the loader nobody sees it happen, so there's no need for the cut to hide it.
			followAddress('at-once');
			canvas.dataset.ready = 'true';
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	};

	const reachedForm = (n: number) => n <= form;

	function restart(event: MouseEvent) {
		event.preventDefault();
		cutTo('How a coding agent works');
	}
</script>

{#snippet picker(compact: boolean)}
	<div class={['picker', { compact }]} role="radiogroup" aria-label="Which coding agent do you use?">
		{#each ids as id (id)}
			<button
				type="button"
				role="radio"
				aria-checked={harness === id}
				class={{ on: harness === id, hint: hinting(id) }}
				title={hinting(id) ? `This page is different for ${labels[id]}` : undefined}
				onclick={() => choose(id)}>{labels[id]}</button
			>
		{/each}
	</div>
{/snippet}

<!-- A phone has no room for the picker in its header, so the agent's name in each note is the way to change it. -->
{#snippet agent()}
	<b class="agent-name">{spec.name}.</b>
	<button type="button" class={['agent', { hint: hinting(nextAgent) }]} aria-label="{spec.name}. Show this for {labels[nextAgent]}" onclick={() => choose(nextAgent)}>
		{spec.name}
		<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5H11L8 2M12.5 9H3l3 3" /></svg>
	</button>
{/snippet}

{#snippet rich(text: string)}
	{#each pieces(text) as piece, i (i)}
		{#if piece.key}<button
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
			>{:else}{piece.text}{/if}
	{/each}
{/snippet}

<svelte:window
	onscroll={() => (tip = null)}
	onclick={() => (tip = null)}
	onkeydown={(e) => {
		if (e.key === 'Escape') tip = null;
		enterKey(e);
	}}
/>

<canvas class="stage" {@attach stage} aria-hidden="true"></canvas>
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
<div class="dive" data-dive aria-hidden="true"></div>
<div class="cut" data-cut aria-hidden="true"></div>

<div class={['journey', { dark, words: failed }]}>
<header class="bar">
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
	<div class={['bar-picker', { show: scrolled }]} inert={!scrolled}>
		{@render picker(true)}
	</div>
	<div class="spine" role="status" aria-live="polite">
		<ol aria-hidden="true">
			{#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}
				<li class={{ on: reachedForm(n), now: n === form }}></li>
			{/each}
		</ol>
		<p>
			<span>Form {form} of 12</span> <strong>{current.name}</strong>
		</p>
	</div>
</header>

<main id="top" class={{ driven, words: failed }}>
	<section data-beat class="beat hero" style:--h="170vh">
		<div class="pin left top" data-out="0.55">
			<h1>How a coding agent works</h1>
			<p class="lede">You type one sentence. Follow it all the way to the model and back, until the bug is fixed. Pick your agent, then scroll.</p>
			{@render picker(false)}
			{#if failed}
				<p class="fallback">This browser can’t draw the 3D scenes right now, so here’s the whole story in words.</p>
			{:else}
				<p class="scroll-hint"><span class="arrow" aria-hidden="true"></span>Scroll to begin</p>
			{/if}
		</div>
	</section>

	<section data-beat class="beat" style:--h="360vh">
		<article class="pin left" data-out="0.62">
			<h2>It starts as a sentence</h2>
			<p>{@render rich(`You type one request. For now it’s just ${surfaceWords}. The model hasn’t seen a thing, and nothing here is a [[token]] yet.`)}</p>
			<p>Your request will change form twelve times on this trip. The corner up there keeps count.</p>
			<p class="note">{@render agent()} {@render rich(callouts.prompt)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.76">
			<h2>The harness wakes up</h2>
			<p>
				The harness is the program around the model, the part you installed. Before anything leaves your laptop, it spends a few hundred
				milliseconds packing what the model will need.
			</p>
			<ol class="steps">
				{#each DRAWERS as d, i (d.name)}
					<li class={{ on: drawer === i, done: drawer > i }}>
						<strong>{d.name}</strong>
						<span>{@render rich(d.text)}</span>
					</li>
				{/each}
			</ol>
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
			<p>{@render rich('The harness opens a secure connection, and [[TLS]] scrambles every byte, so nobody along the way can read your code.')}</p>
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
						<strong>{c.name}</strong>
						<span>{@render rich(c.text)}</span>
					</li>
				{/each}
			</ol>
			<p class="note">{@render agent()} {@render rich(callouts.door)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="640vh">
		<article class="pin top-band" data-out="0.86">
			<h2>Now it is a token</h2>
			<div class="cols">
				<p>
					{@render rich('First, a [[chat template]] flattens the whole request into one long string, with markers showing who said what. Then the tokenizer cuts it into pieces from a vocabulary of 100,000 to 200,000 entries.')}
				</p>
				<p>
					Each piece has a number, and those numbers are all the model will ever read. No letters. The two “the” tiles get the same number,
					and the blue tiles are markers the template added. <small>IDs are illustrative.</small>
				</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="400vh">
		<article class="pin left" data-out="0.58">
			<h2>Thousands more behind it</h2>
			<p>
				Your sentence is only the tail. The instructions and tool descriptions count too, so turn one comes to about 21,000 tokens.
				<small>Illustrative.</small>
			</p>
			<p>All of them are headed for a machine already serving hundreds of other people.</p>
			<p class="next">{@render rich('Next stop: inside the [[inference cluster]].')}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.68">
			<h2>One model, many chips</h2>
			<p>{@render rich('A frontier model is hundreds of billions to a few trillion learned numbers, its [[weights]]. Even compressed they won’t fit in one chip’s memory, so they’re split across many.')}</p>
			<p>{@render rich('Chips in one server talk over [[NVLink]], at terabytes per second. Servers talk to each other over [[InfiniBand or RoCE]], at hundreds of gigabits.')}</p>
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
				To predict the next token, every layer looks back at every earlier token. For each one it needs two lists of numbers, a key and a
				value. Working them out again at every step would be absurd, so they’re computed once and kept. That store is the KV cache.
			</p>
			<p>
				At about 330 KB per token, your 21,000 tokens take about 7 GB of chip memory, the scarcest thing in all of inference.
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

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin right" data-out="0.8">
			<h2>Turn two starts ahead</h2>
			<p>
				Turn two starts with exactly the same bytes as turn one, plus a little more. Those matching blocks are already computed, so only the
				new part runs. Remember the careful order on that JSON page? This is why.
			</p>
			<p>It saves computing. It isn’t the model remembering you. Unused blocks get thrown out, usually within minutes, so coming back after an hour costs full price once.</p>
			<p class="note short-note">{@render agent()} {@render rich(callouts.cache)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin left" data-out="0.86">
			<h2>Sharing the chips</h2>
			<p>{@render rich('A chip only earns its keep when it works on many requests at once. So at every step, the [[scheduler]] gathers a batch of requests that each need one more token.')}</p>
			<p>When one finishes, a waiting one takes its lane right away. Nobody waits for a batch to fill.</p>
			<p>Yours is the amber one.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.74">
			<h2>Reading and writing</h2>
			<p>{@render rich('Reading your prompt is called [[prefill]]: thousands of tokens at once, limited by compute. Writing the answer is called [[decode]]: one token per step, limited by memory.')}</p>
			<p>{@render rich('So many clusters split them into two pools, and ship the KV cache across over [[RDMA]]. It’s a choice, not a law. For some work, one shared pool still wins.')}</p>
			<p class="next">Next stop: inside those chips. What are they actually running?</p>
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
				<small>Around both steps, the layer normalizes its numbers to keep them in range and adds the old vector back, so nothing is lost. In many large models, a tiny router here picks a few experts out of hundreds.</small>
			</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.705" data-out="0.862" data-fade="0.014">
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
					oninput={() => world?.setTemperature(temperature)}
				/>
				<ol class="odds">
					{#each LOGITS.slice(0, TOP_K) as l, i (l.text)}
						<li class={{ won: landed === i }}>
							<b>{l.text}</b>
							<span>{odds[i] < 0.005 ? '<1' : Math.round(odds[i] * 100)}%</span>
							{#if wins[i]}<em>×{wins[i]}</em>{/if}
						</li>
					{/each}
				</ol>
				<button type="button" class="spin" disabled={spinning} onclick={spinIt}>{spinning ? 'Round it goes' : 'Spin it yourself'}</button>
			</div>
			<p><small>Illustrative odds. In this story, it lands on “The”.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="600vh">
		<article class="pin left tight" data-in="0.075" data-out="0.86">
			<h2>One at a time</h2>
			<p>Now the loop. The new token climbs the same stack, alone. On each layer it looks back at everything through the KV cache, and adds its own key and value to the row of lights. One step takes 10 to 40 milliseconds. That’s the typing speed you see.</p>
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
		<article class="pin right" data-out="0.74">
			<h2>Only text comes back</h2>
			<p>Each number is looked up in the vocabulary. The detokenizer waits until it has a whole character, then sends a small chunk of text. Token numbers never leave the data center.</p>
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
		<article class="pin left" data-out="0.88">
			<h2>Intent is not authority</h2>
			<p>Every call passes the same gates. Here, one is refused: a request for your secrets, stopped by a deny list.</p>
			<ol class="steps compact">
				{#each GATES as g, i (g.name)}
					<li class={{ on: gate === i, done: gate > i }}>
						<strong>{g.name}</strong>
						<span>{g.text}</span>
					</li>
				{/each}
			</ol>
			<p class="note">{@render agent()} {@render rich(callouts.policy)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.88">
			<h2>When the page lies</h2>
			<p>{@render rich('Our agent fetched the library’s docs. Now that page sits in the same context as your instructions, and it can say anything. This is [[prompt injection]], the main unsolved security problem of agents.')}</p>
			<p>So the defenses come in layers. The strongest doesn’t have to be convinced of anything: an operating-system fence that every child process inherits.</p>
			<p class="note">{@render agent()} {@render rich(callouts.sandbox)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>Finding the code</h2>
			<p>{@render rich('An approved call becomes a [[system call]], real work on your machine. The model searches the way an engineer does: look for the words, list the candidates, read the promising file by line range.')}</p>
			<p>Each step is its own turn: call, result, think, next call. It will read about 250 lines of your repository, not all of it.</p>
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
		<article class="pin left" data-out="0.84">
			<h2>Evidence, not opinion</h2>
			<p>{@render rich('The harness runs the tests inside the [[sandbox]] with a time limit, and captures everything: [[stdout, stderr and the exit code]]. Here they failed: the new lock [[deadlocks]].')}</p>
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
			<p>{@render rich('A long session reads many files, and the transcript creeps up on the [[context window]]. So a separate model call writes a summary, which replaces the old messages. The cache is lost once, then rebuilt.')}</p>
			<p class="note">{@render agent()} {@render rich(callouts.compact)}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin right" data-out="0.86">
			<h2>Seven things called memory</h2>
			<p>A lot of confusion comes from using one word for seven different things. Each has its own owner and its own lifetime.</p>
			<p>The last one answers a common question: using an agent doesn’t train the model. When your session ends, the model hasn’t learned a thing from you.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>When the answer gets lost</h2>
			<p>A tool can succeed while its result gets lost. The honest state is “I don’t know whether that happened,” and the next step is to look, not to retry.</p>
			<p>Exact-string edits help here: a second attempt fails harmlessly, because the old string is already gone.</p>
			<p>And four controls do four different things. Steering changes the plan. Cancelling stops the stream. Terminating kills the process. Only rolling back undoes a file change.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="1000vh">
		<article class="pin top-band ten" data-out="0.88">
			<h2>The whole fix, in ten turns</h2>
			<div class="ten-grid">
				<div class="ledger">
					<p class="ten-intro">Each bar is one request. Green was already cached, amber is new. Only turn one pays for all of it. After that, more than nine tokens in ten are already there.</p>
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
							<button type="button" class={{ on: turn === i }} disabled={driven && i > turnReached} aria-label="Turn {i + 1}: {t.label}" aria-current={turn === i} onclick={() => pinTurn(i)}>{i + 1}</button>
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
				<p>There’s no “finished” signal. After green tests, the model writes a summary and an end-of-turn token instead of another tool call. Green tests are evidence, not proof.</p>
				<p>The ending is five separate steps, each with its own permission. A typical fix costs tens of cents to a few dollars, mostly in cache reads.</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="440vh">
		<article class="pin left" data-in="0.44" data-out="0.93">
			<h2>Different bodies, one kind of mind</h2>
			<p>The model is a function from tokens to a probability for the next token. Everything else, searching, editing, running code, remembering, asking permission, is the harness.</p>
			<p>It doesn’t know your codebase. It searches, one tool call at a time, and forgets everything when the session ends unless the harness writes it down.</p>
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
					<a class="again" href="#top" onclick={restart}>Follow it again</a>
					<button type="button" class="again quiet" onclick={openMap}>Open the map</button>
				</p>
			</div>
		</article>
	</section>
</main>
{#if tip}
	<div class={['tip', { below: tip.below }]} aria-hidden="true" style:left="{tip.x}px" style:top="{tip.y}px">{tip.text}</div>
{/if}
</div>

<TripMap bind:open={mapOpen} here={mapHere} onjump={jump}>
	{#snippet agents()}
		{@render picker(false)}
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
		gap: 8px;
		margin: 0;
	}
	.again.quiet {
		border: 0;
		background: rgb(16 26 48 / 0.09);
		color: var(--ink);
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}
	.again.quiet:hover {
		background: rgb(16 26 48 / 0.15);
	}

	/* Only phones get this, in place of the plain name. */
	.agent {
		display: none;
		position: relative;
		align-items: center;
		gap: 5px;
		margin: -3px 2px -3px 0;
		padding: 3px 8px 3px 10px;
		border: 0;
		border-radius: 999px;
		background: rgb(127 150 190 / 0.2);
		color: var(--ink);
		font: inherit;
		font-weight: 650;
		vertical-align: baseline;
		white-space: nowrap;
		cursor: pointer;
		pointer-events: auto;
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.1s;
	}
	/* A bigger target than it looks. */
	.agent::after {
		content: '';
		position: absolute;
		inset: -10px -6px;
	}
	.agent:active {
		transform: scale(0.95);
	}
	.agent svg {
		width: 13px;
		height: 13px;
		flex: none;
	}
	.agent path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.agent.hint {
		animation: agent-hint 3.2s ease-in-out infinite;
	}
	@keyframes agent-hint {
		0%,
		100% {
			box-shadow: inset 0 0 0 1.5px rgb(110 162 255 / 0);
		}
		50% {
			box-shadow: inset 0 0 0 1.5px var(--cobalt);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.agent.hint {
			animation: none;
			box-shadow: inset 0 0 0 1.5px var(--cobalt);
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
		background: rgb(255 255 255 / 0.62);
		color: #33415c;
		font: 700 14px/1 var(--sans);
		cursor: pointer;
		transition:
			background 0.18s,
			color 0.18s,
			transform 0.12s;
	}
	.turns button:hover:not(:disabled):not(.on) {
		background: #fff;
		transform: translateY(-1px);
	}
	.turns button:disabled {
		cursor: default;
		opacity: 0.38;
	}
	.turns button.on {
		background: #101a30;
		color: #fff;
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
		.loader {
			left: 50%;
			top: 72%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hops i {
			animation: none;
		}
	}
	/* No 3D: just the story, read straight down. */
	.journey.words .spine,
	.journey.words .bar-picker {
		display: none;
	}
	.journey.words .bar {
		position: absolute;
	}
	.words .beat {
		height: auto;
		min-height: 0;
	}
	.words .pin {
		position: static;
		min-height: 0;
		padding-block: 6vh;
		justify-content: flex-start;
	}
	.words .pin::before {
		display: none;
	}
	.words .steps li {
		opacity: 1;
	}
	.words .steps li span {
		display: block;
	}
	.fallback {
		margin-top: 18px;
		font-size: 15.5px;
		color: var(--ink-soft);
	}

	.term {
		appearance: none;
		display: inline;
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
		color: var(--ink);
	}
	.journey.dark {
		--ink: #f3f7ff;
		--ink-soft: #c2cfe6;
		--cobalt: #6ea2ff;
		--rail: rgb(243 247 255 / 0.22);
	}

	/* Each card carries the colours of the world it stands in. */
	.pin {
		--veil: 214 234 251;
		--veil-a: 0.93;
	}
	.pin:global([data-tone='sky']) {
		--ink: #101a30;
		--ink-soft: #33415c;
		--cobalt: #1f5fe0;
		--amber: #ffb921;
		--green: #12a956;
		--rule: rgb(16 26 48 / 0.14);
	}
	.pin:global([data-tone='inside']) {
		--ink: #f3f7ff;
		--ink-soft: #c2cfe6;
		--cobalt: #6ea2ff;
		--amber: #ffc247;
		--green: #41e58a;
		--rule: rgb(243 247 255 / 0.22);
		--veil: 6 15 38;
		--veil-a: 0.97;
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
		padding: 3px 8px;
		border-radius: 999px;
		background: rgb(127 150 190 / 0.22);
		font: 600 12.5px/1.2 var(--sans);
		letter-spacing: 0;
	}
	/* The moment of a jump: gone before anyone sees the world swap. */
	.cut {
		position: fixed;
		z-index: 5;
		inset: 0;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease-out;
	}
	.cut:global(.on) {
		opacity: 1;
		transition: opacity 0.13s ease-in;
	}

	.bar-picker {
		opacity: 0;
		transform: translateY(-6px);
		transition:
			opacity 0.25s,
			transform 0.25s;
	}
	.bar-picker.show {
		opacity: 1;
		transform: none;
	}

	.spine {
		justify-self: end;
		display: grid;
		justify-items: end;
		gap: 7px;
	}
	.spine ol {
		display: flex;
		gap: 5px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.spine li {
		width: 16px;
		height: 6px;
		border-radius: 3px;
		background: var(--rail);
		transition: background 0.3s;
	}
	.spine li.on {
		background: var(--ink);
	}
	.spine li.now {
		background: var(--cobalt);
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

	.picker {
		display: inline-flex;
		align-self: flex-start;
		padding: 4px;
		gap: 2px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.62);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.8),
			0 6px 20px rgb(30 80 150 / 0.14);
	}
	.picker button {
		border: 0;
		background: transparent;
		color: #33415c;
		font: 600 15px/1 var(--sans);
		white-space: nowrap;
		padding: 11px 16px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.18s,
			color 0.18s;
	}
	.picker button:hover {
		color: #101a30;
	}
	.picker button.on {
		background: #101a30;
		color: #fff;
	}
	.dark .picker {
		background: rgb(255 255 255 / 0.88);
	}
	/* Quiet on purpose: you notice it the second time you look, not the first. */
	.picker button.hint {
		animation: hint 3.2s ease-in-out infinite;
	}
	.picker button.hint:hover {
		animation: none;
	}
	@keyframes hint {
		0%,
		100% {
			color: #33415c;
			box-shadow: inset 0 0 0 1px rgb(31 95 224 / 0);
		}
		50% {
			color: #1f5fe0;
			box-shadow: inset 0 0 0 1px rgb(31 95 224 / 0.32);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.picker button.hint {
			animation: none;
			box-shadow: inset 0 0 0 1px rgb(31 95 224 / 0.28);
		}
	}
	.picker.compact button {
		font-size: 13px;
		padding: 8px 12px;
	}

	main {
		position: relative;
	}

	.beat {
		position: relative;
		height: var(--h);
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
		height: 100dvh;
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

	.scroll-hint {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 34px 0 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}
	.arrow {
		display: block;
		position: relative;
		width: 2px;
		height: 26px;
		border-radius: 2px;
		background: var(--ink);
		animation: nudge 1.8s ease-in-out infinite;
	}
	.arrow::after {
		content: '';
		position: absolute;
		left: -4px;
		bottom: 0;
		width: 8px;
		height: 8px;
		border-right: 2px solid var(--ink);
		border-bottom: 2px solid var(--ink);
		transform: rotate(45deg);
	}
	@keyframes nudge {
		50% {
			transform: translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.arrow {
			animation: none;
		}
	}

	.note {
		margin-top: 8px;
		padding-left: 14px;
		border-left: 3px solid var(--cobalt);
		font-size: 0.9em;
		line-height: 1.45;
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
		color: var(--ink);
		font-weight: 650;
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
		display: inline-block;
		font-weight: 650;
		color: #fff;
		background: #101a30;
		padding: 11px 18px;
		border-radius: 999px;
		text-decoration: none;
		pointer-events: auto;
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
		.bar {
			grid-template-columns: 1fr;
			padding: 14px 20px;
		}
		.spine {
			justify-self: start;
			justify-items: start;
		}
		.bar-picker {
			display: none;
		}
		/* No room for the name on a phone, so the button just says what it opens. */
		.brand {
			position: absolute;
			top: 10px;
			right: 8px;
			gap: 5px;
			margin: 0;
			padding: 8px 8px 8px 6px;
		}
		.brand .name {
			display: none;
		}
		.map-chip {
			padding: 0;
			background: none;
			font-size: 14px;
		}
		/* On a phone the scene runs up under the header, so the header brings its own ground. */
		.bar::before {
			content: '';
			position: absolute;
			inset: 0 0 -18px;
			z-index: -1;
			pointer-events: none;
			background: linear-gradient(to bottom, rgb(214 234 251 / 0.9) 60%, rgb(214 234 251 / 0));
		}
		.dark .bar::before {
			background: linear-gradient(to bottom, rgb(6 15 38 / 0.92) 60%, rgb(6 15 38 / 0));
		}
		.spine li {
			width: 9px;
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
			right: -20px;
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
		.agent {
			display: inline-flex;
		}
		.agent-name {
			display: none;
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
			.scroll-hint {
				display: none;
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
		.scroll-hint {
			margin-top: 18px;
		}
		.steps li:not(.on) span {
			display: none;
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
</style>
