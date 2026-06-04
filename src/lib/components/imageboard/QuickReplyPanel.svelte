<script lang="ts">
	import FileShelf from './FileShelf.svelte';
	import Turnstile from './Turnstile.svelte';

	let {
		threadId = null,
		action = '?/reply',
		turnstile = { posts: true, uploads: true }
	}: {
		threadId?: number | null;
		action?: string;
		turnstile?: { posts: boolean; uploads: boolean };
	} = $props();
</script>

<section class="panel quick-reply" id="quick-reply">
	<form method="POST" {action}>
		<input type="hidden" name="threadId" value={threadId ?? ''} />
		<input data-quick-reply-quote type="hidden" name="quotePostId" value="" />
		<div class="field-grid">
			<input name="name" placeholder="Name" />
			<input name="options" placeholder="Options (#trip, noko, password##Mod)" />
		</div>
		<textarea data-quick-reply-body name="body" rows="5" placeholder="What are your thoughts?"
		></textarea>
		<label class="form-check">
			<input name="spoiler" type="checkbox" />
			Spoiler
		</label>
		<FileShelf turnstileEnabled={turnstile.uploads} />
		{#if turnstile.posts || turnstile.uploads}
			<Turnstile />
		{/if}
		<button class="primary-button full" type="submit" disabled={!threadId}>Post Reply</button>
	</form>
</section>
