<script lang="ts">
	import { resolve } from '$app/paths';
	import ActivityTicker from './ActivityTicker.svelte';
	import Icon from './Icon.svelte';

	type Board = {
		code: string;
		name: string;
	};

	type Activity = {
		id: number;
		message: string;
		boardCode: string;
		threadId: number | null;
	};

	let {
		board = null,
		activities = [],
		search = '',
		showSearch = false,
		leftCollapsed = false,
		rightCollapsed = false,
		boardDrawerOpen = false,
		hasRightRail = false,
		onToggleBoards = () => {},
		onToggleLeft = () => {},
		onToggleRight = () => {},
		onNewThread = () => {}
	}: {
		board?: Board | null;
		activities?: Activity[];
		search?: string;
		showSearch?: boolean;
		leftCollapsed?: boolean;
		rightCollapsed?: boolean;
		boardDrawerOpen?: boolean;
		hasRightRail?: boolean;
		onToggleBoards?: () => void;
		onToggleLeft?: () => void;
		onToggleRight?: () => void;
		onNewThread?: () => void;
	} = $props();

	const boardHref = $derived(
		board ? resolve('/boards/[board]', { board: board.code }) : resolve('/')
	);
	const archiveHref = $derived(
		board ? resolve('/boards/[board]?view=archive', { board: board.code }) : resolve('/')
	);
	const rulesHref = $derived(
		board ? resolve('/boards/[board]?view=rules', { board: board.code }) : resolve('/')
	);
</script>

<header class="topbar">
	<div class="top-left">
		<button
			class="hamburger"
			type="button"
			aria-label="Open boards"
			aria-expanded={boardDrawerOpen}
			onclick={onToggleBoards}
		>
			<Icon name="tabler:menu-2" />
		</button>

		<a class="brand" href={resolve('/')} aria-label="Whisperwall home">
			<span class="brand-mark"><img src="/whisperwall.png" alt="" /></span>
			<span>{board ? `/${board.code}/ - ${board.name}` : 'whisperwall'}</span>
		</a>

		<nav class="topnav" aria-label="Primary navigation">
			<a href={resolve('/')}>Home</a>
			{#if board}
				<a href={boardHref}>Catalog</a>
				<a href={archiveHref}>Archive</a>
				<a href={rulesHref}>Rules</a>
			{/if}
		</nav>
	</div>

	<form class="top-actions" action={boardHref} method="GET">
		{#if showSearch}
			<label class="search">
				<span class="sr-only">Search threads</span>
				<input name="q" type="search" placeholder="Search threads..." value={search} />
			</label>
		{/if}
		{#if board}
			<button class="primary-button" type="button" onclick={onNewThread}>New Thread</button>
		{/if}
		<button
			class="icon-button desktop-only"
			type="button"
			aria-label="Collapse boards"
			aria-pressed={leftCollapsed}
			onclick={onToggleLeft}
		>
			<Icon name="tabler:chevron-left" />
		</button>
		{#if hasRightRail}
			<button
				class="icon-button desktop-only"
				type="button"
				aria-label="Collapse quick reply"
				aria-pressed={rightCollapsed}
				onclick={onToggleRight}
			>
				<Icon name="tabler:chevron-right" />
			</button>
		{/if}
	</form>

	<ActivityTicker {activities} />
</header>
