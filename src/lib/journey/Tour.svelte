<script lang="ts">
	/**
	 * A quick look around. A welcome, then a spotlight that glides from one control to the next (the steps, the talk
	 * key, sound, the map) and ends on Begin. The page opens it by itself on a first visit, once the world is ready, and
	 * the title page's Show me around key opens it after that.
	 */
	import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { fade } from 'svelte/transition';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		soundOn,
		ontogglesound,
		onbegin
	}: {
		open?: boolean;
		soundOn: boolean;
		ontogglesound: () => void;
		/** The last stop's key: the tour ends and the story starts. */
		onbegin: () => void;
	} = $props();

	type Stop = {
		/** What to light up: every match, as one. None for the welcome. */
		at?: string;
		title: string;
		body: string;
		/** Said only to a mouse and keyboard, or only to a finger. */
		mouse?: string;
		touch?: string;
		/** Room for a key's edge, which hangs below its box. */
		edge?: number;
		sound?: true;
	};
	const STOPS: Stop[] = [
		{
			title: 'Before you set off',
			body: 'You’re about to follow one sentence from your keyboard to the model and back. Here’s how to find your way. It takes half a minute.'
		},
		{
			at: '.stepper [data-step]',
			title: 'One card at a time',
			body: 'Next moves the story on by one card. While a scene plays, amber fills the key, and once it’s full, it’s your turn again.',
			mouse: 'The → and ← keys work too, and so does your scroll wheel.',
			touch: 'A swipe up works too, and a swipe down goes back.'
		},
		{
			at: '.stepper .talk',
			title: 'Hear it talked through',
			body: 'Nora and Theo talk each card over in plain words, a few minutes at a time. Once you press play, they follow you from card to card.',
			mouse: 'Rest the pointer on the key to skip, scrub or change the speed.',
			touch: 'Tap it to listen, and the player opens under it.'
		},
		{
			at: '.stepper .sound',
			title: 'Sound, if you like',
			body: 'Soft music, and a little sound for everything the machines do. It’s off until you turn it on, and it steps back whenever Nora and Theo talk.',
			sound: true
		},
		{
			at: '.bar .brand',
			title: 'The map',
			body: 'The whole trip on one page. Jump to any stop, change your agent, or take a side trip. A side trip always brings you back to where you left off.'
		},
		{
			at: '.begin-row > button',
			title: 'Off you go',
			body: 'Press Begin whenever you’re ready. If you want this tour again, it’s right beside it.',
			edge: 6
		}
	];
	const LAST = STOPS.length - 1;

	let n = $state(0);
	const stop = $derived(STOPS[n]);
	let touch = $state(false);
	const extra = $derived(touch ? stop.touch : stop.mouse);
	/** The lit-up hole, and the card beside it, in screen pixels. */
	let spot = $state({ x: 0, y: 0, w: 0, h: 0, r: 0 });
	let card = $state({ x: 0, y: 0, arrow: 0, side: 'none' as 'top' | 'bottom' | 'none' });
	/** Set once the first stop has been placed, so the card arrives where it belongs instead of flying in from a corner. */
	let placed = $state(false);
	let cardEl = $state<HTMLElement>();
	let primary = $state<HTMLButtonElement>();

	const PAD = 6;
	const GAP = 16;
	const MARGIN = 12;

	/** The box around everything a stop lights up, a little bigger, with corners to match. */
	function measure(at?: string) {
		const els = at ? [...document.querySelectorAll<HTMLElement>(at)] : [];
		let l = Infinity;
		let t = Infinity;
		let r = -Infinity;
		let b = -Infinity;
		for (const el of els) {
			const q = el.getBoundingClientRect();
			if (!q.width || !q.height) continue;
			l = Math.min(l, q.left);
			t = Math.min(t, q.top);
			r = Math.max(r, q.right);
			b = Math.max(b, q.bottom);
		}
		if (l === Infinity) return { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0, r: 0 };
		b += STOPS[n].edge ?? 0;
		const round = parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) || 12;
		return { x: l - PAD, y: t - PAD, w: r - l + 2 * PAD, h: b - t + 2 * PAD, r: Math.min(round + PAD, (b - t) / 2 + PAD) };
	}

	/** Lights up the stop and puts the card beside it: under it if there's room, else over it, else in the middle. */
	async function place() {
		spot = measure(stop.at);
		await tick();
		if (!cardEl) return;
		// On a big monitor the card is zoomed with the rest of the words: measured on the screen, placed in its own pixels.
		const zoom = parseFloat(getComputedStyle(cardEl).zoom) || 1;
		const w = cardEl.offsetWidth * zoom;
		const h = cardEl.offsetHeight * zoom;
		if (!stop.at || !spot.w) {
			card = { x: (innerWidth - w) / 2 / zoom, y: Math.max(MARGIN, (innerHeight - h) / 2) / zoom, arrow: 0, side: 'none' };
		} else {
			const middle = spot.x + spot.w / 2;
			const x = Math.max(MARGIN, Math.min(innerWidth - w - MARGIN, middle - w / 2));
			const below = spot.y + spot.h + GAP;
			const above = spot.y - GAP - h;
			const side = below + h <= innerHeight - MARGIN ? 'top' : above >= MARGIN ? 'bottom' : 'none';
			const y = side === 'top' ? below : side === 'bottom' ? above : Math.max(MARGIN, innerHeight - h - MARGIN);
			card = { x: x / zoom, y: y / zoom, arrow: Math.max(24, Math.min(w - 24, middle - x)) / zoom, side };
		}
		// The first time, it appears where it belongs; after that, it glides.
		await tick();
		placed = true;
	}

	async function go(to: number) {
		n = Math.max(0, Math.min(LAST, to));
		await place();
		primary?.focus({ preventScroll: true });
	}

	function finish() {
		open = false;
	}

	function next() {
		if (n < LAST) return go(n + 1);
		finish();
		onbegin();
	}

	/** The dialog is the tour: shown as a modal, so the page behind it keeps still and the keyboard stays inside. */
	const show: Attachment<HTMLDialogElement> = (el) => {
		if (open && !el.open) {
			touch = matchMedia('(pointer: coarse)').matches;
			placed = false;
			el.showModal();
			void go(0);
		} else if (!open && el.open) el.close();
	};

	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	/**
	 * The welcome's little trip: the token runs the road from the first stop to the last, laying amber behind it. One
	 * clock drives both, from the moment the card is shown.
	 */
	const run: Attachment<SVGSVGElement> = (svg) => {
		const road = svg.querySelector<SVGPathElement>('.way');
		const laid = svg.querySelector<SVGPathElement>('.ahead');
		const token = svg.querySelector<SVGGElement>('.token');
		if (!road || !laid || !token) return;
		const length = road.getTotalLength();
		const put = (k: number) => {
			const p = road.getPointAtLength(length * k);
			token.setAttribute('transform', `translate(${p.x} ${p.y})`);
			laid.style.strokeDashoffset = String(1 - k);
		};
		if (reduced()) return put(1);
		put(0);
		const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
		const t0 = performance.now() + 150;
		let frame = 0;
		const step = (now: number) => {
			const k = Math.max(0, Math.min(1, (now - t0) / 1500));
			put(ease(k));
			if (k < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	};
</script>

<svelte:window onresize={() => open && place()} />

<!-- A click on the shade, outside the card and the light, ends the tour; so do Esc and the close key. -->
<dialog
	class="tour"
	aria-labelledby="tour-title"
	aria-describedby="tour-body"
	{@attach show}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === e.currentTarget) finish();
	}}
	onkeydown={(e) => {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			void go(n - 1);
		}
	}}
