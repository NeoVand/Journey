<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { TRIP, TRIP_DONE } from './content';

	type At = { x: number; y: number };
	let {
		T,
		mark,
		stops,
		onjump,
		onopen,
		oncanvas
	}: {
		/** Where the reader is in the story, in sections. */
		T: number;
		/** Where the reader's token is in the picture, as shares of its width and height. */
		mark: At | null;
		/** Where the nine stops are in the picture. */
		stops: At[];
		/** Goes to a stop's first card. */
		onjump: (title: string) => void;
		/** On a phone, where the stops are too close together to press, the whole map opens the map of the trip. */
		onopen: () => void;
		/** The world draws itself into this: the map is a camera on the real scene, far off. */
		oncanvas: (canvas: HTMLCanvasElement | null) => void;
	} = $props();

	const done = $derived(T >= TRIP_DONE);
	const here = $derived(done ? TRIP.length : TRIP.findLastIndex((s) => T >= s.from));
	const caption = $derived(done ? 'All nine stops' : TRIP[here].name);

	/** Sized to the pixels it shows, up to twice the page's: a small picture, drawn now and then. */
	const picture: Attachment<HTMLCanvasElement> = (canvas) => {
		const size = () => {
			const k = Math.min(2, devicePixelRatio || 1);
			const w = Math.round(canvas.clientWidth * k);
			const h = Math.round(canvas.clientHeight * k);
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
			oncanvas(canvas);
		};
		size();
		const watch = new ResizeObserver(size);
		watch.observe(canvas);
		return () => {
			watch.disconnect();
			oncanvas(null);
		};
	};
</script>

