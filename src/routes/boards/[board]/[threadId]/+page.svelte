<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BoardFooter from '$lib/components/imageboard/BoardFooter.svelte';
	import ImageboardShell from '$lib/components/imageboard/ImageboardShell.svelte';

	let { data, form } = $props();
	let autoRefresh = $state(false);
	let refreshCountdown = $state(10);
	let followThread = $state(false);
	let selectedOriginalPost = $state(false);
	let selectedReplyIds = $state<number[]>([]);
	let lastScrollY = 0;
	let previewPostId = $state<number | null>(null);
	let previewX = $state(0);
	let previewY = $state(0);
	let unspoiledPostIds = $state<number[]>([]);
	const thread = $derived(data.thread);
	const selectedPostCount = $derived((selectedOriginalPost ? 1 : 0) + selectedReplyIds.length);
	const boardHref = $derived(resolve('/boards/[board]', { board: data.board.code }));
	const threadHref = $derived(
		resolve('/boards/[board]/[threadId]', {
			board: data.board.code,
			threadId: String(thread.id)
		})
	);
	const autorefreshHref = $derived(
		resolve('/boards/[board]/[threadId]?ww_autorefresh=1', {
			board: data.board.code,
			threadId: String(thread.id)
		})
	);
	const archiveHref = $derived(resolve('/boards/[board]?view=archive', { board: data.board.code }));
	const rulesHref = $derived(resolve('/boards/[board]?view=rules', { board: data.board.code }));
	const pageTitle = $derived(`/${data.board.code}/ - ${thread.subject}`);
	const pageDescription = $derived(
		thread.body.replace(/\s+/g, ' ').trim().slice(0, 155) || data.board.description
	);
	const pageHref = $derived(
		page.url.origin +
			resolve('/boards/[board]/[threadId]', {
				board: data.board.code,
				threadId: String(thread.id)
			})
	);
	const bannerMetaUrl = $derived(
		data.board.bannerUrl ? new URL(data.board.bannerUrl, page.url.origin).toString() : ''
	);

	type BodySegment =
		| { type: 'text'; value: string }
		| { type: 'quote'; value: string; postId: number }
		| { type: 'greentext'; value: string }
		| { type: 'link'; label: string; href: string; external: boolean };

	type PostPreview = {
		id: number;
		author: string;
		authorTripcode: string | null;
		capcode: string | null;
		body: string;
		createdAt: Date | string;
		isOp?: boolean;
		imageUrl?: string | null;
		imageName?: string | null;
	};

	const allPosts = $derived([
		{ ...thread, id: thread.id, isOp: true },
		...thread.replies.map((reply) => ({ ...reply, isOp: reply.isOp }))
	] as PostPreview[]);
	const postById = $derived(new Map(allPosts.map((post) => [post.id, post])));
	const backlinks = $derived(buildBacklinks(allPosts));
	const previewPost = $derived(previewPostId ? postById.get(previewPostId) : null);

	function normalizeStaffHref(href: string) {
		if (href.startsWith('/') && !href.startsWith('//')) return href;

		try {
			const url = new URL(href);
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
		} catch {
			return '';
		}
	}

	function splitStaffLinks(value: string): BodySegment[] {
		const segments: BodySegment[] = [];
		const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
		let offset = 0;
		let match: RegExpExecArray | null;

		while ((match = linkPattern.exec(value))) {
			const href = normalizeStaffHref(match[2]);
			if (match.index > offset)
				segments.push({ type: 'text', value: value.slice(offset, match.index) });
			segments.push(
				href
					? { type: 'link', label: match[1], href, external: !href.startsWith('/') }
					: { type: 'text', value: match[0] }
			);
			offset = match.index + match[0].length;
		}

		if (offset < value.length) segments.push({ type: 'text', value: value.slice(offset) });
		return segments;
	}

	function splitBody(body: string, allowStaffLinks = false): BodySegment[] {
		const segments: BodySegment[] = [];

		for (const line of body.split(/(\r?\n)/)) {
			if (/^\r?\n$/.test(line)) {
				segments.push({ type: 'text', value: line });
				continue;
			}

			if (line.startsWith('>') && !line.startsWith('>>')) {
				segments.push({ type: 'greentext', value: line });
				continue;
			}

			for (const value of line.split(/(>>\d+)/g)) {
				const postId = Number(value.slice(2));
				if (value.startsWith('>>') && Number.isInteger(postId)) {
					segments.push({ type: 'quote', value, postId });
				} else if (allowStaffLinks) {
					segments.push(...splitStaffLinks(value));
				} else {
					segments.push({ type: 'text', value });
				}
			}
		}

		return segments;
	}

	function quotedPostIds(post: Pick<PostPreview, 'body'> & { quotePostId?: number | null }) {
		const ids = new Set<number>();
		for (const match of post.body.matchAll(/>>(\d+)/g)) {
			const id = Number(match[1]);
			if (Number.isInteger(id)) ids.add(id);
		}
		if (post.quotePostId && Number.isInteger(post.quotePostId)) ids.add(post.quotePostId);
		return ids;
	}

	function buildBacklinks(posts: (PostPreview & { quotePostId?: number | null })[]) {
		const available = new Set(posts.map((post) => post.id));
		const links = new Map<number, number[]>();
		for (const post of posts) {
			for (const targetId of quotedPostIds(post)) {
				if (!available.has(targetId) || targetId === post.id) continue;
				links.set(targetId, [...(links.get(targetId) ?? []), post.id]);
			}
		}
		return links;
	}

	function isOpPost(postId: number) {
		const post = postById.get(postId);
		return Boolean(post?.isOp || postId === thread.id);
	}

	function quoteHref(postId: number) {
		return postById.has(postId) ? `#p${postId}` : data.externalQuoteHrefs?.[postId];
	}

	function isExternalQuote(postId: number) {
		return !postById.has(postId) && Boolean(data.externalQuoteHrefs?.[postId]);
	}

	function showPreview(postId: number, event: MouseEvent) {
		if (!postById.has(postId)) return;
		previewPostId = postId;
		movePreview(event);
	}

	function movePreview(event: MouseEvent) {
		previewX = Math.min(event.clientX + 18, window.innerWidth - 320);
		previewY = Math.min(event.clientY + 14, window.innerHeight - 180);
	}

	function hidePreview() {
		previewPostId = null;
	}

	function postAnchor(postId: number) {
		document.querySelector(`#p${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function isSpoilerHidden(post: { id: number; spoiler?: boolean }) {
		return Boolean(post.spoiler && !unspoiledPostIds.includes(post.id));
	}

	function unspoiler(postId: number) {
		unspoiledPostIds = [...new Set([...unspoiledPostIds, postId])];
	}

	function compactDate(value: Date | string) {
		const date = new Date(value);
		const pad = (part: number) => String(part).padStart(2, '0');
		const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${String(date.getFullYear()).slice(-2)}(${weekdays[date.getDay()]})${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	}

	function relativeDate(value: Date | string) {
		const diffSeconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
		const units = [
			['year', 31536000],
			['month', 2592000],
			['day', 86400],
			['hour', 3600],
			['minute', 60]
		] as const;
		for (const [label, seconds] of units) {
			const amount = Math.floor(diffSeconds / seconds);
			if (amount >= 1) return `${amount} ${label}${amount === 1 ? '' : 's'} ago`;
		}
		return `${diffSeconds} second${diffSeconds === 1 ? '' : 's'} ago`;
	}

	function postExcerpt(body: string) {
		return body.replace(/\s+/g, ' ').trim().slice(0, 220);
	}

	function appendQuote(postId: number) {
		const textarea = document.querySelector<HTMLTextAreaElement>('[data-quick-reply-body]');
		const quoteInput = document.querySelector<HTMLInputElement>('[data-quick-reply-quote]');
		if (!textarea) {
			window.dispatchEvent(new CustomEvent('open-quick-reply'));
			setTimeout(() => appendQuote(postId));
			return;
		}

		if (textarea.value && !textarea.value.endsWith('\n')) textarea.value += '\n';
		textarea.value += `>>${postId}\n`;
		textarea.focus();
		if (quoteInput) quoteInput.value = String(postId);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function focusQuickReply() {
		const textarea = document.querySelector<HTMLTextAreaElement>('[data-quick-reply-body]');
		if (!textarea) {
			window.dispatchEvent(new CustomEvent('open-quick-reply'));
			setTimeout(focusQuickReply);
			return;
		}
		textarea.focus();
		textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function toggleReplySelection(id: number, selected: boolean) {
		selectedReplyIds = selected
			? [...new Set([...selectedReplyIds, id])]
			: selectedReplyIds.filter((replyId) => replyId !== id);
	}

	function clearPostSelection() {
		selectedOriginalPost = false;
		selectedReplyIds = [];
	}

	function hasVideoAttachment(post: { imageUrl: string | null; imageName: string | null }) {
		return Boolean(
			post.imageUrl?.toLowerCase().endsWith('.webm') ||
			post.imageName?.toLowerCase().endsWith('.webm')
		);
	}

	function attachmentType(post: { imageUrl: string | null; imageName: string | null }) {
		const source = post.imageName || post.imageUrl || '';
		return source.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase() || 'webp';
	}

	function fileMeta(post: {
		imageUrl: string | null;
		imageName: string | null;
		imageSize: string;
		imageDimensions: string;
	}) {
		return `(${post.imageSize}, ${post.imageDimensions}, ${attachmentType(post)})`;
	}

	function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
		document.querySelector('[data-thread-bottom]')?.scrollIntoView({ block: 'end', behavior });
	}

	function scrollToTop() {
		followThread = false;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function updateFollowThread(enabled: boolean) {
		followThread = enabled;
		if (enabled) scrollToBottom();
	}

	$effect(() => {
		refreshCountdown = 10;
		if (!autoRefresh) {
			const cleanUrl = new URL(window.location.href);
			if (cleanUrl.searchParams.has('ww_autorefresh')) {
				cleanUrl.searchParams.delete('ww_autorefresh');
				window.history.replaceState(window.history.state, '', cleanUrl);
			}
			return;
		}

		const interval = window.setInterval(() => {
			refreshCountdown -= 1;
			if (refreshCountdown > 0) return;

			refreshCountdown = 10;
			void goto(autorefreshHref, {
				replaceState: true,
				noScroll: true,
				keepFocus: true,
				invalidateAll: true
			}).then(() => {
				if (followThread) scrollToBottom('auto');
			});
		}, 1000);

		return () => window.clearInterval(interval);
	});

	$effect(() => {
		lastScrollY = window.scrollY;
		const onScroll = () => {
			const currentY = window.scrollY;
			if (followThread && currentY < lastScrollY - 20) followThread = false;
			lastScrollY = currentY;
		};

		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={pageHref} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={pageHref} />
	<meta property="og:type" content="article" />
	{#if bannerMetaUrl}
		<meta property="og:image" content={bannerMetaUrl} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={bannerMetaUrl} />
	{/if}
</svelte:head>

{#snippet sidebar()}
	<section class="panel">
		<h2>Thread Info</h2>
		<dl>
			<div>
				<dt>Images</dt>
				<dd>{(thread.imageUrl ? 1 : 0) + thread.replies.filter((post) => post.imageUrl).length}</dd>
			</div>
			<div>
				<dt>Replies</dt>
				<dd>{thread.replies.length}</dd>
			</div>
			<div>
				<dt>Views</dt>
				<dd>{thread.views}</dd>
			</div>
			<div>
				<dt>Created</dt>
				<dd>{new Date(thread.createdAt).toLocaleString()}</dd>
			</div>
		</dl>
	</section>

	<section class="panel action-list">
		<h2>Moderation</h2>
		<form class="moderation-command" method="POST" action="?/moderate">
			<label class="sr-only" for="mod-credential">Password</label>
			<input
				id="mod-credential"
				name="credential"
				type="password"
				autocomplete="current-password"
				placeholder="Password"
			/>
			<input type="hidden" name="includeThread" value={String(selectedOriginalPost)} />
			{#each selectedReplyIds as id (id)}
				<input type="hidden" name="postId" value={id} />
			{/each}
			<div class="moderation-actions">
				<button type="submit" name="command" value={thread.pinned ? 'unpin' : 'pin'}>
					{thread.pinned ? 'Unpin' : 'Pin'} Thread
				</button>
				<button type="submit" name="command" value={thread.archived ? 'unarchive' : 'archive'}>
					{thread.archived ? 'Unarchive' : 'Archive'} Thread
				</button>
				{#if selectedPostCount}
					<button type="submit" name="command" value="spoiler-selected">
						Spoiler {selectedPostCount} selected
					</button>
					<button type="submit" name="command" value="unspoiler-selected">
						Unspoiler {selectedPostCount} selected
					</button>
					<button type="submit" name="command" value="delete-selected">
						Delete {selectedPostCount} selected post{selectedPostCount === 1 ? '' : 's'}
					</button>
					<button type="submit" name="command" value="softban-post">Softban Post</button>
					<button type="submit" name="command" value="hardban-post">Hardban Post</button>
				{/if}
				<button type="submit" name="command" value="delete-thread">Delete Thread</button>
			</div>
		</form>
		{#if selectedPostCount}
			<button type="button" onclick={clearPostSelection}>Clear post selection</button>
		{/if}
	</section>
{/snippet}

<ImageboardShell
	boards={data.boards}
	board={data.board}
	activities={data.activities}
	favoriteCodes={data.favoriteCodes}
	threadId={thread.id}
	replyAction="?/reply"
	showSearch
	turnstile={data.turnstile}
	sidebarActive={selectedPostCount > 0}
	{sidebar}
>
	{#if data.board.bannerUrl}
		<a class="board-banner" href={boardHref} aria-label={`Back to /${data.board.code}/ catalog`}>
			<img src={data.board.bannerUrl} alt={`/${data.board.code}/ banner`} />
		</a>
	{/if}

	<div class="thread-toolbar">
		<a class="back-button" href={boardHref}>&lt;- Back to /{data.board.code}/</a>
		<div class="toolbar-controls">
			<label class="autorefresh-control" title="Refresh this thread every 10 seconds">
				<input bind:checked={autoRefresh} type="checkbox" />
				<span>Auto {autoRefresh ? refreshCountdown : 10}</span>
			</label>
			<a href={boardHref}>Catalog</a>
			<a href={archiveHref}>Archive</a>
			<a href={rulesHref}>Rules</a>
		</div>
	</div>

	{#if form?.message}
		<div class="notice" role="status">{form.message}</div>
	{/if}

	<section class="thread-stack" aria-label="Thread">
		<article class="thread selected" id={`p${thread.id}`}>
			<div class="post-head">
				<input
					checked={selectedOriginalPost}
					type="checkbox"
					aria-label={`Select original post ${thread.id}`}
					onchange={(event) => (selectedOriginalPost = event.currentTarget.checked)}
				/>
				<strong>{thread.author}</strong>
				{#if thread.authorTripcode}<span class="tripcode">{thread.authorTripcode}</span>{/if}
				{#if thread.capcode}<span class="capcode">{thread.capcode}</span>{/if}
				<span class="op-badge">OP</span>
				<time
					datetime={new Date(thread.createdAt).toISOString()}
					title={relativeDate(thread.createdAt)}>{compactDate(thread.createdAt)}</time
				>
				<span class="post-number">
					<a href={`#p${thread.id}`} onclick={() => postAnchor(thread.id)}>No.</a>
					<button type="button" onclick={() => appendQuote(thread.id)}>{thread.id}</button>
				</span>
				{#each backlinks.get(thread.id) ?? [] as sourceId (sourceId)}
					<a
						class="quote-ref"
						href={`#p${sourceId}`}
						onmouseenter={(event) => showPreview(sourceId, event)}
						onmousemove={movePreview}
						onmouseleave={hidePreview}>&gt;&gt;{sourceId}{isOpPost(sourceId) ? ' (OP)' : ''}</a
					>
				{/each}
				<button class="tiny-link bracket-link" type="button" onclick={focusQuickReply}>
					Quick Reply
				</button>
				{#if thread.pinned}<span class="status-pill">Pinned</span>{/if}
				{#if thread.archived}<span class="status-pill">Archived</span>{/if}
				{#if thread.spoiler}<span class="status-pill">Spoiler</span>{/if}
			</div>

			<div class="op-post">
				{#if thread.imageUrl}
					<figure class:spoilered={isSpoilerHidden(thread)}>
						{#if hasVideoAttachment(thread)}
							<video src={thread.imageUrl} controls muted playsinline></video>
						{:else}
							<a href={thread.imageUrl} target="_blank" rel="noreferrer">
								<img src={thread.imageUrl} alt={thread.imageName ?? thread.subject} />
							</a>
						{/if}
						<figcaption>
							<a href={thread.imageUrl} target="_blank" rel="noreferrer">{fileMeta(thread)}</a>
						</figcaption>
					</figure>
				{/if}
				<div class:spoiler-text={isSpoilerHidden(thread)}>
					<h2>{thread.subject}</h2>
					{#if isSpoilerHidden(thread)}
						<button
							class="spoiler-toggle bracket-link"
							type="button"
							onclick={() => unspoiler(thread.id)}
						>
							[ Unspoiler ]
						</button>
					{/if}
					<p>
						{#each splitBody(thread.body, Boolean(thread.capcode)) as segment, index (index)}
							{#if segment.type === 'quote'}
								{#if postById.has(segment.postId)}
									<a
										class="quote-inline"
										href={quoteHref(segment.postId)}
										onmouseenter={(event) => showPreview(segment.postId, event)}
										onmousemove={movePreview}
										onmouseleave={hidePreview}
										>{segment.value}{isOpPost(segment.postId) ? ' (OP)' : ''}</a
									>
								{:else if isExternalQuote(segment.postId)}
									<a class="quote-dead quote-external" href={quoteHref(segment.postId)}>
										{segment.value}
									</a>
								{:else}
									<span class="quote-dead">{segment.value}</span>
								{/if}
							{:else if segment.type === 'greentext'}
								<span class="greentext">{segment.value}</span>
							{:else if segment.type === 'link'}
								<a
									href={segment.href}
									target={segment.external ? '_blank' : undefined}
									rel="noreferrer"
								>
									{segment.label}
								</a>
							{:else}
								{segment.value}
							{/if}
						{/each}
					</p>
				</div>
			</div>

			<div class="reply-list">
				{#each thread.replies as reply (reply.id)}
					<article class="reply" id={`p${reply.id}`}>
						<div class="post-head">
							<input
								type="checkbox"
								checked={selectedReplyIds.includes(reply.id)}
								aria-label={`Select reply ${reply.id}`}
								onchange={(event) => toggleReplySelection(reply.id, event.currentTarget.checked)}
							/>
							<strong>{reply.author}</strong>
							{#if reply.authorTripcode}<span class="tripcode">{reply.authorTripcode}</span>{/if}
							{#if reply.capcode}<span class="capcode">{reply.capcode}</span>{/if}
							{#if reply.isOp}<span class="op-badge">OP</span>{/if}
							{#if reply.spoiler}<span class="status-pill">Spoiler</span>{/if}
							<time
								datetime={new Date(reply.createdAt).toISOString()}
								title={relativeDate(reply.createdAt)}>{compactDate(reply.createdAt)}</time
							>
							<span class="post-number">
								<a href={`#p${reply.id}`} onclick={() => postAnchor(reply.id)}>No.</a>
								<button type="button" onclick={() => appendQuote(reply.id)}>{reply.id}</button>
							</span>
							{#each backlinks.get(reply.id) ?? [] as sourceId (sourceId)}
								<a
									class="quote-ref"
									href={`#p${sourceId}`}
									onmouseenter={(event) => showPreview(sourceId, event)}
									onmousemove={movePreview}
									onmouseleave={hidePreview}
									>&gt;&gt;{sourceId}{isOpPost(sourceId) ? ' (OP)' : ''}</a
								>
							{/each}
						</div>
						<div class:has-image={reply.imageUrl} class="reply-body">
							{#if reply.imageUrl}
								<figure class="reply-image" class:spoilered={isSpoilerHidden(reply)}>
									{#if hasVideoAttachment(reply)}
										<video src={reply.imageUrl} controls muted playsinline></video>
									{:else}
										<a href={reply.imageUrl} target="_blank" rel="noreferrer">
											<img src={reply.imageUrl} alt={reply.imageName ?? `reply ${reply.id}`} />
										</a>
									{/if}
									<figcaption>
										<a href={reply.imageUrl} target="_blank" rel="noreferrer">{fileMeta(reply)}</a>
									</figcaption>
								</figure>
							{/if}
							<div class="reply-content" class:spoiler-text={isSpoilerHidden(reply)}>
								{#if isSpoilerHidden(reply)}
									<button
										class="spoiler-toggle bracket-link"
										type="button"
										onclick={() => unspoiler(reply.id)}
									>
										[ Unspoiler ]
									</button>
								{/if}
								{#if reply.quotePostId && !reply.body.includes(`>>${reply.quotePostId}`)}
									{#if postById.has(reply.quotePostId)}
										<a
											class="quote"
											href={quoteHref(Number(reply.quotePostId))}
											onmouseenter={(event) => showPreview(Number(reply.quotePostId), event)}
											onmousemove={movePreview}
											onmouseleave={hidePreview}
											>&gt;&gt;{reply.quotePostId}{isOpPost(Number(reply.quotePostId))
												? ' (OP)'
												: ''}</a
										>
									{:else if isExternalQuote(reply.quotePostId)}
										<a class="quote quote-dead quote-external" href={quoteHref(reply.quotePostId)}
											>&gt;&gt;{reply.quotePostId}</a
										>
									{:else}
										<span class="quote quote-dead">&gt;&gt;{reply.quotePostId}</span>
									{/if}
								{/if}
								<p>
									{#each splitBody(reply.body, Boolean(reply.capcode)) as segment, index (index)}
										{#if segment.type === 'quote'}
											{#if postById.has(segment.postId)}
												<a
													class="quote-inline"
													href={quoteHref(segment.postId)}
													onmouseenter={(event) => showPreview(segment.postId, event)}
													onmousemove={movePreview}
													onmouseleave={hidePreview}
													>{segment.value}{isOpPost(segment.postId) ? ' (OP)' : ''}</a
												>
											{:else if isExternalQuote(segment.postId)}
												<a class="quote-dead quote-external" href={quoteHref(segment.postId)}>
													{segment.value}
												</a>
											{:else}
												<span class="quote-dead">{segment.value}</span>
											{/if}
										{:else if segment.type === 'greentext'}
											<span class="greentext">{segment.value}</span>
										{:else if segment.type === 'link'}
											<a
												href={segment.href}
												target={segment.external ? '_blank' : undefined}
												rel="noreferrer"
											>
												{segment.label}
											</a>
										{:else}
											{segment.value}
										{/if}
									{/each}
								</p>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</article>
	</section>
	{#if previewPost}
		<aside
			class="quote-preview"
			style:left={`${previewX}px`}
			style:top={`${previewY}px`}
			aria-hidden="true"
		>
			<div class="post-head">
				<strong>{previewPost.author}</strong>
				{#if previewPost.authorTripcode}<span class="tripcode">{previewPost.authorTripcode}</span
					>{/if}
				{#if previewPost.capcode}<span class="capcode">{previewPost.capcode}</span>{/if}
				{#if isOpPost(previewPost.id)}<span class="op-badge">OP</span>{/if}
				<span>No.{previewPost.id}</span>
			</div>
			<p>{postExcerpt(previewPost.body)}</p>
		</aside>
	{/if}
	<BoardFooter
		showFollow
		following={followThread}
		onBackToTop={scrollToTop}
		onFollowChange={updateFollowThread}
	/>
</ImageboardShell>
