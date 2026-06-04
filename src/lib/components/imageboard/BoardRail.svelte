<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import pkg from '../../../../package.json';
	import Icon from './Icon.svelte';

	type Board = {
		code: string;
		name: string;
		category: string;
		color: string;
	};

	let {
		boards,
		favoriteCodes = [],
		activeCode = '',
		collapsed = false,
		onToggle = () => {},
		onClose = () => {}
	}: {
		boards: Board[];
		favoriteCodes?: string[];
		activeCode?: string;
		collapsed?: boolean;
		onToggle?: () => void;
		onClose?: () => void;
	} = $props();

	let filter = $state('');
	let favoritesOpen = $state(true);
	let allBoardsOpen = $state(true);
	let theme = $state('');
	const filtered = $derived(
		boards.filter((board) =>
			`${board.code} ${board.name}`.toLowerCase().includes(filter.toLowerCase())
		)
	);
	const favoriteBoards = $derived(filtered.filter((board) => favoriteCodes.includes(board.code)));
	const allBoards = $derived(filtered);
	const favoritesAction = $derived(resolve('/api/favorites'));
	const globalRulesHref = $derived(resolve('/rules'));
	const blotterHref = $derived(resolve('/blotter'));
	const faqHref = $derived(resolve('/faq'));
	const projectVersion = pkg.version;
	const commitHash = __APP_COMMIT_HASH__;
	const repoHref = 'https://github.com/Specifix5/whisperwall';
	const commitHref = `${repoHref}/commit/${commitHash}`;

	function applyTheme(value: string) {
		const nextTheme = value === 'miku' ? 'sankyuu' : value;
		theme = nextTheme;
		document.documentElement.dataset.theme = nextTheme;
		localStorage.setItem('whisperwall-theme', nextTheme);
	}

	onMount(() => {
		applyTheme(localStorage.getItem('whisperwall-theme') ?? '');
	});
</script>

<aside class="board-rail" aria-hidden={collapsed}>
	<div class="rail-header">
		<strong>Boards</strong>
		<button class="rail-toggle" type="button" aria-label="Collapse boards" onclick={onToggle}>
			<Icon name="tabler:chevron-left" />
		</button>
		<label>
			<span class="sr-only">Filter boards</span>
			<input bind:value={filter} placeholder="filter..." />
		</label>
	</div>

	{#if favoriteBoards.length}
		<section class="board-group" aria-label="Favorites">
			<button
				class="group-title"
				type="button"
				aria-expanded={favoritesOpen}
				onclick={() => (favoritesOpen = !favoritesOpen)}
			>
				<Icon name={favoritesOpen ? 'tabler:chevron-down' : 'tabler:chevron-right'} />
				Favorites
			</button>
			{#if favoritesOpen}
				{#each favoriteBoards as board (board.code)}
					<div class="board-row">
						<a
							class:active={activeCode === board.code}
							href={resolve('/boards/[board]', { board: board.code })}
							onclick={onClose}
						>
							<span style:color={board.color}>/{board.code}/</span>
							{board.name}
						</a>
						<form method="POST" action={favoritesAction}>
							<input type="hidden" name="boardCode" value={board.code} />
							<input type="hidden" name="returnTo" value={page.url.pathname + page.url.search} />
							<button
								class="favorite-button"
								type="submit"
								aria-label={`Unfavorite /${board.code}/`}
							>
								[-]
							</button>
						</form>
					</div>
				{/each}
			{/if}
		</section>
	{/if}

	<section class="board-group" aria-label="All Boards">
		<button
			class="group-title"
			type="button"
			aria-expanded={allBoardsOpen}
			onclick={() => (allBoardsOpen = !allBoardsOpen)}
		>
			<Icon name={allBoardsOpen ? 'tabler:chevron-down' : 'tabler:chevron-right'} />
			All Boards
		</button>
		{#if allBoardsOpen}
			{#each allBoards as board (board.code)}
				<div class="board-row">
					<a
						class:active={activeCode === board.code}
						href={resolve('/boards/[board]', { board: board.code })}
						onclick={onClose}
					>
						<span style:color={board.color}>/{board.code}/</span>
						{board.name}
					</a>
					<form method="POST" action={favoritesAction}>
						<input type="hidden" name="boardCode" value={board.code} />
						<input type="hidden" name="returnTo" value={page.url.pathname + page.url.search} />
						<button
							class="favorite-button"
							class:pinned={favoriteCodes.includes(board.code)}
							type="submit"
							aria-label={favoriteCodes.includes(board.code)
								? `Unfavorite /${board.code}/`
								: `Favorite /${board.code}/`}
						>
							{favoriteCodes.includes(board.code) ? '[-]' : '[+]'}
						</button>
					</form>
				</div>
			{/each}
		{/if}
	</section>

	<div class="rail-footer">
		<a href={resolve('/')}>Home</a>
		<a href={blotterHref}>Blotter</a>
		<a href={globalRulesHref}>Global Rules</a>
		<a href={faqHref}>FAQ</a>
		<label class="theme-picker">
			<span>Theme</span>
			<select bind:value={theme} onchange={(event) => applyTheme(event.currentTarget.value)}>
				<option value="">purple</option>
				<option value="sankyuu">miku</option>
			</select>
		</label>
		<p class="build-meta">
			<span>whisperwall v{projectVersion}</span>
			<a href={commitHref}>{commitHash}</a>
		</p>
	</div>
</aside>
