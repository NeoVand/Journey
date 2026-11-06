<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Tiktoken } from 'js-tiktoken/lite';
	import { PROMPT } from './content';
	import { cut, loadTokenizer } from './tokenize';

	/** oncut: the reader changed the text, and it now cuts into `now` tokens where it was `before`. */
	let { open = $bindable(false), oncut }: { open?: boolean; oncut?: (now: number, before: number) => void } = $props();

	/** Each of these surprises someone. The file name and the Persian word are the book's own examples. */
	const TRIES = [
		{ label: 'Your prompt', text: PROMPT },
		{ label: 'A file name', text: 'job_scheduler.py' },
		{ label: 'Indentation', text: '    return job' },
		{ label: 'A rare word', text: 'antidisestablishmentarianism' },
		{ label: 'A Persian word', text: 'برنامه‌نویسی' },
		{ label: 'An emoji', text: '🦄' }
	];

	let text = $state(PROMPT);
	let tokenizer = $state.raw<Tiktoken | null>(null);
	let failed = $state(false);
	let numbers = $state(false);
	/** The tiles a reader has flipped by hand, against whatever the rest are showing. */
	const turned = new SvelteSet<number>();

	const pieces = $derived(tokenizer ? cut(tokenizer, text) : []);
	const someOnlyPart = $derived(pieces.some((p) => p.partial));
	const characters = $derived([...text].length);

	async function load() {
		if (tokenizer) return;
		failed = false;
		try {
			tokenizer = await loadTokenizer();
		} catch {
			failed = true;
		}
	}

	function write(next: string) {
		const before = pieces.length;
		text = next;
		turned.clear();
		if (tokenizer) oncut?.(pieces.length, before);
	}

	function showAs(asNumbers: boolean) {
		numbers = asNumbers;
		turned.clear();
	}

	function flip(i: number) {
		if (!turned.delete(i)) turned.add(i);
	}

	/** Spaces and line ends are real parts of a token, so they get drawn rather than left blank. */
	const runs = (piece: string) => piece.split(/([ \n\t])/).filter(Boolean);
	/** Some scripts use characters with no shape at all, like the joiner in the middle of that Persian word. They cost a token all the same. */
	const unseen = (piece: string) => /^[\u200B-\u200F\u2060\uFEFF]+$/.test(piece);

	const show: Attachment<HTMLDialogElement> = (el) => {
		if (open && !el.open) {
			el.showModal();
			untrack(load);
			// With a keyboard, you can just start typing. On a phone, the keyboard would cover the very thing to look at.
			if (matchMedia('(pointer: fine)').matches) el.querySelector('textarea')?.select();
		} else if (!open && el.open) el.close();
	};
</script>

<dialog
	class="try"
	aria-label="Try the tokenizer"
	{@attach show}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}