>
	{#if open}
	<div
		class={['spot', { bare: !spot.w, placed }]}
		style:width="{spot.w}px"
		style:height="{spot.h}px"
		style:border-radius="{spot.r}px"
		style:transform="translate({spot.x}px, {spot.y}px)"
		aria-hidden="true"
	></div>

	<div
		class={['card', `arrow-${card.side}`, { placed, welcome: n === 0 }]}
		bind:this={cardEl}
		style:transform="translate({card.x}px, {card.y}px)"
		style:--arrow="{card.arrow}px"
	>
		{#if n === 0}
			<!-- The trip in little: a road over the sky, three stops, and the token running along it. -->
			<svg class="road" viewBox="0 0 340 92" aria-hidden="true" {@attach run}>
				<path class="way" d="M30 62 C 80 62, 96 30, 156 32 S 240 70, 300 56" />
				<path class="ahead" d="M30 62 C 80 62, 96 30, 156 32 S 240 70, 300 56" pathLength="1" />
				<circle class="stop" cx="30" cy="62" r="7" style:--d="0s" />
				<circle class="stop" cx="156" cy="32" r="7" style:--d="0.75s" />
				<circle class="stop" cx="300" cy="56" r="7" style:--d="1.55s" />
				<g class="token" transform="translate(30 62)">
					<rect x="-9" y="-7" width="18" height="14" rx="4.5" />
				</g>
			</svg>
		{/if}
		<button type="button" class="close" aria-label="End the tour" onclick={finish}>
			<Icon icon={Cancel01Icon} size={16} stroke={2} />
		</button>
		{#key n}
			<div class="words" in:fade={{ duration: reduced() ? 0 : 220 }}>
				<h2 id="tour-title">{stop.title}</h2>
				<p id="tour-body">
					{stop.body}
					{#if extra}{extra}{/if}
				</p>
				{#if stop.sound}
					<button type="button" class={['sound', { on: soundOn }]} onclick={ontogglesound}>
						<Icon icon={soundOn ? VolumeHighIcon : VolumeOffIcon} size={17} stroke={1.9} />
						{soundOn ? 'Sound is on' : 'Turn the sound on'}
					</button>
				{/if}
			</div>
		{/key}
		<div class="foot">
			<ol class="dots" aria-label="Stop {n + 1} of {STOPS.length}">
				{#each STOPS as s, i (s.title)}
					<li class={{ now: i === n, past: i < n }}></li>
				{/each}
			</ol>
			{#if n === 0}
				<button type="button" class="quiet" onclick={finish}>Not now</button>
			{:else}
				<button type="button" class="back" aria-label="Back" onclick={() => go(n - 1)}>
					<Icon icon={ArrowLeft01Icon} size={18} stroke={2} />
				</button>
			{/if}
			<button type="button" class="next" bind:this={primary} onclick={next}>
				{n === 0 ? 'Show me' : n === LAST ? 'Begin' : 'Next'}
				<Icon icon={ArrowRight01Icon} size={18} stroke={2.2} />
			</button>
		</div>
	</div>
	{/if}
</dialog>

<style>
	/* The whole screen, clear: the shade is the light's own shadow, so the hole in it can glide from place to place. */
	.tour {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		overflow: hidden;
		background: transparent;
		color: #101a30;
		font-family: var(--sans);
		opacity: 0;
		transition:
			opacity 0.28s,
			display 0.28s allow-discrete,
			overlay 0.28s allow-discrete;
	}
	.tour[open] {
		opacity: 1;
	}
	@starting-style {
		.tour[open] {
			opacity: 0;
		}
	}
	.tour::backdrop {
		background: transparent;
	}

	/* The light: a hole in a deep blue shade, ringed in the token's amber, that glides on to each stop. */
	.spot {
		position: fixed;
		top: 0;
		left: 0;
		box-shadow:
			0 0 0 2.5px #ffd45f,
			0 0 0 8px rgb(255 212 95 / 0.22),
			0 0 0 200vmax rgb(9 28 66 / 0.5);
	}
	.spot.placed {
		transition:
			transform 0.6s cubic-bezier(0.3, 1.2, 0.4, 1),
			width 0.6s cubic-bezier(0.3, 1.2, 0.4, 1),
			height 0.6s cubic-bezier(0.3, 1.2, 0.4, 1),
			border-radius 0.6s,
			box-shadow 0.3s;
	}
	.spot.bare {
		box-shadow:
			0 0 0 0 rgb(255 212 95 / 0),
			0 0 0 0 rgb(255 212 95 / 0),
			0 0 0 200vmax rgb(9 28 66 / 0.5);
	}
	/* Once there, it calls softly: a ring that swells out from the light and fades, now and then. */
	.spot::after {
		content: '';
		position: absolute;
		inset: -3px;
		border-radius: inherit;
		box-shadow: 0 0 0 2px rgb(255 212 95 / 0.8);
		opacity: 0;
		animation: call 2.2s 0.7s ease-out infinite;
	}
	.spot.bare::after {
		display: none;
	}
	@keyframes call {
		0% {
			opacity: 0.9;
			transform: scale(1);
		}
		70%,
		100% {
			opacity: 0;
			transform: scale(1.18, 1.35);
		}
	}

	/* The card: the same cream stuff as every key on the page, a size bigger, with a notch pointing at what it's about. */
	.card {
		position: fixed;
		top: 0;
		left: 0;
		box-sizing: border-box;
		width: min(340px, calc(100vw / var(--ui, 1) - 24px));
		padding: 18px 20px 16px;
		zoom: var(--ui, 1);
		border-radius: 20px;
		background: linear-gradient(#fffaf0, #fbefd6);
		box-shadow:
			inset 0 1px 0 #fff,
			inset 0 -4px 0 #e4cfa6,
			0 2px 4px rgb(60 40 10 / 0.16),
			0 26px 60px rgb(4 18 50 / 0.38);
		opacity: 0;
	}
	.card.placed {
		opacity: 1;
		transition:
			transform 0.55s cubic-bezier(0.3, 1.15, 0.4, 1),
			opacity 0.25s;
	}
	.card.welcome {
		width: min(372px, calc(100vw / var(--ui, 1) - 24px));
		padding-top: 0;
	}
	.card::before {
		content: '';
		position: absolute;
		left: calc(var(--arrow) - 8px);
		width: 16px;
		height: 16px;
		border-radius: 3px;
		transform: rotate(45deg);
		opacity: 0;
		transition: opacity 0.2s;
	}
	.card.arrow-top::before {
		top: -7px;
		background: #fffaf0;
		opacity: 1;
	}
	.card.arrow-bottom::before {
		bottom: -7px;
		background: #e4cfa6;
		opacity: 1;
	}

	.road {
		display: block;
		width: calc(100% + 40px);
		height: auto;
		margin: 0 -20px 6px;
		border-radius: 20px 20px 0 0;
		background: linear-gradient(#bfe0fb, #e3f1fd 85%, #fffaf0);
	}
	.way {
		fill: none;
		stroke: #fffaf0;
		stroke-width: 9;
		stroke-linecap: round;
	}
	.ahead {
		fill: none;
		stroke: #ffc94a;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
	}
	.stop {
		fill: #fffaf0;
		stroke: #28405f;
		stroke-width: 2.5;
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.4s var(--d) cubic-bezier(0.2, 1.8, 0.4, 1) backwards;
	}
	@keyframes pop {
		from {
			transform: scale(0);
		}
	}
	.token rect {
		fill: #ffb921;
		stroke: #b06800;
		stroke-width: 1.5;
	}
	@media (prefers-reduced-motion: reduce) {
		.stop,
		.spot::after {
			animation: none;
		}
		.spot.placed,
		.card.placed {
			transition: opacity 0.2s;
		}
	}

	.close {
		position: absolute;
		top: 10px;
		right: 10px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: #7d879a;
		cursor: pointer;
	}
	.welcome .close {
		background: rgb(255 250 240 / 0.7);
	}
	@media (hover: hover) {
		.close:hover {
			background: rgb(217 191 149 / 0.3);
			color: #101a30;
		}
	}

	h2 {
		margin: 0 34px 7px 0;
		font: 800 20px/1.15 var(--display);
		letter-spacing: -0.015em;
		color: #101a30;
	}
	.words p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: #33415c;
	}
	.words .sound {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin: 12px 0 2px;
		padding: 8px 13px 9px 10px;
		border: 0;
		border-radius: 12px;
		background: rgb(217 191 149 / 0.26);
		color: #33415c;
		font: 650 14px/1 var(--sans);
		cursor: pointer;
		box-shadow: inset 0 1px 2px rgb(120 90 30 / 0.16);
		transition:
			background 0.18s,
			color 0.18s,
			box-shadow 0.18s,
			transform 0.1s;
	}
	.words .sound.on {
		background: linear-gradient(#fffefa, #fff4dc);
		color: #101a30;
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.18);
	}
	.words .sound:active {
		transform: translateY(1px);
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
	}
	/* Where you are in the tour, the way the header shows where the request is: the stop you're at is the token. */
	.dots {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0 auto 0 0;
		padding: 0;
		list-style: none;
	}
	.dots li {
		width: 7px;
		height: 7px;
		border-radius: 4px;
		background: #e4cfa6;
		transition:
			width 0.35s cubic-bezier(0.3, 1.4, 0.4, 1),
			background 0.25s;
	}
	.dots li.past {
		background: #c9a76b;
	}
	.dots li.now {
		width: 20px;
		background: linear-gradient(#ffd45f, #ffb921);
		box-shadow: inset 0 -1.5px 0 rgb(176 104 0 / 0.42);
	}
	.foot button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: 12px;
		font: 700 15px/1 var(--sans);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 0.18s,
			transform 0.1s,
			box-shadow 0.1s;
	}
	.foot .quiet,
	.foot .back {
		background: transparent;
		color: #4d5a72;
	}
	.foot .back {
		width: 38px;
		padding: 0;
	}
	@media (hover: hover) {
		.foot .quiet:hover,
		.foot .back:hover {
			background: rgb(217 191 149 / 0.3);
			color: #101a30;
		}
	}
	.foot .next {
		padding: 0 12px 0 16px;
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	@media (hover: hover) {
		.foot .next:hover {
			background: linear-gradient(#ffdb78, #ffc23d);
		}
	}
	.foot button:active {
		transform: translateY(1px);
	}
	.foot .next:active {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -1px 0 rgb(176 104 0 / 0.42);
	}
	.tour button:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 2px;
	}

	@media (forced-colors: active) {
		.spot {
			outline: 3px solid Highlight;
		}
		.card {
			border: 2px solid CanvasText;
		}
		.dots li.now {
			background: Highlight;
		}
	}
</style>
