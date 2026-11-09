<script lang="ts">
	/**
	 * The little player that drops from the header's talk key: the conversation drawn as two lanes, one for each voice,
	 * filling as it plays; a playhead to drag; back and ahead by fifteen seconds; how fast they talk; and subtitles. The
	 * page opens it on hover, on keyboard focus, and on a tap of the key.
	 */
	import { ClosedCaptionIcon, GoBackward15SecIcon, GoForward15SecIcon } from '@hugeicons/core-free-icons';
	import type { Attachment } from 'svelte/attachments';
	import Icon from './Icon.svelte';
	import { RATES, TALKS, clock, type Narrator } from './narrator.svelte';

	let {
		narrator,
		id,
		open,
		anchor
	}: {
		narrator: Narrator;
		/** The card's conversation. */
		id: string;
		open: boolean;
		/** The talk key, which the plate's notch points at. */
		anchor?: HTMLElement;
	} = $props();

	const talk = $derived(TALKS[id]);
	/** On the air, or paused partway: the conversation the narrator holds is this card's. */
	const on = $derived(narrator.id === id);
	const seconds = $derived(on && narrator.duration ? narrator.duration : (talk?.seconds ?? 0));
	const time = $derived(on ? narrator.time : 0);
	const p = $derived(seconds ? Math.min(1, time / seconds) : 0);
	const playing = $derived(on && narrator.playing);
	const now = $derived(on && time > 0 ? narrator.speaker(id, time) : null);
	const turns = $derived(narrator.turns[id] ?? []);
	/** The moments the conversation shows something in the scene: marked on the score, and a click near one goes there. */
	const marks = $derived(narrator.spots[id] ?? []);
	/** Where a press on the score began, to tell a click from a drag. */
	let pressedAt = 0;
	const lanes = [
		['NORA', 'Nora'],
		['THEO', 'Theo']
	] as const;

	/** Points the notch at the key, wherever the header has put the plate. */
	const aim: Attachment<HTMLElement> = (box) => {
		if (!open || !anchor) return;
		const key = anchor;
		const place = () => {
			const k = key.getBoundingClientRect();
			const b = box.getBoundingClientRect();
			// A zoomed header measures in zoomed pixels; the notch is placed in the plate's own.
			const scale = b.width / box.offsetWidth || 1;
			box.style.setProperty('--notch', `${(k.left + k.width / 2 - b.left) / scale}px`);
		};
		place();
		addEventListener('resize', place);
		return () => removeEventListener('resize', place);
	};

	const span = (t: { start: number; end: number }) => `left: ${(t.start / seconds) * 100}%; width: max(2px, ${((t.end - t.start) / seconds) * 100}%)`;

	/**
	 * A click (not a drag) near a mark goes to just before it, so the thing is heard named as the camera goes to it.
	 * Anywhere else, the slider has already gone where it was clicked.
	 */
	function snap(event: PointerEvent) {
		if (Math.abs(event.clientX - pressedAt) > 4 || !seconds || !marks.length) return;
		const strip = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const near = marks.find(([at]) => Math.abs(strip.left + (at / seconds) * strip.width - event.clientX) <= 7);
		if (near) narrator.seek(id, Math.max(0, near[0] - 1.5));
	}

	/** The arrow keys move the playhead by five seconds, Page Up and Down by thirty. */
	function scrub(event: KeyboardEvent) {
		const by: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 };
		if (!(event.key in by)) return;
		event.preventDefault();
		narrator.skip(by[event.key], id);
	}

	/** The speeds are a set of radios: the arrow keys move the choice. */
	function roam(event: KeyboardEvent) {
		const by: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
		if (!(event.key in by)) return;
		event.preventDefault();
		const at = (RATES.indexOf(narrator.rate) + by[event.key] + RATES.length) % RATES.length;
		narrator.setRate(RATES[at]);
		(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')[at]?.focus();
	}
</script>

{#if talk}
	<div class={['player', { open }]} inert={!open}>
		<div class="plate" {@attach aim} role="group" aria-label="Player for this card’s conversation">
			<div class="top">
				<p class="title">{talk.title}</p>
				<button
					type="button"
					class={['cc', { on: narrator.subtitles }]}
					aria-pressed={narrator.subtitles}
					aria-label="Subtitles"
					title={narrator.subtitles ? 'Subtitles are on' : 'Subtitles'}
					onclick={() => narrator.setSubtitles(!narrator.subtitles)}
				>
					<Icon icon={ClosedCaptionIcon} size={19} stroke={1.7} />
				</button>
			</div>
			<div class="score" style:--p={p}>
				{#each lanes as [who, name] (who)}
					<span class={['who', who.toLowerCase(), { now: now === who, talking: now === who && playing }]}>{name}</span>
				{/each}
				<div class="strip">
					{#each [false, true] as played (played)}
						<div class={['lanes', { played }]} aria-hidden="true">
							{#each lanes as [who] (who)}
								<div class={['lane', who.toLowerCase()]}>
									{#each turns.filter((t) => t.who === who) as t (t.start)}
										<i style={span(t)}></i>
									{/each}
								</div>
							{/each}
						</div>
					{/each}
					{#each marks as [at, key] (at)}
						<i class={['mark', { past: at <= time }]} style:left="{(at / seconds) * 100}%" aria-hidden="true" data-spot={key}></i>
					{/each}
					<span class="head" aria-hidden="true"></span>
					<input
						type="range"
						min="0"
						max={seconds}
						step="0.5"
						value={time}
						aria-label="Where in the conversation"
						aria-valuetext="{clock(time)} of {clock(seconds)}"
						oninput={(e) => narrator.seek(id, Number(e.currentTarget.value))}
						onpointerdown={(e) => (pressedAt = e.clientX)}
						onpointerup={snap}
						onkeydown={scrub}
					/>
				</div>
				<span class="at">{clock(time)}</span>
				<span class="left">{on && time > 0.5 ? `−${clock(seconds - time)}` : clock(seconds)}</span>
			</div>
			<div class="keys">
				<button type="button" class="jump" aria-label="Back 15 seconds" onclick={() => narrator.skip(-15, id)}>
					<Icon icon={GoBackward15SecIcon} size={19} stroke={1.7} />
				</button>
				<button type="button" class={['play', { waiting: on && narrator.waiting }]} aria-label={playing ? 'Pause' : 'Play'} onclick={() => narrator.toggle(id)}>
					<!-- Solid, as a player's own play and pause always are: outlined, two bars read as a zero zero. -->
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						{#if playing}
							<rect x="6" y="5" width="4.4" height="14" rx="1.5" />
							<rect x="13.6" y="5" width="4.4" height="14" rx="1.5" />
						{:else}
							<path d="M8 6.1v11.8a1.3 1.3 0 0 0 2 1.1l9.3-5.9a1.3 1.3 0 0 0 0-2.2L10 5a1.3 1.3 0 0 0-2 1.1z" />
						{/if}
					</svg>
				</button>
				<button type="button" class="jump" aria-label="Ahead 15 seconds" onclick={() => narrator.skip(15, id)}>
					<Icon icon={GoForward15SecIcon} size={19} stroke={1.7} />
				</button>
				<div class="speeds" role="radiogroup" aria-label="Speed" tabindex="-1" style:--at={RATES.indexOf(narrator.rate)} onkeydown={roam}>
					{#each RATES as rate (rate)}
						<button
							type="button"
							role="radio"
							aria-checked={narrator.rate === rate}
							tabindex={narrator.rate === rate ? 0 : -1}
							onclick={() => narrator.setRate(rate)}>{rate}×</button
						>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/*
	 * It hangs from the header, under the panel, right edges together. The clear strip above the plate is a bridge, so
	 * a pointer on its way down from the key never falls through a gap and closes it.
	 */
	.player {
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
	.player.open {
		opacity: 1;
		visibility: visible;
		transform: none;
		transition:
			opacity 0.18s,
			transform 0.32s cubic-bezier(0.2, 1.35, 0.4, 1),
			visibility 0s;
	}
	/* The same cream, edge and shadow as the panel it comes from, with a notch pointing back at the key. */
	.plate {
		position: relative;
		width: 300px;
		box-sizing: border-box;
		padding: 13px 14px 12px;
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
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 11px;
	}
	.title {
		flex: 1;
		margin: 2px 0 0;
		font: 700 14.5px/1.25 var(--display);
		letter-spacing: -0.01em;
	}
	/* Subtitles: a small key in the corner of the plate. On, it stands up in cream with an amber line under the letters. */
	.cc {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 26px;
		margin: -3px -4px 0 0;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #7d879a;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 0.2s,
			color 0.15s,
			box-shadow 0.2s,
			transform 0.1s;
	}
	.cc::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 14px;
		height: 2.5px;
		margin-left: -7px;
		border-radius: 2px;
		background: #ffb921;
		transform: scaleX(0);
		transition: transform 0.25s cubic-bezier(0.3, 1.5, 0.4, 1);
	}
	.cc.on {
		background: linear-gradient(#fffefa, #fff4dc);
		color: #101a30;
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.18);
	}
	.cc.on::after {
		transform: none;
	}
	@media (hover: hover) {
		.cc:hover {
			color: #101a30;
		}
		.cc:not(.on):hover {
			background: rgb(217 191 149 / 0.3);
		}
	}
	.cc:active {
		transform: translateY(1px);
	}
	.cc:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 1px;
	}

	/*
	 * The conversation as a score: Nora's turns on the top lane, Theo's below, so the back and forth can be seen. What
	 * has been heard takes their colours, amber for her and slate for him; the rest waits pale.
	 */
	.score {
		--nora: #ffb921;
		--nora-pale: #f5dda3;
		--theo: #3d5f91;
		--theo-pale: #d3dbe8;
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-rows: 13px 13px auto;
		column-gap: 9px;
		row-gap: 2px;
		align-items: center;
	}
	.who {
		grid-column: 1;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 650 11.5px/1 var(--sans);
		color: #7d879a;
		transition: color 0.2s;
	}
	.who::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
		transition: transform 0.2s;
	}
	.who.nora {
		--c: var(--nora);
	}
	.who.theo {
		--c: var(--theo);
	}
	.who.now {
		color: #101a30;
	}
	.who.talking::before {
		animation: talk 0.5s ease-in-out infinite alternate;
	}
	@keyframes talk {
		to {
			transform: scale(1.5);
		}
	}
	.strip {
		position: relative;
		grid-column: 2 / 4;
		grid-row: 1 / 3;
		align-self: stretch;
		border-radius: 6px;
	}
	.lanes {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-rows: 1fr 1fr;
		row-gap: 2px;
	}
	.lanes.played {
		clip-path: inset(-2px calc(100% - var(--p) * 100%) -2px 0);
	}
	.lane {
		position: relative;
		margin: 3px 0;
		border-radius: 4px;
		background: rgb(217 191 149 / 0.22);
	}
	.lanes.played .lane {
		background: none;
	}
	.lane i {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 4px;
		background: var(--nora-pale);
	}
	.lane.theo i {
		background: var(--theo-pale);
	}
	.lanes.played .lane i {
		background: var(--nora);
	}
	.lanes.played .lane.theo i {
		background: var(--theo);
	}
	/* Where the conversation shows something: a faint steady line across both lanes, a little warmer once it's been. */
	.mark {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 1.5px;
		margin-left: -0.75px;
		border-radius: 1px;
		background: rgb(16 26 48 / 0.2);
		pointer-events: none;
	}
	.mark.past {
		background: rgb(176 104 0 / 0.38);
	}
	.head {
		position: absolute;
		top: -3px;
		bottom: -3px;
		left: calc(var(--p) * 100%);
		width: 3px;
		margin-left: -1.5px;
		border-radius: 2px;
		background: #101a30;
		box-shadow: 0 0 0 1.5px #fffaf0;
		pointer-events: none;
	}
	/* The real control lies over the score, unseen: pointer, finger and keys all scrub with it. */
	.strip input {
		position: absolute;
		inset: -6px 0;
		width: 100%;
		height: calc(100% + 12px);
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.strip:has(input:focus-visible) {
		outline: 2px solid #1f5fe0;
		outline-offset: 4px;
	}
	.at,
	.left {
		grid-row: 3;
		margin-top: 6px;
		font: 600 11px/1 var(--sans);
		font-variant-numeric: tabular-nums;
		color: #7d879a;
	}
	.at {
		grid-column: 2;
	}
	.left {
		grid-column: 3;
		justify-self: end;
	}

	.keys {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-top: 10px;
	}
	.keys button {
		display: grid;
		place-items: center;
		border: 0;
		padding: 0;
		background: transparent;
		color: #33415c;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 0.2s,
			color 0.15s,
			transform 0.1s;
	}
	.keys button:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 1px;
	}
	.keys button:active {
		transform: translateY(1px);
	}
	.jump {
		width: 34px;
		height: 32px;
		border-radius: 10px;
	}
	@media (hover: hover) {
		.jump:hover {
			background: rgb(217 191 149 / 0.3);
			color: #101a30;
		}
	}
	/* Play is the amber key, the same as Next: the one that's yours to press. */
	.keys .play {
		width: 42px;
		height: 34px;
		border-radius: 11px;
		background: linear-gradient(#ffd45f, #ffb921);
		color: #101a30;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -3px 0 rgb(176 104 0 / 0.42);
	}
	@media (hover: hover) {
		.keys .play:hover {
			background: linear-gradient(#ffdb78, #ffc23d);
		}
	}
	.keys .play:active {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.55),
			inset 0 -1px 0 rgb(176 104 0 / 0.42);
	}
	.play svg {
		display: block;
		fill: currentColor;
	}
	.play.waiting svg {
		animation: breathe 0.9s ease-in-out infinite alternate;
	}
	@keyframes breathe {
		to {
			opacity: 0.4;
		}
	}

	/* How fast: a little tray of four, with one cream key that slides to the speed chosen. */
	.speeds {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		margin-left: auto;
		padding: 3px;
		border-radius: 11px;
		background: rgb(217 191 149 / 0.26);
		box-shadow: inset 0 1px 2px rgb(120 90 30 / 0.16);
	}
	.speeds::before {
		content: '';
		position: absolute;
		z-index: -1;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc((100% - 6px) / 4);
		border-radius: 8px;
		background: linear-gradient(#fffefa, #fff4dc);
		box-shadow:
			inset 0 -2px 0 #e2cb9f,
			0 1px 3px rgb(60 40 10 / 0.18);
		transform: translateX(calc(var(--at) * 100%));
		transition: transform 0.3s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.keys .speeds button {
		width: 38px;
		height: 26px;
		border-radius: 8px;
		font: 650 12px/1 var(--sans);
		font-variant-numeric: tabular-nums;
		color: #6b7488;
	}
	.keys .speeds button[aria-checked='true'] {
		color: #101a30;
	}
	@media (hover: hover) {
		.keys .speeds button:hover {
			color: #101a30;
		}
	}

	/* On a phone the header is its anchor: the plate spans the screen under it, and keeps to a sensible width on a tablet. */
	@media (max-aspect-ratio: 9/10) {
		.player {
			left: 10px;
			right: 10px;
			padding-top: 6px;
			transform-origin: 50% 0;
		}
		.plate {
			width: auto;
			max-width: 400px;
			margin-left: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.player,
		.player.open {
			transform: none;
			transition:
				opacity 0.15s,
				visibility 0s 0.15s;
		}
		.player.open {
			transition: opacity 0.15s;
		}
		.who.talking::before,
		.play.waiting svg {
			animation: none;
		}
		.speeds::before,
		.cc::after {
			transition: none;
		}
	}
	@media (forced-colors: active) {
		.lanes.played .lane i,
		.head {
			background: Highlight;
		}
		.lane i {
			background: GrayText;
		}
		.speeds button[aria-checked='true'],
		.cc.on {
			outline: 2px solid ButtonText;
		}
	}
</style>