<nav class="loop-map" aria-label="Where you are in the loop">
	<div class="view">
		<canvas {@attach picture} aria-hidden="true"></canvas>
		<div class="presses">
			{#each TRIP as stop, i (stop.name)}
				{@const at = stops[i]}
				{#if at}
					<button
						type="button"
						class={['press', { past: i < here, at: i === here }]}
						style:left="{at.x * 100}%"
						style:top="{at.y * 100}%"
						aria-label="Stop {i + 1}, {stop.name}: go to {stop.card}"
						aria-current={i === here ? 'step' : undefined}
						onclick={() => onjump(stop.card)}
					>
						<span class="tip">{i + 1} {stop.name}</span>
					</button>
				{/if}
			{/each}
		</div>
		{#if mark && !done}
			<span class="mark" style:left="{mark.x * 100}%" style:top="{mark.y * 100}%" aria-hidden="true"></span>
		{/if}
	</div>
	<span class="cloud" aria-hidden="true"></span>
	<button type="button" class="whole" aria-label="Open the map of the trip" onclick={onopen}></button>
	<p class="caption">
		{#if !done}<b>{here + 1}</b>{/if}
		{caption}
	</p>
</nav>

<style>
	/*
	 * A glimpse of the whole loop far below, through a gap in the clouds: no frame, the picture clear in the middle and
	 * thinning to nothing towards its edges, with cloud drifting over them. Pointed at, the gap opens and it comes up
	 * clear. The opening is a registered property, so it eases.
	 */
	@property --clear {
		syntax: '<percentage>';
		inherits: true;
		initial-value: 56%;
	}
	.loop-map {
		--clear: 56%;
		--puff: 255 255 255;
		--halo: 255 255 255;
		position: fixed;
		z-index: 9;
		right: clamp(8px, 1.4vw, 20px);
		bottom: max(8px, env(safe-area-inset-bottom));
		box-sizing: border-box;
		width: 236px;
		color: #33415c;
		font: 650 12px/1.2 var(--sans);
		transition: --clear 0.5s cubic-bezier(0.3, 0.8, 0.3, 1);
	}
	.loop-map:hover,
	.loop-map:focus-within {
		--clear: 74%;
	}
	/* At night the cloud is the hall's haze, and the caption's words are light. */
	:global(.journey.dark) .loop-map {
		--puff: 96 116 158;
		--halo: 6 15 38;
		color: #e3ebf9;
	}
	.view {
		position: relative;
		background: linear-gradient(#a9d3f6, #e3f2fd);
		-webkit-mask-image: radial-gradient(closest-side, #000 var(--clear), transparent);
		mask-image: radial-gradient(closest-side, #000 var(--clear), transparent);
		opacity: 0.88;
		transition: opacity 0.4s;
	}
	.loop-map:hover .view,
	.loop-map:focus-within .view {
		opacity: 1;
	}
	/* Puffs of cloud round the gap's rim, thickest where the picture thins, parting a little when it opens. */
	.cloud {
		position: absolute;
		inset: -14% -10% 2%;
		pointer-events: none;
		background:
			radial-gradient(closest-side, rgb(var(--puff) / 0.85), rgb(var(--puff) / 0)) 0% 18% / 38% 46% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.7), rgb(var(--puff) / 0)) 34% 0% / 46% 34% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.8), rgb(var(--puff) / 0)) 92% 4% / 44% 40% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.75), rgb(var(--puff) / 0)) 104% 58% / 30% 50% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.85), rgb(var(--puff) / 0)) 78% 104% / 52% 38% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.7), rgb(var(--puff) / 0)) 20% 100% / 50% 36% no-repeat,
			radial-gradient(closest-side, rgb(var(--puff) / 0.75), rgb(var(--puff) / 0)) -4% 74% / 32% 48% no-repeat;
		filter: blur(3px);
		opacity: 0.75;
		transition:
			opacity 0.5s,
			transform 0.6s cubic-bezier(0.3, 0.8, 0.3, 1);
	}
	/* At night the world below is still by day, so the gap shows it dimmer, with only a little haze. */
	:global(.journey.dark) .cloud {
		opacity: 0.3;
	}
	:global(.journey.dark) .view {
		filter: brightness(0.86);
	}
	:global(.journey.dark) .loop-map:not(:hover, :focus-within) .view {
		opacity: 0.7;
	}
	.loop-map:hover .cloud,
	.loop-map:focus-within .cloud {
		opacity: 0.5;
		transform: scale(1.1);
	}
	canvas {
		display: block;
		width: 100%;
		aspect-ratio: 162 / 104;
	}
	.presses {
		position: absolute;
		inset: 0;
	}
	.press {
		position: absolute;
		width: 18px;
		height: 18px;
		translate: -50% -50%;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	/* Each stop is a small ring on the picture: hollow ahead, filled once passed, larger where the reader is. */
	.press::before {
		content: '';
		position: absolute;
		inset: 6.5px;
		border-radius: 50%;
		background: rgb(255 250 240 / 0.92);
		box-shadow: 0 0 0 1px rgb(110 90 60 / 0.7);
	}
	.press.past::before {
		background: #f6b24a;
		box-shadow: 0 0 0 1px #d98a17;
	}
	.press.at::before {
		inset: 5px;
		background: #fff;
		box-shadow: 0 0 0 1.5px #e58a0c;
	}
	.press:hover::before,
	.press:focus-visible::before {
		box-shadow: 0 0 0 3px #e58a0c;
	}
	.press:focus-visible {
		outline: none;
	}
	.tip {
		position: absolute;
		right: calc(100% + 4px);
		top: 50%;
		translate: 0 -50%;
		padding: 4px 7px 5px;
		border-radius: 8px;
		background: #1c2740;
		color: #fff;
		font: 650 12px/1 var(--sans);
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s;
	}
	.press:hover .tip,
	.press:focus-visible .tip {
		opacity: 1;
	}
	/* The reader's token: a warm dot with a soft glow, on top of everything. */
	.mark {
		position: absolute;
		width: 7px;
		height: 7px;
		translate: -50% -50%;
		border-radius: 50%;
		background: #f08c00;
		box-shadow:
			0 0 0 1.5px #fff,
			0 0 0 6px rgb(255 170 40 / 0.35);
		pointer-events: none;
	}
	.whole {
		display: none;
	}
	/* Where you are, written on the cloud under the gap. */
	.caption {
		position: relative;
		margin: -4px 0 0;
		text-align: center;
		white-space: nowrap;
		text-shadow:
			0 0 4px rgb(var(--halo)),
			0 0 10px rgb(var(--halo) / 0.9);
	}
	.caption b {
		display: inline-grid;
		place-items: center;
		min-width: 15px;
		height: 15px;
		margin-right: 3px;
		border-radius: 8px;
		background: #f6b24a;
		color: #3a2600;
		font-size: 10.5px;
	}

	/* A phone: a small glimpse under the header on the right, above the words, fading into the sky with no cloud of its
	   own. Its stops are too close to press, so a tap opens the map. */
	@media (max-aspect-ratio: 9/10) {
		.loop-map {
			--clear: 58%;
			top: calc(env(safe-area-inset-top) + 62px);
			bottom: auto;
			right: 6px;
			width: 112px;
		}
		.cloud {
			display: none;
		}
		.presses {
			display: none;
		}
		.whole {
			display: block;
			position: absolute;
			inset: 0;
			border: 0;
			border-radius: inherit;
			background: none;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
		}
		.caption {
			display: none;
		}
	}
</style>
