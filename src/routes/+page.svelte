<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ImageboardShell from '$lib/components/imageboard/ImageboardShell.svelte';

	let { data } = $props();
	const pageHref = $derived(page.url.origin + resolve('/'));

	function excerpt(value: string) {
		return value.replace(/\s+/g, ' ').trim();
	}
</script>

<svelte:head>
	<title>whisperwall</title>
	<meta
		name="description"
		content="whisperwall is a compact anonymous imageboard with board catalogs, threads, rules, archives, and live activity."
	/>
	<meta property="og:title" content="whisperwall" />
	<meta
		property="og:description"
		content="A compact anonymous imageboard with board catalogs, threads, rules, archives, and live activity."
	/>
	<link rel="canonical" href={pageHref} />
	<meta property="og:url" content={pageHref} />
</svelte:head>

<ImageboardShell
	boards={data.boards}
	activities={data.activities}
	favoriteCodes={data.favoriteCodes}
>
	<section class="landing">
		<div class="landing-title">
			<span class="brand-mark large"><img src="/whisperwall.png" alt="" /></span>
			<h1>project “whisperwall„</h1>
			<p>whispers in the dark</p>
		</div>

		<section class="landing-stats" aria-label="Stats">
			<h2>Stats</h2>
			<hr />
			<div class="landing-stats-grid">
				<div class="landing-stat">
					<strong>{data.boards.length}</strong>
					<span>Boards</span>
				</div>
				<div class="landing-stat">
					<strong>{data.threadCount}</strong>
					<span>Threads</span>
				</div>
				<div class="landing-stat">
					<strong>{data.threadCount + data.postCount}</strong>
					<span>Posts</span>
				</div>
				<div class="landing-stat">
					<strong>{data.uniquePosterCount}</strong>
					<span>Unique Posters</span>
				</div>
			</div>
		</section>

		<section class="landing-board-list" aria-label="Boards">
			<h2>Boards</h2>
			<hr />
			<div>
				{#each data.boards as board (board.code)}
					<a href={resolve('/boards/[board]', { board: board.code })}>
						<span style:color={board.color}>/{board.code}/</span>
						<strong>{board.name}</strong>
						<small>{board.description}</small>
					</a>
				{/each}
			</div>
		</section>

		<div class="landing-recent-split">
			<section class="landing-recent landing-images" aria-label="Recent images">
				<h2>Recent images</h2>
				<div>
					{#each data.recentImages as post (`${post.threadId}-${post.id}`)}
						<a
							href={`${resolve('/boards/[board]/[threadId]', {
								board: post.boardCode,
								threadId: String(post.threadId)
							})}#p${post.id}`}
						>
							<img
								class:spoilered={post.spoiler}
								src={post.imageUrl ?? ''}
								alt={post.imageName ?? post.subject}
							/>
							<span>/{post.boardCode}/ No.{post.id}</span>
						</a>
					{/each}
				</div>
			</section>

			<section class="landing-recent" aria-label="Recent threads">
				<h2>Recent threads</h2>
				{#each data.recentThreads as thread (thread.id)}
					<a
						href={resolve('/boards/[board]/[threadId]', {
							board: thread.boardCode,
							threadId: String(thread.id)
						})}
					>
						<span>/{thread.boardCode}/</span>
						<strong>{thread.subject}</strong>
						<small>No.{thread.id}</small>
						<p>{excerpt(thread.latestText)}</p>
					</a>
				{/each}
			</section>
		</div>
	</section>
</ImageboardShell>
