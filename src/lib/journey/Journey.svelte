<script lang="ts">
	import { HARNESSES, FORMS, type HarnessId } from './content';
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
			claude: 'The terminal, the VS Code extension and the desktop app all host the same binary, so the journey starts the same way in each.',
			codex: 'The TUI runs the agent loop in its own process. The VS Code extension and desktop app reach the same engine through codex app-server.',
			copilot: 'VS Code owns the editor, the extension gathers context, and since mid-2026 the loop itself runs in a separate process, the Agent Host.'
		}[harness],
		wire: {
			claude: 'HTTPS to api.anthropic.com/v1/messages with stream: true, signed with an API key or a Claude account login.',
			codex: 'The Responses API over SSE or a WebSocket, signed with an API key or a ChatGPT login.',
			copilot: 'To api.githubcopilot.com with a short-lived Copilot token, exchanged from your GitHub login. Your GitHub token itself never reaches the model service.'
		}[harness],
		cache: {
			claude: 'Marks explicit cache breakpoints in the request. Cache reads bill at a tenth of the normal input price.',
			codex: 'Relies on the Responses API’s automatic prefix caching, and keeps its instructions fixed for the session so the prefix stays identical.',
			copilot: 'GitHub’s service sits in between, so the extension cannot see hits or misses. Any caching at GitHub is undisclosed.'
		}[harness],
		thinking: {
			claude: 'Thinking blocks carry a signature, so they can come back unmodified on the next turn.',
			codex: 'Reasoning items can travel as encrypted content the client cannot read but must resend.',
			copilot: 'It depends on the model you picked. The extension shows either kind as a collapsible section.'
		}[harness],
		toolcall: {
			claude: 'Grep is a tool of its own. The harness wraps ripgrep and returns matching lines with file names and numbers.',
			codex: 'There is no search tool: the model writes rg into the shell tool. Simpler catalog, same behavior.',
			copilot: 'Text search sits beside the language server’s symbols and a semantic index. The model picks one.'
		}[harness],
		stream: {
			claude: 'The Messages API streams thinking_delta, text_delta and input_json_delta events, then a stop reason.',
			codex: 'The Responses API streams typed events such as response.function_call_arguments.delta.',
			copilot: 'GitHub’s API streams OpenAI-style chat chunks, whichever vendor is behind them.'
		}[harness],
		policy: {
			claude: 'Permission modes, allow, ask and deny rules, hooks, and in auto mode a classifier that reviews each call.',
			codex: 'Two dials: an approval policy for when to ask, and a sandbox mode for what is allowed, plus execpolicy rules.',
			copilot: 'A confirmation card in the editor, with auto-approve lists and a cap on requests per session.'
		}[harness],
		sandbox: {
			claude: 'Seatbelt on macOS, bubblewrap on Linux. A proxy enforces a domain allowlist, so this request goes nowhere.',
			codex: 'Seatbelt, bwrap or MXC. In workspace-write mode the network is off by default.',
			copilot: 'No OS sandbox by default locally, and the network is unrestricted. The confirmation card has to catch this. The cloud agent runs in GitHub Actions.'
		}[harness],
		search: {
			claude: 'Grep wraps ripgrep. Read returns numbered lines, so the model can quote exact positions.',
			codex: 'No separate search tools: the model runs rg and sed through the shell.',
			copilot: 'Text search, the language server’s symbols, and semantic search over an embedding index.'
		}[harness],
		edit: {
			claude: 'Exact-string replacement. The old string must appear exactly once, and the file must have been read this session.',
			codex: 'apply_patch: a diff-like text format, applied hunk by hunk. The API can enforce its grammar at generation time.',
			copilot: 'Edit tools plus a review surface: the diff lands in the editor to accept or reject, hunk by hunk.'
		}[harness],
		test: {
			claude: 'Two minutes by default. The result is a tool_result block carrying the tool_use_id it answers.',
			codex: 'The shell has a persistent PTY mode, so a process can keep running across turns. The result carries a call_id.',
			copilot: 'Commands run in the integrated terminal, visible to you, which doubles as a place to intervene.'
		}[harness],
		loop: {
			claude: 'Resends everything. The API is stateless, and the prefix cache makes that cheap.',
			codex: 'Also resends, with reasoning sealed as encrypted items. The API can alternatively keep state server-side.',
			copilot: 'Rebuilds the prompt from components every turn, pruning low-priority parts when the budget is tight.'
		}[harness],
		compact: {
			claude: 'Compacts automatically near the limit, or on /compact. Durable notes can live in CLAUDE.md and auto memory.',
			codex: 'A client-side /compact, or server-side compaction that returns an encrypted item to append.',
			copilot: 'A background summarizer watches the budget, with a simpler fallback if the full mode fails.'
		}[harness],
		turns: {
			claude: 'Grep, Read, Edit, Bash. A classifier approves the edit in auto mode.',
			codex: 'rg and sed in the shell, apply_patch for edits, pytest in a sandbox with no network.',
			copilot: 'Text search and usages, editFiles with a reviewable diff, and the Problems panel before any test runs.'
		}[harness],
		door: {
			claude: 'One front door: Anthropic’s, or Bedrock, Vertex or Foundry for the same models.',
			codex: 'One front door. With a ChatGPT login the request goes to ChatGPT’s backend rather than the public API host.',
			copilot: 'Two front doors. GitHub checks your plan, policies and content exclusions, then forwards to the vendor, whose own door runs this list again.'
		}[harness]
	});

	const DRAWERS = $derived([
		{ name: 'Instructions', text: `What the agent is, plus your project’s rules from ${spec.ruleFile}.` },
		{ name: 'Environment', text: 'Working directory, git branch, operating system, date, shell.' },
		{ name: 'Tools', text: 'Built-in ones plus any from MCP servers. A name, a description and a JSON Schema each, costing tokens on every turn.' },
		{ name: 'Conversation', text: 'Your prompt. On turn one, nothing else.' }
	]);

	const GATES = [
		{ name: 'Valid shape?', text: 'Known tool, arguments match the schema.' },
		{ name: 'Allowed path?', text: 'Inside the project, not on a deny list.' },
		{ name: 'Policy', text: 'May this run without asking?' },
		{ name: 'You, if asked', text: 'Reads often pass automatically. Writes and commands may not.' }
	];

	const CHECKS = [
		{ name: 'Decrypt', text: 'TLS ends here.' },
		{ name: 'Who are you?', text: 'Is this credential valid, and whose is it?' },
		{ name: 'Rate limit', text: 'Too many requests or tokens this minute?' },
		{ name: 'Budget', text: 'Any quota or spend left?' },
		{ name: 'Capacity', text: 'If the cluster is full, you get a queue or a 529, and the harness backs off and retries.' }
	];

	/** The pages that really do read or look different for each agent. */
	const DIFFERS = new Set([0, 1, 2, 3, 4, 5, 11, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29]);
	const tried = new SvelteSet<string>();
	const differs = $derived(DIFFERS.has(section));
	/** An agent breathes while this page has something to show for it that the reader has not looked at yet. */
	const hinting = (id: HarnessId) => differs && id !== harness && !tried.has(`${section}/${id}`);

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
			const sharpness = new Sharpness(dpr);

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
						if (n === 0) {
							el.style.pointerEvents = k > 0.6 ? 'auto' : 'none';
							el.inert = k < 0.1;
						}
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
				w.dispose();
			};
			driven = true;
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
		window.scrollTo({ top: 0 });
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

