<script lang="ts">
	import Journey from '#lib/journey/Journey.svelte';

	const home = 'https://neovand.github.io/Journey/';
	const summary =
		'Press Enter and follow one sentence through Claude Code, Codex or Copilot: across the wire, into the model and back, until the bug is fixed. A scroll-through 3D journey.';
</script>

<svelte:head>
	<title>The journey of a token: how a coding agent works</title>
	<meta name="description" content={summary} />
	<meta name="author" content="Neo Mohsenvand" />
	<meta name="theme-color" content="#9fd0f8" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="The journey of a token" />
	<meta property="og:title" content="The journey of a token: how a coding agent works" />
	<meta property="og:description" content={summary} />
	<meta property="og:url" content={home} />
	<meta property="og:image" content="{home}og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="A laptop, a cream harness machine and a blue MCP box on a floating porcelain island, with the words How a coding agent works."
	/>
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="canonical" href={home} />
</svelte:head>

<Journey />
