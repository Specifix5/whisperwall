<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BoardFooter from '$lib/components/imageboard/BoardFooter.svelte';
	import ImageboardShell from '$lib/components/imageboard/ImageboardShell.svelte';
	import ThreadCard from '$lib/components/imageboard/ThreadCard.svelte';

	let { data, form } = $props();
	let selectedThreadIds = $state<number[]>([]);
	const boardHref = $derived(resolve('/boards/[board]', { board: data.board.code }));
	const archiveHref = $derived(resolve('/boards/[board]?view=archive', { board: data.board.code }));
	const rulesHref = $derived(resolve('/boards/[board]?view=rules', { board: data.board.code }));
	const pageTitle = $derived(`/${data.board.code}/ - ${data.board.name}`);
	const pageDescription = $derived(
		data.board.description || `Threads and archive for /${data.board.code}/.`
	);
	const pageHref = $derived(
		page.url.origin + resolve('/boards/[board]', { board: data.board.code })
	);
	const bannerMetaUrl = $derived(
		data.board.bannerUrl ? new URL(data.board.bannerUrl, page.url.origin).toString() : ''
	);
	const canSwitchLayout = $derived(data.view !== 'rules');

	function toggleThreadSelection(id: number, selected: boolean) {
		selectedThreadIds = selected
			? [...new Set([...selectedThreadIds, id])]
			: selectedThreadIds.filter((threadId) => threadId !== id);
	}

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function changeLayout(layout: string) {
		const url = new URL(page.url);
		url.searchParams.set('layout', layout);
		if (data.view === 'archive') url.searchParams.set('view', 'archive');
		if (data.view !== 'archive') url.searchParams.delete('view');
		void goto(`${url.pathname}${url.search}`);
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={pageHref} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={pageHref} />
	<meta property="og:type" content="website" />
	{#if bannerMetaUrl}
		<meta property="og:image" content={bannerMetaUrl} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={bannerMetaUrl} />
	{/if}
</svelte:head>

<ImageboardShell
	boards={data.boards}
	board={data.board}
	activities={data.activities}
	favoriteCodes={data.favoriteCodes}
	search={data.search}
	showSearch={data.view !== 'rules'}
	turnstile={data.turnstile}
	sidebarActive={selectedThreadIds.length > 0}
>
	{#snippet sidebar()}
		{#if selectedThreadIds.length}
			<section class="panel action-list">
				<h2>{selectedThreadIds.length} Selected</h2>
				<a
					href={resolve('/boards/[board]/[threadId]', {
						board: data.board.code,
						threadId: String(selectedThreadIds[0])
					})}>Open first selected thread</a
				>
				<form method="POST" action="?/moderateSelected">
					{#each selectedThreadIds as id (id)}
						<input type="hidden" name="threadId" value={id} />
					{/each}
					<input
						name="credential"
						type="password"
						autocomplete="current-password"
						placeholder="Password"
					/>
					<button type="submit" name="command" value="pin-selected">Pin selected</button>
					<button type="submit" name="command" value="archive-selected">Archive selected</button>
					<button type="submit" name="command" value="spoiler-selected">Spoiler selected</button>
					<button type="submit" name="command" value="unspoiler-selected">Unspoiler selected</button
					>
					<button type="submit" name="command" value="delete-selected">Delete selected</button>
				</form>
				<button type="button" onclick={() => (selectedThreadIds = [])}>Clear selection</button>
			</section>
		{/if}
	{/snippet}

	{#if data.board.bannerUrl}
		<a class="board-banner" href={boardHref} aria-label={`Open /${data.board.code}/ catalog`}>
			<img src={data.board.bannerUrl} alt={`/${data.board.code}/ banner`} />
		</a>
	{/if}

	<div class="thread-toolbar">
		<a class="back-button" href={boardHref}>Catalog</a>
		<div class="toolbar-controls">
			<a class:active={data.view !== 'archive' && data.view !== 'rules'} href={boardHref}>Threads</a
			>
			<a class:active={data.view === 'archive'} href={archiveHref}>Archive</a>
			<a class:active={data.view === 'rules'} href={rulesHref}>Rules</a>
			{#if canSwitchLayout}
				<label class="view-picker">
					<span>View</span>
					<select
						value={data.layout}
						aria-label="Catalog layout"
						onchange={(event) => changeLayout(event.currentTarget.value)}
					>
						<option value="list">List</option>
						<option value="grid">Grid</option>
					</select>
				</label>
			{/if}
		</div>
	</div>

	{#if form?.message}
		<div class="notice" role="status">{form.message}</div>
	{/if}

	{#if data.view === 'rules'}
		<section class="info-page">
			<div class="markdown-content">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.rulesHtml}
			</div>
		</section>
	{:else if data.rows.length}
		<section class={data.layout === 'grid' ? 'catalog-grid' : 'thread-stack'} aria-label="Threads">
			{#each data.rows as row (row.thread.id)}
				<ThreadCard
					{row}
					variant={data.layout === 'grid' ? 'grid' : 'list'}
					selected={selectedThreadIds.includes(row.thread.id)}
					onSelectedChange={toggleThreadSelection}
				/>
			{/each}
		</section>
	{:else}
		<section class="empty-state">
			<h2>No threads found</h2>
			<p>Start the first conversation on /{data.board.code}/.</p>
		</section>
	{/if}

	<BoardFooter onBackToTop={scrollToTop} />
</ImageboardShell>