<canvas class="stage" {@attach stage} aria-hidden="true"></canvas>
<div class="dive" data-dive aria-hidden="true"></div>

<div class={['journey', { dark }]}>
<header class="bar">
	<a class="brand" href="#top">The journey of a token</a>
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

<main id="top" class={{ driven }}>
	<section data-beat class="beat hero" style:--h="170vh">
		<div class="pin left top" data-out="0.55">
			<h1>How a coding agent works</h1>
			<p class="lede">Follow one request from your keyboard to the model. Pick the agent you use, then scroll.</p>
			{@render picker(false)}
			<p class="scroll-hint"><span class="arrow" aria-hidden="true"></span>Scroll to begin</p>
		</div>
	</section>

	<section data-beat class="beat" style:--h="360vh">
		<article class="pin left" data-out="0.62">
			<h2>It starts as a sentence</h2>
			<p>
				You type one request. Right now it is {surfaceWords}. The model has seen nothing, and nothing here is a
				token yet.
			</p>
			<p class="note"><b>{spec.name}.</b> {callouts.prompt}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.76">
			<h2>The harness wakes up</h2>
			<p>
				A harness is the program around the model. Before anything leaves your laptop, it spends a few hundred
				milliseconds gathering what the model will need.
			</p>
			<ol class="steps">
				{#each DRAWERS as d, i (d.name)}
					<li class={{ on: drawer === i, done: drawer > i }}>
						<strong>{d.name}</strong>
						<span>{d.text}</span>
					</li>
				{/each}
			</ol>
		</article>
	</section>

	<section data-beat class="beat" style:--h="300vh">
		<article class="pin right" data-out="0.6">
			<h2>One JSON request</h2>
			<p>
				The parts that stay the same go first, the conversation goes last and only ever grows. That order will pay
				off later, when the provider can reuse work on an identical start.
			</p>
			<p>Look at what is missing: there is none of your code in it. The model will have to ask for that, one tool call at a time.</p>
			<p>And it is still plain text. The harness does not tokenize.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin left" data-out="0.66">
			<h2>Across the wire</h2>
			<p>
				The harness opens an HTTPS connection and TLS encrypts the bytes, so nobody on the path can read your code.
			</p>
			<p>It also asks for a streaming response. That is why you later see the agent typing.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.wire}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin right" data-out="0.66">
			<h2>The front door</h2>
			<p>Cheap, ordinary checks, in order. No neural network is involved.</p>
			<ol class="steps compact">
				{#each CHECKS as c, i (c.name)}
					<li class={{ on: check === i, done: check > i }}>
						<strong>{c.name}</strong>
						<span>{c.text}</span>
					</li>
				{/each}
			</ol>
			<p class="note"><b>{spec.name}.</b> {callouts.door}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="640vh">
		<article class="pin top-band" data-out="0.86">
			<h2>Now it is a token</h2>
			<div class="cols">
				<p>
					A chat template flattens the request into one long string with markers for each role. The tokenizer cuts
					that string into pieces from a vocabulary of 100,000 to 200,000 entries.
				</p>
				<p>
					Every piece has a number, and the number is all the model will ever read. The two “the” tiles get the same
					one. The blue tiles are markers the template added. <small>IDs are illustrative.</small>
				</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="400vh">
		<article class="pin left" data-out="0.58">
			<h2>Thousands more behind it</h2>
			<p>
				Your sentence is only the tail of the request. Instructions and tool schemas count too, and turn one comes to
				about 21,000 IDs. <small>Illustrative.</small>
			</p>
			<p>They are on their way to a machine already serving hundreds of other people.</p>
			<p class="next">Next stop: inside the inference cluster.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.68">
			<h2>One model, many chips</h2>
			<p>
				A frontier model has hundreds of billions to a few trillion learned numbers. Even compressed, they do not fit in
				one chip’s memory, so the weights are split across many.
			</p>
			<p>
				Chips in a node talk over NVLink at terabytes per second. Nodes talk over InfiniBand or RoCE, at hundreds of
				gigabits per port.
			</p>
			<p class="note">
				<b>From here, all three agents look the same.</b> Providers do not publish these systems, so this is the public
				blueprint, from open engines such as vLLM and SGLang.
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.86">
			<h2>Its working memory</h2>
			<p>
				To predict the next token, every layer looks back at every earlier token. For each one it needs two vectors, a
				key and a value. Recomputing them at every step would be absurd, so they are computed once and kept. That store
				is the KV cache.
			</p>
			<p>
				It costs about 330 KB per token, so your 21,000 tokens take about 7 GB of chip memory, the scarce resource in all of
				inference. <small>Illustrative: 80 layers, 8 KV heads, 128 dimensions, 2 bytes per number.</small>
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="380vh">
		<article class="pin left" data-out="0.78">
			<h2>Blocks that can sit anywhere</h2>
			<p>
				The cache is cut into fixed-size blocks, say 16 tokens each. A block can sit in any free slot, and a block table
				records where.
			</p>
			<p>Almost nothing is wasted, and two requests can share a block when they start the same way.</p>
			<p><small>A real request has far more than four blocks. The grey ones belong to other people.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin right" data-out="0.8">
			<h2>Turn two starts ahead</h2>
			<p>
				Turn two begins with exactly the same bytes as turn one, plus a little more. Matching blocks already have their
				KV computed, so only the new part runs. Remember that order the harness kept? This is why.
			</p>
			<p>
				It saves computing, not memory of you. Unused blocks are evicted, usually within minutes, so a session that
				pauses for an hour pays full price once.
			</p>
			<p class="note"><b>{spec.name}.</b> {callouts.cache}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin left" data-out="0.86">
			<h2>Sharing the chips</h2>
			<p>
				A chip is only efficient when it works on many requests at once. Every step, the scheduler builds a batch of
				sequences that each need one more token.
			</p>
			<p>When one finishes, a waiting request takes its lane right away. You never wait for a batch to fill.</p>
			<p>Yours is the amber one.</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.74">
			<h2>Reading and writing</h2>
			<p>
				Prefill reads your prompt, thousands of tokens at once, and is limited by compute. Decode writes the answer, one
				token per step, and is limited by memory.
			</p>
			<p>
				Many clusters split them into two pools and ship the KV cache across over RDMA. It is a choice, not a law: for
				some workloads, one shared pool still wins.
			</p>
			<p class="next">Next stop: inside those chips. What are they actually running?</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="2800vh">
		<article class="pin left tight" data-in="0.035" data-out="0.125" data-fade="0.014">
			<h2>The transformer</h2>
			<p>
				Every chip in those pools runs one program, a transformer. It is the T in GPT, and the design behind today’s big language models.
				Tokens go in at the bottom. A score for every possible next word comes out at the top.
			</p>
			<Blueprint />
		</article>
		<article class="pin left tight" data-in="0.17" data-out="0.272" data-fade="0.014">
			<h2>A place for every word</h2>
			<p>
				Your prompt starts at the bottom. On turn one, nearly every token misses the cache, so they go through together. An embedding turns
				each ID into a list of a few thousand numbers, and you can read that list as a place on a map of meaning.
			</p>
			<p>
				Watch where they land. “job” is among careers, “race” is in sports. An embedding knows the word, not the sentence. Both “the” tiles
				land on one spot, until a position signal says where each sits in the line.
			</p>
			<p><small>The real map has thousands of dimensions. This one has two, and its neighborhoods are illustrative.</small></p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.325" data-out="0.548" data-fade="0.014">
			<h2>Attention</h2>
			<p>
				In this sentence “job” is not about careers, and only the words around it can say so. So it asks a question, its query. Every token
				before it offers a key and holds a value. Later tokens stay dark, because a token can only look back.
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
					<span>The query against every key. A better match scores higher, and the √d keeps numbers in range.</span>
				</li>
				<li class={{ on: attention === 1, done: attention > 1 }}>
					<strong>Weigh</strong>
					<span>Softmax turns the scores into shares that add up to 100%.</span>
				</li>
				<li class={{ on: attention === 2, done: attention > 2 }}>
					<strong>Mix</strong>
					<span>Those shares of the values become “job”’s new vector, and it moves toward code.</span>
				</li>
			</ol>
			<p><small>The shares are illustrative. A real layer runs many of these side by side, called heads.</small></p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.555" data-out="0.622" data-fade="0.014">
			<h2>All of them, at once</h2>
			<p>
				Every token does this in the same instant, which is why this work suits a chip built for parallel math. Each one also stores its key
				and value in the row of lights along the front of the layer.
			</p>
			<p>That row is the KV cache from earlier, and now you can see what it is for.</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.63" data-out="0.694" data-fade="0.014">
			<h2>Then each token, by itself</h2>
			<p>
				Attention moves information between tokens. Next comes a small fully connected network, with every input wired to every unit. It works
				on one token’s vector at a time, and every token gets the same network.
			</p>
			<p>
				<small>Around both steps, the layer normalizes its numbers to keep them in range and adds the old vector back, so nothing is lost. In many
				large models, this network is where a tiny router picks a few experts out of hundreds.</small>
			</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.705" data-out="0.862" data-fade="0.014">
			<h2>Then again, eighty times</h2>
			<p>
				That was one layer. The next has the same design and its own weights, and it starts where the last one finished. Each thread is one
				token’s path up the stack, and they gather as they climb.
			</p>
			<p>
				“race” never quite arrives. It cannot see “condition”, which comes after it. That is what looking only backward costs.
				<small>Eighty is illustrative.</small>
			</p>
			<Blueprint compact stage={part} />
		</article>
		<article class="pin left tight" data-in="0.885" data-out="0.985" data-fade="0.014">
			<h2>One score for every word</h2>
			<p>
				After the last layer, only the final position matters. One more normalize, then the LM head gives a raw score, called a logit, to every entry in the
				vocabulary. Those logits are all the model ever outputs. <small>Scores on the map are illustrative.</small>
			</p>
			<p>The time until they exist is the time to first token, usually 0.3 to 2 seconds for a prompt this size.</p>
			<Blueprint compact stage={part} />
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-in="0.1" data-out="0.86">
			<h2>One token is chosen</h2>
			<p>
				This is the only probabilistic step in the whole journey. The highest logits land here and become probabilities. Temperature reshapes them,
				and top-p or top-k cut off the unlikely tail.
			</p>
			<p>Then a random draw picks one. Coding agents run near temperature 0 or a provider default, so the wheel is heavily weighted, but it is still a wheel.</p>
			<p><small>Candidates and odds are illustrative.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="600vh">
		<article class="pin left tight" data-in="0.075" data-out="0.86">
			<h2>One at a time</h2>
			<p>
				Now the loop. The new token climbs the same stack, alone. On every layer it looks back at everything through the KV cache, and adds its
				own key and value to the row of lights. One step takes 10 to 40 milliseconds. That is the typing speed you see.
			</p>
			<p>In 2026 the model usually thinks first. Thinking tokens are ordinary decoded tokens, billed as output.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.thinking}</p>
			<p><small>Speculative decoding can verify several guessed tokens in one pass, often 2 to 3 times faster on code, with the same answers.</small></p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin top-band" data-in="0.08" data-out="0.84">
			<h2>A tool call is born</h2>
			<div class="cols">
				<p>
					The model opens a tool call with a special token, then writes the name and arguments as more tokens. It does nothing
					else. The file may not exist, and the command may not be allowed. Those checks come later.
				</p>
				<p class="note"><b>{spec.name}.</b> {callouts.toolcall}</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin right" data-out="0.74">
			<h2>Only text comes back</h2>
			<p>
				Each ID is looked up in the vocabulary. The detokenizer waits until it has a complete character, then sends a small chunk of
				text. Token IDs never leave the data center.
			</p>
			<p>A second set of classifiers reads along. If the text crosses a line, generation is cut off mid-stream.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.stream}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="460vh">
		<article class="pin right" data-in="0.05" data-out="0.56">
			<h2>The model has no hands</h2>
			<p>
				The tube ends at your laptop, in the harness. It buffers the stream until the tool-call block closes, then parses it. Only now does anyone know
				the full call.
			</p>
			<p>
				And it is only a request, the way a web form is a request to a server. The model cannot read a file. It can only write the
				text “please read this file.” Everything after this decides whether to honor it.
			</p>
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
			<p class="note"><b>{spec.name}.</b> {callouts.policy}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="520vh">
		<article class="pin right" data-out="0.88">
			<h2>When the page lies</h2>
			<p>
				Our agent fetched the library’s docs. After that, the page sits in the same context as your instructions, and it can say
				anything. This is prompt injection, the main unsolved security problem of agents.
			</p>
			<p>So defenses come in layers. The strongest is the one that does not need to be convinced: an operating-system boundary every child process inherits.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.sandbox}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>Finding the code</h2>
			<p>
				An approved call becomes a system call. The model works the way an engineer does: search for the words, list the candidates,
				read the promising file by line range.
			</p>
			<p>Each of these is a separate turn: call, result, think, next call. It will read about 250 lines of your repository, not all of it.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.search}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin right" data-in="0.09" data-out="0.88">
			<h2>Three ways to edit</h2>
			<p>A few turns later the model knows what to change, and asks. The edit goes through the same gates.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.edit}</p>
			<p>
				All three write atomically: a temporary file, then a rename, so a crash never leaves half a file. An emitted patch and an
				applied patch are different events, and the result says which happened.
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.84">
			<h2>Evidence, not opinion</h2>
			<p>
				The harness runs the tests inside the sandbox with a timeout, and captures stdout, stderr and the exit code. Here it failed: the
				new lock deadlocks.
			</p>
			<p>That is not an error of the tool. It is a successful tool call whose text says failed, and it is the most useful thing the model has read all session.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.test}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="560vh">
		<article class="pin right" data-in="0.4" data-out="0.86">
			<h2>Around the loop</h2>
			<p>
				Remember the green pipe in the very first frame? This is what it carries. The result is appended to the transcript, and the
				whole conversation goes back to the provider.
			</p>
			<p>One pass around is a turn. A real fix takes five to thirty.</p>
			<p class="note"><b>{spec.name}.</b> {callouts.loop}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin left" data-out="0.86">
			<h2>When the context fills up</h2>
			<p>
				A long session reads many files, and the transcript approaches the context window. So a separate model call writes a summary,
				which replaces the old messages. The cache is lost once and rebuilt.
			</p>
			<p class="note"><b>{spec.name}.</b> {callouts.compact}</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin right" data-out="0.86">
			<h2>Seven things called memory</h2>
			<p>Much confusion comes from using one word for seven different things. Each has a different owner and a different lifetime.</p>
			<p>
				The last one answers a common question: using an agent does not train the model. When a session ends, the model has not
				learned anything from you.
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin left" data-out="0.88">
			<h2>When the answer gets lost</h2>
			<p>A tool can succeed while its result is lost. The honest state is “I do not know whether that happened,” and the next step is to look, not to retry.</p>
			<p>Exact-string edits help here: the second attempt fails on its own, because the old string is gone.</p>
			<p>
				And four controls do four different things. Steering changes the plan. Cancelling stops the stream. Terminating kills the
				process. Only rolling back undoes a file change.
			</p>
		</article>
	</section>

	<section data-beat class="beat" style:--h="500vh">
		<article class="pin top-band" data-out="0.88">
			<h2>The whole fix, in ten turns</h2>
			<div class="cols">
				<p>
					Each bar is one request. Green was already cached, amber is new. Only turn one pays for all of it, then every later turn is
					95 to 99 percent cache hit. <small>Claude Code’s numbers. Illustrative.</small>
				</p>
				<p class="note"><b>{spec.name}.</b> {callouts.turns}</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="480vh">
		<article class="pin top-band" data-out="0.76">
			<h2>What finished means</h2>
			<div class="cols">
				<p>
					There is no finished signal. After green tests, the model writes a summary and an end-of-turn token instead of another tool call.
					Green tests are evidence, not proof.
				</p>
				<p>The ending is five separate operations, each with its own authority. A typical fix costs tens of cents to a few dollars, mostly in cache reads.</p>
			</div>
		</article>
	</section>

	<section data-beat class="beat" style:--h="440vh">
		<article class="pin left end" data-in="0.44" data-out="9">
			<h2>Different bodies, one kind of mind</h2>
			<p>
				The model is a function from tokens to a probability distribution over the next token. Everything else, retrieval, editing, running
				code, remembering, asking permission, is the harness.
			</p>
			<p>It does not know your codebase. It searches, one tool call at a time, and forgets everything when the session ends unless the harness writes it down.</p>
			<p><small>Harness details are from public docs and source as of November 2026. Inside the data center, this follows public engines and papers, because providers do not publish their own.</small></p>
			<p><a class="again" href="#top" onclick={restart}>Follow it again</a></p>
		</article>
	</section>
</main>
</div>

<style>
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
		font-family: var(--display);
		font-weight: 700;
		font-size: 17px;
		letter-spacing: -0.01em;
		color: var(--ink);
		text-decoration: none;
		justify-self: start;
		transition: color 0.3s;
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
		.bar-picker,
		.brand {
			display: none;
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
		.pin::before {
			content: '';
			position: absolute;
			inset: auto 0 0;
			height: 58%;
			background: linear-gradient(to top, rgb(var(--veil) / 0.96) 72%, rgb(var(--veil) / 0));
			pointer-events: none;
		}
		/* These cards carry the most, and a phone has the least room: keep what teaches, and give it solid ground. */
		.pin.tight::before {
			height: 70%;
			background: linear-gradient(to top, rgb(var(--veil) / 0.97) 82%, rgb(var(--veil) / 0));
		}
		.pin.tight small,
		.pin.tight :global(.crumbs) {
			display: none;
		}
		.eq {
			margin-bottom: 10px;
			padding: 9px 10px;
			font-size: 13px;
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
			inset: 0 0 auto;
			height: 56%;
			background: linear-gradient(to bottom, rgb(var(--veil) / 0.9) 72%, rgb(var(--veil) / 0));
		}
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
