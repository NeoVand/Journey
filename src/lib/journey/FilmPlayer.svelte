<script lang="ts">
	/**
	 * The plate that drops from the Play key: the whole story as one rail, a share for every card, its scene and then its
	 * conversation, under the nine stops of the trip. Dragging it moves the picture through every moment between, either
	 * way, and the voices follow; a stop's mark goes there the way the map does. And what plays: the conversations (or,
	 * without them, time to read each card), the music of each place, and the sounds of the machines.
	 */
	import { ConversationIcon, MusicNote03Icon, SparklesIcon } from '@hugeicons/core-free-icons';
	import type { Attachment } from 'svelte/attachments';
	import { STOPS } from './content';
	import type { ReelCard } from './film';
	import Icon from './Icon.svelte';
	import { STOP_ICON } from './icons';

	let {
		cards,
		rail,
		at,
		total,
		playing,
		open,
		anchor,
		layers,
		onlayer,
		onscrub,
		ontoggle,
		onjump
	}: {
		cards: ReelCard[];
		/** Where the film is along the rail, 0 to 1, and in seconds, of how many. */
		rail: number;
		at: number;
		total: number;
		playing: boolean;
		open: boolean;
		/** The Play key, which the plate's notch points at. */
		anchor?: HTMLElement;
		/** What plays: the conversations, the ambience, the effects. */
		layers: Record<Layer, boolean>;
		onlayer: (layer: Layer, on: boolean) => void;
		onscrub: (u: number, phase: 'start' | 'move' | 'end') => void;
		ontoggle: () => void;
		/** To the first card of a stop on the trip, the way the map goes there. */
		onjump: (title: string) => void;
	} = $props();

	type Layer = 'talk' | 'ambience' | 'effects';
	const LAYERS: { layer: Layer; name: string; icon: typeof ConversationIcon; on: string; off: string }[] = [
		{ layer: 'talk', name: 'Voices', icon: ConversationIcon, on: 'Nora and Theo talk each card through', off: 'Just the scenes, with time to read each card' },
		{ layer: 'ambience', name: 'Ambience', icon: MusicNote03Icon, on: 'The music and air of each place', off: 'No music or air' },
		{ layer: 'effects', name: 'Effects', icon: SparklesIcon, on: 'The sounds of the machines', off: 'No sounds from the machines' }
	];

	const count = $derived(Math.max(1, cards.length));
	/** The card the film is on, and the one under the pointer, if it's over the rail. */
	const here = $derived(Math.min(count - 1, Math.floor(rail * count)));
	let hover = $state<number | null>(null);
	let hoverX = $state(0);
	const shown = $derived(hover ?? here);
	const stopOf = (k: number) => STOPS[cards[k]?.chapter] ?? null;
	/** Where each stop of the trip begins along the rail, and how far it runs. */
	const stops = $derived(
		STOPS.map((stop, n) => {
			const first = cards.findIndex((c) => c.chapter === n);
			const last = cards.findLastIndex((c) => c.chapter === n);
			return { stop, n, from: first / count, to: (last + 1) / count, first: cards[first]?.title ?? stop.parts[0] };
		}).filter((s) => s.from >= 0)
	);
	const chapter = $derived(cards[here]?.chapter ?? 0);

	/** "1:02:03" past the hour, "2:03" under it. */
	const clock = (s: number) => {
		const t = Math.max(0, Math.floor(s));
		const h = Math.floor(t / 3600);
		const m = Math.floor((t % 3600) / 60);
		const r = String(t % 60).padStart(2, '0');
		return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
	};

	/** Points the notch at the key, wherever the header has put the plate. */
	const aim: Attachment<HTMLElement> = (box) => {
		if (!open || !anchor) return;
		const key = anchor;
		const place = () => {
			const k = key.getBoundingClientRect();
			const b = box.getBoundingClientRect();
			const scale = b.width / box.offsetWidth || 1;
			box.style.setProperty('--notch', `${(k.left + k.width / 2 - b.left) / scale}px`);
		};
		place();
		addEventListener('resize', place);
		return () => removeEventListener('resize', place);
	};

	let holding = false;
	/** How far along the rail the pointer is, 0 to 1. The handlers are the rail's own, so it measures itself. */
	const along = (e: PointerEvent) => {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
	};
	function point(e: PointerEvent) {
		const u = along(e);
		hover = Math.min(count - 1, Math.floor(u * count));
		hoverX = u;
		if (holding) onscrub(u, 'move');
	}
	function press(e: PointerEvent) {
		if (e.button !== 0) return;
		holding = true;
		try {
			// The drag stays the rail's even when the pointer wanders off it.
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// A pointer the browser no longer knows about: the drag works as long as it stays on the rail.
		}
		const u = along(e);
		hoverX = u;
		onscrub(u, 'start');
		e.preventDefault();
	}
	function release(e: PointerEvent) {
		if (!holding) return;
		holding = false;
		onscrub(along(e), 'end');
		if (e.pointerType !== 'mouse') hover = null;
	}

	/** Where card k's conversation begins along the rail: the arrow keys go from card to card there. */
	const holdOf = (k: number) => (Math.max(0, Math.min(count - 1, k)) + (cards[k]?.split ?? 0)) / count;
	function keys(e: KeyboardEvent) {
		const now = Math.min(count - 1, Math.floor(rail * count + 1e-6));
		const past = rail * count - now > (cards[now]?.split ?? 0) + 1e-3;
		const to: Record<string, () => number> = {
			ArrowRight: () => holdOf(now + 1),
			ArrowUp: () => holdOf(now + 1),
			ArrowLeft: () => holdOf(past ? now : now - 1),
			ArrowDown: () => holdOf(past ? now : now - 1),
			Home: () => 0,
			End: () => holdOf(count - 1)
		};
		if (!(e.key in to)) return;
		e.preventDefault();
		e.stopPropagation();
		const u = to[e.key]();
		onscrub(u, 'start');
		onscrub(u, 'end');
	}
