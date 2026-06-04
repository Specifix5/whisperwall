<script lang="ts">
	type IconName =
		| 'tabler:chevron-down'
		| 'tabler:chevron-right'
		| 'tabler:chevron-left'
		| 'tabler:star'
		| 'tabler:star-filled'
		| 'tabler:menu-2';

	let { name, label = '' }: { name: IconName; label?: string } = $props();
</script>

<svg
	class="icon"
	viewBox="0 0 24 24"
	width="1em"
	height="1em"
	aria-hidden={label ? undefined : 'true'}
	aria-label={label || undefined}
	role={label ? 'img' : undefined}
>
	{#if name === 'tabler:chevron-down'}
		<path d="M6 9l6 6l6 -6" />
	{:else if name === 'tabler:chevron-right'}
		<path d="M9 6l6 6l-6 6" />
	{:else if name === 'tabler:chevron-left'}
		<path d="M15 6l-6 6l6 6" />
	{:else if name === 'tabler:star-filled'}
		<path
			class="filled"
			d="M12 17.75l-6.17 3.24l1.18 -6.87l-5 -4.87l6.9 -1l3.09 -6.25l3.09 6.25l6.9 1l-5 4.87l1.18 6.87z"
		/>
	{:else if name === 'tabler:star'}
		<path
			d="M12 17.75l-6.17 3.24l1.18 -6.87l-5 -4.87l6.9 -1l3.09 -6.25l3.09 6.25l6.9 1l-5 4.87l1.18 6.87z"
		/>
	{:else if name === 'tabler:menu-2'}
		<path d="M4 6h16" />
		<path d="M4 12h16" />
		<path d="M4 18h16" />
	{/if}
</svg>
