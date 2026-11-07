<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { STOPS, TRACKS, type TrackId } from './content';
	import Icon from './Icon.svelte';
	import { CLOSE, STOP_ICON, TRACK_ICON } from './icons';

	let {
		open = $bindable(false),
		here,
		onjump,
		ontrip,
		agents
	}: {
		open?: boolean;
		/** The chapter the reader is in, by title. */
		here: string;
		onjump: (title: string) => void;
		/** Starts a side trip. */
		ontrip: (id: TrackId) => void;
		/** The agent picker, which belongs to the page. */
		agents: Snippet;
	} = $props();

	const hereStop = $derived(STOPS.findIndex((s) => s.parts.includes(here)));

	const show: Attachment<HTMLDialogElement> = (el) => {
		if (open && !el.open) {
			el.showModal();
			el.querySelector('.at')?.scrollIntoView({ block: 'center' });
		} else if (!open && el.open) el.close();
	};
</script>

<!-- A click that lands on the dialog itself landed on the backdrop. Esc and the close button cover the keyboard. -->
<dialog
	class="map"
	aria-label="Map of the trip"
	{@attach show}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}
>
	<div class="sheet">
		<div class="head">
			<h2>The whole trip</h2>
			<button type="button" class="close" aria-label="Close the map" onclick={() => (open = false)}>
				<Icon icon={CLOSE} size={18} stroke={2} />
			</button>
		</div>
		<p class="intro">One sentence goes out, and comes back as a fix. Jump to any stop along the way, or follow a different agent.</p>
		<div class="agents">{@render agents()}</div>
		<ol class="route">
			{#each STOPS as stop, n (stop.name)}
				<li class={{ past: n < hereStop, at: n === hereStop }}>
					<span class="node" aria-hidden="true">{n === hereStop ? 'T' : n + 1}</span>
					<button type="button" class="stop" onclick={() => onjump(stop.parts[0])}>
						<b><Icon icon={STOP_ICON[n]} size={19} stroke={1.8} />{stop.name}</b>
						<span>{stop.what}</span>
					</button>
					<ul>
						{#each stop.parts as part (part)}
							<li>
								<button type="button" class={{ now: part === here }} aria-current={part === here ? 'location' : undefined} onclick={() => onjump(part)}>{part}</button>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
		<h3>Side trips</h3>
		<p class="intro">Short detours off the road. Each one brings you back to where you left.</p>
		<ul class="trips">
			{#each Object.entries(TRACKS) as [id, t] (id)}
				<li>
					<button type="button" class="stop" onclick={() => ontrip(id as TrackId)}>
						<b><Icon icon={TRACK_ICON[id as TrackId]} size={19} stroke={1.8} />{t.name}</b>
						<span>{t.what}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</dialog>

<style>
	.map {
		--paper: #fdf7e9;
		--line: #e8dcc2;
		--text: #101a30;
		--soft: #4d5a72;
		position: fixed;
		inset: 0 auto 0 0;
		width: min(452px, 100vw);
		max-width: none;
		height: 100dvh;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: var(--paper);
		color: var(--text);
		box-shadow: 12px 0 44px rgb(6 15 38 / 0.28);
		transform: translateX(-104%);
		transition:
			transform 0.34s cubic-bezier(0.2, 1, 0.3, 1),
			display 0.34s allow-discrete,
			overlay 0.34s allow-discrete;
	}
	.map[open] {
		transform: none;
	}
	@starting-style {
		.map[open] {
			transform: translateX(-104%);
		}
	}
	.map::backdrop {
		background: rgb(6 15 38 / 0);
		transition:
			background 0.3s,
			display 0.3s allow-discrete,
			overlay 0.3s allow-discrete;
	}
	.map[open]::backdrop {
		background: rgb(6 15 38 / 0.42);
	}
	@starting-style {
		.map[open]::backdrop {
			background: rgb(6 15 38 / 0);
		}
	}

	.sheet {
		height: 100%;
		box-sizing: border-box;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 26px 26px 40px;
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
		font-size: 34px;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.close {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: 0;
		color: var(--text);
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
	.intro {
		margin: 8px 0 14px;
		font-size: 16px;
		line-height: 1.42;
		color: var(--soft);
		text-wrap: pretty;
	}

	.agents {
		margin: 0 0 24px;
	}

	.route,
	.route ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* The line runs from each stop to the next, behind the nodes. Where the token has been, it's drawn in amber. */
	.route > li {
		position: relative;
		padding: 0 0 18px 48px;
	}
	.route > li::before {
		content: '';
		position: absolute;
		left: 14px;
		top: 16px;
		bottom: -16px;
		width: 4px;
		background: var(--line);
	}
	.route > li:last-child::before {
		display: none;
	}
	.route > li.past::before {
		background: #ffb921;
	}
	.node {
		position: absolute;
		z-index: 1;
		left: 0;
		top: 2px;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		box-sizing: border-box;
		border-radius: 50%;
		border: 3px solid var(--line);
		background: var(--paper);
		color: var(--soft);
		font:
			800 14px/1 var(--display);
	}
	.past .node {
		border-color: #ffb921;
		color: var(--text);
	}
	/* The token itself, in the same amber as everywhere else, and it has just landed. */
	.at .node {
		left: -3px;
		top: -1px;
		width: 38px;
		height: 38px;
		border: 0;
		border-radius: 11px;
		background: #ffb921;
		color: #101a30;
		font-size: 20px;
		box-shadow:
			inset 0 2px 0 rgb(255 255 255 / 0.55),
			inset 0 -4px 0 rgb(176 104 0 / 0.5),
			0 4px 10px rgb(150 90 0 / 0.3);
		animation: land 0.6s 0.14s cubic-bezier(0.2, 1.5, 0.4, 1) backwards;
	}
	@keyframes land {
		from {
			transform: translateY(-34px) scale(0.7, 1.15);
		}
	}

	h3 {
		margin: 26px 0 0;
		font-family: var(--display);
		font-weight: 800;
		font-size: 24px;
		letter-spacing: -0.02em;
	}
	.trips {
		list-style: none;
		margin: 0 0 24px;
		padding: 0;
	}
	.stop {
		display: grid;
		gap: 1px;
		width: 100%;
		margin: 0;
		padding: 5px 8px 6px;
		border: 0;
		border-radius: 10px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.14s;
	}
	.stop:hover {
		background: rgb(16 26 48 / 0.06);
	}
	.stop b {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 19px;
		line-height: 1.15;
		letter-spacing: -0.015em;
	}
	.stop span {
		font-size: 14px;
		line-height: 1.34;
		color: var(--soft);
	}
	.route ul {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 5px 0 0 8px;
	}
	.route ul button {
		padding: 5px 10px;
		border: 0;
		border-radius: 999px;
		background: rgb(16 26 48 / 0.06);
		color: var(--text);
		font: 500 13.5px/1.2 var(--sans);
		text-align: left;
		cursor: pointer;
		transition:
			background 0.14s,
			transform 0.12s;
	}
	.route ul button:hover {
		background: rgb(16 26 48 / 0.12);
		transform: translateY(-1px);
	}
	.route ul button.now {
		background: #101a30;
		color: #fff;
		font-weight: 600;
	}
	/* A dialog focuses its first button when it opens, which on a touch screen is only a ring nobody asked for. */
	@media (hover: none) {
		.map .close:focus-visible {
			outline: none;
		}
	}
	.map :focus-visible {
		outline: 3px solid #1f5fe0;
		outline-offset: 2px;
	}

	/* A big monitor at its own size: the sheet grows with the page's words, as the story's cards do. */
	@media (min-aspect-ratio: 9/10) and (min-width: 2000px) and (min-height: 1000px) {
		.map {
			--ui: 1.18;
			width: calc(452px * var(--ui));
		}
		.sheet > :global(*) {
			zoom: var(--ui);
		}
	}
	@media (min-aspect-ratio: 9/10) and (min-width: 2400px) and (min-height: 1000px) {
		.map {
			--ui: 1.32;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.map,
		.map::backdrop {
			transition: none;
		}
		.at .node {
			animation: none;
		}
	}
</style>
