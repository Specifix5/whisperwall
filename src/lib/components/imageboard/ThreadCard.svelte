<script lang="ts">
	import { resolve } from '$app/paths';

	type ThreadRow = {
		thread: {
			id: number;
			boardCode: string;
			subject: string;
			author: string;
			authorTripcode: string | null;
			capcode: string | null;
			body: string;
			imageUrl: string | null;
			imageName: string | null;
			imageOriginalName: string | null;
			imageSize: string;
			imageDimensions: string;
			views: number;
			pinned: boolean;
			archived: boolean;
			spoiler: boolean;
			createdAt: Date | string;
		};
		replyCount: number;
		imageCount: number;
	};

	let {
		row,
		expanded = false,
		variant = 'list',
		selected = false,
		onSelectedChange = () => {}
	}: {
		row: ThreadRow;
		expanded?: boolean;
		variant?: 'list' | 'grid';
		selected?: boolean;
		onSelectedChange?: (id: number, selected: boolean) => void;
	} = $props();
	let unspoiled = $state(false);
	const thread = $derived(row.thread);
	const isSpoilerHidden = $derived(thread.spoiler && !unspoiled);
	const hasVideoAttachment = $derived(
		Boolean(
			thread.imageUrl?.toLowerCase().endsWith('.webm') ||
			thread.imageName?.toLowerCase().endsWith('.webm')
		)
	);
	function attachmentType(post: { imageUrl: string | null; imageName: string | null }) {
		const source = post.imageName || post.imageUrl || '';
		return source.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase() || 'webp';
	}

	const fileMeta = $derived(
		`(${thread.imageSize}, ${thread.imageDimensions}, ${attachmentType(thread)})`
	);
	const threadHref = $derived(
		resolve('/boards/[board]/[threadId]', {
			board: thread.boardCode,
			threadId: String(thread.id)
		})
	);
</script>

{#if variant === 'grid'}
	<article class="catalog-card" class:no-thumb={!thread.imageUrl} class:selected={expanded}>
		<label class="catalog-select">
			<input
				type="checkbox"
				aria-label={`Select thread ${thread.id}`}
				checked={selected}
				onchange={(event) => onSelectedChange(thread.id, event.currentTarget.checked)}
			/>
			<span>No.{thread.id}</span>
		</label>
		{#if thread.imageUrl}
			<a class="catalog-thumb" href={threadHref} class:spoilered={isSpoilerHidden}>
				{#if hasVideoAttachment}
					<video src={thread.imageUrl} muted playsinline></video>
				{:else}
					<img src={thread.imageUrl} alt={thread.imageName ?? thread.subject} />
				{/if}
			</a>
		{/if}
		<div class:spoiler-text={isSpoilerHidden}>
			<strong>{thread.subject}</strong>
			<p>{thread.body}</p>
		</div>
		{#if isSpoilerHidden}
			<button class="spoiler-toggle bracket-link" type="button" onclick={() => (unspoiled = true)}>
				[ Unspoiler ]
			</button>
		{/if}
		<span>
			{row.replyCount} replies, {row.imageCount} images, {thread.views} views.
		</span>
	</article>
{:else}
	<article class="thread" class:selected={expanded}>
		<div class="post-head">
			<input
				type="checkbox"
				aria-label={`Select thread ${thread.id}`}
				checked={selected}
				onchange={(event) => onSelectedChange(thread.id, event.currentTarget.checked)}
			/>
			<strong>{thread.author}</strong>
			{#if thread.authorTripcode}<span class="tripcode">{thread.authorTripcode}</span>{/if}
			{#if thread.capcode}<span class="capcode">{thread.capcode}</span>{/if}
			<span class="op-badge">OP</span>
			<span>{new Date(thread.createdAt).toLocaleString()}</span>
			<a href={threadHref}>No.{thread.id}</a>
			{#if thread.pinned}<span class="status-pill">Pinned</span>{/if}
			{#if thread.archived}<span class="status-pill">Archived</span>{/if}
			{#if thread.spoiler}<span class="status-pill">Spoiler</span>{/if}
		</div>

		<div class="op-post">
			{#if thread.imageUrl}
				<figure class:spoilered={isSpoilerHidden}>
					{#if hasVideoAttachment}
						<video src={thread.imageUrl} controls muted playsinline></video>
					{:else}
						<a href={thread.imageUrl} target="_blank" rel="noreferrer">
							<img src={thread.imageUrl} alt={thread.imageName ?? thread.subject} />
						</a>
					{/if}
					<figcaption>
						<a href={thread.imageUrl} target="_blank" rel="noreferrer">{fileMeta}</a>
					</figcaption>
				</figure>
			{/if}
			<div class:spoiler-text={isSpoilerHidden}>
				<h2>{thread.subject}</h2>
				<p>{thread.body}</p>
				{#if isSpoilerHidden}
					<button
						class="spoiler-toggle bracket-link"
						type="button"
						onclick={() => (unspoiled = true)}
					>
						[ Unspoiler ]
					</button>
				{/if}
				<p class="omitted">
					{row.replyCount} replies, {row.imageCount} images, {thread.views} views.
					<a href={threadHref}>Open thread.</a>
				</p>
			</div>
		</div>
	</article>
{/if}
