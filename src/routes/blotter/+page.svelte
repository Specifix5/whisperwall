<script lang="ts">
	import ImageboardShell from '$lib/components/imageboard/ImageboardShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Blotter - Whisperwall</title>
</svelte:head>

<ImageboardShell
	boards={data.boards}
	activities={data.activities}
	favoriteCodes={data.favoriteCodes}
>
	<section class="info-page">
		<div class="markdown-content">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html data.blotterHtml}
		</div>
	</section>
</ImageboardShell>
