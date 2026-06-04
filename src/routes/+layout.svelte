<script lang="ts">
	import '$lib/styles/app.scss';

	let { children } = $props();
</script>

<svelte:head>
	<title>whisperwall</title>
	<meta
		name="description"
		content="whisperwall is a compact anonymous imageboard with board catalogs, threads, rules, and archive views."
	/>
	<meta name="theme-color" content="#7460a3" />
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" sizes="16x16" href="/favicon-16x16.png" />
	<link rel="icon" sizes="32x32" href="/favicon-32x32.png" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" />
	<meta property="og:site_name" content="whisperwall" />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

{@render children()}