</script>

<div class={['film-player', { open }]} inert={!open}>
	<div class="plate" {@attach aim} role="group" aria-label="The whole story, as a film">
		<div class="top">
			<button type="button" class={['play', { playing }]} aria-label={playing ? 'Pause the film' : 'Play the whole story'} onclick={ontoggle}>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					{#if playing}
						<rect x="6" y="5" width="4.4" height="14" rx="1.5" />
						<rect x="13.6" y="5" width="4.4" height="14" rx="1.5" />
					{:else}
						<path d="M8 6.1v11.8a1.3 1.3 0 0 0 2 1.1l9.3-5.9a1.3 1.3 0 0 0 0-2.2L10 5a1.3 1.3 0 0 0-2 1.1z" />
					{/if}
				</svg>
			</button>
			<p class="title">
				<small>{stopOf(shown)?.name ?? 'The whole story'}</small>
				<span>{cards[shown]?.title ?? ''}</span>
			</p>
		</div>

		<div class="stops" aria-hidden="true">
			{#each stops as s (s.n)}
				<button
					type="button"
					tabindex="-1"
					class={{ now: s.n === chapter, past: s.n < chapter }}
					style:left="{((s.from + s.to) / 2) * 100}%"
					title={s.stop.name}
					onclick={() => onjump(s.first)}
				>
					<Icon icon={STOP_ICON[s.n]} size={13} stroke={1.9} />
				</button>
			{/each}
		</div>
		<div
			class="strip"
			style:--p={rail}
			role="presentation"
			onpointermove={point}
			onpointerleave={() => !holding && (hover = null)}
			onpointerdown={press}
			onpointerup={release}
			onpointercancel={release}
		>
			{#each [false, true] as played (played)}
				<div class={['cells', { played }]} aria-hidden="true">
					{#each cards as card, k (k)}
						<span class="cell" style:--s={card.split}><i class="scene"></i><i class={['hold', { talk: card.talk }]}></i></span>
					{/each}
				</div>
			{/each}
			{#each stops.slice(1) as s (s.n)}
				<i class="seam" style:left="{s.from * 100}%" aria-hidden="true"></i>
			{/each}
			{#if hover !== null}
				<i class="ghost" style:left="{hoverX * 100}%" aria-hidden="true"></i>
			{/if}
			<span class="head" aria-hidden="true"></span>
			<!-- The slider a screen reader and the keys use: card by card. The pointer drags the rail itself. -->
			<input
				type="range"
				min="0"
				max="1000"
				step="1"
				value={Math.round(rail * 1000)}
				aria-label="Where in the story"
				aria-valuetext="{clock(at)} of {clock(total)}: {cards[here]?.title ?? ''}"
				tabindex="0"
				onkeydown={keys}
				oninput={(e) => {
					const u = Number(e.currentTarget.value) / 1000;
					onscrub(u, 'start');
					onscrub(u, 'end');
				}}
			/>
		</div>
		<div class="foot">
			<span class="time">{clock(at)}</span>
			<div class="layers" role="group" aria-label="What plays">
				{#each LAYERS as l (l.layer)}
					<button type="button" class={['layer', { on: layers[l.layer] }]} aria-pressed={layers[l.layer]} title={layers[l.layer] ? l.on : l.off} onclick={() => onlayer(l.layer, !layers[l.layer])}>
						<Icon icon={l.icon} size={15} stroke={1.8} />{l.name}
					</button>
				{/each}
			</div>
			<span class="time">{clock(total)}</span>
		</div>
	</div>
</div>

<style>
	/* It hangs from the header like the talk key's player, with a clear bridge above it so a pointer never falls through. */
	.film-player {
		position: absolute;
		z-index: 2;
		top: 100%;
		right: 0;
		padding-top: 10px;
		opacity: 0;
		visibility: hidden;
		transform: translateY(-6px) scale(0.97);
		transform-origin: 70% 0;
		transition:
			opacity 0.16s,
			transform 0.2s,
			visibility 0s 0.2s;
	}
	.film-player.open {
		opacity: 1;
		visibility: visible;
		transform: none;
		transition:
			opacity 0.18s,
			transform 0.32s cubic-bezier(0.2, 1.35, 0.4, 1),
			visibility 0s;
	}
	.plate {
		position: relative;
		width: 360px;
		box-sizing: border-box;
		padding: 12px 14px 11px;
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
		left: calc(var(--notch) - 7px);
		width: 14px;
		height: 14px;
		border-radius: 3px 0 0;
		background: #fffaf0;
		box-shadow: -2px -2px 5px rgb(20 60 130 / 0.07);
		transform: rotate(45deg);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 12px;
	}
	button {
		-webkit-tap-highlight-color: transparent;
	}
	button:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 1px;
	}
	/* Play is the amber key, the one that's yours to press. */
	.play {
		flex: none;
		display: grid;
		place-items: center;
		width: 42px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: 11px;
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		cursor: pointer;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
		transition: transform 0.1s;
	}
	.play svg {
		display: block;
		fill: currentColor;
	}
	@media (hover: hover) {
		.play:hover {
			background: linear-gradient(#ffdb78, #ffc23d);
		}
	}
	.play:active {
		transform: translateY(1px);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -1px 0 rgb(176 104 0 / 0.42);
	}
	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		display: grid;
		gap: 2px;
	}
	.title small {
		font: 650 10.5px/1.1 var(--sans);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #8a7a5c;
	}
	.title span {
		overflow: hidden;
		font: 700 14px/1.2 var(--display);
		letter-spacing: -0.01em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	/* What plays: a small key that stands up in cream, with an amber line under it, when it's on. */
	.layer {
		position: relative;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		padding: 0 7px 0 6px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: #7d879a;
		font: 650 11.5px/1 var(--sans);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.15s,
			box-shadow 0.2s,
			transform 0.1s;
	}
	.layer::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 18px;
		height: 2.5px;
		margin-left: -9px;
		border-radius: 2px;
		background: #ffb921;
		transform: scaleX(0);
		transition: transform 0.25s cubic-bezier(0.3, 1.5, 0.4, 1);
	}
	.layer.on {
		background: linear-gradient(#fffefa, #fff4dc);
		color: #101a30;
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.18);
	}
	.layer.on::after {
		transform: none;
	}
	@media (hover: hover) {
		.layer:not(.on):hover {
			background: rgb(217 191 149 / 0.3);
			color: #101a30;
		}
	}
	.layer:active {
		transform: translateY(1px);
	}

	/* The nine stops of the trip, each over its own stretch of the rail: the one the film is in, in amber. */
	.stops {
		position: relative;
		height: 18px;
		margin: 0 0 3px;
	}
	.stops button {
		position: absolute;
		top: 0;
		display: grid;
		place-items: center;
		width: 22px;
		height: 18px;
		margin-left: -11px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #a3abbb;
		cursor: pointer;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.stops button.past {
		color: #6b7488;
	}
	.stops button.now {
		color: #b06800;
	}
	@media (hover: hover) {
		.stops button:hover {
			color: #101a30;
			background: rgb(217 191 149 / 0.3);
		}
	}

	/*
	 * The rail: a share for every card, its scene in sky blue and then its hold, amber where it's talked through and cream
	 * where it's read. What has played takes the full colours; the rest waits pale.
	 */
	.strip {
		position: relative;
		height: 16px;
		touch-action: none;
		cursor: pointer;
	}
	.cells {
		position: absolute;
		inset: 3px 0;
		display: flex;
		border-radius: 5px;
		overflow: hidden;
		background: rgb(217 191 149 / 0.2);
	}
	.cells.played {
		clip-path: inset(-2px calc(100% - var(--p) * 100%) -2px 0);
		background: none;
	}
	.cell {
		flex: 1;
		display: flex;
		min-width: 0;
	}
	.cell i {
		display: block;
		height: 100%;
	}
	.scene {
		flex: 0 0 calc(var(--s) * 100%);
		background: #cfe3f7;
	}
	.hold {
		flex: 1;
		background: rgb(217 191 149 / 0.32);
	}
	.hold.talk {
		background: #f6e3b4;
	}
	.played .scene {
		background: #5da2ee;
	}
	.played .hold {
		background: #d9bf95;
	}
	.played .hold.talk {
		background: #ffb921;
	}
	/* Where one stop of the trip gives way to the next: a cream seam across the rail. */
	.seam {
		position: absolute;
		top: 1px;
		bottom: 1px;
		width: 2px;
		margin-left: -1px;
		border-radius: 1px;
		background: #fffaf0;
		pointer-events: none;
	}
	.ghost {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		border-radius: 1px;
		background: rgb(16 26 48 / 0.28);
		pointer-events: none;
	}
	/* The film's place: a dark line, with the token on top of it. */
	.head {
		position: absolute;
		top: -2px;
		bottom: -2px;
		left: calc(var(--p) * 100%);
		width: 3px;
		margin-left: -1.5px;
		border-radius: 2px;
		background: #101a30;
		box-shadow: 0 0 0 1.5px #fffaf0;
		pointer-events: none;
	}
	.head::before {
		content: '';
		position: absolute;
		top: -5px;
		left: 50%;
		width: 9px;
		height: 9px;
		margin-left: -4.5px;
		border-radius: 50%;
		background: #ffb921;
		box-shadow:
			0 0 0 1.5px #fffaf0,
			0 1px 2px rgb(60 40 10 / 0.3);
	}
	/* Only for the keys and a screen reader: the pointer works the rail itself. */
	.strip input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}
	.strip:has(input:focus-visible) {
		outline: 2px solid #1f5fe0;
		outline-offset: 4px;
		border-radius: 4px;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
	}
	.time {
		flex: 1;
		font: 600 11px/1 var(--sans);
		font-variant-numeric: tabular-nums;
		color: #7d879a;
	}
	.time:last-child {
		text-align: right;
	}
	.layers {
		display: flex;
		gap: 2px;
	}

	@media (max-aspect-ratio: 9/10) {
		.film-player {
			left: 10px;
			right: 10px;
			padding-top: 6px;
			transform-origin: 50% 0;
		}
		.plate {
			width: auto;
			max-width: 420px;
			margin-left: auto;
		}
		.strip {
			height: 22px;
		}
		.cells {
			inset: 5px 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.film-player,
		.film-player.open {
			transform: none;
			transition:
				opacity 0.15s,
				visibility 0s 0.15s;
		}
		.film-player.open {
			transition: opacity 0.15s;
		}
		.layer::after {
			transition: none;
		}
	}
	@media (forced-colors: active) {
		.played .scene,
		.played .hold,
		.head {
			background: Highlight;
		}
		.layer.on {
			outline: 2px solid ButtonText;
		}
	}
</style>
