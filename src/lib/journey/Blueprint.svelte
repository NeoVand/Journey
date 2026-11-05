<script lang="ts" module>
	export type Stage = 'embed' | 'attn' | 'ffn' | 'stack' | 'head' | null;
</script>

<script lang="ts">
	let { stage = null, compact = false }: { stage?: Stage; compact?: boolean } = $props();

	const on = (...names: Stage[]) => stage === null || names.includes(stage);

	const crumbs: { id: Stage; label: string }[] = [
		{ id: 'embed', label: 'Embedding' },
		{ id: 'attn', label: 'Attention' },
		{ id: 'ffn', label: 'Feed-forward' },
		{ id: 'stack', label: '× 80' },
		{ id: 'head', label: 'LM head' }
	];
</script>

{#if compact}
	<ol class="crumbs" aria-label="Where this is in the transformer">
		{#each crumbs as c (c.id)}
			<li class={{ here: stage === c.id }} aria-current={stage === c.id ? 'step' : undefined}>{c.label}</li>
		{/each}
	</ol>
{:else}
	<!--
		Read from the bottom up, the way the tokens travel through the scene beside it. Everything is centred on the spine at x=200:
		every block is the same width, and the gutter that carries the skip lines is mirrored by the one that names the repeat.
		A skip line leaves the spine at a junction below its Normalize and rejoins at the sum, so it never crosses a block.
	-->
	<svg class="plan" viewBox="39 0 322 404" preserveAspectRatio="xMinYMid meet" role="img" aria-labelledby="plan-title plan-desc">
		<title id="plan-title">Block diagram of a transformer</title>
		<desc id="plan-desc">
			From the bottom: token IDs, embedding plus position, then a layer repeated eighty times. In each layer the signal splits, one branch goes through normalize and attention and is added back to the other, and the same again through normalize and feed-forward. Then a final normalize, the LM head, and one score for every word.
		</desc>

		<!-- the repeated layer -->
		<rect class="layer" x="40" y="92" width="320" height="244" rx="14" />
		<text class="repeat" transform="rotate(-90 62 214)" x="62" y="214"><tspan class="count">× 80</tspan><tspan dx="9">the same layer</tspan></text>

		<!-- the spine, in pieces, so it only ever runs between blocks -->
		<path class="wire" d="M200 28V18M196 22.5L200 18L204 22.5M200 62V56M200 102V82M200 130V122M200 178V172M200 218V198M200 246V238M200 294V288M200 346V314M200 384V374" />

		<!-- what skips around each step -->
		<path class="skip" d="M200 208H330Q338 208 338 200V120Q338 112 330 112H210" />
		<path class="skip" d="M200 324H330Q338 324 338 316V236Q338 228 330 228H210" />
		<circle class="junction" cx="200" cy="208" r="3.4" />
		<circle class="junction" cx="200" cy="324" r="3.4" />

		<text class={['foot', { dim: !on('stack', 'head') }]} x="200" y="11">One score per word</text>
		<g class={['dark', { dim: !on('head') }]}>
			<rect x="84" y="28" width="232" height="28" rx="9" /><text x="200" y="47">LM head</text>
		</g>
		<g class={['plain', { dim: !on('head') }]}>
			<rect x="84" y="62" width="232" height="20" rx="7" /><text class="small" x="200" y="76.5">Normalize</text>
		</g>

		<g class={['sum', { dim: !on('ffn') }]}>
			<circle cx="200" cy="112" r="10" /><path d="M195 112H205M200 107V117" />
		</g>
		<g class={['blue', { dim: !on('ffn') }]}>
			<rect x="84" y="130" width="232" height="42" rx="10" />
			<text class="name" x="200" y="148">Feed-forward</text>
			<text class="note" x="200" y="163.5">each token, by itself</text>
		</g>
		<g class={['plain', { dim: !on('ffn') }]}>
			<rect x="84" y="178" width="232" height="20" rx="7" /><text class="small" x="200" y="192.5">Normalize</text>
		</g>

		<g class={['sum', { dim: !on('attn') }]}>
			<circle cx="200" cy="228" r="10" /><path d="M195 228H205M200 223V233" />
		</g>
		<g class={['amber', { dim: !on('attn') }]}>
			<rect x="84" y="246" width="232" height="42" rx="10" />
			<text class="name" x="200" y="264">Attention</text>
			<text class="note" x="200" y="279.5">looks back at earlier tokens</text>
		</g>
		<g class={['plain', { dim: !on('attn') }]}>
			<rect x="84" y="294" width="232" height="20" rx="7" /><text class="small" x="200" y="308.5">Normalize</text>
		</g>

		<g class={['cream', { dim: !on('embed') }]}>
			<rect x="84" y="346" width="232" height="28" rx="9" /><text x="200" y="365">Embedding + position</text>
		</g>
		<text class={['foot', { dim: !on('embed') }]} x="200" y="398">Token IDs</text>
	</svg>
{/if}

<style>
	.plan {
		display: block;
		width: 100%;
		max-height: 46vh;
		margin-top: 8px;
		font-family: var(--sans);
	}
	.plan text {
		text-anchor: middle;
		font-size: 14.5px;
		font-weight: 650;
		fill: #f3f7ff;
	}
	.plan .small {
		font-size: 12px;
		font-weight: 550;
		fill: #c2cfe6;
	}
	.plan .foot {
		font-size: 13px;
		font-weight: 550;
		fill: #c2cfe6;
	}
	.plan .name {
		font-size: 15.5px;
		font-weight: 750;
	}
	.plan .note {
		font-size: 11.5px;
		font-weight: 500;
		fill: #dbe7ff;
	}
	.plan .repeat {
		font-size: 12px;
		font-weight: 500;
		fill: #c2cfe6;
		dominant-baseline: central;
	}
	.plan .count {
		font-family: var(--display);
		font-size: 18px;
		font-weight: 800;
		fill: #f3f7ff;
	}
	.layer {
		fill: rgb(255 255 255 / 0.035);
		stroke: rgb(243 247 255 / 0.2);
	}
	.wire {
		fill: none;
		stroke: rgb(243 247 255 / 0.5);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.skip {
		fill: none;
		stroke: #41e58a;
		stroke-width: 1.6;
		opacity: 0.85;
	}
	.junction {
		fill: #41e58a;
	}
	.plan g,
	.plan .foot {
		transition: opacity 0.3s;
	}
	.plan .dim {
		opacity: 0.32;
	}
	.plain rect {
		fill: rgb(255 255 255 / 0.07);
		stroke: rgb(243 247 255 / 0.18);
	}
	.dark rect {
		fill: #16264f;
		stroke: rgb(110 162 255 / 0.7);
	}
	.cream rect {
		fill: #f6dfb6;
	}
	.cream text {
		fill: #111a2e;
	}
	.amber rect {
		fill: #ffc247;
	}
	.amber .name {
		fill: #111a2e;
	}
	.amber .note {
		fill: #4a3a12;
	}
	.blue rect {
		fill: #2f6fe8;
	}
	.sum circle {
		fill: #0a1a3c;
		stroke: #41e58a;
		stroke-width: 1.6;
	}
	.sum path {
		fill: none;
		stroke: #41e58a;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	/* A phone shows this small: the names carry it, so they take the whole block. */
	@media (max-aspect-ratio: 9/10) {
		.plan {
			max-height: 31vh;
		}
		.plan .note {
			display: none;
		}
		.plan .name {
			transform: translateY(5.5px);
		}
	}

	.crumbs {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 6px;
		margin: 14px 0 0;
		padding: 0;
		font-size: 12.5px;
		line-height: 1;
	}
	.crumbs li {
		padding: 6px 9px;
		border-radius: 8px;
		color: var(--ink-soft);
		background: rgb(255 255 255 / 0.06);
		transition:
			background 0.25s,
			color 0.25s;
	}
	.crumbs li.here {
		background: #ffc247;
		color: #111a2e;
		font-weight: 650;
	}
</style>
