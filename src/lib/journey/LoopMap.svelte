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
	<button type="button" class="whole" aria-label="Open the map of the trip" onclick={onopen}></button>
	<p class="caption">
		{#if !done}<b>{here + 1}</b>{/if}
		{caption}
	</p>
</nav>

<style>
	/* A cream key like the controls, standing still in the corner while the story moves past it. */
	.loop-map {
		position: fixed;
		z-index: 9;
		right: clamp(14px, 2.2vw, 30px);
		bottom: max(14px, env(safe-area-inset-bottom));
		box-sizing: border-box;
		width: 176px;
		padding: 7px 7px 5px;
		border-radius: 16px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 10px 26px rgb(20 60 130 / 0.16);
		color: #33415c;
		font: 650 12px/1.2 var(--sans);
	}
	.view {
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		background: linear-gradient(#a9d3f6, #e3f2fd);
		box-shadow: inset 0 0 0 1px rgb(40 70 120 / 0.12);
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
	.caption {
		margin: 4px 0 0;
		text-align: center;
		white-space: nowrap;
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

	/* A phone: a small picture under the header on the right, above the words. Its stops are too close to press, so a tap opens the map. */
	@media (max-aspect-ratio: 9/10) {
		.loop-map {
			top: calc(env(safe-area-inset-top) + 68px);
			bottom: auto;
			right: 12px;
			width: 96px;
			padding: 4px;
			border-radius: 12px;
		}
		.view {
			border-radius: 8px;
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
