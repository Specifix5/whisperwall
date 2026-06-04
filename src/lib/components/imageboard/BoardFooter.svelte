<script lang="ts">
	let {
		showFollow = false,
		following = false,
		onBackToTop = () => {},
		onFollowChange = () => {}
	}: {
		showFollow?: boolean;
		following?: boolean;
		onBackToTop?: () => void;
		onFollowChange?: (following: boolean) => void;
	} = $props();
</script>

<footer class="board-footer" data-thread-bottom>
	<div class="board-footer-controls">
		<button type="button" onclick={onBackToTop}>[ back to top ]</button>
		{#if showFollow}
			<label>
				[
				<input
					checked={following}
					type="checkbox"
					onchange={(event) => onFollowChange(event.currentTarget.checked)}
				/>
				follow thread ]
			</label>
		{/if}
	</div>
	<p>
		whisperwall hosts user-submitted posts and links. We are not responsible for third-party
		content; copyrights and other rights remain the responsibility of their respective owners.
	</p>
</footer>