>
	<div class="sheet">
		<div class="head">
			<h2>The tokenizer is all yours</h2>
			<button type="button" class="close" aria-label="Close the tokenizer" onclick={() => (open = false)}>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
			</button>
		</div>

		<label class="what" for="try-text">Type anything. Nothing you type leaves this page.</label>
		<textarea
			id="try-text"
			rows="2"
			maxlength="400"
			dir="auto"
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			value={text}
			oninput={(e) => write(e.currentTarget.value)}
		></textarea>

		<div class="tries">
			{#each TRIES as t (t.label)}
				<button type="button" class={{ on: text === t.text }} onclick={() => write(t.text)}>{t.label}</button>
			{/each}
		</div>

		<div class="belt">
			{#if failed}
				<p class="empty">
					The vocabulary didn’t arrive. Check your connection, then
					<button type="button" onclick={load}>try again</button>.
				</p>
			{:else if !tokenizer}
				<p class="empty"><span class="hops" aria-hidden="true"><i></i><i></i><i></i></span> Fetching 200,000 pieces</p>
			{:else if pieces.length === 0}
				<p class="empty">Nothing to cut yet.</p>
			{:else}
				{#each pieces as p, i (`${i}:${p.id}`)}
					<button
						type="button"
						class={['tile', { part: p.partial, number: numbers !== turned.has(i) }]}
						style:--i={Math.min(i, 40)}
						aria-label="{p.partial ? 'Part of a character' : unseen(p.text) ? 'An invisible character' : `“${p.text}”`}, token number {p.id}"
						onclick={() => flip(i)}
					>
						<span class="faces">
							<span class="face word">
								{#if p.partial}…{:else if unseen(p.text)}<small>invisible</small>{:else}
									{#each runs(p.text) as run, j (j)}
										{#if run === ' '}<i class="space"></i>{:else if run === '\n'}↵{:else if run === '\t'}⇥{:else}<bdi>{run}</bdi>{/if}
									{/each}
								{/if}
							</span>
							<span class="face id">{p.id}</span>
						</span>
					</button>
				{/each}
			{/if}
		</div>

		<div class="under">
			<p class="count" aria-live="polite">
				{#if tokenizer}
					<b>{pieces.length}</b>
					{pieces.length === 1 ? 'token' : 'tokens'} from <b>{characters}</b>
					{characters === 1 ? 'character' : 'characters'}
				{/if}
			</p>
			<div class="view" role="radiogroup" aria-label="Show the tiles as">
				<button type="button" role="radio" aria-checked={!numbers} class={{ on: !numbers }} onclick={() => showAs(false)}>Words</button>
				<button type="button" role="radio" aria-checked={numbers} class={{ on: numbers }} onclick={() => showAs(true)}>Numbers</button>
			</div>
		</div>

		<p class="note">
			{#if someOnlyPart}
				Striped tiles each hold only part of one character.
			{:else}
				Press a tile to flip it. The numbers are all the model ever reads.
			{/if}
			This is o200k_base, a public vocabulary from OpenAI. Each model family has its own, so your agent’s cuts may differ a little.
		</p>
	</div>
</dialog>

<style>
	.try {
		--paper: #fdf7e9;
		--line: #e8dcc2;
		--text: #101a30;
		--soft: #4d5a72;
		position: fixed;
		inset: auto 0 0;
		width: min(680px, 100vw);
		max-width: none;
		max-height: 92dvh;
		margin: 0 auto;
		padding: 0;
		border: 0;
		border-radius: 22px 22px 0 0;
		background: var(--paper);
		color: var(--text);
		box-shadow: 0 -12px 44px rgb(6 15 38 / 0.3);
		transform: translateY(104%);
		transition:
			transform 0.36s cubic-bezier(0.2, 1, 0.3, 1),
			display 0.36s allow-discrete,
			overlay 0.36s allow-discrete;
	}
	.try[open] {
		transform: none;
	}
	@starting-style {
		.try[open] {
			transform: translateY(104%);
		}
	}
	.try::backdrop {
		background: rgb(6 15 38 / 0);
		transition:
			background 0.3s,
			display 0.3s allow-discrete,
			overlay 0.3s allow-discrete;
	}
	.try[open]::backdrop {
		background: rgb(6 15 38 / 0.42);
	}
	@starting-style {
		.try[open]::backdrop {
			background: rgb(6 15 38 / 0);
		}
	}

	.sheet {
		display: grid;
		gap: 10px;
		max-height: 92dvh;
		box-sizing: border-box;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 22px 24px 24px;
		font-family: var(--sans);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(25px, 5vw, 32px);
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.close {
		flex: none;
		width: 40px;
		height: 40px;
		padding: 12px;
		border: 0;
		border-radius: 50%;
		background: rgb(16 26 48 / 0.07);
		cursor: pointer;
		transition:
			background 0.15s,
			transform 0.15s;
	}
	.close:hover {
		background: rgb(16 26 48 / 0.13);
		transform: rotate(90deg);
	}
	.close path {
		fill: none;
		stroke: var(--text);
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.what {
		font-size: 15px;
		line-height: 1.35;
		color: var(--soft);
	}
	textarea {
		box-sizing: border-box;
		width: 100%;
		padding: 11px 13px;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: #fffdf7;
		color: var(--text);
		/* Sixteen pixels, or a phone zooms the page when this gets focus. */
		font: 500 16px/1.4 var(--mono);
		resize: none;
	}
	.tries {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.tries button {
		padding: 6px 11px;
		border: 0;
		border-radius: 999px;
		background: rgb(16 26 48 / 0.07);
		color: var(--text);
		font: 500 13.5px/1.2 var(--sans);
		cursor: pointer;
		transition:
			background 0.14s,
			transform 0.12s;
	}
	.tries button:hover {
		background: rgb(16 26 48 / 0.13);
		transform: translateY(-1px);
	}
	.tries button.on {
		background: #101a30;
		color: #fff;
	}

	/* The same belt the tiles ride in the story. */
	.belt {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 5px;
		min-height: 118px;
		max-height: 34dvh;
		box-sizing: border-box;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px;
		border-radius: 14px;
		background: #1c2c4c;
		box-shadow:
			0 0 0 3px #dfe5ee,
			inset 0 3px 8px rgb(6 15 38 / 0.45);
	}
	.empty {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		min-height: 46px;
		color: #c2cfe6;
		font-size: 15px;
	}
	.empty button {
		padding: 0;
		border: 0;
		background: none;
		color: #fff;
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}
	.hops {
		display: inline-flex;
		gap: 4px;
	}
	.hops i {
		width: 15px;
		height: 12px;
		border-radius: 3px;
		background: #ffb921;
		animation: hop 0.8s ease-in-out infinite;
	}
	.hops i:nth-child(2) {
		animation-delay: 0.12s;
	}
	.hops i:nth-child(3) {
		animation-delay: 0.24s;
	}
	@keyframes hop {
		0%,
		60%,
		100% {
			transform: none;
		}
		30% {
			transform: translateY(-8px);
		}
	}

	.tile {
		min-width: 26px;
		padding: 0;
		border: 0;
		background: none;
		color: #111a2e;
		perspective: 420px;
		cursor: pointer;
		animation: arrive 0.26s cubic-bezier(0.2, 1.7, 0.4, 1) backwards;
	}
	@keyframes arrive {
		from {
			transform: translateY(-9px) scale(0.86, 1.1);
			opacity: 0;
		}
	}
	.faces {
		display: grid;
		transform-style: preserve-3d;
		transition: transform 0.46s cubic-bezier(0.3, 1.5, 0.5, 1);
		transition-delay: calc(var(--i) * 14ms);
	}
	.number .faces {
		transform: rotateX(180deg);
	}
	.face {
		grid-area: 1 / 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 9px;
		border-radius: 8px;
		background: #ffb921;
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.5),
			inset 0 -4px 0 rgb(176 104 0 / 0.42);
		font: 600 15px/1 var(--mono);
		white-space: pre;
		backface-visibility: hidden;
	}
	.face.id {
		transform: rotateX(180deg);
		font-size: 13.5px;
	}
	/* Part of a character: all the same amber, but plainly not whole. */
	.part .face {
		background: repeating-linear-gradient(-45deg, #ffb921 0 6px, #ffd778 6px 12px);
	}
	.face small {
		font: 600 11px/1 var(--sans);
		opacity: 0.72;
	}
	.space {
		display: inline-block;
		width: 0.42em;
		height: 0.28em;
		margin: 0.42em 0.1em 0;
		border: solid rgb(17 26 46 / 0.55);
		border-width: 0 1.5px 1.5px;
	}
	bdi {
		unicode-bidi: isolate;
	}

	.under {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px 14px;
	}
	.count {
		margin: 0;
		font-size: 15px;
		color: var(--soft);
	}
	.count b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.3em;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.view {
		display: inline-flex;
		padding: 3px;
		gap: 2px;
		border-radius: 999px;
		background: rgb(16 26 48 / 0.07);
	}
	.view button {
		padding: 7px 13px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--soft);
		font: 600 13.5px/1 var(--sans);
		cursor: pointer;
	}
	.view button.on {
		background: #101a30;
		color: #fff;
	}
	.note {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.4;
		color: var(--soft);
		text-wrap: pretty;
	}
	@media (hover: none) {
		.try .close:focus-visible {
			outline: none;
		}
	}
	.try :focus-visible {
		outline: 3px solid #1f5fe0;
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.try,
		.try::backdrop {
			transition: none;
		}
		.tile,
		.hops i {
			animation: none;
		}
		.faces {
			transition: none;
		}
	}
</style>
