<script lang="ts">
	/**
	 * The little mixer that drops from the header's sound key, like the conversation's player drops from the talk key:
	 * sound on or off, and two faders, the ambience under everything and the sounds things make. The page opens it on
	 * hover, on keyboard focus, and on a tap of the key.
	 */
	import { Music01Icon, SparklesIcon } from '@hugeicons/core-free-icons';
	import type { Attachment } from 'svelte/attachments';
	import Icon from './Icon.svelte';
	import type { Mix } from './sound/engine';

	let {
		open,
		on,
		levels,
		anchor,
		onmix,
		ontoggle
	}: {
		open: boolean;
		/** Whether sound is on at all. */
		on: boolean;
		levels: Mix;
		/** The sound key, which the plate's notch points at. */
		anchor?: HTMLElement;
		onmix: (levels: Mix) => void;
		ontoggle: () => void;
	} = $props();

	const faders = [
		{ key: 'ambience', name: 'Ambience', icon: Music01Icon, hint: 'The music of each place, under everything' },
		{ key: 'effects', name: 'Effects', icon: SparklesIcon, hint: 'The sounds things make as they happen' }
	] as const;

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
</script>

<div class={['mixer', { open }]} inert={!open}>
	<div class="plate" {@attach aim} role="group" aria-label="Sound levels">
		<div class="top">
			<p class="title">Sound</p>
			<button type="button" class={['switch', { on }]} role="switch" aria-checked={on} aria-label="Sound" onclick={ontoggle}>
				<span class="track"><span class="knob"></span></span>
				{on ? 'On' : 'Off'}
			</button>
		</div>
		{#each faders as f (f.key)}
			<label class={['fader', { quiet: !on }]} title={f.hint}>
				<span class="name"><Icon icon={f.icon} size={16} stroke={1.8} />{f.name}</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={levels[f.key]}
					style:--v={levels[f.key]}
					aria-valuetext="{Math.round(levels[f.key] * 100)} percent"
					oninput={(e) => onmix({ ...levels, [f.key]: Number(e.currentTarget.value) })}
				/>
			</label>
		{/each}
	</div>
</div>

<style>
	/* It hangs from the header, under the panel, like the conversation's player: the clear strip above is a bridge. */
	.mixer {
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
	.mixer.open {
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
		width: 248px;
		box-sizing: border-box;
		padding: 12px 14px 8px;
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
		left: calc(var(--notch, 50%) - 7px);
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
		justify-content: space-between;
		margin: 0 0 6px;
	}
	.title {
		margin: 0;
		font: 700 14.5px/1.25 var(--display);
		letter-spacing: -0.01em;
	}
	/* On and off as a small switch: amber when the world is sounding. */
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin: -2px -4px 0 0;
		padding: 4px 6px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #5a6476;
		font: 600 12.5px/1 var(--sans);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.track {
		position: relative;
		width: 26px;
		height: 15px;
		border-radius: 8px;
		background: #d9cdb6;
		box-shadow: inset 0 1px 2px rgb(60 40 10 / 0.22);
		transition: background 0.2s;
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #fffdf8;
		box-shadow: 0 1px 2px rgb(60 40 10 / 0.3);
		transition: transform 0.22s cubic-bezier(0.3, 1.4, 0.5, 1);
	}
	.switch.on {
		color: #101a30;
	}
	.switch.on .track {
		background: #ffb921;
	}
	.switch.on .knob {
		transform: translateX(11px);
	}
	@media (hover: hover) {
		.switch:hover {
			background: rgb(217 191 149 / 0.3);
		}
	}
	.switch:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 1px;
	}
	.fader {
		display: grid;
		grid-template-columns: 92px 1fr;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		transition: opacity 0.2s;
	}
	.fader.quiet {
		opacity: 0.55;
	}
	.name {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 600 13px/1 var(--sans);
		color: #33415c;
	}
	/* A slim track that fills amber up to the knob, like the conversation's playhead. */
	input[type='range'] {
		width: 100%;
		height: 22px;
		margin: 0;
		background: transparent;
		appearance: none;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 5px;
		border-radius: 3px;
		background: linear-gradient(to right, #ffb921 calc(var(--v) * 100%), #e2d5bd calc(var(--v) * 100%));
		box-shadow: inset 0 1px 1px rgb(60 40 10 / 0.18);
	}
	input[type='range']::-moz-range-track {
		height: 5px;
		border-radius: 3px;
		background: linear-gradient(to right, #ffb921 calc(var(--v) * 100%), #e2d5bd calc(var(--v) * 100%));
	}
	input[type='range']::-webkit-slider-thumb {
		width: 15px;
		height: 15px;
		margin-top: -5px;
		border-radius: 50%;
		background: #fffdf8;
		box-shadow:
			0 0 0 1px rgb(60 40 10 / 0.12),
			0 1px 3px rgb(60 40 10 / 0.3);
		appearance: none;
	}
	input[type='range']::-moz-range-thumb {
		width: 15px;
		height: 15px;
		border: 0;
		border-radius: 50%;
		background: #fffdf8;
		box-shadow:
			0 0 0 1px rgb(60 40 10 / 0.12),
			0 1px 3px rgb(60 40 10 / 0.3);
	}
	input[type='range']:focus-visible {
		outline: 2px solid #1f5fe0;
		outline-offset: 2px;
		border-radius: 4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.mixer,
		.mixer.open,
		.knob {
			transition: none;
		}
	}
</style>
