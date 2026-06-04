<script lang="ts">
	import BoardRail from './BoardRail.svelte';
	import NewThreadModal from './NewThreadModal.svelte';
	import QuickReplyPanel from './QuickReplyPanel.svelte';
	import TopBar from './TopBar.svelte';
	import Window from './Window.svelte';

	type Board = {
		code: string;
		name: string;
		category: string;
		color: string;
	};

	type Activity = {
		id: number;
		message: string;
		boardCode: string;
		threadId: number | null;
	};

	let {
		boards,
		board = null,
		activities = [],
		favoriteCodes = [],
		search = '',
		showSearch = false,
		threadId = null,
		replyAction = '?/reply',
		turnstile = { posts: true, uploads: true },
		sidebarActive = false,
		children,
		sidebar
	}: {
		boards: Board[];
		board?: Board | null;
		activities?: Activity[];
		favoriteCodes?: string[];
		search?: string;
		showSearch?: boolean;
		threadId?: number | null;
		replyAction?: string;
		turnstile?: { posts: boolean; uploads: boolean };
		sidebarActive?: boolean;
		children: import('svelte').Snippet;
		sidebar?: import('svelte').Snippet;
	} = $props();

	let leftCollapsed = $state(false);
	let rightCollapsed = $state(true);
	let boardDrawerOpen = $state(false);
	let replyWindowOpen = $state(false);
	let newThreadOpen = $state(false);

	$effect(() => {
		if (!sidebar) return;
		rightCollapsed = !sidebarActive;
	});

	$effect(() => {
		const openQuickReply = () => {
			replyWindowOpen = true;
		};

		window.addEventListener('open-quick-reply', openQuickReply);
		return () => {
			window.removeEventListener('open-quick-reply', openQuickReply);
		};
	});
</script>

<div
	class="app-shell"
	class:left-collapsed={leftCollapsed}
	class:right-collapsed={rightCollapsed}
	class:has-right-rail={Boolean(sidebar)}
	class:board-drawer-open={boardDrawerOpen}
	class:reply-window-open={replyWindowOpen}
>
	<TopBar
		{board}
		{activities}
		{search}
		{showSearch}
		{leftCollapsed}
		{rightCollapsed}
		{boardDrawerOpen}
		hasRightRail={Boolean(sidebar)}
		onToggleBoards={() => (boardDrawerOpen = !boardDrawerOpen)}
		onToggleLeft={() => (leftCollapsed = !leftCollapsed)}
		onToggleRight={() => (rightCollapsed = !rightCollapsed)}
		onNewThread={() => (newThreadOpen = true)}
	/>

	{#if boardDrawerOpen}
		<button
			class="drawer-scrim"
			type="button"
			aria-label="Close boards"
			onclick={() => (boardDrawerOpen = false)}
		></button>
	{/if}

	<BoardRail
		{boards}
		{favoriteCodes}
		activeCode={board?.code}
		collapsed={leftCollapsed}
		onToggle={() => (leftCollapsed = !leftCollapsed)}
		onClose={() => (boardDrawerOpen = false)}
	/>

	<main class="content">
		{#if threadId}
			<div class="reply-trigger">
				<button class="primary-button" type="button" onclick={() => (replyWindowOpen = true)}>
					Post a Reply
				</button>
			</div>
		{/if}
		{@render children()}
	</main>

	{#if sidebar}
		<aside class="right-rail" aria-hidden={rightCollapsed}>
			{@render sidebar()}
		</aside>
	{/if}

	{#if threadId}
		<div class="floating-reply">
			<Window title="Quick Reply" open={replyWindowOpen} onClose={() => (replyWindowOpen = false)}>
				<QuickReplyPanel {threadId} action={replyAction} {turnstile} />
			</Window>
		</div>
	{/if}

	{#if board}
		<NewThreadModal
			boardCode={board.code}
			open={newThreadOpen}
			{turnstile}
			onClose={() => (newThreadOpen = false)}
		/>
	{/if}
</div>
