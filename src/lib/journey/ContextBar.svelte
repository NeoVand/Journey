<script lang="ts">
	import { PART_NAME, WINDOW, type Context, type PartKind } from './context';

	let { context }: { context: Context | null } = $props();

	const ORDER: PartKind[] = ['instructions', 'environment', 'tools', 'conversation', 'call', 'result', 'text', 'summary'];
	const total = $derived(context?.total ?? 0);
	const full = $derived(total / WINDOW);
	/** What's in it, kind by kind, in the order it was packed. */
	const kinds = $derived(
		ORDER.map((kind) => ({ kind, tokens: context?.parts.filter((p) => p.kind === kind).reduce((s, p) => s + p.tokens, 0) ?? 0 })).filter(
			(k) => k.tokens > 0
		)
	);
	const thousands = (n: number) => (n < 1000 ? `${n}` : `${Math.round(n / 1000)}k`);
	const exact = (n: number) => n.toLocaleString('en-US');
	let open = $state(false);
</script>

<div class={['context', { shown: !!context, long: context?.long, near: full > 0.8 }]}>
	<button
		type="button"
		class="gauge"
		aria-expanded={open}
		aria-label={context
			? `${context.long ? 'A long session' : 'The context'}: ${exact(total)} of ${exact(WINDOW)} tokens. Show what's in it`
			: 'The context is empty'}
		onclick={() => (open = !open)}
		onblur={() => (open = false)}
	>
		<span class="name">{context?.long ? 'A long session' : 'Context'}</span>
		<span class="track" aria-hidden="true">
			{#each context?.parts ?? [] as part, i (i)}
				<span class="part {part.kind}" style:width="{(part.tokens / WINDOW) * 100}%"></span>
			{/each}
		</span>
		<span class="count" aria-hidden="true">{thousands(total)} <span class="of">of {thousands(WINDOW)}</span></span>
	</button>
	<div class={['card', { open }]} aria-hidden="true">
		<div class="plate">
			<p class="title">{context?.long ? 'A long session, near its limit' : 'What the model is sent'}</p>
			<span class="zoom">
				{#each kinds as k (k.kind)}
					<span class="part {k.kind}" style:flex-grow={k.tokens}></span>
				{/each}
			</span>
			<ul>
				{#each kinds as k (k.kind)}
					<li><span class="swatch part {k.kind}"></span>{PART_NAME[k.kind]}<b>{exact(k.tokens)}</b></li>
				{/each}
			</ul>
			<p class="sum"><b>{exact(total)}</b> of a {exact(WINDOW)}-token window</p>
			<p class="note">Tokens are illustrative, for Claude Code.</p>
		</div>
	</div>
</div>

<style>
	/* A slim gauge in the middle of the header's band: how full the model's window is, and what fills it. */
	.context {
		position: relative;
		justify-self: center;
		/* The header lets the pointer through to the world; the gauge takes it back. */
		pointer-events: auto;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.5s,
			visibility 0.5s;
	}
	.context.shown {
		opacity: 1;
		visibility: visible;
	}
	.gauge {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -6px -10px;
		padding: 6px 10px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: 650 13px/1 var(--sans);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: background 0.15s;
	}
	@media (hover: hover) {
		.gauge:hover {
			background: rgb(127 150 190 / 0.16);
		}
	}
	.gauge:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 2px;
	}
	.name {
		white-space: nowrap;
	}
	/* The window, end to end. What's in it fills from the left, in the colours of the drawers and the loop. */
	.track {
		display: flex;
		width: 200px;
		height: 8px;
		overflow: hidden;
		border-radius: 4px;
		background: rgb(255 255 255 / 0.5);
		box-shadow:
			inset 0 1px 2px rgb(20 40 80 / 0.18),
			0 0 0 1px rgb(255 255 255 / 0.35);
		transition: box-shadow 0.4s;
	}
	:global(.journey.dark) .track {
		background: rgb(255 255 255 / 0.12);
		box-shadow:
			inset 0 1px 2px rgb(0 0 0 / 0.4),
			0 0 0 1px rgb(255 255 255 / 0.08);
	}
	/* Close to the limit, the window's edge warms. */
	.near .track {
		box-shadow:
			inset 0 1px 2px rgb(20 40 80 / 0.18),
			0 0 0 1.5px rgb(240 71 60 / 0.65);
	}
	.track .part {
		flex: none;
		height: 100%;
		transition: width 0.6s cubic-bezier(0.3, 0.9, 0.3, 1);
	}
	.part + .part {
		box-shadow: inset 1px 0 0 rgb(255 255 255 / 0.55);
	}
	.instructions {
		background: #ecd29a;
	}
	.environment {
		background: #9fcbf3;
	}
	.tools {
		background: #c9a271;
	}
	.conversation {
		background: #2f6fe0;
	}
	.call {
		background: #ffbc2e;
	}
	.result {
		background: #3cc47e;
	}
	.text {
		background: #b9c4d8;
	}
	.summary {
		background: #ff9a1f;
	}
	.count {
		min-width: 3.4em;
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Pointed at, it opens below the band: the same contents, large enough to read, with their sizes. */
	.card {
		position: absolute;
		z-index: 2;
		top: 100%;
		left: 50%;
		padding-top: 12px;
		opacity: 0;
		visibility: hidden;
		transform: translate(-50%, -6px) scale(0.97);
		transform-origin: 50% 0;
		transition:
			opacity 0.16s,
			transform 0.2s,
			visibility 0s 0.2s;
	}
	.card.open,
	.gauge:focus-visible + .card {
		opacity: 1;
		visibility: visible;
		transform: translate(-50%, 0);
		transition:
			opacity 0.18s,
			transform 0.32s cubic-bezier(0.2, 1.35, 0.4, 1),
			visibility 0s;
	}
	@media (hover: hover) {
		.context:hover .card {
			opacity: 1;
			visibility: visible;
			transform: translate(-50%, 0);
			transition:
				opacity 0.18s,
				transform 0.32s cubic-bezier(0.2, 1.35, 0.4, 1),
				visibility 0s;
		}
	}
	.plate {
		position: relative;
		width: 264px;
		box-sizing: border-box;
		padding: 12px 14px 10px;
		border-radius: 16px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 16px 34px rgb(20 60 130 / 0.22);
		color: #101a30;
		font-family: var(--sans);
	}
	.plate::before {
		content: '';
		position: absolute;
		top: -6px;
		left: calc(50% - 7px);
		width: 14px;
		height: 14px;
		border-radius: 3px 0 0;
		background: #fffaf0;
		box-shadow: -2px -2px 5px rgb(20 60 130 / 0.07);
		transform: rotate(45deg);
	}
	.title {
		margin: 0 0 9px;
		font: 700 14.5px/1.25 var(--display);
		letter-spacing: -0.01em;
	}
	/* Only what's in it, end to end: the window's emptiness is the gauge's to show. */
	.zoom {
		display: flex;
		height: 12px;
		overflow: hidden;
		border-radius: 4px;
		box-shadow: inset 0 0 0 1px rgb(60 40 10 / 0.12);
	}
	.zoom .part {
		min-width: 3px;
	}
	ul {
		display: grid;
		gap: 5px;
		margin: 10px 0 8px;
		padding: 0;
		list-style: none;
		font: 600 13px/1.2 var(--sans);
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	li b {
		margin-left: auto;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		box-shadow: inset 0 0 0 1px rgb(60 40 10 / 0.12);
	}
	.sum {
		margin: 0;
		padding-top: 8px;
		border-top: 1px solid rgb(60 40 10 / 0.12);
		font: 500 13px/1.3 var(--sans);
		color: #33415c;
	}
	.sum b {
		color: #101a30;
		font-weight: 700;
	}
	.note {
		margin: 3px 0 0;
		font: 500 12px/1.3 var(--sans);
		color: #6a7488;
	}

	/* Narrower screens keep the gauge, its name and its number, and let the window's size go. */
	@media (max-width: 1360px) {
		.of {
			display: none;
		}
		.track {
			width: 150px;
		}
	}
	@media (max-width: 1120px) {
		.track {
			width: 96px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.track .part {
			transition: none;
		}
	}
</style>
