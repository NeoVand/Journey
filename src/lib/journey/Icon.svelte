<script lang="ts">
	/**
	 * A Hugeicons icon, drawn when the page is built, so it is there before any script runs. Pass the icon's data from
	 * `@hugeicons/core-free-icons/<Name>Icon`. Decorative unless it gets a label.
	 */
	type Shape = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

	let { icon, size = 20, stroke = 1.8, label }: { icon: Shape; size?: number; stroke?: number; label?: string } = $props();

	// The data is written for React: camelCase attributes and a key on every part.
	const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
	const attributes = (a: Readonly<Record<string, string | number>>) =>
		Object.fromEntries(
			Object.entries(a)
				.filter(([name]) => name !== 'key')
				.map(([name, value]) => [kebab(name), name === 'strokeWidth' ? stroke : value])
		);
</script>

<svg class="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
	{#each icon as [tag, a] (a.key ?? tag)}
		<svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attributes(a)} />
	{/each}
</svg>

<style>
	.icon {
		display: block;
		flex: none;
	}
</style>
