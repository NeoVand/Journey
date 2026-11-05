<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { STOPS } from './content';

	let {
		open = $bindable(false),
		here,
		onjump
	}: {
		open?: boolean;
		/** The chapter the reader is in, by title. */
		here: string;
		onjump: (title: string) => void;
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
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
			</button>
		</div>
		<p class="intro">One sentence goes out, and comes back as a fix. Jump to any stop along the way.</p>
		<ol class="route">
			{#each STOPS as stop, n (stop.name)}
				<li class={{ past: n < hereStop, at: n === hereStop }}>
					<span class="node" aria-hidden="true">{n === hereStop ? 'T' : n + 1}</span>
					<button type="button" class="stop" onclick={() => onjump(stop.parts[0])}>
						<b>{stop.name}</b>
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
	.intro {
		margin: 8px 0 22px;
		font-size: 16px;
		line-height: 1.42;
		color: var(--soft);
		text-wrap: pretty;
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
	.map :focus-visible {
		outline: 3px solid #1f5fe0;
		outline-offset: 2px;
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
