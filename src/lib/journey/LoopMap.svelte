<script lang="ts" module>
	import { TRIP, TRIP_DONE } from './content';

	type P = [number, number];
	/**
	 * The token's way round, as the world has it seen from in front: x across, y up, in the world's own units, with the
	 * moment of the story the token is at each point. Your laptop at the waist, the provider and the model in the ring
	 * above, your tools in the ring below. Kept in step with layout.ts and world.ts by eye: this is a map, not a plan.
	 */
	const ROUTE: [number, number, number][] = [
		[-5.5, 1.5, 0],
		[1.1, 3, 2],
		[7.5, 4, 3.6],
		[13.5, 7.5, 4.4],
		[20, 12.5, 5.4],
		[22.5, 19.5, 6.7],
		[18, 28, 7.3],
		[9, 33, 7.7],
		[1.4, 34.2, 7.95],
		[1.4, 34.2, 18.6],
		[-8.5, 32, 18.85],
		[-16.5, 23, 19],
		[-15.5, 12.5, 19.12],
		[-8, 6, 19.22],
		[1.1, 3, 19.3],
		[-7.5, -4.5, 19.6],
		[-16, -12.5, 19.85],
		[-19.5, -19, 20.1],
		[-9, -23, 21.3],
		[6, -24, 22.4],
		[20, -22.5, 24.6],
		[25.5, -15.5, 25],
		[22, -7.5, 25.1],
		[11, -1.5, 25.3],
		[1.1, 3, 25.42]
	];
	/** Where each of the nine stops is marked: points the route passes through. */
	const MARKS: P[] = [0, 1, 3, 4, 8, 11, 17, 19, 22].map((i) => [ROUTE[i][0], ROUTE[i][1]]);
	const pts = ROUTE.map(([x, y]) => [x, -y] as P);
	/** A point on the smooth curve through the route, f of the way from point i to point i + 1. */
	const along = (i: number, f: number): P => {
		const a = pts[Math.max(0, i - 1)];
		const b = pts[i];
		const c = pts[Math.min(pts.length - 1, i + 1)];
		const d = pts[Math.min(pts.length - 1, i + 2)];
		const f2 = f * f;
		const f3 = f2 * f;
		// Catmull-Rom: through every point, with no corners.
		const at = (k: 0 | 1) => 0.5 * (2 * b[k] + (c[k] - a[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f2 + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * f3);
		return [at(0), at(1)];
	};
	const fmt = (p: P) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
	/** The route drawn from its start up to point i, f of the way on to the next: the part the token has travelled. */
	const upTo = (i: number, f: number) => {
		let d = `M${fmt(pts[0])}`;
		for (let j = 0; j <= i && j < pts.length - 1; j++) {
			const steps = j < i ? 8 : Math.max(1, Math.ceil(f * 8));
			const end = j < i ? 1 : f;
			for (let s = 1; s <= steps; s++) d += `L${fmt(along(j, (s / steps) * end))}`;
		}
		return d;
	};
	const WHOLE = upTo(pts.length - 2, 1);
	/** Where the token is at a moment of the story: the route point it last passed, and how far on to the next. */
	const placeAt = (T: number): [number, number] => {
		let i = 0;
		while (i < ROUTE.length - 2 && T >= ROUTE[i + 1][2]) i++;
		const [, , a] = ROUTE[i];
		const [, , b] = ROUTE[i + 1];
		return [i, Math.max(0, Math.min(1, (T - a) / (b - a)))];
	};
</script>

<script lang="ts">
	let {
		T,
		onjump,
		onopen
	}: {
		/** Where the reader is in the story, in sections. */
		T: number;
		/** Goes to a stop's first card. */
		onjump: (title: string) => void;
		/** On a phone, where the stops are too close together to press, the whole map opens the map of the trip. */
		onopen: () => void;
	} = $props();

	const done = $derived(T >= TRIP_DONE);
	const here = $derived(done ? TRIP.length : TRIP.findLastIndex((s) => T >= s.from));
	const place = $derived(placeAt(T));
	const travelled = $derived(done ? WHOLE : upTo(place[0], place[1]));
	const dot = $derived(done ? pts[pts.length - 1] : along(place[0], place[1]));
	const caption = $derived(done ? 'All nine stops' : TRIP[here].name);
</script>

<nav class="loop-map" aria-label="Where you are in the loop">
	<svg viewBox="-23.5 -37.5 52.5 65" aria-hidden="true">
		<path class="track" d={WHOLE} />
		<path class="travelled" d={travelled} />
		{#each MARKS as [x, y], i (i)}
			<circle class={['stop', { past: i < here, at: i === here }]} cx={x} cy={-y} r={i === here ? 2.9 : 2.1} />
		{/each}
		{#if !done}
			<circle class="halo" cx={dot[0]} cy={dot[1]} r="4.6" />
			<circle class="token" cx={dot[0]} cy={dot[1]} r="1.9" />
		{/if}
	</svg>
	<div class="presses">
		{#each TRIP as stop, i (stop.name)}
			{@const [x, y] = MARKS[i]}
			<button
				type="button"
				class="press"
				style:left="{((x + 23.5) / 52.5) * 100}%"
				style:top="{((-y + 37.5) / 65) * 100}%"
				aria-label="Stop {i + 1}, {stop.name}: go to {stop.card}"
				aria-current={i === here ? 'step' : undefined}
				onclick={() => onjump(stop.card)}
			>
				<span class="tip">{i + 1} {stop.name}</span>
			</button>
		{/each}
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
		width: 112px;
		padding: 9px 9px 7px;
		border-radius: 16px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -3px 0 #e4cfa6,
			0 1px 2px rgb(60 40 10 / 0.14),
			0 10px 26px rgb(20 60 130 / 0.16);
		color: #33415c;
		font: 650 12px/1.2 var(--sans);
		transition:
			opacity 0.4s,
			visibility 0.4s;
	}
	svg {
		display: block;
		width: 100%;
		aspect-ratio: 52.5 / 65;
		overflow: visible;
	}
	.track,
	.travelled {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.track {
		stroke: #d9cbb0;
		stroke-width: 1.5;
	}
	.travelled {
		stroke: #f29a1f;
		stroke-width: 1.9;
	}
	.stop {
		fill: #fffaf0;
		stroke: #b9a888;
		stroke-width: 0.9;
		transition: r 0.25s;
	}
	.stop.past {
		fill: #f6b24a;
		stroke: #d98a17;
	}
	.stop.at {
		fill: #fff;
		stroke: #e58a0c;
		stroke-width: 1.3;
	}
	.token {
		fill: #f08c00;
	}
	.halo {
		fill: rgb(255 170 40 / 0.28);
	}
	.presses {
		position: absolute;
		inset: 9px 9px auto;
		aspect-ratio: 52.5 / 65;
	}
	.press {
		position: absolute;
		width: 16px;
		height: 16px;
		translate: -50% -50%;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.press:hover,
	.press:focus-visible {
		background: rgb(240 140 0 / 0.16);
		outline: none;
	}
	.tip {
		position: absolute;
		right: calc(100% + 6px);
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
	.whole {
		display: none;
	}
	.caption {
		margin: 3px 0 0;
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

	/* A phone: a small mark under the header on the right, above the words. Its stops are too close to press, so a tap opens the map. */
	@media (max-aspect-ratio: 9/10) {
		.loop-map {
			top: calc(env(safe-area-inset-top) + 68px);
			bottom: auto;
			right: 12px;
			width: 58px;
			padding: 6px 6px 4px;
			border-radius: 12px;
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
