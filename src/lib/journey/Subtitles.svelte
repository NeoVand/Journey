<script lang="ts">
	/**
	 * What Nora and Theo are saying, as they say it: a short run of words at a time, each with its speaker's colour. They
	 * sit over the picture, where the page has found room clear of the cards' words, and never take a click. The
	 * player's subtitle key turns them on.
	 */
	import { fade, fly } from 'svelte/transition';
	import type { Narrator } from './narrator.svelte';

	let {
		narrator,
		place
	}: {
		narrator: Narrator;
		/** Where there's room: a stretch along the bottom of the screen, or, with a top, a band under the header. */
		place: { top: number | null; left: number; right: number };
	} = $props();

	const id = $derived(narrator.id);
	const cue = $derived(narrator.subtitles && id && narrator.playing ? narrator.cue(id, narrator.time) : null);
	const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<div
	class={['subtitles', { high: place.top !== null }]}
	style:top={place.top === null ? undefined : `${place.top}px`}
	style:left="{place.left}px"
	style:width="{Math.max(0, place.right - place.left)}px"
	aria-hidden="true"
>
	{#key cue}
		{#if cue}
			<p
				class={['line', cue.who === 'NORA' ? 'nora' : 'theo']}
				in:fly={{ y: place.top === null ? 8 : -8, duration: still() ? 0 : 220 }}
				out:fade={{ duration: still() ? 0 : 140 }}
			>
				<b>{cue.who === 'NORA' ? 'Nora' : 'Theo'}</b>{cue.text}
			</p>
		{/if}
	{/key}
</div>

<style>
	/* One cell, so a line on its way out and the next on its way in share it, anchored at the edge they sit near. */
	.subtitles {
		position: fixed;
		z-index: 9;
		bottom: max(24px, calc(env(safe-area-inset-bottom) + 10px));
		display: grid;
		justify-items: center;
		pointer-events: none;
		transition:
			left 0.5s cubic-bezier(0.3, 1, 0.4, 1),
			width 0.5s cubic-bezier(0.3, 1, 0.4, 1);
	}
	.subtitles.high {
		bottom: auto;
	}
	/*
	 * Deep blue glass, the colour of the tour's shade, so it reads over the bright sky and the dark machine rooms alike.
	 * The speaker's name is a little tab in their colour from the player: amber for Nora, slate blue for Theo.
	 */
	.line {
		grid-area: 1 / 1;
		align-self: end;
		box-sizing: border-box;
		max-width: min(100%, calc(600px * var(--ui, 1)));
		margin: 0;
		padding: calc(8px * var(--ui, 1)) calc(16px * var(--ui, 1)) calc(10px * var(--ui, 1));
		border-radius: calc(14px * var(--ui, 1));
		background: rgb(9 24 56 / 0.8);
		-webkit-backdrop-filter: blur(12px) saturate(1.4);
		backdrop-filter: blur(12px) saturate(1.4);
		color: #f4f7ff;
		font: 500 calc(17px * var(--ui, 1)) / 1.42 var(--sans);
		text-align: center;
		text-wrap: balance;
		/* A faint rim, so the glass keeps its edge over the darkest rooms too. */
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.1),
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			0 10px 30px rgb(6 15 38 / 0.26);
	}
	.high .line {
		align-self: start;
	}
	.line b {
		display: inline-block;
		margin-right: 0.55em;
		padding: 0.12em 0.5em 0.2em;
		border-radius: 0.45em;
		background: var(--c);
		color: #101a30;
		font-size: 0.72em;
		font-weight: 700;
		line-height: 1.2;
		vertical-align: 0.14em;
	}
	.nora {
		--c: #ffc94a;
	}
	.theo {
		--c: #a9c4ee;
	}
	@media (max-aspect-ratio: 9/10) {
		.line {
			font-size: 16px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.subtitles {
			transition: none;
		}
	}
	@media (forced-colors: active) {
		.line {
			border: 1px solid CanvasText;
		}
		.line b {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
